"""
NBA Data Sidecar — wraps nba_api (stats.nba.com) with a FastAPI HTTP interface.
The NestJS backend calls this service to get real player game logs, season stats,
and today's scoreboard without needing a paid API key.

Rate limiting: stats.nba.com enforces ~600ms between requests. All endpoints cache
responses for 5 minutes to keep calls minimal when the NestJS backend polls repeatedly.
"""

import time
import logging
import requests as _requests
from datetime import datetime, timedelta
from typing import Optional, Any

from fastapi import FastAPI, Query, HTTPException
from nba_api.stats.endpoints import (
    commonallplayers,
    playergamelogs,
    scoreboardv2,
    leaguedashplayerstats,
    commonplayerinfo,
)
from nba_api.stats.static import players as nba_players_static

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="NBA Data Service", version="1.0.0")

# ─── Simple in-memory cache ──────────────────────────────────────────────────
_cache: dict[str, tuple[Any, float]] = {}
CACHE_TTL = 300  # 5 minutes


def _cache_get(key: str) -> Any | None:
    if key in _cache:
        value, ts = _cache[key]
        if time.time() - ts < CACHE_TTL:
            return value
        del _cache[key]
    return None


def _cache_set(key: str, value: Any) -> None:
    _cache[key] = (value, time.time())


def _safe_float(val: Any, default: float = 0.0) -> float:
    try:
        if val is None or val == "":
            return default
        # Handle "MM:SS" minutes format
        if isinstance(val, str) and ":" in val:
            parts = val.split(":")
            return float(parts[0]) + float(parts[1]) / 60
        return float(val)
    except (ValueError, TypeError):
        return default


# ─── Endpoints ───────────────────────────────────────────────────────────────

@app.get("/health")
def health():
    return {"status": "ok", "timestamp": datetime.utcnow().isoformat()}


@app.get("/players/active")
def get_active_players():
    """
    Returns all active NBA players with their nba_api ID, name, and team.
    Cached for 5 minutes.
    """
    cache_key = "active_players"
    cached = _cache_get(cache_key)
    if cached is not None:
        return cached

    try:
        all_players = commonallplayers.CommonAllPlayers(
            is_only_current_season=1,
            league_id="00",
            season="2024-25",
        )
        time.sleep(0.6)
        rows = all_players.get_dict()["resultSets"][0]
        headers = [h.lower() for h in rows["headers"]]
        result = []
        for row in rows["rowSet"]:
            d = dict(zip(headers, row))
            result.append({
                "nba_id": d.get("person_id"),
                "name": d.get("display_first_last") or d.get("display_last_comma_first", ""),
                "team_abbreviation": d.get("team_abbreviation", ""),
                "team_city": d.get("team_city", ""),
                "team_name": d.get("team_name", ""),
                "is_active": True,
            })
        _cache_set(cache_key, result)
        logger.info(f"Fetched {len(result)} active players")
        return result
    except Exception as e:
        logger.error(f"Error fetching active players: {e}")
        raise HTTPException(status_code=503, detail=f"nba_api error: {str(e)}")


@app.get("/players/{nba_id}/game-logs")
def get_player_game_logs(
    nba_id: int,
    season: str = Query(default="2024-25"),
    last_n: int = Query(default=20, ge=1, le=82),
):
    """
    Returns the last N game logs for a player in a given season.
    Maps all stat fields to the format expected by the NestJS StatLine model.
    """
    cache_key = f"game_logs:{nba_id}:{season}:{last_n}"
    cached = _cache_get(cache_key)
    if cached is not None:
        return cached

    try:
        logs = playergamelogs.PlayerGameLogs(
            player_id_nullable=nba_id,
            season_nullable=season,
            last_n_games_nullable=last_n,
        )
        time.sleep(0.6)
        rows = logs.get_dict()["resultSets"][0]
        headers = [h.lower() for h in rows["headers"]]
        result = []
        for row in rows["rowSet"]:
            d = dict(zip(headers, row))
            fgm = _safe_float(d.get("fgm"))
            fga = _safe_float(d.get("fga"))
            fg3m = _safe_float(d.get("fg3m"))
            fg3a = _safe_float(d.get("fg3a"))
            ftm = _safe_float(d.get("ftm"))
            fta = _safe_float(d.get("fta"))
            pts = _safe_float(d.get("pts"))
            min_played = _safe_float(d.get("min"))
            ts_pct = pts / (2 * (fga + 0.475 * fta)) if (fga + fta) > 0 else 0.0
            efg_pct = (fgm + 0.5 * fg3m) / fga if fga > 0 else 0.0
            result.append({
                "nba_id": nba_id,
                "game_id": d.get("game_id"),
                "game_date": d.get("game_date"),
                "matchup": d.get("matchup", ""),
                "season": season,
                "points": pts,
                "rebounds": _safe_float(d.get("reb")),
                "assists": _safe_float(d.get("ast")),
                "steals": _safe_float(d.get("stl")),
                "blocks": _safe_float(d.get("blk")),
                "turnovers": _safe_float(d.get("tov")),
                "minutes": min_played,
                "fgm": fgm,
                "fga": fga,
                "fg_pct": _safe_float(d.get("fg_pct")),
                "fg3m": fg3m,
                "fg3a": fg3a,
                "fg3_pct": _safe_float(d.get("fg3_pct")),
                "ftm": ftm,
                "fta": fta,
                "ft_pct": _safe_float(d.get("ft_pct")),
                "plus_minus": _safe_float(d.get("plus_minus")),
                "ts_pct": round(ts_pct, 4),
                "efg_pct": round(efg_pct, 4),
                "usg_pct": _safe_float(d.get("usg_pct")),
                "bpm": 0.0,  # not available in game logs; populated from season stats
            })
        _cache_set(cache_key, result)
        logger.info(f"Fetched {len(result)} game logs for player {nba_id}")
        return result
    except Exception as e:
        logger.error(f"Error fetching game logs for {nba_id}: {e}")
        raise HTTPException(status_code=503, detail=f"nba_api error: {str(e)}")


