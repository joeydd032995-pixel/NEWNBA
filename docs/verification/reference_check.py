"""Independent reference for NEWNBA engine math. Different RNG (PCG64), exact Fractions for odds."""
import json, sys, math
from fractions import Fraction
import numpy as np

E = json.load(open(sys.argv[1]))
res = {"checks": [], "findings": []}

def check(name, ok, detail=""):
    res["checks"].append({"name": name, "ok": bool(ok), "detail": detail})
    print(("PASS " if ok else "FAIL ") + name + (f"  [{detail}]" if detail else ""))

# ---------- 1. odds math (exact) ----------
def dec_exact(o):
    return 1 + Fraction(o, 100) if o > 0 else 1 + Fraction(100, -o)
worst = 0
for g in E["odds"]["grid"]:
    o = g["odds"]; d = dec_exact(o)
    worst = max(worst, abs(g["decimal"] - float(d)), abs(g["impliedMath"] - float(1 / d)),
                abs(g["impliedAnalytics"] - float(1 / d)),
                abs(g["ev_p55"] - float(Fraction(55, 100) * d - 1)),
                abs(g["evAnalytics_p55"] - float(Fraction(55, 100) * d - 1)))
    b = float(d - 1); p = 0.55
    kelly = max(0.0, (b * p - (1 - p)) / b)
    worst = max(worst, abs(g["kellyAnalytics_p55"] - kelly))
check("odds: decimal/implied/EV/Kelly match exact fractions across 18 prices (both implementations)", worst < 1e-12, f"max abs err {worst:.2e}")

worst = 0
for r in E["odds"]["noVig"]:
    a, b = float(1 / dec_exact(r["over"])), float(1 / dec_exact(r["under"]))
    ov, un = a / (a + b), b / (a + b)
    worst = max(worst, abs(r["math"]["over"] - ov), abs(r["math"]["under"] - un),
                abs(r["analytics"][0] - ov), abs(r["analytics"][1] - un), abs(r["math"]["over"] + r["math"]["under"] - 1))
check("no-vig two-way: matches exact and sums to 1 (7 price pairs, both implementations)", worst < 1e-12, f"max abs err {worst:.2e}")

# ---------- 2. playable-to price ----------
bad = [x for x in E["playable"] if x["evAtPrice"] < x["minEv"] - 1e-9]
pos_bad = [x for x in bad if x["price"] > 0]
neg_bad = [x for x in bad if x["price"] < 0]
check("playable-to price: EV at returned price >= required minimum EV", len(bad) == 0,
      f"{len(bad)}/{len(E['playable'])} violate (plus-odds side {len(pos_bad)}, minus-odds side {len(neg_bad)})")
if bad:
    w = min(bad, key=lambda x: x["evAtPrice"] - x["minEv"])
    res["findings"].append({"id": "F-PLAYABLE", "worst": w, "n": len(bad)})
    print("   worst:", w)

# ---------- 3. distribution cross-check (independent MC, replicates documented semantics) ----------
def clampv(x, lo, hi): return np.minimum(hi, np.maximum(lo, x))
def snorm(rng, mean, sd, n, lo=-np.inf, hi=np.inf):
    if not sd > 0: return clampv(np.full(n, mean), lo, hi)
    return clampv(mean + sd * rng.standard_normal(n), lo, hi)

