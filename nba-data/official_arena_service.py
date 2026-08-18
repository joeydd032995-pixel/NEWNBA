"""Official NBA team-profile arena ingestion.

NBA team profile pages expose current ``City`` and ``Arena`` background fields.
This adapter reads only those first-party fields. It deliberately does not infer
coordinates, time zones, travel distance or altitude from city/arena names.
"""

from __future__ import annotations

import re
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from html import unescape
from typing import Any

import requests
from fastapi import APIRouter, HTTPException

router = APIRouter(prefix="/arenas", tags=["arenas"])

TEAM_IDS: dict[str, int] = {
    "ATL": 1610612737, "BOS": 1610612738, "CLE": 1610612739, "NOP": 1610612740,
    "CHI": 1610612741, "DAL": 1610612742, "DEN": 1610612743, "GSW": 1610612744,
    "HOU": 1610612745, "LAC": 1610612746, "LAL": 1610612747, "MIA": 1610612748,
    "MIL": 1610612749, "MIN": 1610612750, "BKN": 1610612751, "NYK": 1610612752,
    "ORL": 1610612753, "IND": 1610612754, "PHI": 1610612755, "PHX": 1610612756,
    "POR": 1610612757, "SAC": 1610612758, "SAS": 1610612759, "OKC": 1610612760,
    "TOR": 1610612761, "UTA": 1610612762, "MEM": 1610612763, "WAS": 1610612764,
    "DET": 1610612765, "CHA": 1610612766,
}

PROFILE_URL = "https://www.nba.com/team/{team_id}"
HEADERS = {
    "Accept": "text/html,*/*;q=0.8",
    "User-Agent": "Mozilla/5.0 (compatible; NEWNBA/2.0; +opportunity-first)",
}

CITY_ARENA_RE = re.compile(
    r"\bCity\s+(?P<city>.+?)\s+Arena\s+(?P<arena>.+?)\s+(?:G-League|G League|Governor\(s\)|General Manager|Head Coach)\b",
    re.I | re.S,
)
TAG_RE = re.compile(r"<[^>]+>")
SPACE_RE = re.compile(r"\s+")


def _visible_text(html: str) -> str:
    text = TAG_RE.sub(" ", html)
    text = unescape(text).replace("\xa0", " ")
    return SPACE_RE.sub(" ", text).strip()


def parse_team_profile(html: str) -> dict[str, str] | None:
    text = _visible_text(html)
    match = CITY_ARENA_RE.search(text)
    if not match:
        return None
    city = SPACE_RE.sub(" ", match.group("city")).strip(" :-")
    arena = SPACE_RE.sub(" ", match.group("arena")).strip(" :-")
    if not city or not arena:
        return None
    return {"city": city, "arena": arena}


def fetch_team_arena(team_abbr: str, team_id: int, timeout: int = 15) -> dict[str, Any]:
    url = PROFILE_URL.format(team_id=team_id)
    fetched_at = datetime.now(timezone.utc).isoformat()
    try:
        response = requests.get(url, headers=HEADERS, timeout=timeout)
        response.raise_for_status()
        parsed = parse_team_profile(response.text)
        if not parsed:
            return {
                "team_abbr": team_abbr,
                "team_id": team_id,
                "arena": None,
                "city": None,
                "source": "nba_team_profile",
                "source_tier": "TIER_1_OFFICIAL",
                "data_quality": "LOW",
                "source_url": url,
                "fetched_at": fetched_at,
                "error": "Current NBA team profile did not expose parseable City/Arena fields",
            }
        return {
            "team_abbr": team_abbr,
            "team_id": team_id,
            **parsed,
            "source": "nba_team_profile",
            "source_tier": "TIER_1_OFFICIAL",
            "data_quality": "HIGH",
            "source_url": url,
            "fetched_at": fetched_at,
        }
    except requests.RequestException as exc:
        return {
            "team_abbr": team_abbr,
            "team_id": team_id,
            "arena": None,
            "city": None,
            "source": "nba_team_profile",
            "source_tier": "TIER_1_OFFICIAL",
            "data_quality": "LOW",
            "source_url": url,
            "fetched_at": fetched_at,
            "error": str(exc),
        }


def get_official_arenas(timeout: int = 15, workers: int = 8) -> dict[str, Any]:
    arenas_by_team: dict[str, dict[str, Any]] = {}
    # Bound concurrency so the endpoint completes well inside the backend's
    # request timeout without opening an excessive number of connections.
    with ThreadPoolExecutor(max_workers=max(1, min(workers, 10))) as executor:
        futures = {
            executor.submit(fetch_team_arena, abbr, team_id, timeout): abbr
            for abbr, team_id in TEAM_IDS.items()
        }
        for future in as_completed(futures):
            abbr = futures[future]
            try:
                arenas_by_team[abbr] = future.result()
            except Exception as exc:  # defensive: one team must not fail the batch
                arenas_by_team[abbr] = {
                    "team_abbr": abbr,
                    "team_id": TEAM_IDS[abbr],
                    "arena": None,
                    "city": None,
                    "source": "nba_team_profile",
                    "source_tier": "TIER_1_OFFICIAL",
                    "data_quality": "LOW",
                    "source_url": PROFILE_URL.format(team_id=TEAM_IDS[abbr]),
                    "fetched_at": datetime.now(timezone.utc).isoformat(),
                    "error": str(exc),
                }

    # Preserve stable team order for deterministic API/test output.
    arenas = [arenas_by_team[abbr] for abbr in TEAM_IDS]
    successful = [row for row in arenas if row.get("arena") and row.get("city")]
    return {
        "arenas": arenas,
        "source": "nba_team_profiles",
        "source_tier": "TIER_1_OFFICIAL",
        "data_quality": "HIGH" if len(successful) == len(TEAM_IDS) else "MEDIUM" if successful else "LOW",
        "fetched_at": datetime.now(timezone.utc).isoformat(),
        "successful": len(successful),
        "expected": len(TEAM_IDS),
    }


@router.get("/official")
def official_arenas():
    result = get_official_arenas()
    if not result["successful"]:
        raise HTTPException(status_code=503, detail=result)
    return result
