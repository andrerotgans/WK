/* Familiepoule WK 2026 — front-end logica.
   Bron van waarheid = window.WK (gegenereerd uit de JSON-database).
   Handmatig ingevoerde uitslagen worden lokaal bewaard in localStorage, zodat
   ze blijven staan zonder de databasebestanden te wijzigen. Een uitslag die al
   in de database staat (bv. door de ochtend-update) heeft altijd voorrang. */

const WK = window.WK;
const CFG = WK.config;
const MATCHES = WK.matches;
const PREDS = WK.predictions;
const BONUS = WK.bonusPredictions;
const PARTS = CFG.participants;

const LS_RESULTS = "wk2026_results";
const LS_BONUS = "wk2026_bonus";

function loadLS(key) {
  try { return JSON.parse(localStorage.getItem(key)) || {}; }
  catch { return {}; }
}
function saveLS(key, obj) { localStorage.setItem(key, JSON.stringify(obj)); }

let localResults = loadLS(LS_RESULTS);   // { mid: {home, away} }
let localBonus = loadLS(LS_BONUS);       // { champion, topscorer: [..] }

// Effectieve uitslag: database wint, anders lokaal ingevoerd.
function resultOf(match) {
  if (match.result && Number.isInteger(match.result.home)) return match.result;
  const lr = localResults[match.id];
  if (lr && Number.isInteger(lr.home) && Number.isInteger(lr.away)) return lr;
  return null;
}
function championResult() {
  return (CFG.bonus.champion.result) || localBonus.champion || null;
}
function topscorerResult() {
  const fromCfg = CFG.bonus.topscorer.result;
  if (fromCfg && fromCfg.length) return fromCfg;
  return localBonus.topscorer || [];
}

// Onderscheid groepsfase / knock-out.
const isKO = (m) => m.phase === "knockout";
const GROUP_MATCHES = MATCHES.filter(m => !isKO(m));
const KO_MATCHES = MATCHES.filter(isKO);
// Volgorde van de knock-outrondes (voor weergave).
const KO_ROUND_ORDER = ["R32", "R16", "QF", "SF", "3P", "F"];
function matchTag(m) { return isKO(m) ? (m.roundLabel || m.round) : "Groep " + m.group; }
function shortTag(m) { return isKO(m) ? m.round : m.group; }

// ---------- Berekeningen ----------
function standingsForGroup(letter) {
  const teams = CFG.groups[letter];
  const rows = {};
  teams.forEach(t => rows[t] = { team: t, P:0, W:0, D:0, L:0, GF:0, GA:0, Pts:0 });
  MATCHES.filter(m => m.group === letter).forEach(m => {
    const r = resultOf(m);
    if (!r) return;
    const h = rows[m.home], a = rows[m.away];
    h.P++; a.P++; h.GF += r.home; h.GA += r.away; a.GF += r.away; a.GA += r.home;
    if (r.home > r.away) { h.W++; a.L++; h.Pts += 3; }
    else if (r.home < r.away) { a.W++; h.L++; a.Pts += 3; }
    else { h.D++; a.D++; h.Pts++; a.Pts++; }
  });
  return Object.values(rows).sort((x, y) =>
    y.Pts - x.Pts || (y.GF - y.GA) - (x.GF - x.GA) || y.GF - x.GF || x.team.localeCompare(y.team));
}

function computeLeaderboard() {
  const champ = championResult();
  const tops = topscorerResult();
  const board = PARTS.map(name => {
    let groupPts = 0, koPts = 0, played = 0, exact = 0;
    MATCHES.forEach(m => {
      const r = resultOf(m);
      if (!r) return;
      const pred = PREDS[m.id] ? PREDS[m.id][name] : null;
      const pts = scoreMatch(parseScore(pred), r);
      // tel deze wedstrijd alleen mee als de deelnemer hem voorspeld heeft
      if (pred == null) return;
      played++;
      if (isKO(m)) koPts += pts; else groupPts += pts;
      if (pts === CFG.scoring.exact) exact++;
    });
    let bonusPts = 0;
    if (champ && BONUS.champion[name] &&
        String(BONUS.champion[name]).trim().toUpperCase() === String(champ).trim().toUpperCase())
      bonusPts += CFG.scoring.champion;
    if (tops.length && BONUS.topscorer[name] &&
        tops.some(t => String(t).trim().toLowerCase() === String(BONUS.topscorer[name]).trim().toLowerCase()))
      bonusPts += CFG.scoring.topscorer;
    return { name, groupPts, koPts, bonusPts, total: groupPts + koPts + bonusPts, played, exact };
  });
  board.sort((a, b) => b.total - a.total || b.exact - a.exact || a.name.localeCompare(b.name));
  // rang met gedeelde posities
  let rank = 0, prev = null;
  board.forEach((row, i) => { if (row.total !== prev) { rank = i + 1; prev = row.total; } row.rank = rank; });
  return board;
}

const playedCount = () => MATCHES.filter(m => resultOf(m)).length;

// Cumulatieve punten (en rang) van elke deelnemer na elke gespeelde wedstrijd,
// op volgorde van speeldatum. Bonuspunten (kampioen/topscorer) horen niet bij
// één wedstrijd-moment en tellen hier niet mee.
function computeStandingsOverTime() {
  const played = MATCHES.filter(m => resultOf(m))
    .slice().sort((a, b) => new Date(a.datetime) - new Date(b.datetime));
  const cum = {}; PARTS.forEach(p => cum[p] = 0);
  const labels = [], ranks = {};
  PARTS.forEach(p => { ranks[p] = []; });
  const koIdx = played.findIndex(isKO);
  played.forEach(m => {
    const r = resultOf(m);
    PARTS.forEach(name => {
      const raw = PREDS[m.id] ? PREDS[m.id][name] : null;
      cum[name] += scoreMatch(parseScore(raw), r);
    });
    const parts = (m.datetimeLabel || "").split(" ");
    labels.push(parts.length >= 2 ? parts[0] + " " + parts[1] : (m.datetimeLabel || m.id));
    const ranked = PARTS.slice().sort((a, b) => cum[b] - cum[a] || a.localeCompare(b));
    PARTS.forEach(name => {
      ranks[name].push(ranked.indexOf(name) + 1);
    });
  });
  const order = PARTS.slice().sort((a, b) => cum[b] - cum[a] || a.localeCompare(b));
  return { labels, order, ranks, matches: played, phaseSplit: koIdx === -1 ? played.length : koIdx };
}