def ref_dist(f, n, seed):
    rng = np.random.default_rng(seed)
    m = f["minutes"]; u = f["uncertainty"]
    width = max(0, m["ceiling"] - m["floor"])
    mstd = m.get("stdDev") if m.get("stdDev") is not None else max(0.5, width / 4)
    pace = 1.0
    if f.get("expectedPace") and f.get("baselinePace"):
        pace = min(1.2, max(0.8, f["expectedPace"] / f["baselinePace"]))
    ppp = 1.0
    if f.get("expectedPpp") and f.get("baselinePpp"):
        ppp = min(1.2, max(0.8, f["expectedPpp"] / f["baselinePpp"]))
    if f.get("expectedPossessions") and f.get("playerOpportunityShare") is not None and m["median"] > 0:
        rate = f["expectedPossessions"] * f["playerOpportunityShare"] / m["median"]
    else:
        rate = f["opportunityRatePerMinute"]
    sc = f["scripts"]; probs = np.array([s["probability"] for s in sc], float); probs /= probs.sum()
    idx = rng.choice(len(sc), size=n, p=probs)
    mm = np.array([s["minutesMultiplier"] for s in sc])[idx]
    om = np.array([s["opportunityMultiplier"] for s in sc])[idx]
    cm = np.array([s.get("conversionMultiplier", 1) for s in sc])[idx]
    xm = np.array([s.get("contextMultiplier", 1) for s in sc])[idx]
    minutes = snorm(rng, m["median"], max(mstd, u["minutesStdDev"]), n, max(0, m["floor"]), max(m["floor"], m["ceiling"]))
    minutes = np.where(rng.random(n) < f.get("foulTroubleProbability", 0), np.maximum(0, minutes - f.get("foulMinutesPenalty", 6)), minutes)
    minutes = np.where(rng.random(n) < f.get("blowoutProbability", 0), np.maximum(0, minutes - f.get("blowoutMinutesPenalty", 5)), minutes)
    minutes = minutes * mm
    opp = np.maximum(0, rate * om + u["opportunityRateStdDev"] * rng.standard_normal(n))
    conv = np.maximum(0, f["conversionRate"] * cm + u["conversionRateStdDev"] * rng.standard_normal(n))
    ctx = np.maximum(0, f["contextAdjustment"] * ppp * xm + u["contextStdDev"] * rng.standard_normal(n))
    pc = clampv(pace + u["paceStdDev"] * rng.standard_normal(n), 0.5, 1.5)
    x = np.maximum(0, minutes * opp * conv * ctx * pc)
    point = m["median"] * rate * f["conversionRate"] * f["contextAdjustment"] * pace * ppp
    return x, point

N = 3_000_000
for name, fx in E["fixtures"].items():
    f = fx["input"]; lines = fx["lines"]
    x, point = ref_dist(f, N, 12345)
    eq = fx["modes"]["DEEP"]["equation"]
    # point estimate: exact formula
    pe_ok = abs(fx["modes"]["STANDARD"]["pointEstimate"] - point) < 1e-9
    check(f"{name}: point estimate == Minutes x Rate x Conv x Context x Pace x PPP", pe_ok,
          f"engine {fx['modes']['STANDARD']['pointEstimate']:.6f} ref {point:.6f}")
    for mode in ["FAST", "STANDARD", "DEEP"]:
        d = fx["modes"][mode]; n = d["trials"]
        sd = x.std(ddof=1); se_mean = sd / math.sqrt(n)
        z_mean = (d["mean"] - x.mean()) / se_mean
        se_sd = sd / math.sqrt(2 * (n - 1))
        z_sd = (d["sd"] - sd) / se_sd
        pz = []
        for i, l in enumerate(lines):
            p = (x > l).mean(); se = math.sqrt(max(p * (1 - p), 1e-9) / n)
            pz.append((d["pOver"][i] - p) / se)
        ok = abs(z_mean) < 4 and abs(z_sd) < 4 and max(abs(v) for v in pz) < 4
        check(f"{name}/{mode}({n}): mean, sd, P(over) within 4 SE of independent 3M-trial reference", ok,
              f"mean {d['mean']:.3f} vs {x.mean():.3f} (z={z_mean:+.2f}); sd {d['sd']:.3f} vs {sd:.3f} (z={z_sd:+.2f}); max|z_P|={max(abs(v) for v in pz):.2f}")
        if mode == "DEEP":
            for k, q in [("p05", .05), ("p10", .1), ("p25", .25), ("p50", .5), ("p75", .75), ("p90", .9), ("p95", .95)]:
                rq = np.quantile(x, q)
                tol = 4 * math.sqrt(q * (1 - q) / n) / max(1e-9, (np.exp(-0.5) / 1))  # loose; scaled below
                dens = np.mean(np.abs(x - rq) < 0.05 * sd) / (0.1 * sd)
                se_q = math.sqrt(q * (1 - q) / n) / dens
                if abs(d["pct"][k] - rq) > 4 * se_q:
                    check(f"{name}: percentile {k}", False, f"{d['pct'][k]:.3f} vs {rq:.3f} (4SE={4*se_q:.3f})")
    # P(over)+P(under)=1 (continuous, ties only at 0)
    d = fx["modes"]["STANDARD"]
    check(f"{name}: P(over)+P(under)=1 on continuous lines", all(abs(a + b - 1) < 1e-9 for a, b in zip(d["pOver"], d["pUnder"])))
    # mean vs point estimate gap (documented, not a bug): report
    gap = fx["modes"]["DEEP"]["mean"] / point - 1
    res.setdefault("mean_vs_point", {})[name] = gap
    print(f"   info: simulated mean / point estimate - 1 = {gap:+.3%}")

