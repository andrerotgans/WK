# Ochtend-update runbook (WK 2026 familiepoule)

Dit zijn de stappen die de geplande **ochtend-routine** elke dag uitvoert. De
routine is een Claude-agent die in de cloud draait op een vast tijdstip
(bv. 09:00 Europe/Amsterdam) tegen de online repo van dit project.

## Doel
De echte uitslagen van de **sinds gisteren gespeelde** WK 2026-groepswedstrijden
invullen, zodat de stand van de poule klopt.

## Stappen voor de routine

1. **Bepaal welke wedstrijden nog open staan en al gespeeld zouden moeten zijn.**
   ```bash
   python3 set_result.py --list-todo
   ```
   Kijk naar wedstrijden met een datum/tijd (kolom) die inmiddels voorbij is.

2. **Zoek de officiële einduitslagen op** (stand na 90 min + eventuele
   verlenging; strafschoppen tellen NIET mee). Gebruik WebSearch, bijvoorbeeld:
   `WK 2026 uitslag <land> <land> <datum>` of een betrouwbare bron
   (FIFA, NOS, ESPN, Wikipedia "2026 FIFA World Cup group stage").
   Vul **alleen** uitslagen in waarvan je zeker bent. Bij twijfel: overslaan.

3. **Zet elke gevonden uitslag** (let op: de teamnamen in dit project zijn
   Nederlands, bv. "Zuid-Afrika", "Boznië en Herzegovina", "Saoedie-Arabië",
   "Congo-Kinshasa"):
   ```bash
   python3 set_result.py --home "<thuis>" --away "<uit>" --score H-A
   ```
   Of op id (uit stap 1): `python3 set_result.py --id m07 --score 1-2`

4. **Bonus** (pas bijwerken aan het einde van het toernooi):
   ```bash
   python3 set_result.py --champion <CODE>          # bv. NED, ARG, BRA, FRA, SPA
   python3 set_result.py --topscorer "Naam[,Naam]"  # bij meerdere topscorers
   ```

5. **Commit & push** zodat de online site bijwerkt:
   ```bash
   git add -A && git commit -m "Uitslagen <datum>" && git push
   ```
   (`set_result.py` heeft `docs/bundle.js` al opnieuw gebouwd.)

## Veiligheidsregels
- Nooit een al ingevulde uitslag overschrijven tenzij die aantoonbaar fout was.
- Geen uitslagen gokken. Liever een wedstrijd een dag later invullen dan fout.
- Alleen groepsfase-wedstrijden (dit bestand bevat de 1e ronde).