// Status van een team: nog actief, uitgeschakeld, of onduidelijk (verlengd/
// strafschoppen waarvan de winnaar hier niet apart wordt bijgehouden — die
// wordt pas zichtbaar zodra de volgende ronde in de database staat).
function teamStatus(team) {
  if (!team) return { alive: null, label: "Onbekend team" };
  const groupComplete = GROUP_MATCHES.every(m => resultOf(m));
  const koForTeam = KO_MATCHES.filter(m => m.home === team || m.away === team)
    .sort((a, b) => KO_ROUND_ORDER.indexOf(a.round) - KO_ROUND_ORDER.indexOf(b.round));
  if (!koForTeam.length) {
    if (groupComplete) return { alive: false, label: "Uitgeschakeld in groepsfase" };
    return { alive: true, label: "Groepsfase nog bezig" };
  }
  for (const m of koForTeam) {
    const r = resultOf(m);
    const roundLabel = m.roundLabel || m.round;
    if (!r) return { alive: true, label: `Speelt nog: ${roundLabel}` };
    const isHome = m.home === team;
    const own = isHome ? r.home : r.away, opp = isHome ? r.away : r.home;
    if (own < opp) return { alive: false, label: `Uitgeschakeld in ${roundLabel}` };
    if (own === opp && m === koForTeam[koForTeam.length - 1]) {
      return { alive: null, label: `Strafschoppen in ${roundLabel} (uitkomst hier onbekend)` };
    }
  }
  const last = koForTeam[koForTeam.length - 1];
  return { alive: true, label: `Actief · laatst geplaatst ${last.roundLabel || last.round}` };
}

// Aantal keer minimaal de juiste winnaar/gelijkspel voorspeld, en aantal keer
// de exacte uitslag geraden, per deelnemer.
function computePredictionQuality() {
  return PARTS.map(name => {
    let played = 0, good = 0, exact = 0;
    MATCHES.forEach(m => {
      const r = resultOf(m);
      if (!r) return;
      const raw = PREDS[m.id] ? PREDS[m.id][name] : null;
      if (raw == null) return;
      played++;
      const pts = scoreMatch(parseScore(raw), r);
      if (pts >= CFG.scoring.winner) good++;
      if (pts === CFG.scoring.exact) exact++;
    });
    return { name, played, good, exact };
  });
}

// Vaste omvang van elke knock-outronde (32 teams bij de ronde van 32).
// Nodig om ook rondes mee te tellen die nog niet in de database staan.
const KO_ROUND_SIZES = { R32: 16, R16: 8, QF: 4, SF: 2, "3P": 1, F: 1 };

// Aantal wedstrijden dat nog gespeeld moet worden tot het einde van het
// toernooi: onafgewerkte wedstrijden die al in de database staan, plus
// knock-outrondes die pas later worden toegevoegd (op basis van de vaste
// bracket-omvang, want de indeling van bv. de kwartfinale is nu nog niet bekend).
function remainingMatchCount() {
  let remaining = MATCHES.filter(m => !resultOf(m)).length;
  const presentRounds = new Set(KO_MATCHES.map(m => m.round));
  KO_ROUND_ORDER.forEach(round => {
    if (!presentRounds.has(round)) remaining += KO_ROUND_SIZES[round] || 0;
  });
  return remaining;
}

// Wie maakt (rekenkundig) nog kans op de poule: huidige stand + maximaal
// haalbare punten uit alle nog te spelen wedstrijden tot het einde van het
// toernooi (alle exact goed) + bonuspunten die nog niet vergeven zijn.
function computeTitleRace() {
  const board = computeLeaderboard();
  const leaderTotal = board.length ? board[0].total : 0;
  const champDecided = !!championResult();
  const topsDecided = topscorerResult().length > 0;
  const remainingMatches = remainingMatchCount();
  return board.map(row => {
    const pick = BONUS.champion[row.name];
    const pickTeam = CFG.teamCodes ? CFG.teamCodes[String(pick || "").trim().toUpperCase()] : null;
    const pickStatus = pickTeam ? teamStatus(pickTeam) : { alive: null, label: "" };
    const champPotential = champDecided ? 0 : (pickStatus.alive === false ? 0 : CFG.scoring.champion);
    const topPotential = topsDecided ? 0 : CFG.scoring.topscorer;
    const maxTotal = row.total + remainingMatches * CFG.scoring.exact + champPotential + topPotential;
    return { ...row, maxTotal, inRace: maxTotal >= leaderTotal, pick, pickTeam, pickStatus };
  });
}

// Grootste sprong in klassementspositie tussen twee opeenvolgende wedstrijden.
function computeBiggestMoves() {
  const data = computeStandingsOverTime();
  let best = null, worst = null;
  PARTS.forEach(name => {
    const ranks = data.ranks[name];
    for (let i = 1; i < ranks.length; i++) {
      const delta = ranks[i - 1] - ranks[i]; // positief = omhoog in de stand
      const move = { name, from: ranks[i - 1], to: ranks[i], delta, match: data.matches[i] };
      if (!best || delta > best.delta) best = move;
      if (!worst || delta < worst.delta) worst = move;
    }
  });
  return { best, worst };
}

