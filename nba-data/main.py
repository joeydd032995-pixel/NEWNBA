"""
NBA Data Sidecar
================

FastAPI wrapper around nba_api / stats.nba.com plus explicitly lower-tier
fallback feeds. The service follows three integrity rules:

1. NBA season values are resolved dynamically; no historical season is silently
   treated as the current season.
2. Missing upstream fields remain missing. Endpoints return raw normalized rows
   and explicit availability metadata instead of fabricating zero-valued data.
3. Source provenance is explicit. stats.nba.com data is Tier 1 official; ESPN
   injury/news endpoints are fallback reporting only until the official NBA
   injury-report adapter replaces them in Phase 4.
"""

import importlib
import logging
import time
from datetime import datetime, timezone
from typing import Any, Optional

import requests as _requests
from fastapi import FastAPI, HTTPException, Query
from nba_api.stats.endpoints import (
    commonallplayers,
    commonplayerinfo,
    leaguedashplayerstats,
    playergamelogs,
    scoreboardv2,
)

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="NBA Data Service", version="2.0.0")

_cache: dict[str, tuple[Any, float]] = {}
CACHE_TTL = 300


def current_nba_season(now: Optional[datetime] = None) -> str:
    """Return the NBA season containing *now* in ``YYYY-YY`` form.

    NBA regular seasons begin in the fall. July-September are treated as the
    upcoming season beginning that calendar year, while January-June belong to
    the season that began in the prior calendar year.
    """
    dt = now or datetime.now(timezone.utc)
    start_year = dt.year if dt.month >= 7 else dt.year - 1
    return f"{start_year}-{str(start_year + 1)[-2:]}"


def _resolve_season(season: Optional[str]) -> str:
    return season or current_nba_season()


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
        if isinstance(val, str) and ":" in val:
            minutes, seconds = val.split(":", 1)
            return float(minutes) + float(seconds) / 60
        return float(val)
    except (ValueError, TypeError):
        return default


def _iso_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _rows_from_endpoint(endpoint: Any) -> list[dict[str, Any]]:
    """Normalize every result set into row dictionaries without inventing fields."""
    payload = endpoint.get_dict()
    result: list[dict[str, Any]] = []
    for result_set in payload.get("resultSets", []):
        name = result_set.get("name", "unknown")
        headers = [str(h).lower() for h in result_set.get("headers", [])]
        for row in result_set.get("rowSet", []):
            normalized = dict(zip(headers, row))
            normalized["_result_set"] = name
            result.append(normalized)
    return result


def _load_endpoint(module_name: str, class_name: str):
    """Load optional nba_api endpoint classes lazily for graceful degradation."""
    try:
        module = importlib.import_module(f"nba_api.stats.endpoints.{module_name}")
        return getattr(module, class_name)
    except (ImportError, AttributeError) as exc:
        raise HTTPException(
            status_code=501,
            detail={
                "error": f"nba_api endpoint {class_name} unavailable in installed version",
                "source": "stats.nba.com",
                "source_tier": "TIER_1_OFFICIAL",
                "data_quality": "LOW",
                "reason": str(exc),
            },
        ) from exc


@app.get("/health")
def health():
    return {
        "status": "ok",
        "timestamp": _iso_now(),
        "current_season": current_nba_season(),
        "version": app.version,
    }


@app.get("/season/current")
def get_current_season():
    return {"season": current_nba_season(), "resolved_at": _iso_now()}


@app.get("/players/active")
def get_active_players(season: Optional[str] = Query(default=None)):
    resolved_season = _resolve_season(season)
    cache_key = f"active_players:{resolved_season}"
    cached = _cache_get(cache_key)
    if cached is not None:
        return cached

    try:
        all_players = commonallplayers.CommonAllPlayers(
            is_only_current_season=1,
            league_id="00",
            season=resolved_season,
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
                "season": resolved_season,
            })
        _cache_set(cache_key, result)
        return result
    except Exception as exc:
        logger.error("Error fetching active players: %s", exc)
        raise HTTPException(status_code=503, detail=f"nba_api error: {exc}") from exc


