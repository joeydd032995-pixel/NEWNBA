"""Tier-1 NBA injury report service with Eastern-time report timestamps."""

from __future__ import annotations

import io
import re
from datetime import datetime
from typing import Any
from urllib.parse import urljoin
from zoneinfo import ZoneInfo

import pdfplumber
import requests
from fastapi import APIRouter, HTTPException, Query

router = APIRouter(prefix="/injuries", tags=["injuries"])
ET = ZoneInfo("America/New_York")
UTC = ZoneInfo("UTC")
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


def current_nba_season(now: datetime | None = None) -> str:
    dt = now or datetime.now(ET)
    start_year = dt.year if dt.month >= 7 else dt.year - 1
    return f"{start_year}-{str(start_year + 1)[-2:]}"


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
        day = datetime.strptime(match.group("date"), "%Y-%m-%d")
        return day.replace(hour=hour, minute=minute, tzinfo=ET)
    except ValueError:
        return None


def discover_report_urls(season: str, timeout: int = 12) -> list[str]:
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
            if "nba.com" in url:
                found.add(url)
        for raw in RELATIVE_PDF_RE.findall(html):
            url = urljoin(page_url, raw)
            if "nba.com" in url:
                found.add(url)

    minimum = datetime.min.replace(tzinfo=ET)
    return sorted(found, key=lambda url: parse_report_timestamp(url) or minimum, reverse=True)


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
    if status == "doubtful":
        return "DOUBTFUL"
    if status == "questionable":
        return "QUESTIONABLE"
    if status in {"game time decision", "game-time decision", "gtd"}:
        return "GTD"
    if status == "probable":
        return "PROBABLE"
    if status in {"available", "active", "available to play"}:
        return "ACTIVE"
    return status.upper().replace(" ", "_") if status else "QUESTIONABLE"


def locate_header(rows: list[list[Any]]) -> tuple[int, dict[str, int]] | None:
    aliases = {
        "game_date": {"game_date", "game_date_est"},
        "game_time": {"game_time", "game_time_et"},
        "matchup": {"matchup"},
        "team": {"team", "team_name"},
        "player_name": {"player_name", "player"},
        "current_status": {"current_status", "status"},
        "reason": {"reason", "injury_reason"},
    }
    for row_index, row in enumerate(rows[:10]):
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
            return row_index, mapping
    return None


def cell(row: list[Any], mapping: dict[str, int], key: str) -> str:
    column = mapping.get(key)
    return normalize_cell(row[column]) if column is not None and column < len(row) else ""


def parse_official_pdf(pdf_bytes: bytes, report_url: str) -> list[dict[str, Any]]:
    report_ts = parse_report_timestamp(report_url) or datetime.now(ET)
    injuries: list[dict[str, Any]] = []
    inherited = {"game_date": "", "game_time": "", "matchup": "", "team": ""}

    with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
        for page in pdf.pages:
            for rows in page.extract_tables() or []:
                located = locate_header(rows)
                if not located:
                    continue
                header_index, mapping = located
                for row in rows[header_index + 1 :]:
                    if not row:
                        continue
                    player_name = cell(row, mapping, "player_name")
                    status_raw = cell(row, mapping, "current_status")
                    if not player_name or not status_raw:
                        continue
                    for key in inherited:
                        value = cell(row, mapping, key)
                        if value:
                            inherited[key] = value

                    injuries.append({
                        "player_name": player_name,
                        "team_name": inherited["team"],
                        "matchup": inherited["matchup"],
                        "game_date": inherited["game_date"],
                        "game_time": inherited["game_time"],
                        "status": normalize_status(status_raw),
                        "description": cell(row, mapping, "reason") or None,
                        "return_eta": None,
                        "source": "official_nba_injury_report",
                        "source_tier": "TIER_1_OFFICIAL",
                        "reported_at": report_ts.astimezone(UTC).isoformat(),
                        "report_url": report_url,
                    })
    return injuries


def latest_official_report(season: str | None = None, timeout: int = 15) -> dict[str, Any]:
    resolved_season = season or current_nba_season()
    urls = discover_report_urls(resolved_season, timeout=timeout)
    fetched_at = datetime.now(UTC).isoformat()
    if not urls:
        return {
            "injuries": [],
            "source": "official_nba_injury_report",
            "source_tier": "TIER_1_OFFICIAL",
            "data_quality": "LOW",
            "season": resolved_season,
            "error": "No official injury-report PDF discovered",
            "fetched_at": fetched_at,
        }

    errors: list[str] = []
    for report_url in urls[:6]:
        try:
            response = requests.get(report_url, headers=HEADERS, timeout=timeout)
            response.raise_for_status()
            injuries = parse_official_pdf(response.content, report_url)
            if injuries:
                report_ts = parse_report_timestamp(report_url) or datetime.now(ET)
                return {
                    "injuries": injuries,
                    "source": "official_nba_injury_report",
                    "source_tier": "TIER_1_OFFICIAL",
                    "data_quality": "HIGH",
                    "season": resolved_season,
                    "report_url": report_url,
                    "reported_at": report_ts.astimezone(UTC).isoformat(),
                    "fetched_at": fetched_at,
                }
            errors.append(f"{report_url}: parsed zero rows")
        except Exception as exc:
            errors.append(f"{report_url}: {exc}")

    return {
        "injuries": [],
        "source": "official_nba_injury_report",
        "source_tier": "TIER_1_OFFICIAL",
        "data_quality": "LOW",
        "season": resolved_season,
        "error": "; ".join(errors[-3:]) or "Official report unavailable",
        "fetched_at": fetched_at,
    }


@router.get("/official")
def official_injuries(season: str | None = Query(default=None, pattern=r"^\d{4}-\d{2}$")):
    result = latest_official_report(season)
    if not result["injuries"]:
        raise HTTPException(status_code=503, detail=result)
    return result
