"""Official NBA player shot-location profiles.

Uses stats.nba.com ShotChartDetail through nba_api. Player zone frequencies and
observed efficiencies come only from official shot events. Expected eFG is
location-based: the player's shot mix is weighted by the official endpoint's
league-average field-goal percentage for each matching shot zone, with 3-point
zones receiving the normal 1.5 eFG multiplier.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, HTTPException, Query
from nba_api.stats.endpoints import shotchartdetail

router = APIRouter(prefix="/shots", tags=["shots"])


def _rows(endpoint: Any) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    normalized = endpoint.get_normalized_dict()
    shots = normalized.get("Shot_Chart_Detail") or normalized.get("ShotChartDetail") or []
    league = normalized.get("LeagueAverages") or normalized.get("League_Averages") or []
    return list(shots), list(league)


def _key(row: dict[str, Any]) -> tuple[str, str, str]:
    return (
        str(row.get("SHOT_ZONE_BASIC") or "").strip(),
        str(row.get("SHOT_ZONE_AREA") or "").strip(),
        str(row.get("SHOT_ZONE_RANGE") or "").strip(),
    )


def _is_three(zone_basic: str) -> bool:
    value = zone_basic.lower()
    return "3" in value or "backcourt" in value


def _bucket(zone_basic: str) -> str | None:
    value = zone_basic.strip().lower()
    if value == "restricted area":
        return "rim"
    if value == "mid-range":
        return "midrange"
    if "corner 3" in value:
        return "corner3"
    if value == "above the break 3":
        return "atb3"
    return None


def summarize_shot_profile(
    shots: list[dict[str, Any]],
    league_rows: list[dict[str, Any]],
) -> dict[str, Any]:
    league_pct: dict[tuple[str, str, str], float] = {}
    for row in league_rows:
        try:
            league_pct[_key(row)] = float(row.get("FG_PCT") or 0)
        except (TypeError, ValueError):
            continue

    buckets = {
        "rim": {"attempts": 0.0, "makes": 0.0},
        "midrange": {"attempts": 0.0, "makes": 0.0},
        "corner3": {"attempts": 0.0, "makes": 0.0},
        "atb3": {"attempts": 0.0, "makes": 0.0},
    }
    total_attempts = 0.0
    expected_efg_numerator = 0.0
    expected_attempts = 0.0

    for shot in shots:
        total_attempts += 1
        zone_basic = str(shot.get("SHOT_ZONE_BASIC") or "").strip()
        bucket = _bucket(zone_basic)
        made = 1.0 if int(shot.get("SHOT_MADE_FLAG") or 0) == 1 else 0.0
        if bucket:
            buckets[bucket]["attempts"] += 1
            buckets[bucket]["makes"] += made

        expected_pct = league_pct.get(_key(shot))
        if expected_pct is not None:
            expected_efg_numerator += expected_pct * (1.5 if _is_three(zone_basic) else 1.0)
            expected_attempts += 1

    def metric(name: str) -> dict[str, float]:
        attempts = buckets[name]["attempts"]
        makes = buckets[name]["makes"]
        return {
            "attempts": attempts,
            "frequency": attempts / total_attempts if total_attempts else 0.0,
            "efficiency": makes / attempts if attempts else 0.0,
        }

    return {
        "total_attempts": total_attempts,
        "rim": metric("rim"),
        "midrange": metric("midrange"),
        "corner3": metric("corner3"),
        "atb3": metric("atb3"),
        "expected_efg": expected_efg_numerator / expected_attempts if expected_attempts else None,
        "expected_efg_sample": expected_attempts,
    }


def get_player_shot_profile(player_id: int, season: str, season_type: str = "Regular Season") -> dict[str, Any]:
    fetched_at = datetime.now(timezone.utc).isoformat()
    try:
        endpoint = shotchartdetail.ShotChartDetail(
            team_id=0,
            player_id=player_id,
            context_measure_simple="FGA",
            season_nullable=season,
            season_type_all_star=season_type,
        )
        shots, league_rows = _rows(endpoint)
        profile = summarize_shot_profile(shots, league_rows)
        return {
            "player_id": player_id,
            "season": season,
            "season_type": season_type,
            "profile": profile,
            "source": "stats.nba.com/shotchartdetail",
            "source_tier": "TIER_1_OFFICIAL",
            "data_quality": "HIGH" if profile["total_attempts"] >= 50 and profile["expected_efg"] is not None else "MEDIUM" if shots else "LOW",
            "fetched_at": fetched_at,
        }
    except Exception as exc:
        return {
            "player_id": player_id,
            "season": season,
            "season_type": season_type,
            "profile": None,
            "source": "stats.nba.com/shotchartdetail",
            "source_tier": "TIER_1_OFFICIAL",
            "data_quality": "LOW",
            "error": str(exc),
            "fetched_at": fetched_at,
        }


@router.get("/players/{player_id}/profile")
def player_shot_profile(
    player_id: int,
    season: str = Query(..., pattern=r"^\d{4}-\d{2}$"),
    season_type: str = Query("Regular Season"),
):
    result = get_player_shot_profile(player_id, season, season_type)
    if result.get("profile") is None:
        raise HTTPException(status_code=503, detail=result)
    return result
