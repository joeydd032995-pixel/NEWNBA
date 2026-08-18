"""Production FastAPI entrypoint for NEWNBA.

Keeps the baseline ``main:app`` intact and composes additive production routes
for official injury/referee reports and typed Opportunity-First ingestion.
"""

from main import app
from official_injury_service import router as official_injury_router
from official_referee_service import router as official_referee_router
from opportunity_routes import router as opportunity_router

app.include_router(official_injury_router)
app.include_router(official_referee_router)
app.include_router(opportunity_router)

__all__ = ["app"]