@app.get("/games/today")
def get_today_games():
    """
    Returns today's NBA scoreboard: game matchups, scores, status.
    """
    cache_key = f"today_games:{datetime.utcnow().strftime('%Y-%m-%d')}"
    cached = _cache_get(cache_key)
    if cached is not None:
        return cached

    try:
        board = scoreboardv2.ScoreboardV2(
            game_date=datetime.now().strftime("%m/%d/%Y"),
            league_id="00",
            day_offset=0,
        )
        time.sleep(0.6)
        data = board.get_dict()
        # ResultSet 0 = GameHeader, ResultSet 1 = LineScore
        game_header = data["resultSets"][0]
        line_score = data["resultSets"][1]

        gh_headers = [h.lower() for h in game_header["headers"]]
        ls_headers = [h.lower() for h in line_score["headers"]]

        games = []
        for row in game_header["rowSet"]:
            d = dict(zip(gh_headers, row))
            games.append({
                "game_id": d.get("game_id"),
                "game_date_est": d.get("game_date_est"),
                "game_status_text": d.get("game_status_text"),
                "home_team_id": d.get("home_team_id"),
                "visitor_team_id": d.get("visitor_team_id"),
                "home_team_abbreviation": d.get("home_team_abbreviation", d.get("home_team_city", "")),
                "visitor_team_abbreviation": d.get("visitor_team_abbreviation", d.get("visitor_team_city", "")),
                "live_period": d.get("live_period"),
                "live_pc_time": d.get("live_pc_time"),
            })

        scores: dict[str, dict] = {}
        for row in line_score["rowSet"]:
            d = dict(zip(ls_headers, row))
            gid = d.get("game_id")
            if gid not in scores:
                scores[gid] = {}
            # team_abbreviation tells us home vs away
            scores[gid][d.get("team_abbreviation", "")] = {
                "pts": d.get("pts"),
                "reb": d.get("reb"),
                "ast": d.get("ast"),
            }

        result = {"games": games, "scores": scores}
        _cache_set(cache_key, result)
        return result
    except Exception as e:
        logger.error(f"Error fetching today's games: {e}")
        raise HTTPException(status_code=503, detail=f"nba_api error: {str(e)}")


@app.get("/players/season-stats")
def get_season_stats(
    season: str = Query(default="2024-25"),
    per_mode: str = Query(default="PerGame"),
):
    """
    Returns per-game season averages for all NBA players.
    Useful for syncing season-level stats like USG%, BPM approximation, etc.
    """
    cache_key = f"season_stats:{season}:{per_mode}"
    cached = _cache_get(cache_key)
    if cached is not None:
        return cached

    try:
        stats = leaguedashplayerstats.LeagueDashPlayerStats(
            season=season,
            per_mode_simple=per_mode,
            measure_type_simple_defense="Base",
        )
        time.sleep(0.6)
        rows = stats.get_dict()["resultSets"][0]
        headers = [h.lower() for h in rows["headers"]]
        result = []
        for row in rows["rowSet"]:
            d = dict(zip(headers, row))
            result.append({
                "nba_id": d.get("player_id"),
                "name": d.get("player_name"),
                "team_abbreviation": d.get("team_abbreviation", ""),
                "gp": _safe_float(d.get("gp")),
                "pts": _safe_float(d.get("pts")),
                "reb": _safe_float(d.get("reb")),
                "ast": _safe_float(d.get("ast")),
                "stl": _safe_float(d.get("stl")),
                "blk": _safe_float(d.get("blk")),
                "tov": _safe_float(d.get("tov")),
                "min": _safe_float(d.get("min")),
                "fg_pct": _safe_float(d.get("fg_pct")),
                "fg3m": _safe_float(d.get("fg3m")),
                "fg3_pct": _safe_float(d.get("fg3_pct")),
                "ft_pct": _safe_float(d.get("ft_pct")),
                "usg_pct": _safe_float(d.get("usg_pct")),
                "ts_pct": _safe_float(d.get("ts_pct")),
                "net_rating": _safe_float(d.get("net_rating")),
                "plus_minus": _safe_float(d.get("plus_minus")),
            })
        _cache_set(cache_key, result)
        logger.info(f"Fetched season stats for {len(result)} players ({season})")
        return result
    except Exception as e:
        logger.error(f"Error fetching season stats: {e}")
        raise HTTPException(status_code=503, detail=f"nba_api error: {str(e)}")


