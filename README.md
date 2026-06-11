# WK Voetbal 2026 — Familiepoule

Interactieve poule-site voor de groepsfase van het WK 2026. De stand van alle
deelnemers wordt **live** berekend uit de ingevoerde uitslagen.

## Snel bekijken (lokaal)

De site staat in `app/` en werkt zonder server: dubbelklik op
`app/index.html`. (Wil je een server: `python3 -m http.server 8123 --directory app`
en ga naar <http://localhost:8123>.)

## Mappen

```
data/                 ← de "database" (bron van waarheid, leesbare JSON)
  config.json         ← deelnemers, groepen, puntentelling, bonus-uitslag
  matches.json        ← alle 72 wedstrijden + (later) de echte uitslagen
  predictions.json    ← de voorspelling van elke deelnemer per wedstrijd
  bonus_predictions.json ← voorspellingen kampioen + topscorer
app/                  ← de website
  index.html, style.css, app.js, scoring.js
  bundle.js           ← automatisch gegenereerd uit data/ (niet handmatig wijzigen)
build_bundle.py       ← zet data/ om naar app/bundle.js
set_result.py         ← uitslag invoeren + site herbouwen (zie hieronder)
UPDATE_RUNBOOK.md     ← stappen voor de automatische ochtend-update
```

## Uitslag invoeren

```bash
python3 set_result.py --id m14 --score 2-1
python3 set_result.py --home Nederland --away Japan --score 3-1
python3 set_result.py --champion NED
python3 set_result.py --topscorer "Mbappé,Kane"
python3 set_result.py --list-todo        # toon nog niet gespeelde wedstrijden
```

Elke wijziging bouwt `app/bundle.js` opnieuw, zodat de site klopt. Je kunt ook
op het tabblad **Uitslagen** in de site zelf invoeren (wordt op dat apparaat
bewaard); de scripts/database hebben altijd voorrang.

## Puntentelling

| Situatie | Punten |
|---|---|
| Exacte uitslag | 200 |
| Juist gelijkspel (niet exact) | 100 |
| Juiste winnaar + doelpunten van één team | 95 |
| Juiste winnaar | 75 |
| Doelpunten van één team (winnaar fout) | 20 |
| Kampioen goed | 300 |
| Topscorer goed (elke juiste voorspeller bij meerdere topscorers) | 300 |

Uitslag = stand na 90 min + eventuele verlenging; strafschoppen tellen niet mee.

## Automatische ochtend-update

Zie `UPDATE_RUNBOOK.md`. Kort: een geplande Claude-routine zoekt elke ochtend de
uitslagen van de gespeelde wedstrijden op, zet ze met `set_result.py`, en pusht de
bijgewerkte site. Dit werkt zodra het project in een online repo/host staat.
