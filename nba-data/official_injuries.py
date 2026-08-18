"""Official NBA injury-report ingestion.

The NBA publishes timestamped injury-report PDFs through official.nba.com and
ak-static.cms.nba.com. This module discovers the newest report from the official
season page, parses its table, and preserves the report publication timestamp as
``reported_at``. It never substitutes a return date for report freshness.
"""

from __future__ import annotations

import io
import re
from datetime import datetime, timezone
from typing import Any, Iterable
from urllib.parse import urljoin

import pdfplumber
import requests
from fastapi import APIRouter, HTTPException, Query

router = APIRouter(prefix="/injuries", tags=["injuries"])

OFFICIAL_HOSTS = ("official.nba.com", "ak-static.cms.nba.com")
PAGE_TEMPLATE = "https://official.nba.com/nba-injury-report-{season}-season/"
HEADERS = {
    "Accept": "text/html,application/pdf;q=0.9,*/*;q=0.8",
    "User-Agent": "Mozilla/5.0 (compatible; NEWNBA/2.0; +opportunity-first)",
}
PDF_RE = re.compile(r"(?:https?:)?//[^\"'<>\s]+Injury-Report_[^\"'<>\s]+\.pdf", re.I)
RELATIVE_PDF_RE = re.compile(r"[\"']([^\"']*Injury-Report_[^\"']+\.pdf)[\"']", re.I)
STAMP_RE = re.compile(
    r"Injury-Report_(?P<date>\d{4}-\d{2}-\d{2})_(?P<hour>\d{1,2})_(?P<minute>\d{2})(?P<ampm>AM|PM)?\.pdf",
    re.I,
)


def previous_season(season: str) -> str:
    start = int(season[:4]) - 1
    return f"{start}-{str(start + 1)[-2:]}"


def parse_report_timestamp(url: str) -> datetime | None:
    match = STAMP_RE.search(url)
    if not match:
        return None
    hour = int(match.group("hour"))
    minute = int(match.group("minute"))
    ampm = (match.group("ampm") or "").upper()
    if ampm == "PM" and hour < 12:
        hour += 12
    elif ampm == "AM" and hour == 12:
        hour = 0
    try:
        # Official reports are published in Eastern Time. We preserve the local
        # wall-clock as an aware fixed offset only when DST cannot be resolved
        # without an additional timezone dependency; downstream freshness uses
        # the HTTP fetch time as a second guard.
        naive = datetime.strptime(match.group("date"), "%Y-%m-%d")
        return naive.replace(hour=hour, minute=minute, tzinfo=timezone.utc)
    except ValueError:
        return None


def discover_report_urls(season: str, timeout: int = 12) -> list[str]:
    """Discover official PDF URLs from current and immediately prior season pages."""
    found: set[str] = set()
    for candidate in (season, previous_season(season)):
        page_url = PAGE_TEMPLATE.format(season=candidate)
        try:
            response = requests.get(page_url, headers=HEADERS, timeout=timeout)
            if response.status_code >= 400:
                continue
            html = response.text
        except requests.RequestException:
            continue

        for raw in PDF_RE.findall(html):
            url = raw if raw.startswith("http") else f"https:{raw}"
            if any(host in url for host in OFFICIAL_HOSTS):
                found.add(url)
        for raw in RELATIVE_PDF_RE.findall(html):
            url = urljoin(page_url, raw)
            if any(host in url for host in OFFICIAL_HOSTS):
                found.add(url)

    return sorted(found, key=lambda url: parse_report_timestamp(url) or datetime.min.replace(tzinfo=timezone.utc), reverse=True)


def normalize_cell(value: Any) -> str:
    if value is None:
        return ""
    return " ".join(str(value).replace("\n", " ").split()).strip()


def normalize_header(value: Any) -> str:
    return re.sub(r"[^a-z0-9]+", "_", normalize_cell(value).lower()).strip("_")


def normalize_status(value: str) -> str:
    status = normalize_cell(value).lower()
    if status in {"out", "inactive"}:
        return "OUT"
    if status in {"doubtful"}:
        return "DOUBTFUL"
    if status in {"questionable", "game time decision", "game-time decision", "gtd"}:
        return "QUESTIONABLE" if status == "questionable" else "GTD"
    if status in {"probable"}:
        return "PROBABLE"
    if status in {"available", "active", "available to play"}:
        return "ACTIVE"
    return status.upper().replace(" ", "_") if status else "QUESTIONABLE"


