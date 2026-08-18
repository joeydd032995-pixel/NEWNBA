"""Production app entrypoint with additive Opportunity-First routers."""

from main import app
from official_injury_service import router as official_injury_router

app.include_router(official_injury_router)

__all__ = ["app"]