// Wie stond het langst op de eerste plek (na afloop van een gespeelde wedstrijd).
function computeLongestLeader() {
  const data = computeStandingsOverTime();
  const counts = {};
  PARTS.forEach(name => { counts[name] = data.ranks[name].filter(r => r === 1).length; });
  const max = Math.max(0, ...Object.values(counts));
  const leaders = PARTS.filter(name => counts[name] === max);
  return { leaders, max, currentlyFirst: data.order[0] || null };
}

// ---------- Helpers ----------
const el = (html) => { const t = document.createElement("template"); t.innerHTML = html.trim(); return t.content.firstChild; };
const esc = (s) => String(s).replace(/[&<>"]/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;" }[c]));
function ptsClass(p) { return p === 200 ? "pts200" : p === 100 ? "pts100" : p === 95 ? "pts95" : p === 75 ? "pts75" : p === 20 ? "pts20" : "pts0"; }
function fmtDate(iso, label) {
  if (!iso) return label || "";
  const d = new Date(iso);
  const days = ["zo","ma","di","wo","do","vr","za"];
  const mon = ["jan","feb","mrt","apr","mei","jun","jul","aug","sep","okt","nov","dec"];
  return `${days[d.getDay()]} ${d.getDate()} ${mon[d.getMonth()]} · ${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}`;
}

// ---------- Views ----------
function viewKlassement() {
  const board = computeLeaderboard();
  const v = el(`<div></div>`);
  v.appendChild(el(`
    <div class="lb-head">
      <div>
        <h2>Klassement</h2>
        <p class="lb-meta">${playedCount()} van ${MATCHES.length} wedstrijden gespeeld · klik op een naam voor details</p>
      </div>
    </div>`));
  const ul = el(`<ul class="leaderboard"></ul>`);
  board.forEach(row => {
    const showMedals = playedCount() > 0;
    const topCls = showMedals && row.rank <= 3 ? `top${row.rank}` : "";
    const medal = showMedals && row.rank === 1 ? "🥇" : showMedals && row.rank === 2 ? "🥈" : showMedals && row.rank === 3 ? "🥉" : row.rank;
    const li = el(`
      <li class="lb-row ${topCls}" data-name="${esc(row.name)}">
        <div class="lb-rank">${medal}</div>
        <div>
          <div class="lb-name">${esc(row.name)}</div>
          <div class="lb-sub">groep ${row.groupPts}${row.koPts ? " · knock-out " + row.koPts : ""}${row.bonusPts ? " · bonus " + row.bonusPts : ""} · ${row.exact}× exact</div>
        </div>
        <div class="lb-points">${row.total}<small>punten</small></div>
      </li>`);
    li.addEventListener("click", () => openParticipant(row.name));
    ul.appendChild(li);
  });
  v.appendChild(ul);
  v.appendChild(legendBlock());
  return v;
}

function legendBlock() {
  const s = CFG.scoring;
  return el(`
    <div class="card" style="padding:16px 18px;margin-top:22px">
      <div class="section-title" style="margin:0 0 8px">Puntentelling</div>
      <div class="legend">
        <span><i style="background:var(--p200)"></i> Exacte uitslag — ${s.exact}</span>
        <span><i style="background:var(--p100)"></i> Juist gelijkspel — ${s.draw}</span>
        <span><i style="background:var(--p95)"></i> Winnaar + doelpunten — ${s.winnerPlusGoals}</span>
        <span><i style="background:var(--p75)"></i> Juiste winnaar — ${s.winner}</span>
        <span><i style="background:var(--p20)"></i> Doelpunten 1 team — ${s.oneTeamGoals}</span>
      </div>
      <p class="hint" style="margin:10px 0 0">Bonus: kampioen ${s.champion} · topscorer ${s.topscorer}. Uitslag = stand na 90 min + eventuele verlenging; strafschoppen tellen niet mee.</p>
    </div>`);
}

let matchFilter = "all";
function viewWedstrijden() {
  const v = el(`<div></div>`);
  const groups = Object.keys(CFG.groups);
  const filters = el(`<div class="filters"></div>`);
  const mk = (key, lbl) => {
    const c = el(`<button class="chip ${matchFilter===key?"active":""}">${lbl}</button>`);
    c.addEventListener("click", () => { matchFilter = key; render(); });
    return c;
  };
  filters.appendChild(mk("all", "Alle"));
  filters.appendChild(mk("todo", "Nog te spelen"));
  filters.appendChild(mk("done", "Gespeeld"));
  groups.forEach(g => filters.appendChild(mk("g"+g, "Groep "+g)));
  v.appendChild(filters);

  const list = GROUP_MATCHES.filter(m => {
    const r = resultOf(m);
    if (matchFilter === "todo") return !r;
    if (matchFilter === "done") return !!r;
    if (matchFilter.startsWith("g")) return m.group === matchFilter.slice(1);
    return true;
  });

  list.forEach(m => v.appendChild(matchCard(m)));
  if (!list.length) v.appendChild(el(`<p class="hint">Geen wedstrijden in deze selectie.</p>`));
  return v;
}

function matchCard(m) {
  const r = resultOf(m);
  const scoreHtml = r
    ? `<div class="match-score">${r.home}–${r.away}</div>`
    : `<div class="match-score pending">vs</div>`;
  const card = el(`
    <div class="match" data-id="${m.id}">
      <div class="match-head">
        <div class="match-team home"><span>${esc(m.home)}</span><span class="flag">${m.homeFlag}</span></div>
        <div class="match-center">
          ${scoreHtml}
          <div class="match-date">${fmtDate(m.datetime, m.datetimeLabel)}</div>
          <div class="grouptag">${matchTag(m)}</div>
        </div>
        <div class="match-team away"><span class="flag">${m.awayFlag}</span><span>${esc(m.away)}</span></div>
      </div>
      <div class="match-detail"></div>
    </div>`);
  const head = card.querySelector(".match-head");
  head.addEventListener("click", () => {
    const open = card.classList.toggle("open");
    if (open) fillMatchDetail(card.querySelector(".match-detail"), m);
  });
  return card;
}

