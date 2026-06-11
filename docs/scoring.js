// Puntentelling familiepoule WK 2026.
// Categorieën (hoogst geldende telt), exact gelijk aan de afgesproken regels:
//   exacte uitslag            -> 200
//   juist gelijkspel          -> 100  (voorspeld gelijk én werd gelijk, niet exact)
//   winnaar + doelpunten team -> 95   (juiste winnaar én 1 team-score klopt)
//   winnaar                   -> 75   (juiste winnaar)
//   doelpunten van 1 team     -> 20   (1 team-score klopt, winnaar fout)
//   anders                    -> 0
//
// Bonus: kampioen 300, topscorer 300 (bij meerdere topscorers krijgt elke
// juiste voorspeller 300).

const SCORING = window.WK.config.scoring;

// "2-1" -> {home:2, away:1}.  Geeft null bij ongeldige invoer.
function parseScore(str) {
  if (str == null) return null;
  const m = String(str).trim().match(/^(\d+)\s*-\s*(\d+)$/);
  if (!m) return null;
  return { home: parseInt(m[1], 10), away: parseInt(m[2], 10) };
}

function sign(a, b) {
  return a > b ? 1 : a < b ? -1 : 0;
}

// pred en result: {home, away}.  Geeft punten (number).
function scoreMatch(pred, result) {
  if (!pred || !result) return 0;
  const { home: ph, away: pa } = pred;
  const { home: rh, away: ra } = result;

  if (ph === rh && pa === ra) return SCORING.exact;            // 200

  const pDraw = ph === pa;
  const rDraw = rh === ra;
  if (pDraw && rDraw) return SCORING.draw;                     // 100

  const goalMatch = ph === rh || pa === ra;
  const psign = sign(ph, pa);
  const rsign = sign(rh, ra);

  if (psign === rsign && rsign !== 0) {                        // juiste winnaar
    return goalMatch ? SCORING.winnerPlusGoals : SCORING.winner; // 95 / 75
  }
  return goalMatch ? SCORING.oneTeamGoals : 0;                 // 20 / 0
}

// Korte labels voor uitleg in de UI.
function scoreLabel(points) {
  switch (points) {
    case SCORING.exact: return "Exacte uitslag";
    case SCORING.draw: return "Juist gelijkspel";
    case SCORING.winnerPlusGoals: return "Winnaar + doelpunten";
    case SCORING.winner: return "Juiste winnaar";
    case SCORING.oneTeamGoals: return "Doelpunten 1 team";
    default: return "";
  }
}

window.scoreMatch = scoreMatch;
window.parseScore = parseScore;
window.scoreLabel = scoreLabel;
