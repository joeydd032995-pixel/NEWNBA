#!/usr/bin/env python3
"""Read-only connectivity + payload-shape probe for every upstream NEWNBA depends on.

Run where outbound network and keys exist (the Claude cloud sandbox blocks stats.nba.com).
Never writes to a database, never fabricates data. Result per probe:
  PASS        reachable and payload shape is what the adapters expect
  FAIL        reachable but wrong status/shape (adapter will misbehave)
  UNVERIFIED  not reachable from this host / credential absent (says nothing about the provider)
Exit code 1 if any FAIL. UNVERIFIED does not fail the run but is printed loudly.

Usage:  ODDS_API_KEY=... BALLDONTLIE_API_KEY=... NBA_DATA_URL=http://localhost:8000 python probe_apis.py
"""
import json, os, sys, urllib.request, urllib.error
from datetime import datetime, timezone

T = 20
results = []

def get(url, headers=None):
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0", "Accept": "application/json", **(headers or {})})
    try:
        with urllib.request.urlopen(req, timeout=T) as r:
            return r.status, json.loads(r.read().decode() or "null"), None
    except urllib.error.HTTPError as e:
        return e.code, None, f"HTTP {e.code}"
    except Exception as e:  # DNS, TLS, timeout, proxy block
        return None, None, f"{type(e).__name__}: {e}"

def record(name, status, detail=""):
    results.append((name, status, detail)); print(f"{status:10} {name}  {detail}")

def expect_season():
    now = datetime.now(timezone.utc); start = now.year if now.month >= 7 else now.year - 1
    return f"{start}-{str(start + 1)[2:]}"

# 1. sidecar
base = os.environ.get("NBA_DATA_URL", "http://localhost:8000")
s, body, err = get(f"{base}/health")
if s != 200: record("nba-data /health", "UNVERIFIED", f"{base} not reachable ({err})")
else:
    ok = body.get("current_season") == expect_season()
    record("nba-data /health + season resolution", "PASS" if ok else "FAIL", f"season={body.get('current_season')} expected={expect_season()}")

# 2. ESPN injuries (Tier-3 fallback): the adapter needs team + athlete id
s, body, err = get("https://site.api.espn.com/apis/site/v2/sports/basketball/nba/injuries")
if s != 200: record("ESPN injuries", "UNVERIFIED", err)
else:
    teams = body.get("injuries", []); first = next((i for t in teams for i in t.get("injuries", [])), {})
    a = first.get("athlete", {}); has_block_abbr = bool(teams and teams[0].get("team", {}).get("abbreviation"))
    has_ath_team = bool(a.get("team", {}).get("abbreviation")); has_ath_id = bool(a.get("id"))
    # nba-data/main.py currently reads team_block['team']['abbreviation'] and athlete['id']
    record("ESPN injuries shape matches nba-data/main.py parser", "PASS" if (has_block_abbr and has_ath_id) else "FAIL",
           f"block.team.abbreviation={has_block_abbr} athlete.id={has_ath_id} (athlete.team.abbreviation={has_ath_team} available)")

# 3. ESPN news must be NBA-only
s, body, err = get("https://site.api.espn.com/apis/site/v2/sports/basketball/nba/news")
if s != 200: record("ESPN news", "UNVERIFIED", err)
else:
    NBA = set("ATL BOS BKN CHA CHI CLE DAL DEN DET GS HOU IND LAC LAL MEM MIA MIL MIN NO NY OKC ORL PHI PHX POR SAC SA TOR UTAH UTA WSH".split())
    abbrs = {c.get("team", {}).get("abbreviation") for art in body.get("articles", []) for c in art.get("categories", []) if c.get("type") == "team"}
    foreign = sorted(a for a in abbrs if a and a not in NBA)
    record("ESPN news categories are NBA teams only", "PASS" if not foreign else "FAIL", f"non-NBA team tags: {foreign or 'none'}")

# 4. official NBA (Tier 1): blocked in the cloud sandbox -> UNVERIFIED there
for name, url in [("stats.nba.com", "https://stats.nba.com/stats/commonteamyears?LeagueID=00"), ("cdn.nba.com", "https://cdn.nba.com/static/json/liveData/scoreboard/todaysScoreboard_00.json")]:
    s, _, err = get(url, {"Referer": "https://www.nba.com/", "Origin": "https://www.nba.com"})
    record(f"{name} reachable", "PASS" if s == 200 else "UNVERIFIED", err or "")

# 5. The Odds API (free /sports call; does not consume quota)
key = os.environ.get("ODDS_API_KEY")
if not key: record("The Odds API", "UNVERIFIED", "ODDS_API_KEY not set")
else:
    s, body, err = get(f"https://api.the-odds-api.com/v4/sports?apiKey={key}")
    record("The Odds API key valid + basketball_nba listed", "PASS" if s == 200 and any(x.get("key") == "basketball_nba" for x in body or []) else "FAIL", err or "")

# 6. BallDontLie
key = os.environ.get("BALLDONTLIE_API_KEY")
if not key: record("BallDontLie", "UNVERIFIED", "BALLDONTLIE_API_KEY not set")
else:
    s, body, err = get("https://api.balldontlie.io/v1/teams", {"Authorization": key})
    record("BallDontLie key valid", "PASS" if s == 200 and body and body.get("data") else "FAIL", err or "")

print(); fails = [r for r in results if r[1] == "FAIL"]; unv = [r for r in results if r[1] == "UNVERIFIED"]
print(f"{len(results)-len(fails)-len(unv)} PASS, {len(fails)} FAIL, {len(unv)} UNVERIFIED")
sys.exit(1 if fails else 0)
