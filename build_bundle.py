#!/usr/bin/env python3
"""Leest de JSON-database in data/ en schrijft app/bundle.js met window.WK.
Hierdoor werkt de site zowel lokaal (dubbelklikken, file://) als online.
Wordt aangeroepen na elke wijziging van de uitslagen (ook door de ochtend-update)."""
import json, os, datetime

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, "data")

def load(name):
    with open(os.path.join(DATA, name), encoding="utf-8") as f:
        return json.load(f)

bundle = {
    "config": load("config.json"),
    "matches": load("matches.json"),
    "predictions": load("predictions.json"),
    "bonusPredictions": load("bonus_predictions.json"),
    "generatedAt": datetime.datetime.now().isoformat(timespec="seconds"),
}

os.makedirs(os.path.join(HERE, "app"), exist_ok=True)
out = os.path.join(HERE, "app", "bundle.js")
with open(out, "w", encoding="utf-8") as f:
    f.write("window.WK = ")
    json.dump(bundle, f, ensure_ascii=False, indent=2)
    f.write(";\n")
print("Bundle geschreven:", out, "| gegenereerd:", bundle["generatedAt"])