function fillMatchDetail(box, m) {
  box.innerHTML = "";
  const r = resultOf(m);
  const grid = el(`<div class="pred-grid"></div>`);
  // sorteer op punten (hoog -> laag) als er een uitslag is
  const rows = PARTS.map(name => {
    const raw = PREDS[m.id][name];
    const pts = r ? scoreMatch(parseScore(raw), r) : null;
    return { name, raw, pts };
  });
  if (r) rows.sort((a, b) => b.pts - a.pts || a.name.localeCompare(b.name));
  rows.forEach(({ name, raw, pts }) => {
    const badge = r
      ? `<span class="pts ${ptsClass(pts)}" title="${scoreLabel(pts)}">${pts}</span>`
      : "";
    grid.appendChild(el(`
      <div class="pred-cell">
        <span class="pred-name">${esc(name)}</span>
        <span style="display:flex;align-items:center;gap:8px">
          <span class="pred-val">${raw ? esc(raw) : "—"}</span>${badge}
        </span>
      </div>`));
  });
  if (!r) box.appendChild(el(`<p class="hint" style="padding:4px 10px">Nog niet gespeeld — voorspellingen:</p>`));
  box.appendChild(grid);
}

function viewKnockout() {
  const v = el(`<div></div>`);
  if (!KO_MATCHES.length) {
    v.appendChild(el(`<p class="hint">De knock-outfase is nog niet beschikbaar.</p>`));
    return v;
  }
  v.appendChild(el(`<p class="hint">Voorspellingen per ronde, zelfde puntentelling als de groepsfase. De uitslag telt ná 90 min + verlenging; strafschoppen bepalen wie doorgaat maar tellen niet voor de punten.</p>`));

  // groepeer per ronde in vaste volgorde
  const byRound = {};
  KO_MATCHES.forEach(m => { (byRound[m.round] = byRound[m.round] || []).push(m); });
  const rounds = KO_ROUND_ORDER.filter(r => byRound[r]);
  Object.keys(byRound).forEach(r => { if (!rounds.includes(r)) rounds.push(r); });

  rounds.forEach(r => {
    const ms = byRound[r];
    const label = ms[0].roundLabel || r;
    const done = ms.filter(m => resultOf(m)).length;
    v.appendChild(el(`<div class="section-title" style="display:flex;justify-content:space-between;align-items:baseline">
      <span>${esc(label)}</span><span style="text-transform:none;font-weight:600">${done}/${ms.length} gespeeld</span></div>`));
    ms.forEach(m => v.appendChild(matchCard(m)));
  });
  return v;
}

function viewGroepen() {
  const v = el(`<div></div>`);
  v.appendChild(el(`<p class="hint">Standen worden live berekend uit de ingevoerde uitslagen. De bovenste twee (groen) plaatsen zich direct.</p>`));
  const grid = el(`<div class="groups-grid" style="margin-top:14px"></div>`);
  Object.keys(CFG.groups).forEach(letter => {
    const rows = standingsForGroup(letter);
    const card = el(`<div class="card group-card"><h3>Groep ${letter}</h3></div>`);
    const tbl = el(`
      <table class="standings">
        <thead><tr>
          <th>#</th><th class="team-col">Team</th><th title="Gespeeld">Gs</th><th title="Winst">W</th><th title="Gelijk">G</th><th title="Verlies">V</th><th title="Doelpunten voor">DV</th><th title="Doelpunten tegen">DT</th><th title="Saldo">+/−</th><th title="Punten">Ptn</th>
        </tr></thead>
        <tbody></tbody>
      </table>`);
    const tb = tbl.querySelector("tbody");
    rows.forEach((row, i) => {
      const flag = (MATCHES.find(m => m.home === row.team)?.homeFlag) || (MATCHES.find(m => m.away === row.team)?.awayFlag) || "";
      tb.appendChild(el(`
        <tr class="${i < 2 ? "qualify" : ""}">
          <td class="pos">${i + 1}</td>
          <td class="team-col">${flag} ${esc(row.team)}</td>
          <td>${row.P}</td><td>${row.W}</td><td>${row.D}</td><td>${row.L}</td>
          <td>${row.GF}</td><td>${row.GA}</td><td>${row.GF - row.GA >= 0 ? "+" : ""}${row.GF - row.GA}</td>
          <td class="pts-col">${row.Pts}</td>
        </tr>`));
    });
    card.appendChild(tbl);
    grid.appendChild(card);
  });
  v.appendChild(grid);
  return v;
}

// ---------- Verloop (stand door de tijd) ----------
const VERLOOP_TOP_COLORS = ["#2ee6a6", "#4f9dff", "#ffd23f", "#9d8cff", "#ff6b6b", "#ff9f43"];
const VERLOOP_GRAY = "rgba(147,163,196,0.55)";
const VERLOOP_GRAY_DIM = "rgba(147,163,196,0.28)";
let verloopHighlight = null;
let verloopChart = null;

function hexToRgba(hex, a) {
  const v = hex.replace("#", "");
  const r = parseInt(v.substring(0, 2), 16), g = parseInt(v.substring(2, 4), 16), b = parseInt(v.substring(4, 6), 16);
  return `rgba(${r},${g},${b},${a})`;
}

