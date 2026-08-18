"""Small official-data routes used to resolve NBA IDs for typed ingestion."""

from fastapi import APIRouter
from nba_api.stats.static import teams

router = APIRouter(prefix="/official", tags=["official-data"])


@router.get("/teams")
def official_teams():
    rows = teams.get_teams()
    return {
        "source": "nba_api.stats.static",
        "source_tier": "TIER_1_OFFICIAL",
        "data_quality": "HIGH" if rows else "LOW",
        "teams": [
            {
                "nba_id": row.get("id"),
                "full_name": row.get("full_name"),
                "abbreviation": row.get("abbreviation"),
                "nickname": row.get("nickname"),
                "city": row.get("city"),
            }
            for row in rows
        ],
    }