@app.get("/players/{nba_id}/info")
def get_player_info(nba_id: int):
    """
    Returns biographical info for a single player (position, height, weight, team).
    """
    cache_key = f"player_info:{nba_id}"
    cached = _cache_get(cache_key)
    if cached is not None:
        return cached

    try:
        info = commonplayerinfo.CommonPlayerInfo(player_id=nba_id)
        time.sleep(0.6)
        rows = info.get_dict()["resultSets"][0]
        headers = [h.lower() for h in rows["headers"]]
        if not rows["rowSet"]:
            raise HTTPException(status_code=404, detail="Player not found")
        d = dict(zip(headers, rows["rowSet"][0]))
        result = {
            "nba_id": nba_id,
            "name": f"{d.get('first_name', '')} {d.get('last_name', '')}".strip(),
            "position": d.get("position", ""),
            "height": d.get("height", ""),
            "weight": d.get("weight", ""),
            "jersey_number": d.get("jersey", ""),
            "team_abbreviation": d.get("team_abbreviation", ""),
            "team_city": d.get("team_city", ""),
            "team_name": d.get("team_name", ""),
            "is_active": d.get("rosterstatus", "") == "Active",
        }
        _cache_set(cache_key, result)
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching player info for {nba_id}: {e}")
        raise HTTPException(status_code=503, detail=f"nba_api error: {str(e)}")


# ── Injuries via ESPN unofficial API ──────────────────────────────────────────
@app.get("/injuries")
def get_injuries():
    """Fetch NBA injury reports from ESPN unofficial API."""
    try:
        resp = _requests.get(
            "https://site.api.espn.com/apis/site/v2/sports/basketball/nba/injuries",
            timeout=10,
            headers={"Accept": "application/json", "User-Agent": "Mozilla/5.0"},
        )
        resp.raise_for_status()
        raw = resp.json()
    except Exception as e:
        return {"injuries": [], "error": str(e)}

    injuries = []
    for team_block in raw.get("injuries", []):
        team_abbr = team_block.get("team", {}).get("abbreviation", "")
        for item in team_block.get("injuries", []):
            athlete = item.get("athlete", {})
            details = item.get("details") or {}
            injuries.append({
                "player_name": athlete.get("displayName", ""),
                "espn_id": str(athlete.get("id", "")),
                "team_abbr": team_abbr,
                "status": item.get("status", "Questionable"),
                "description": details.get("detail") or item.get("shortComment", ""),
                "return_eta": details.get("returnDate", ""),
                "source": "espn",
                "reported_at": details.get("returnDate") or None,
            })
    return {"injuries": injuries}


# ── News via ESPN unofficial API ───────────────────────────────────────────────
@app.get("/news")
def get_news():
    """Fetch NBA news from ESPN unofficial API."""
    try:
        resp = _requests.get(
            "https://site.api.espn.com/apis/site/v2/sports/basketball/nba/news",
            timeout=10,
            params={"limit": 50},
            headers={"Accept": "application/json", "User-Agent": "Mozilla/5.0"},
        )
        resp.raise_for_status()
        raw = resp.json()
    except Exception as e:
        return {"items": [], "error": str(e)}

    items = []
    for article in raw.get("articles", []):
        player_name = None
        team_abbr = None
        for category in article.get("categories", []):
            if category.get("type") == "athlete":
                player_name = category.get("athlete", {}).get("displayName")
            if category.get("type") == "team":
                team_abbr = category.get("team", {}).get("abbreviation")
        items.append({
            "id": str(article.get("id", "")),
            "headline": article.get("headline", ""),
            "summary": article.get("description", ""),
            "url": article.get("links", {}).get("web", {}).get("href", ""),
            "source": "espn",
            "player_name": player_name,
            "team_abbr": team_abbr,
            "published_at": article.get("published", ""),
        })
    return {"items": items}