function viewVerloop() {
  const v = el(`<div></div>`);
  const data = computeStandingsOverTime();
  if (!data.labels.length) {
    v.appendChild(el(`<p class="hint">Nog geen wedstrijden gespeeld — er is nog geen verloop te tonen.</p>`));
    return v;
  }
  v.appendChild(el(`
    <div class="lb-head">
      <div>
        <h2>Verloop van de stand</h2>
        <p class="lb-meta">${playedCount()} van ${MATCHES.length} wedstrijden gespeeld · positie na elke wedstrijd</p>
      </div>
    </div>`));

  const card = el(`<div class="card" style="padding:18px"></div>`);
  const legend = el(`<div class="verloop-legend"></div>`);
  const chartWrap = el(`<div class="verloop-chart-wrap"><canvas id="verloop-canvas" role="img" aria-label="Lijngrafiek van de cumulatieve punten van alle deelnemers door het toernooi heen"></canvas></div>`);
  card.appendChild(legend);
  card.appendChild(chartWrap);
  card.appendChild(el(`
    <div class="verloop-phase-note">
      <span>← groepsfase</span><span>gestippelde lijn = start knock-out</span><span>knock-out →</span>
    </div>`));
  v.appendChild(card);
  v.appendChild(el(`<p class="hint" style="margin-top:12px">Klik een naam om die lijn uit te lichten. Bonuspunten (kampioen/topscorer) staan hier niet in — die horen niet bij één wedstrijd-moment.</p>`));

  renderVerloopLegend(legend, data);
  // canvas moet al in de echte DOM hangen voordat Chart.js 'm mag aanmaken
  setTimeout(() => renderVerloopChart(chartWrap.querySelector("canvas"), data), 0);

  return v;
}

function renderVerloopLegend(container, data) {
  container.innerHTML = "";
  data.order.forEach((name, i) => {
    const isTop = i < VERLOOP_TOP_COLORS.length;
    const color = isTop ? VERLOOP_TOP_COLORS[i] : "var(--muted)";
    const chip = el(`<span class="p-chip ${verloopHighlight === name ? "active" : ""}"><i style="background:${color}"></i>${i + 1}. ${esc(name)}</span>`);
    chip.addEventListener("click", () => {
      verloopHighlight = verloopHighlight === name ? null : name;
      renderVerloopLegend(container, data);
      applyVerloopHighlight();
    });
    container.appendChild(chip);
  });
}

function renderVerloopChart(canvas, data) {
  if (verloopChart) { verloopChart.destroy(); verloopChart = null; }
  const datasets = data.order.map((name, i) => {
    const isTop = i < VERLOOP_TOP_COLORS.length;
    const color = isTop ? VERLOOP_TOP_COLORS[i] : VERLOOP_GRAY;
    return {
      label: name,
      data: data.ranks[name],
      borderColor: color, backgroundColor: color,
      borderWidth: isTop ? 2.5 : 1.4,
      pointRadius: 0, pointHitRadius: 8, tension: 0.15,
      order: isTop ? 1 : 2,
      _base: color, _topColor: isTop ? VERLOOP_TOP_COLORS[i] : null, _isTop: isTop,
    };
  });
  const phaseLinePlugin = {
    id: "verloopPhaseLine",
    afterDraw(chart) {
      const idx = data.phaseSplit;
      const xScale = chart.scales.x, yScale = chart.scales.y;
      if (!xScale || idx >= data.labels.length) return;
      const x = xScale.getPixelForValue(idx);
      const ctx = chart.ctx;
      ctx.save();
      ctx.strokeStyle = "rgba(234,240,251,0.35)";
      ctx.setLineDash([4, 4]); ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(x, yScale.top); ctx.lineTo(x, yScale.bottom); ctx.stroke();
      ctx.restore();
    },
  };
  verloopChart = new Chart(canvas, {
    type: "line",
    data: { labels: data.labels, datasets },
    plugins: [phaseLinePlugin],
    options: {
      responsive: true, maintainAspectRatio: false,
      interaction: { mode: "nearest", intersect: true },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: "#1f2c45", borderColor: "#2a3a5a", borderWidth: 1,
          titleColor: "#eaf0fb", bodyColor: "#eaf0fb", padding: 10, displayColors: true,
          callbacks: {
            label: item => `${item.dataset.label}: positie ${item.formattedValue}`,
          },
        },
      },
      scales: {
        x: { grid: { display: false }, ticks: { color: "#93a3c4", font: { size: 10 }, maxRotation: 0, autoSkip: true, maxTicksLimit: 11 } },
        y: {
          reverse: true, min: 1, max: data.order.length,
          grid: { color: "rgba(147,163,196,0.12)" },
          ticks: { color: "#93a3c4", font: { size: 10 }, callback: v => Number.isInteger(v) ? v : "", stepSize: 1 },
          title: { display: true, color: "#93a3c4", font: { size: 11 }, text: "positie (1 = koploper)" },
        },
      },
    },
  });
  applyVerloopHighlight();
}

function applyVerloopHighlight() {
  if (!verloopChart) return;
  verloopChart.data.datasets.forEach(ds => {
    if (verloopHighlight === null) {
      ds.borderColor = ds._base; ds.borderWidth = ds._isTop ? 2.5 : 1.4; ds.order = ds._isTop ? 1 : 2;
    } else if (ds.label === verloopHighlight) {
      ds.borderColor = ds._isTop ? ds._topColor : "#eaf0fb"; ds.borderWidth = 3.5; ds.order = 0;
    } else if (ds._isTop) {
      ds.borderColor = hexToRgba(ds._topColor, 0.35); ds.borderWidth = 1.6; ds.order = 2;
    } else {
      ds.borderColor = VERLOOP_GRAY_DIM; ds.borderWidth = 1.2; ds.order = 3;
    }
  });
  verloopChart.update();
}

