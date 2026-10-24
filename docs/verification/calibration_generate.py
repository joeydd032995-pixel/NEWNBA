"""Ground-truth calibration harness (synthetic generative players; harness-only, never persisted).
Transcribes assembler.buildOpportunityModel/buildUncertainty (no-tracking fallback path)."""
import json, sys, math
import numpy as np

rng = np.random.default_rng(777)
ARCH = {
  # name: minutes mean/sd, fga per min, 3pa share, fg2%, fg3%, fta per fga, reb/min, ast/min, game-role CV
  "scoring_wing":   dict(m=34, ms=3.0, fgapm=0.55, s3=0.40, p2=0.54, p3=0.37, fta=0.28, rpm=0.18, apm=0.12, cv=0.15),
  "3pt_specialist": dict(m=30, ms=3.5, fgapm=0.42, s3=0.68, p2=0.52, p3=0.38, fta=0.10, rpm=0.12, apm=0.08, cv=0.15),
  "big_man":        dict(m=29, ms=3.0, fgapm=0.40, s3=0.05, p2=0.60, p3=0.30, fta=0.35, rpm=0.38, apm=0.07, cv=0.15),
  "playmaker":      dict(m=35, ms=2.5, fgapm=0.46, s3=0.45, p2=0.50, p3=0.36, fta=0.25, rpm=0.14, apm=0.30, cv=0.15),
}

def sim_games(a, n, rg):
    mins = np.clip(rg.normal(a["m"], a["ms"], n), 12, 44)
    g = rg.gamma(1 / a["cv"] ** 2, a["cv"] ** 2, n)  # mean 1 game-role factor
    fga = rg.poisson(a["fgapm"] * mins * g)
    fg3a = rg.binomial(fga, a["s3"]); fg2a = fga - fg3a
    fg3m = rg.binomial(fg3a, a["p3"]); fg2m = rg.binomial(fg2a, a["p2"])
    fta = rg.poisson(a["fta"] * fga * np.clip(rg.normal(1, .2, n), .3, 2))
    ftm = rg.binomial(fta, 0.80)
    pts = 2 * fg2m + 3 * fg3m + ftm
    reb = rg.poisson(a["rpm"] * mins * g); ast = rg.poisson(a["apm"] * mins * g)
    return dict(minutes=mins, fga=fga, fta=fta, points=pts, fg3a=fg3a, fg3m=fg3m, rebounds=reb, assists=ast)

STATS = ["points", "threes", "rebounds", "assists"]
def stat_vec(L, s): return {"points": L["points"], "threes": L["fg3m"], "rebounds": L["rebounds"], "assists": L["assists"]}[s]

def assembler_inputs(L, stat):
    tm = max(1, L["minutes"].sum())
    if stat == "points":
        opp = (L["fga"] + 0.44 * L["fta"]).sum(); prod = L["points"].sum(); rate, conv = opp / tm, prod / opp
    elif stat == "threes":
        a, m = L["fg3a"].sum(), L["fg3m"].sum(); rate, conv = a / tm, (m / a if a > 0 else 0)
    elif stat == "rebounds":
        rate, conv = L["rebounds"].sum() / tm, 1.0
    else:
        rate, conv = L["assists"].sum() / tm, 1.0
    pm = stat_vec(L, stat) / L["minutes"]
    rate_std = float(np.sqrt(np.mean((pm - pm.mean()) ** 2)))
    return rate, conv, dict(minutesStdDev=None, opportunityRateStdDev=max(0.01, rate_std * 1.35),
                            conversionRateStdDev=0.04, contextStdDev=0.05, paceStdDev=0.02)

jobs, truth = [], {}
REPS, NG = 120, 20
for name, a in ARCH.items():
    big = sim_games(a, 400_000, rng)
    for stat in STATS:
        x = stat_vec(big, stat).astype(float)
        med = float(np.median(x)); lines = sorted({math.floor(med) - 1.5 + k for k in range(0, 4)})
        lines = [l for l in lines if l > 0]
        truth[f"{name}/{stat}"] = dict(mean=x.mean(), sd=x.std(ddof=1), lines=lines,
                                       pOver=[float((x > l).mean()) for l in lines])
        for r in range(REPS):
            L = sim_games(a, NG, rng)
            rate, conv, unc = assembler_inputs(L, stat)
            unc["minutesStdDev"] = a["ms"]  # assume rotation module reports the true minutes sd
            jobs.append(dict(key=f"{name}/{stat}", input=dict(
                stat=stat.upper(), analysisMode="STANDARD", seed=1000 + len(jobs),
                minutes=dict(floor=max(0, a["m"] - 2.5 * a["ms"]), median=a["m"], ceiling=a["m"] + 2 * a["ms"], stdDev=a["ms"]),
                opportunityRatePerMinute=rate, conversionRate=conv, contextAdjustment=1,
                uncertainty=unc, scripts=[dict(script="COMPETITIVE", probability=1, minutesMultiplier=1, opportunityMultiplier=1)],
                dataQuality="HIGH")))
json.dump(dict(jobs=jobs, truth=truth), open(sys.argv[1], "w"))
print(len(jobs), "jobs")