@app.get("/players/{nba_id}/game-logs")
def get_player_game_logs(
    nba_id: int,
    season: Optional[str] = Query(default=None),
    last_n: int = Query(default=20, ge=1, le=82),
):
    resolved_season = _resolve_season(season)
    cache_key = f"game_logs:{nba_id}:{resolved_season}:{last_n}"
    cached = _cache_get(cache_key)
    if cached is not None:
        return cached

    try:
        logs = playergamelogs.PlayerGameLogs(
            player_id_nullable=nba_id,
            season_nullable=resolved_season,
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
                "season": resolved_season,
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
                "bpm": 0.0,
            })
        _cache_set(cache_key, result)
        return result
    except Exception as exc:
        logger.error("Error fetching game logs for %s: %s", nba_id, exc)
        raise HTTPException(status_code=503, detail=f"nba_api error: {exc}") from exc


@app.get("/games/today")
def get_today_games():
    cache_key = f"today_games:{datetime.now(timezone.utc).strftime('%Y-%m-%d')}"
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
            game_id = d.get("game_id")
            if game_id not in scores:
                scores[game_id] = {}
            scores[game_id][d.get("team_abbreviation", "")] = {
                "pts": d.get("pts"),
                "reb": d.get("reb"),
                "ast": d.get("ast"),
            }

        result = {"games": games, "scores": scores}
        _cache_set(cache_key, result)
        return result
    except Exception as exc:
        logger.error("Error fetching today's games: %s", exc)
        raise HTTPException(status_code=503, detail=f"nba_api error: {exc}") from exc


@app.get("/players/season-stats")
def get_season_stats(
    season: Optional[str] = Query(default=None),
    per_mode: str = Query(default="PerGame"),
):
    resolved_season = _resolve_season(season)
    cache_key = f"season_stats:{resolved_season}:{per_mode}"
    cached = _cache_get(cache_key)
    if cached is not None:
        return cached

    try:
        stats = leaguedashplayerstats.LeagueDashPlayerStats(
            season=resolved_season,
            per_mode_detailed=per_mode,
            measure_type_detailed_defense="Base",
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
                "season": resolved_season,
            })
        _cache_set(cache_key, result)
        return result
    except Exception as exc:
        logger.error("Error fetching season stats: %s", exc)
        raise HTTPException(status_code=503, detail=f"nba_api error: {exc}") from exc


@app.get("/players/{nba_id}/info")
def get_player_info(nba_id: int):
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
    except Exception as exc:
        logger.error("Error fetching player info for %s: %s", nba_id, exc)
        raise HTTPException(status_code=503, detail=f"nba_api error: {exc}") from exc


# ---------------------------------------------------------------------------
# Official stats.nba.com Opportunity-First adapters
# ---------------------------------------------------------------------------

ALLOWED_TRACKING_MEASURES = {
    "Rebounding",
    "Possessions",
    "CatchShoot",
    "PullUpShot",
    "Defense",
    "Drives",
    "Passing",
    "ElbowTouch",
    "PostTouch",
    "PaintTouch",
    "Efficiency",
    "SpeedDistance",
}


@app.get("/tracking/league/{measure}")
def get_tracking_measure(
    measure: str,
    season: Optional[str] = Query(default=None),
    player_or_team: str = Query(default="Player", pattern="^(Player|Team)$"),
    per_mode: str = Query(default="PerGame", pattern="^(Totals|PerGame)$"),
    last_n_games: int = Query(default=0, ge=0, le=82),
):
    """Return an official NBA tracking result set without filling missing fields.

    The upstream schema differs by measure. Consumers must map only fields that
    actually exist in each response and lower data quality when a required field
    is absent.
    """
    if measure not in ALLOWED_TRACKING_MEASURES:
        raise HTTPException(
            status_code=422,
            detail={"error": "unsupported tracking measure", "allowed": sorted(ALLOWED_TRACKING_MEASURES)},
        )

    resolved_season = _resolve_season(season)
    cache_key = f"tracking:{measure}:{resolved_season}:{player_or_team}:{per_mode}:{last_n_games}"
    cached = _cache_get(cache_key)
    if cached is not None:
        return cached

    Endpoint = _load_endpoint("leaguedashptstats", "LeagueDashPtStats")
    try:
        endpoint = Endpoint(
            pt_measure_type=measure,
            player_or_team=player_or_team,
            season=resolved_season,
            season_type_all_star="Regular Season",
            per_mode_simple=per_mode,
            last_n_games=last_n_games,
            timeout=45,
        )
        time.sleep(0.6)
        rows = _rows_from_endpoint(endpoint)
        result = {
            "source": "stats.nba.com",
            "source_tier": "TIER_1_OFFICIAL",
            "data_quality": "HIGH" if rows else "LOW",
            "season": resolved_season,
            "measure": measure,
            "player_or_team": player_or_team,
            "rows": rows,
            "fetched_at": _iso_now(),
        }
        _cache_set(cache_key, result)
        return result
    except HTTPException:
        raise
    except Exception as exc:
        logger.warning("Tracking measure %s unavailable: %s", measure, exc)
        raise HTTPException(
            status_code=503,
            detail={
                "error": str(exc),
                "source": "stats.nba.com",
                "source_tier": "TIER_1_OFFICIAL",
                "data_quality": "LOW",
                "measure": measure,
            },
        ) from exc