function viewStatistieken() {
  const v = el(`<div></div>`);
  v.appendChild(el(`
    <div class="lb-head">
      <div>
        <h2>Statistieken</h2>
        <p class="lb-meta">Extra cijfers over het verloop van de poule</p>
      </div>
    </div>`));

  if (!playedCount()) {
    v.appendChild(el(`<p class="hint">Nog geen wedstrijden gespeeld — nog geen statistieken te tonen.</p>`));
    return v;
  }

  // ---- Beste / minst rake voorspellers ----
  const quality = computePredictionQuality();
  const bestQ = quality.slice().sort((a, b) => b.good - a.good || a.name.localeCompare(b.name)).slice(0, 3);
  const worstQ = quality.slice().sort((a, b) => a.good - b.good || a.name.localeCompare(b.name)).slice(0, 3);
  const qRow = (row, cls) => `<li class="${cls}"><span class="who">${esc(row.name)}</span><span class="pick ${cls}">${row.good}/${row.played} raak</span></li>`;
  const qCols = el(`<div class="bonus-cols" style="margin-top:14px"></div>`);
  qCols.appendChild(el(`<div class="card bonus-card">
      <h3>🎯 Beste voorspellers</h3>
      <p class="bonus-result">Meeste keren minimaal de juiste winnaar/gelijkspel voorspeld.</p>
      <ul class="bonus-list">${bestQ.map(r => qRow(r, "hit")).join("")}</ul>
    </div>`));
  qCols.appendChild(el(`<div class="card bonus-card">
      <h3>🥴 Minst rake voorspellers</h3>
      <p class="bonus-result">Minste keren minimaal de juiste winnaar/gelijkspel voorspeld.</p>
      <ul class="bonus-list">${worstQ.map(r => qRow(r, "")).join("")}</ul>
    </div>`));
  v.appendChild(qCols);

  // ---- Meeste / minste exacte uitslagen ----
  const bestE = quality.slice().sort((a, b) => b.exact - a.exact || a.name.localeCompare(b.name)).slice(0, 3);
  const worstE = quality.slice().sort((a, b) => a.exact - b.exact || a.name.localeCompare(b.name)).slice(0, 3);
  const eRow = (row, cls) => `<li class="${cls}"><span class="who">${esc(row.name)}</span><span class="pick ${cls}">${row.exact}/${row.played} exact</span></li>`;
  const eCols = el(`<div class="bonus-cols" style="margin-top:14px"></div>`);
  eCols.appendChild(el(`<div class="card bonus-card">
      <h3>🎯 Meeste exacte uitslagen</h3>
      <p class="bonus-result">Aantal keer de uitslag precies goed voorspeld (200 punten).</p>
      <ul class="bonus-list">${bestE.map(r => eRow(r, "hit")).join("")}</ul>
    </div>`));
  eCols.appendChild(el(`<div class="card bonus-card">
      <h3>😅 Minste exacte uitslagen</h3>
      <p class="bonus-result">Aantal keer de uitslag precies goed voorspeld (200 punten).</p>
      <ul class="bonus-list">${worstE.map(r => eRow(r, "")).join("")}</ul>
    </div>`));
  v.appendChild(eCols);

  // ---- Titelrace ----
  v.appendChild(el(`<div class="section-title">Wie maakt nog kans op de poule?</div>`));
  v.appendChild(el(`<p class="hint">Rekenkundig maximum: huidige punten + alle nog te spelen wedstrijden tot het einde van het toernooi exact goed voorspeld (ook rondes die nog niet in de database staan, op basis van de vaste bracket-omvang) + bonuspunten die nog niet vergeven zijn.</p>`));
  const race = computeTitleRace();
  const raceCard = el(`<div class="card bonus-card" style="margin-top:10px"><ul class="bonus-list"></ul></div>`);
  const raceList = raceCard.querySelector("ul");
  race.forEach(row => {
    const pickNote = row.pickStatus.alive === false ? " · kampioenspick uitgeschakeld" : "";
    const txt = row.inRace ? `nog kans · max ${row.maxTotal}` : `geen kans meer (max ${row.maxTotal})`;
    raceList.appendChild(el(`<li class="${row.inRace ? "hit" : ""}"><span class="who">${esc(row.name)} <span class="hint">(${row.total} pt nu)</span></span><span class="pick ${row.inRace ? "win" : ""}">${txt}${pickNote}</span></li>`));
  });
  v.appendChild(raceCard);

  // ---- Grootste sprong ----
  v.appendChild(el(`<div class="section-title">Grootste sprong in de stand</div>`));
  const moves = computeBiggestMoves();
  if (!moves.best) {
    v.appendChild(el(`<p class="hint">Nog niet genoeg wedstrijden gespeeld voor deze statistiek.</p>`));
  } else {
    const mLabel = m => `na ${esc(m.home)} – ${esc(m.away)} (${fmtDate(m.datetime, m.datetimeLabel)})`;
    const moveCols = el(`<div class="bonus-cols"></div>`);
    moveCols.appendChild(el(`<div class="card bonus-card">
        <h3>📈 Grootste stijger</h3>
        <p class="bonus-result">${esc(moves.best.name)}: van plek ${moves.best.from} naar plek ${moves.best.to}</p>
        <p class="hint">${mLabel(moves.best.match)}</p>
      </div>`));
    moveCols.appendChild(el(`<div class="card bonus-card">
        <h3>📉 Grootste daler</h3>
        <p class="bonus-result">${esc(moves.worst.name)}: van plek ${moves.worst.from} naar plek ${moves.worst.to}</p>
        <p class="hint">${mLabel(moves.worst.match)}</p>
      </div>`));
    v.appendChild(moveCols);
  }

  // ---- Langst op kop ----
  v.appendChild(el(`<div class="section-title">Langst op #1 gestaan</div>`));
  const lead = computeLongestLeader();
  const leadCard = el(`<div class="card bonus-card"></div>`);
  if (!lead.max) {
    leadCard.appendChild(el(`<p class="hint">Nog niet genoeg wedstrijden gespeeld voor deze statistiek.</p>`));
  } else {
    leadCard.appendChild(el(`<p class="bonus-result">${lead.leaders.map(esc).join(" & ")} stond na ${lead.max} van de ${playedCount()} gespeelde wedstrijden bovenaan.</p>`));
    if (lead.currentlyFirst) leadCard.appendChild(el(`<p class="hint">Nu bovenaan: <b>${esc(lead.currentlyFirst)}</b>.</p>`));
  }
  v.appendChild(leadCard);

  return v;
}

