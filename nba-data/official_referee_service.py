"""Official NBA daily referee-assignment ingestion.

The official NBA officiating site publishes the game-day crew table at
https://official.nba.com/referee-assignments/. This adapter parses only the
``NBA Referee Assignments`` section and never substitutes WNBA assignments or
fabricated officials when the NBA table is empty.
"""

from __future__ import annotations

import re
from datetime import datetime, timezone
from html.parser import HTMLParser
from typing import Any

import requests
from fastapi import APIRouter, HTTPException

router = APIRouter(prefix="/referees", tags=["referees"])

ASSIGNMENTS_URL = "https://official.nba.com/referee-assignments/"
HEADERS = {
    "Accept": "text/html,*/*;q=0.8",
    "User-Agent": "Mozilla/5.0 (compatible; NEWNBA/2.0; +opportunity-first)",
}
DATE_RE = re.compile(
    r"\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},\s+\d{4}\b",
    re.I,
)
OFFICIAL_RE = re.compile(r"^(?P<name>.+?)\s*\(#(?P<number>\d+)\)\s*$")


class AssignmentTableParser(HTMLParser):
    """Small DOM-state parser to avoid adding a scraping dependency.

    The site can contain both NBA and WNBA tables. Rows are captured only while
    the most recent section heading is exactly ``NBA Referee Assignments``.
    """

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self._heading_depth = 0
        self._heading_parts: list[str] = []
        self._active_section = ""
        self._in_table = False
        self._in_row = False
        self._in_cell = False
        self._cell_parts: list[str] = []
        self._row: list[str] = []
        self.rows: list[list[str]] = []
        self.nba_text: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        lower = tag.lower()
        if lower in {"h1", "h2", "h3", "h4"}:
            self._heading_depth += 1
            self._heading_parts = []
        elif lower == "table" and self._active_section == "nba referee assignments":
            self._in_table = True
        elif lower == "tr" and self._in_table:
            self._in_row = True
            self._row = []
        elif lower in {"th", "td"} and self._in_row:
            self._in_cell = True
            self._cell_parts = []

    def handle_endtag(self, tag: str) -> None:
        lower = tag.lower()
        if lower in {"h1", "h2", "h3", "h4"} and self._heading_depth:
            heading = normalize_text(" ".join(self._heading_parts)).lower()
            self._active_section = heading
            self._heading_depth -= 1
            self._heading_parts = []
        elif lower in {"th", "td"} and self._in_cell:
            self._row.append(normalize_text(" ".join(self._cell_parts)))
            self._cell_parts = []
            self._in_cell = False
        elif lower == "tr" and self._in_row:
            if any(self._row):
                self.rows.append(self._row)
            self._row = []
            self._in_row = False
        elif lower == "table" and self._in_table:
            self._in_table = False

    def handle_data(self, data: str) -> None:
        value = normalize_text(data)
        if not value:
            return
        if self._heading_depth:
            self._heading_parts.append(value)
        if self._active_section == "nba referee assignments":
            self.nba_text.append(value)
        if self._in_cell:
            self._cell_parts.append(value)


def normalize_text(value: Any) -> str:
    return " ".join(str(value or "").replace("\xa0", " ").split()).strip()


def parse_official(value: str) -> dict[str, Any] | None:
    text = normalize_text(value)
    if not text or text in {"-", "—", "N/A"}:
        return None
    match = OFFICIAL_RE.match(text)
    if match:
        return {"name": normalize_text(match.group("name")), "number": int(match.group("number"))}
    return {"name": text, "number": None}


def parse_assignment_html(html: str) -> dict[str, Any]:
    parser = AssignmentTableParser()
    parser.feed(html)

    assignment_date = None
    section_text = " ".join(parser.nba_text)
    date_match = DATE_RE.search(section_text)
    if date_match:
        try:
            assignment_date = datetime.strptime(date_match.group(0), "%B %d, %Y").date().isoformat()
        except ValueError:
            assignment_date = None

    rows = parser.rows
    if rows and normalize_text(rows[0][0]).lower() == "game":
        rows = rows[1:]

    assignments: list[dict[str, Any]] = []
    for row in rows:
        if not row or len(row) < 4:
            continue
        game = normalize_text(row[0])
        if not game or "@" not in game:
            continue
        assignments.append(
            {
                "game": game,
                "crew_chief": parse_official(row[1] if len(row) > 1 else ""),
                "referee": parse_official(row[2] if len(row) > 2 else ""),
                "umpire": parse_official(row[3] if len(row) > 3 else ""),
                "alternate": parse_official(row[4] if len(row) > 4 else ""),
            }
        )

    return {
        "assignments": assignments,
        "assignment_date": assignment_date,
        "source": "official_nba_referee_assignments",
        "source_tier": "TIER_1_OFFICIAL",
        "data_quality": "HIGH" if assignments else "LOW",
    }


def get_official_assignments(timeout: int = 15) -> dict[str, Any]:
    fetched_at = datetime.now(timezone.utc).isoformat()
    try:
        response = requests.get(ASSIGNMENTS_URL, headers=HEADERS, timeout=timeout)
        response.raise_for_status()
        result = parse_assignment_html(response.text)
        result["fetched_at"] = fetched_at
        result["source_url"] = ASSIGNMENTS_URL
        return result
    except requests.RequestException as exc:
        return {
            "assignments": [],
            "assignment_date": None,
            "source": "official_nba_referee_assignments",
            "source_tier": "TIER_1_OFFICIAL",
            "data_quality": "LOW",
            "fetched_at": fetched_at,
            "source_url": ASSIGNMENTS_URL,
            "error": str(exc),
        }


@router.get("/official")
def official_referee_assignments():
    result = get_official_assignments()
    if result.get("error"):
        raise HTTPException(status_code=503, detail=result)
    return result