@app.get("/tracking/play-types")
def get_play_types(
    season: Optional[str] = Query(default=None),
    player_or_team: str = Query(default="P", pattern="^(P|T)$"),
    play_type: Optional[str] = Query(default=None),
    per_mode: str = Query(default="Totals", pattern="^(Totals|PerGame)$"),
):
    resolved_season = _resolve_season(season)
    cache_key = f"playtypes:{resolved_season}:{player_or_team}:{play_type}:{per_mode}"
    cached = _cache_get(cache_key)
    if cached is not None:
        return cached

    Endpoint = _load_endpoint("synergyplaytypes", "SynergyPlayTypes")
    try:
        endpoint = Endpoint(
            league_id="00",
            per_mode_simple=per_mode,
            player_or_team_abbreviation=player_or_team,
            season_type_all_star="Regular Season",
            season=resolved_season,
            play_type_nullable=play_type or "",
            type_grouping_nullable="",
            timeout=45,
        )
        time.sleep(0.6)
        rows = _rows_from_endpoint(endpoint)
        result = {
            "source": "stats.nba.com",
            "source_tier": "TIER_1_OFFICIAL",
            "data_quality": "HIGH" if rows else "LOW",
            "season": resolved_season,
            "play_type": play_type,
            "player_or_team": player_or_team,
            "rows": rows,
            "fetched_at": _iso_now(),
        }
        _cache_set(cache_key, result)
        return result
    except Exception as exc:
        logger.warning("Synergy play-type data unavailable: %s", exc)
        raise HTTPException(
            status_code=503,
            detail={
                "error": str(exc),
                "source": "stats.nba.com",
                "source_tier": "TIER_1_OFFICIAL",
                "data_quality": "LOW",
            },
        ) from exc


@app.get("/teams/{team_id}/lineups")
def get_team_lineups(
    team_id: int,
    season: Optional[str] = Query(default=None),
    last_n_games: int = Query(default=0, ge=0, le=82),
):
    resolved_season = _resolve_season(season)
    cache_key = f"lineups:{team_id}:{resolved_season}:{last_n_games}"
    cached = _cache_get(cache_key)
    if cached is not None:
        return cached

    Endpoint = _load_endpoint("teamdashlineups", "TeamDashLineups")
    try:
        endpoint = Endpoint(
            team_id=team_id,
            group_quantity=5,
            last_n_games=last_n_games,
            measure_type_detailed_defense="Advanced",
            per_mode_detailed="Totals",
            season=resolved_season,
            season_type_all_star="Regular Season",
            timeout=45,
        )
        time.sleep(0.6)
        rows = _rows_from_endpoint(endpoint)
        result = {
            "source": "stats.nba.com",
            "source_tier": "TIER_1_OFFICIAL",
            "data_quality": "HIGH" if rows else "LOW",
            "team_id": team_id,
            "season": resolved_season,
            "rows": rows,
            "fetched_at": _iso_now(),
        }
        _cache_set(cache_key, result)
        return result
    except Exception as exc:
        logger.warning("Team lineup data unavailable for %s: %s", team_id, exc)
        raise HTTPException(
            status_code=503,
            detail={
                "error": str(exc),
                "source": "stats.nba.com",
                "source_tier": "TIER_1_OFFICIAL",
                "data_quality": "LOW",
            },
        ) from exc


