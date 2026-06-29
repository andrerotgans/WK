#!/usr/bin/env python3
"""Zet een uitslag in de database (data/matches.json) en bouwt de site opnieuw.
Gebruikt door de ochtend-update én handmatig te gebruiken.

Voorbeelden:
  # op wedstrijd-id:
  python3 set_result.py --id m01 --score 2-0
  # op teamnamen (volgorde maakt niet uit, hoofdletterongevoelig, deelmatch mag):
  python3 set_result.py --home Mexico --away "Zuid-Afrika" --score 2-0
  # bonus:
  python3 set_result.py --champion NED
  python3 set_result.py --topscorer "Mbappé,Kane"
  # overzicht nog niet ingevulde wedstrijden:
  python3 set_result.py --list-todo
"""
import argparse, json, os, subprocess, sys

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, "data")
M = os.path.join(DATA, "matches.json")
C = os.path.join(DATA, "config.json")


def load(p):
    with open(p, encoding="utf-8") as f:
        return json.load(f)


def save(p, obj):
    with open(p, "w", encoding="utf-8") as f:
        json.dump(obj, f, ensure_ascii=False, indent=2)


def norm(s):
    return (s or "").strip().lower()


def find_match(matches, mid=None, home=None, away=None):
    if mid:
        for m in matches:
            if m["id"] == mid:
                return m
        sys.exit(f"Geen wedstrijd met id {mid}")
    # match op teamnamen (beide moeten voorkomen, in willekeurige volgorde)
    h, a = norm(home), norm(away)
    cands = []
    for m in matches:
        names = {norm(m["home"]), norm(m["away"])}
        teamtext = norm(m["home"]) + " " + norm(m["away"])
        if (any(h in n or n in h for n in names) and any(a in n or n in a for n in names)) \
           or (h in teamtext and a in teamtext):
            cands.append(m)
    if len(cands) == 1:
        return cands[0]
    if not cands:
        sys.exit(f"Geen wedstrijd gevonden voor {home} - {away}")
    sys.exit("Meerdere wedstrijden passen; gebruik --id: " + ", ".join(c["id"] for c in cands))


def parse_score(s):
    try:
        h, a = s.replace(" ", "").split("-")
        return int(h), int(a)
    except Exception:
        sys.exit(f"Ongeldige score '{s}', verwacht bv. 2-1")


def rebuild():
    subprocess.run([sys.executable, os.path.join(HERE, "build_bundle.py")], check=True)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--id")
    ap.add_argument("--home")
    ap.add_argument("--away")
    ap.add_argument("--score")
    ap.add_argument("--champion")
    ap.add_argument("--topscorer", help="komma-gescheiden lijst")
    ap.add_argument("--list-todo", action="store_true")
    args = ap.parse_args()

    matches = load(M)

    if args.list_todo:
        for m in matches:
            if not (m.get("result") and isinstance(m["result"].get("home"), int)):
                tag = m["round"] if m.get("phase") == "knockout" else "groep " + m.get("group", "?")
                print(f'{m["id"]}  [{tag:>6}]  {m["datetimeLabel"]:>16}  {m["home"]} - {m["away"]}')
        return

    changed = False

    if args.score and (args.id or (args.home and args.away)):
        m = find_match(matches, args.id, args.home, args.away)
        h, a = parse_score(args.score)
        m["result"] = {"home": h, "away": a}
        print(f'Uitslag gezet: {m["home"]} {h}-{a} {m["away"]}  ({m["id"]})')
        save(M, matches)
        changed = True

    if args.champion is not None:
        cfg = load(C)
        cfg["bonus"]["champion"]["result"] = args.champion.strip().upper() or None
        save(C, cfg)
        print("Kampioen gezet:", cfg["bonus"]["champion"]["result"])
        changed = True

    if args.topscorer is not None:
        cfg = load(C)
        cfg["bonus"]["topscorer"]["result"] = [s.strip() for s in args.topscorer.split(",") if s.strip()]
        save(C, cfg)
        print("Topscorer(s) gezet:", cfg["bonus"]["topscorer"]["result"])
        changed = True

    if not changed:
        ap.print_help()
        return
    rebuild()


if __name__ == "__main__":
    main()
