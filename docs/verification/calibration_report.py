"""Summarise engine-vs-ground-truth dispersion/calibration. Usage: calibration_report.py <gen.json> <engine_out.json>"""
import json, sys, collections, numpy as np
I = json.load(open(sys.argv[1])); O = json.load(open(sys.argv[2])); T = I["truth"]
g = collections.defaultdict(list)
for o in O: g[o["key"]].append(o)
by = collections.defaultdict(list)
print(f"{'player/stat':28} {'trueSD':>7} {'engSD':>7} {'ratio':>6} | mean(engine P(over)) - true P(over), pts, per line | avg|EV err| @-110")
for k, v in g.items():
    t = T[k]; sd = np.mean([x["sd"] for x in v]); d = 1 + 100 / 110
    dP = [np.mean([x["pOver"][i] for x in v]) - t["pOver"][i] for i in range(len(t["lines"]))]
    ev = np.mean([abs(p * d) for p in dP])
    print(f"{k:28} {t['sd']:7.2f} {sd:7.2f} {sd/t['sd']:6.2f} | " + " ".join(f"{p*100:+5.1f}" for p in dP) + f" | {ev*100:.1f}%")
    by[k.split('/')[1]].append(sd / t["sd"])
print(); [print(f"{s:9} mean SD ratio engine/true = {np.mean(v):.2f}") for s, v in by.items()]