@app.get("/teams/{team_id}/on-off")
def get_team_on_off(
    team_id: int,
    season: Optional[str] = Query(default=None),
    last_n_games: int = Query(default=0, ge=0, le=82),
):
    resolved_season = _resolve_season(season)
    cache_key = f"onoff:{team_id}:{resolved_season}:{last_n_games}"
    cached = _cache_get(cache_key)
    if cached is not None:
        return cached

    Endpoint = _load_endpoint("teamplayeronoffsummary", "TeamPlayerOnOffSummary")
    try:
        endpoint = Endpoint(
            team_id=team_id,
            last_n_games=last_n_games,
            measure_type_detailed_defense="Advanced",
            per_mode_detailed="Per100Possessions",
            season=resolved_season,
            season_type_all_star="Regular Season",
            timeout=45,
        )
        time.sleep(0.6)
        rows = _rows_from_endpoint(endpoint)
        result = {
            "source": "stats.nba.com",
            "source_tier": "TIER_1_OFFICIAL",
            "data_quality": "HIGH" if rows else "LOW",
            "team_id": team_id,
            "season": resolved_season,
            "rows": rows,
            "fetched_at": _iso_now(),
        }
        _cache_set(cache_key, result)
        return result
    except Exception as exc:
        logger.warning("Team on/off data unavailable for %s: %s", team_id, exc)
        raise HTTPException(
            status_code=503,
            detail={
                "error": str(exc),
                "source": "stats.nba.com",
                "source_tier": "TIER_1_OFFICIAL",
                "data_quality": "LOW",
            },
        ) from exc


# ---------------------------------------------------------------------------
# Lower-tier fallback reporting feeds
# ---------------------------------------------------------------------------

@app.get("/injuries")
def get_injuries():
    """Fetch ESPN injury reporting as a fallback source.

    Phase 4 will place the official NBA injury report ahead of this adapter. The
    critical invariant is already enforced here: reported_at is a report/ingest
    timestamp and can never be ESPN's returnDate.
    """
    fetched_at = _iso_now()
    try:
        resp = _requests.get(
            "https://site.api.espn.com/apis/site/v2/sports/basketball/nba/injuries",
            timeout=10,
            headers={"Accept": "application/json", "User-Agent": "Mozilla/5.0"},
        )
        resp.raise_for_status()
        raw = resp.json()
    except Exception as exc:
        return {
            "injuries": [],
            "error": str(exc),
            "source": "espn",
            "source_tier": "TIER_3_REPORTING",
            "data_quality": "LOW",
            "fetched_at": fetched_at,
        }

    injuries = []
    for team_block in raw.get("injuries", []):
        team_abbr = team_block.get("team", {}).get("abbreviation", "")
        for item in team_block.get("injuries", []):
            athlete = item.get("athlete", {})
            details = item.get("details") or {}
            source_reported_at = item.get("date") or item.get("lastModified") or fetched_at
            injuries.append({
                "player_name": athlete.get("displayName", ""),
                "espn_id": str(athlete.get("id", "")),
                "team_abbr": team_abbr,
                "status": item.get("status", "Questionable"),
                "description": details.get("detail") or item.get("shortComment", ""),
                "return_eta": details.get("returnDate", ""),
                "source": "espn",
                "source_tier": "TIER_3_REPORTING",
                "reported_at": source_reported_at,
                "fetched_at": fetched_at,
            })
    return {
        "injuries": injuries,
        "source": "espn",
        "source_tier": "TIER_3_REPORTING",
        "data_quality": "MEDIUM" if injuries else "LOW",
        "fetched_at": fetched_at,
    }


@app.get("/news")
def get_news():
    fetched_at = _iso_now()
    try:
        resp = _requests.get(
            "https://site.api.espn.com/apis/site/v2/sports/basketball/nba/news",
            timeout=10,
            params={"limit": 50},
            headers={"Accept": "application/json", "User-Agent": "Mozilla/5.0"},
        )
        resp.raise_for_status()
        raw = resp.json()
    except Exception as exc:
        return {
            "items": [],
            "error": str(exc),
            "source": "espn",
            "source_tier": "TIER_3_REPORTING",
            "data_quality": "LOW",
            "fetched_at": fetched_at,
        }

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
            "source_tier": "TIER_3_REPORTING",
            "player_name": player_name,
            "team_abbr": team_abbr,
            "published_at": article.get("published", ""),
            "fetched_at": fetched_at,
        })
    return {
        "items": items,
        "source": "espn",
        "source_tier": "TIER_3_REPORTING",
        "data_quality": "MEDIUM" if items else "LOW",
        "fetched_at": fetched_at,
    }