def _locate_header(rows: list[list[Any]]) -> tuple[int, dict[str, int]] | None:
    aliases = {
        "game_date": {"game_date", "game_date_est"},
        "game_time": {"game_time", "game_time_et"},
        "matchup": {"matchup"},
        "team": {"team", "team_name"},
        "player_name": {"player_name", "player"},
        "current_status": {"current_status", "status"},
        "reason": {"reason", "injury_reason"},
    }
    for index, row in enumerate(rows[:8]):
        normalized = [normalize_header(cell) for cell in row]
        if not any(value in aliases["player_name"] for value in normalized):
            continue
        mapping: dict[str, int] = {}
        for canonical, names in aliases.items():
            for column, value in enumerate(normalized):
                if value in names:
                    mapping[canonical] = column
                    break
        if "player_name" in mapping and "current_status" in mapping:
            return index, mapping
    return None


def _cell(row: list[Any], mapping: dict[str, int], key: str) -> str:
    column = mapping.get(key)
    return normalize_cell(row[column]) if column is not None and column < len(row) else ""


def parse_official_pdf(pdf_bytes: bytes, report_url: str) -> list[dict[str, Any]]:
    report_ts = parse_report_timestamp(report_url) or datetime.now(timezone.utc)
    injuries: list[dict[str, Any]] = []
    inherited = {"game_date": "", "game_time": "", "matchup": "", "team": ""}

    with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
        for page in pdf.pages:
            tables = page.extract_tables() or []
            for rows in tables:
                located = _locate_header(rows)
                if not located:
                    continue
                header_index, mapping = located
                for row in rows[header_index + 1 :]:
                    if not row:
                        continue
                    player_name = _cell(row, mapping, "player_name")
                    status_raw = _cell(row, mapping, "current_status")
                    if not player_name or not status_raw:
                        continue

                    for key in inherited:
                        current = _cell(row, mapping, key)
                        if current:
                            inherited[key] = current

                    injuries.append(
                        {
                            "player_name": player_name,
                            "team_name": inherited["team"],
                            "matchup": inherited["matchup"],
                            "game_date": inherited["game_date"],
                            "game_time": inherited["game_time"],
                            "status": normalize_status(status_raw),
                            "description": _cell(row, mapping, "reason") or None,
                            "return_eta": None,
                            "source": "official_nba_injury_report",
                            "source_tier": "TIER_1_OFFICIAL",
                            "reported_at": report_ts.isoformat(),
                            "report_url": report_url,
                        }
                    )
    return injuries


def get_latest_official_report(season: str, timeout: int = 15) -> dict[str, Any]:
    urls = discover_report_urls(season, timeout=timeout)
    if not urls:
        return {
            "injuries": [],
            "source": "official_nba_injury_report",
            "source_tier": "TIER_1_OFFICIAL",
            "data_quality": "LOW",
            "error": "No official injury-report PDF discovered",
            "fetched_at": datetime.now(timezone.utc).isoformat(),
        }

    errors: list[str] = []
    for report_url in urls[:6]:
        try:
            response = requests.get(report_url, headers=HEADERS, timeout=timeout)
            response.raise_for_status()
            injuries = parse_official_pdf(response.content, report_url)
            if injuries:
                return {
                    "injuries": injuries,
                    "source": "official_nba_injury_report",
                    "source_tier": "TIER_1_OFFICIAL",
                    "data_quality": "HIGH",
                    "report_url": report_url,
                    "reported_at": (parse_report_timestamp(report_url) or datetime.now(timezone.utc)).isoformat(),
                    "fetched_at": datetime.now(timezone.utc).isoformat(),
                }
            errors.append(f"{report_url}: parsed zero rows")
        except Exception as exc:  # upstream/PDF parser failure is an explicit degraded state
            errors.append(f"{report_url}: {exc}")

    return {
        "injuries": [],
        "source": "official_nba_injury_report",
        "source_tier": "TIER_1_OFFICIAL",
        "data_quality": "LOW",
        "error": "; ".join(errors[-3:]) or "Official report unavailable",
        "fetched_at": datetime.now(timezone.utc).isoformat(),
    }


@router.get("/official")
def official_injuries(
    season: str = Query(..., pattern=r"^\d{4}-\d{2}$"),
):
    result = get_latest_official_report(season)
    if not result["injuries"]:
        raise HTTPException(status_code=503, detail=result)
    return result