function viewBonus() {
  const champ = championResult();
  const tops = topscorerResult();
  const v = el(`<div></div>`);
  v.appendChild(el(`<p class="hint">Kampioen en topscorer leveren elk ${CFG.scoring.champion} punten op. Vul de uitslag in op het tabblad Uitslagen.</p>`));
  const cols = el(`<div class="bonus-cols" style="margin-top:14px"></div>`);

  const champCard = el(`<div class="card bonus-card"><h3>👑 Kampioen WK 2026</h3>
    <p class="bonus-result">${champ ? "Uitslag: <b>"+esc(champ)+"</b>" : "Nog niet bekend"}</p>
    <ul class="bonus-list"></ul></div>`);
  const champList = champCard.querySelector("ul");
  const champCounts = {};
  PARTS.forEach(n => { const p = BONUS.champion[n]; champCounts[p] = (champCounts[p]||0)+1; });
  PARTS.forEach(n => {
    const pick = BONUS.champion[n];
    const hit = champ && String(pick).trim().toUpperCase() === String(champ).trim().toUpperCase();
    champList.appendChild(el(`<li class="${hit?"hit":""}"><span class="who">${esc(n)}</span><span class="pick ${hit?"win":""}">${esc(pick||"—")}${hit?" ✓ +"+CFG.scoring.champion:""}</span></li>`));
  });
  cols.appendChild(champCard);

  const topCard = el(`<div class="card bonus-card"><h3>🥅 Topscorer WK 2026</h3>
    <p class="bonus-result">${tops.length ? "Uitslag: <b>"+tops.map(esc).join(", ")+"</b>" : "Nog niet bekend"}</p>
    <ul class="bonus-list"></ul></div>`);
  const topList = topCard.querySelector("ul");
  PARTS.forEach(n => {
    const pick = BONUS.topscorer[n];
    const hit = tops.length && tops.some(t => String(t).trim().toLowerCase() === String(pick).trim().toLowerCase());
    topList.appendChild(el(`<li class="${hit?"hit":""}"><span class="who">${esc(n)}</span><span class="pick ${hit?"win":""}">${esc(pick||"—")}${hit?" ✓ +"+CFG.scoring.topscorer:""}</span></li>`));
  });
  cols.appendChild(topCard);
  v.appendChild(cols);
  return v;
}

function viewInvoeren() {
  const v = el(`<div></div>`);
  v.appendChild(el(`
    <div class="notice">
      <b>Uitslagen invoeren.</b> Wat je hier invult wordt op dit apparaat bewaard en de standen worden direct herberekend.
      Wedstrijden die automatisch (of door iemand anders) al in de database staan, kun je hier niet overschrijven.
      Gebruik <b>Exporteren</b> om alles als <code>matches.json</code> te downloaden voor de gedeelde/online versie.
    </div>`));

  const toolbar = el(`<div class="toolbar"></div>`);
  const exportBtn = el(`<button class="btn primary">⬇︎ Exporteer matches.json</button>`);
  exportBtn.addEventListener("click", exportMatches);
  const clearBtn = el(`<button class="btn danger">Lokale invoer wissen</button>`);
  clearBtn.addEventListener("click", () => {
    if (confirm("Alle lokaal ingevoerde uitslagen op dit apparaat wissen?")) {
      localResults = {}; saveLS(LS_RESULTS, localResults); render();
    }
  });
  toolbar.appendChild(exportBtn); toolbar.appendChild(clearBtn);
  v.appendChild(toolbar);

  // Bonus-invoer
  const bonusBox = el(`<div class="card" style="padding:14px 16px;margin-bottom:16px">
      <div class="section-title" style="margin:0 0 10px">Bonus-uitslag</div>
      <div style="display:flex;flex-wrap:wrap;gap:14px;align-items:center">
        <label style="font-size:13px">Kampioen (code, bv. NED):
          <input id="champ-in" class="" style="width:90px;padding:8px;background:var(--bg-2);border:1px solid var(--line);color:var(--text);border-radius:8px;text-transform:uppercase" value="${esc(localBonus.champion||"")}">
        </label>
        <label style="font-size:13px">Topscorer(s) (komma-gescheiden):
          <input id="top-in" style="width:240px;padding:8px;background:var(--bg-2);border:1px solid var(--line);color:var(--text);border-radius:8px" value="${esc((localBonus.topscorer||[]).join(", "))}">
        </label>
        <button class="btn" id="save-bonus">Bonus opslaan</button>
      </div>
    </div>`);
  bonusBox.querySelector("#save-bonus").addEventListener("click", () => {
    localBonus.champion = bonusBox.querySelector("#champ-in").value.trim().toUpperCase() || null;
    localBonus.topscorer = bonusBox.querySelector("#top-in").value.split(",").map(s=>s.trim()).filter(Boolean);
    saveLS(LS_BONUS, localBonus);
    render();
  });
  v.appendChild(bonusBox);

  const card = el(`<div class="card"></div>`);
  MATCHES.forEach(m => {
    const fileLocked = m.result && Number.isInteger(m.result.home);
    const r = resultOf(m) || {};
    const row = el(`
      <div class="entry-row" data-id="${m.id}">
        <div class="entry-team home">${esc(m.home)} <span class="flag">${m.homeFlag}</span></div>
        <div class="score-inputs">
          <input type="number" min="0" class="in-h" value="${Number.isInteger(r.home)?r.home:""}" ${fileLocked?"disabled":""}>
          <span>–</span>
          <input type="number" min="0" class="in-a" value="${Number.isInteger(r.away)?r.away:""}" ${fileLocked?"disabled":""}>
        </div>
        <div class="entry-team away"><span class="flag">${m.awayFlag}</span> ${esc(m.away)}</div>
        <div class="entry-status ${fileLocked?"saved":""}">${fileLocked?"in database":(localResults[m.id]?"opgeslagen":"")} <span class="grouptag">${shortTag(m)}</span></div>
      </div>`);
    if (!fileLocked) {
      const h = row.querySelector(".in-h"), a = row.querySelector(".in-a");
      const status = row.querySelector(".entry-status");
      const onChange = () => {
        const hv = h.value === "" ? null : parseInt(h.value, 10);
        const av = a.value === "" ? null : parseInt(a.value, 10);
        if (Number.isInteger(hv) && Number.isInteger(av) && hv >= 0 && av >= 0) {
          localResults[m.id] = { home: hv, away: av };
          status.textContent = "opgeslagen ✓"; status.classList.add("saved");
        } else {
          delete localResults[m.id];
          status.textContent = ""; status.classList.remove("saved");
        }
        saveLS(LS_RESULTS, localResults);
        updateBadge();
      };
      h.addEventListener("input", onChange);
      a.addEventListener("input", onChange);
    }
    card.appendChild(row);
  });
  v.appendChild(card);
  return v;
}