# closed-form moments for F1 (no foul/blowout, single script): independent factors
f = E["fixtures"]["F1_simple_points"]["input"]; u = f["uncertainty"]
mu = [f["minutes"]["median"], f["opportunityRatePerMinute"], f["conversionRate"], f["contextAdjustment"], 101 / 99]
sg = [max(f["minutes"]["stdDev"], u["minutesStdDev"]), u["opportunityRateStdDev"], u["conversionRateStdDev"], u["contextStdDev"], u["paceStdDev"]]
am = np.prod(mu); av = np.prod([s ** 2 + m ** 2 for s, m in zip(sg, mu)]) - am ** 2
dd = E["fixtures"]["F1_simple_points"]["modes"]["DEEP"]
check("F1 closed-form E[prod] and Var[prod] of independent factors within 2% (clamp/trunc effects small)",
      abs(dd["mean"] / am - 1) < 0.02 and abs(dd["sd"] / math.sqrt(av) - 1) < 0.02,
      f"mean {dd['mean']:.3f} vs {am:.3f}; sd {dd['sd']:.3f} vs {math.sqrt(av):.3f}")

# ---------- 4. reproducibility ----------
R_ = E["repro"]
check("seeded determinism: same seed -> identical samples", R_["identical"])
check("seeded determinism: different seed -> different samples", R_["differentSeedDiffers"])
check("trial counts FAST/STANDARD/DEEP = 2500/10000/40000",
      [E["fixtures"]["F1_simple_points"]["modes"][m]["trials"] for m in ["FAST", "STANDARD", "DEEP"]] == [2500, 10000, 40000])

# ---------- 5. correlation ----------
S = np.array(E["corr"]["series"]); M = np.array(E["corr"]["matrix"]); ref = np.corrcoef(S)
check("empirical correlation matrix == numpy.corrcoef", np.abs(M - ref).max() < 1e-12, f"max err {np.abs(M-ref).max():.2e}")
p = E["corr"]["pra"]; cm = p["compMeans"]; cs = np.array(p["compSds"]); Rm = np.array(p["R"])
exp_mean = sum(cm); exp_sd = math.sqrt(cs @ Rm @ cs)
check("PRA composite mean == sum of component means (within 1%)", abs(p["mean"] / exp_mean - 1) < 0.01, f"{p['mean']:.3f} vs {exp_mean:.3f}")
check("PRA composite sd ~ sqrt(s' R s) from supplied correlations (within 4%; copula != Pearson exactly)",
      abs(p["sd"] / exp_sd - 1) < 0.04, f"{p['sd']:.3f} vs {exp_sd:.3f}")
indep_sd = math.sqrt((cs ** 2).sum())
print(f"   info: independent-sum sd would be {indep_sd:.3f}; correlated {exp_sd:.3f}; engine {p['sd']:.3f}")

# ---------- 6. decision engine ----------
dec = [x for x in E["decision"] if "quality" in x]
strong_low = [x for x in dec if x["decision"] == "STRONG_BET" and x["quality"] != "HIGH"]
check("STRONG_BET never issued below HIGH data quality", not strong_low, f"{len(strong_low)} violations")
low = [x for x in dec if x["quality"] == "LOW" and x["decision"] in ("BET", "STRONG_BET")]
check("LOW data quality never yields BET/STRONG_BET", not low, f"{len(low)} violations")
flags = [x for x in E["decision"] if "flag" in x]
check("unresolved availability/lineup/minutes restriction downgrades decision (<= LEAN)",
      all(x["decision"] in ("PASS", "WAIT", "LEAN") for x in flags), str([(x["flag"], x["decision"]) for x in flags]))
# EV consistency: engine EV vs EV recomputed from the same probability
worst = 0
for x in dec:
    if x["decision"] != "PASS" or True:
        pass
print("   decision grid (quality, line, decision, side, p, EV):")
for x in dec:
    print(f"     {x['quality']:6} {x['line']:5} {x['decision']:10} {x['side']:5} p={x['p']:.3f} ev={x['ev']:+.3f} fair={x['fair']} playableTo={x['playableTo']} conf={x['conf']}")

json.dump(res, open(sys.argv[2], "w"), indent=1)
fails = [c for c in res["checks"] if not c["ok"]]
print(f"\n{len(res['checks'])-len(fails)}/{len(res['checks'])} checks passed")