function exportMatches() {
  const merged = MATCHES.map(m => ({ ...m, result: resultOf(m) }));
  const blob = new Blob([JSON.stringify(merged, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = "matches.json"; a.click();
  URL.revokeObjectURL(url);
}

// ---------- Deelnemer-detail ----------
function openParticipant(name) {
  const champ = championResult(), tops = topscorerResult();
  const content = document.getElementById("modal-content");
  const board = computeLeaderboard();
  const me = board.find(b => b.name === name);
  const renderRows = (list) => list.map(m => {
    const r = resultOf(m);
    const raw = PREDS[m.id] ? PREDS[m.id][name] : null;
    const pts = (r && raw != null) ? scoreMatch(parseScore(raw), r) : null;
    return `
      <div class="detail-row">
        <span class="dmatch">${m.homeFlag} ${esc(m.home)} – ${esc(m.away)} ${m.awayFlag}
          <span class="grouptag">${shortTag(m)}</span></span>
        <span class="dpred">${raw?esc(raw):"—"}${r?` · <b>${r.home}–${r.away}</b>`:""}</span>
        <span>${(r && raw != null)?`<span class="pts ${ptsClass(pts)}">${pts}</span>`:`<span class="hint">—</span>`}</span>
      </div>`;
  }).join("");
  const koRowsHtml = KO_MATCHES.length
    ? `<div class="section-title" style="margin:16px 0 0">Knock-out</div>${renderRows(KO_MATCHES)}`
    : "";
  const groupRowsHtml = `<div class="section-title" style="margin:16px 0 0">Groepsfase</div>${renderRows(GROUP_MATCHES)}`;
  const champHit = champ && String(BONUS.champion[name]).trim().toUpperCase() === String(champ).trim().toUpperCase();
  const topHit = tops.length && tops.some(t => String(t).trim().toLowerCase() === String(BONUS.topscorer[name]).trim().toLowerCase());
  content.innerHTML = `
    <h2>${esc(name)}</h2>
    <p class="hint">Plek ${me.rank} · ${me.total} punten · ${me.exact}× exacte uitslag</p>
    <div class="card" style="padding:12px 16px;margin:14px 0">
      <div style="display:flex;gap:18px;flex-wrap:wrap;font-size:13px">
        <span>Groepsfase: <b>${me.groupPts}</b></span>
        <span>Knock-out: <b>${me.koPts}</b></span>
        <span>Bonus: <b>${me.bonusPts}</b></span>
        <span>Kampioen: ${esc(BONUS.champion[name]||"—")} ${champHit?"✓":""}</span>
        <span>Topscorer: ${esc(BONUS.topscorer[name]||"—")} ${topHit?"✓":""}</span>
      </div>
    </div>
    ${koRowsHtml}
    ${groupRowsHtml}`;
  document.getElementById("modal").classList.remove("hidden");
}

// ---------- Routing ----------
let currentTab = "klassement";
function render() {
  const view = document.getElementById("view");
  view.innerHTML = "";
  const map = { klassement: viewKlassement, wedstrijden: viewWedstrijden, knockout: viewKnockout, groepen: viewGroepen, verloop: viewVerloop, statistieken: viewStatistieken, bonus: viewBonus, invoeren: viewInvoeren };
  view.appendChild((map[currentTab] || viewKlassement)());
  document.querySelectorAll(".tab").forEach(t => t.classList.toggle("active", t.dataset.tab === currentTab));
  updateBadge();
}
function updateBadge() {
  document.getElementById("updated-badge").textContent = `${playedCount()}/${MATCHES.length} gespeeld`;
}

document.getElementById("tabs").addEventListener("click", e => {
  const btn = e.target.closest(".tab");
  if (!btn) return;
  currentTab = btn.dataset.tab;
  render();
});
document.getElementById("modal").addEventListener("click", e => {
  if (e.target.hasAttribute("data-close")) document.getElementById("modal").classList.add("hidden");
});

render();
