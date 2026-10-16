// ============================================================
//  Moteur de rapport de partie
//  ------------------------------------------------------------
//  - Probabilité de gain (formule publique de Lichess)
//  - Classification par perte de « points attendus »
//  - Détection de sacrifices (coups géniaux), coups uniques,
//    occasions manquées, coups forcés, coups théoriques
//  - Précision de partie (moyenne pondérée par la volatilité
//    + moyenne harmonique, méthode publiée par Lichess)
//  Algorithmes réimplémentés pour ce projet — pas de code tiers.
// ============================================================

import { lookupOpening } from './openings.js';

const Chess = () => globalThis.Chess;

// ---------- Catégories ----------
export const CLASSES = {
  brilliant:  { label: 'Génial',             sym: '!!', order: 0 },
  great:      { label: 'Coup unique',        sym: '!',  order: 1 },
  best:       { label: 'Meilleur',           sym: '◆',  order: 2 },
  excellent:  { label: 'Excellent',          sym: '◇',  order: 3 },
  good:       { label: 'Bon',                sym: '○',  order: 4 },
  book:       { label: 'Théorie',            sym: 'Th', order: 5 },
  forced:     { label: 'Forcé',              sym: '→',  order: 6 },
  inaccuracy: { label: 'Imprécision',        sym: '?!', order: 7 },
  mistake:    { label: 'Erreur',             sym: '?',  order: 8 },
  miss:       { label: 'Occasion manquée',   sym: '✕',  order: 9 },
  blunder:    { label: 'Gaffe',              sym: '??', order: 10 },
};
export const CLASS_KEYS = Object.keys(CLASSES);

const VALUE = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
const PIECE_FR = { p: 'un pion', n: 'un cavalier', b: 'un fou', r: 'une tour', q: 'la dame', k: 'le roi' };

// ---------- Probabilités ----------
/** Probabilité de gain des Blancs (0–100) pour un score en centipions. */
export function winPercent(cp) {
  const c = Math.max(-1000, Math.min(1000, cp));
  return 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * c)) - 1);
}

/** Probabilité de gain (0–100) d'une évaluation {cp|mate} pour la couleur donnée. */
export function evalWp(ev, color = 'w') {
  if (!ev) return 50;
  let w;
  if (ev.mate !== undefined && ev.mate !== null) w = ev.mate > 0 ? 100 : ev.mate < 0 ? 0 : (ev.matedSide === 'w' ? 0 : 100);
  else w = winPercent(ev.cp);
  return color === 'w' ? w : 100 - w;
}

/** Précision d'un coup (0–100) à partir de la perte de probabilité de gain (en points %). */
export function moveAccuracy(lossPct) {
  const raw = 103.1668100711649 * Math.exp(-0.04354415386753951 * Math.max(0, lossPct)) - 3.166924740191411 + 1;
  return Math.max(0, Math.min(100, raw));
}

/** Texte lisible d'une évaluation (point de vue des Blancs). */
export function formatEval(ev) {
  if (!ev) return '0.0';
  if (ev.mate !== undefined && ev.mate !== null) {
    if (ev.mate === 0) return ev.matedSide === 'w' ? '0-1' : '1-0';
    return (ev.mate > 0 ? '+' : '-') + 'M' + Math.abs(ev.mate);
  }
  const v = ev.cp / 100;
  return (v > 0 ? '+' : '') + v.toFixed(1);
}

// ---------- Outils échiquier ----------
export function uciToSan(fen, uci) {
  if (!uci) return null;
  const g = new (Chess())(fen);
  const mv = g.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] || 'q' });
  return mv ? mv.san : null;
}

export function pvToSan(fen, pv, max = 6) {
  const g = new (Chess())(fen);
  const out = [];
  for (const uci of pv.slice(0, max)) {
    const mv = g.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] || 'q' });
    if (!mv) break;
    out.push(mv.san);
  }
  return out;
}

/**
 * Gain matériel maximal que le camp au trait peut obtenir par une prise,
 * en tenant compte d'une reprise éventuelle (échange statique à 1 coup).
 */
function bestCaptureGain(g, minTarget = 0) {
  let best = 0;
  for (const m of g.moves({ verbose: true })) {
    if (!m.captured) continue;
    const victim = VALUE[m.captured];
    if (victim < minTarget) continue;
    g.move(m);
    const canRecapture = g.moves({ verbose: true }).some((r) => r.to === m.to && r.captured);
    g.undo();
    const gain = victim + (m.promotion ? VALUE[m.promotion] - 1 : 0) - (canRecapture ? VALUE[m.piece] : 0);
    if (gain > best) best = gain;
  }
  return best;
}

/** Le coup laisse-t-il une pièce (≥ fou/cavalier) en prise de façon délibérée ? */
export function isSacrifice(fenBefore, move) {
  const C = Chess();
  if (move.promotion) return false;
  const after = new C(fenBefore);
  const played = after.move({ from: move.from, to: move.to, promotion: move.promotion || 'q' });
  if (!played) return false;
  const gainAfter = bestCaptureGain(after, 3);
  const captured = move.captured ? VALUE[move.captured] : 0;
  if (gainAfter - captured < 2) return false;

  // Ce qui était déjà en prise avant le coup ne compte pas comme un sacrifice
  let gainBefore = 0;
  const before = new C(fenBefore);
  if (!before.in_check()) {
    const parts = fenBefore.split(' ');
    parts[1] = parts[1] === 'w' ? 'b' : 'w';
    parts[3] = '-';
    const swapped = new C();
    if (swapped.load(parts.join(' '))) gainBefore = bestCaptureGain(swapped, 3);
  }
  return gainAfter > gainBefore;
}

function nonPawnMaterial(fen) {
  let t = 0;
  for (const ch of fen.split(' ')[0]) {
    const v = VALUE[ch.toLowerCase()];
    if (v && ch.toLowerCase() !== 'p') t += v;
  }
  return t;
}

// ---------- Analyse des positions ----------
/** Évaluation d'une position terminale (mat / pat / nulle) sans moteur. */
function terminalEval(fen) {
  const g = new (Chess())(fen);
  if (g.in_checkmate()) return { mate: 0, matedSide: g.turn() };
  if (g.in_stalemate() || g.insufficient_material()) return { cp: 0 };
  return null;
}

/**
 * Analyse toutes les positions d'une partie (initiale + après chaque coup).
 * @returns Promise<Array<{fen, eval, lines}>>
 */
export async function analyzePositions(game, engine, { depth = 14, onProgress = null, isCancelled = () => false } = {}) {
  const fens = [game.initialFen, ...game.moves.map((m) => m.fenAfter)];
  // Pool de moteurs : positions réparties en blocs contigus, analysées en parallèle
  if (engine && typeof engine.map === 'function') {
    return engine.map(fens, (fen, eng) => analyzeOne(fen, eng, depth), { onProgress, isCancelled });
  }
  const positions = [];
  for (let i = 0; i < fens.length; i++) {
    if (isCancelled()) throw new Error('cancelled');
    positions.push(await analyzeOne(fens[i], engine, depth));
    if (onProgress) onProgress(i + 1, fens.length);
  }
  return positions;
}

export async function analyzeOne(fen, engine, depth, maxTime = null) {
  const term = terminalEval(fen);
  if (term) return { fen, eval: term, lines: [] };
  const res = await engine.analyse(fen, { depth, multipv: 2, maxTime });
  const lines = res.lines.map((l) => ({ uci: l.uci, pv: l.pv, cp: l.cp, mate: l.mate }));
  const top = lines[0] || { cp: 0 };
  return { fen, eval: { cp: top.cp, mate: top.mate }, lines };
}

/**
 * Passe de vérification : les coups classés erreur/gaffe/occasion manquée
 * (et les grosses imprécisions) sont ré-analysés plus profondément avant
 * d'être confirmés. Corrige les faux positifs dus à l'horizon du moteur.
 */
export async function refinePositions(game, positions, engine, { depth = 14, extra = 4, maxTime = 1500, onProgress = null, isCancelled = () => false } = {}) {
  const prelim = [];
  for (let i = 0; i < game.moves.length; i++) prelim.push(classifyMove(game, positions, i, prelim));
  const targets = new Set();
  prelim.forEach((c, i) => {
    if (['mistake', 'blunder', 'miss'].includes(c.cls) || (c.cls === 'inaccuracy' && c.loss > 0.07)) {
      targets.add(i); targets.add(i + 1);
    }
  });
  const list = [...targets].sort((a, b) => a - b);
  if (engine && typeof engine.map === 'function') {
    const res = await engine.map(list, (idx, eng) => analyzeOne(positions[idx].fen, eng, depth + extra, maxTime), { onProgress, isCancelled });
    list.forEach((idx, k) => { positions[idx] = res[k]; });
    return list.length;
  }
  for (let k = 0; k < list.length; k++) {
    if (isCancelled()) throw new Error('cancelled');
    const idx = list[k];
    positions[idx] = await analyzeOne(positions[idx].fen, engine, depth + extra, maxTime);
    if (onProgress) onProgress(k + 1, list.length);
  }
  return list.length;
}

// ---------- Classification ----------
/**
 * Classe le coup d'indice i.
 * positions[i] = avant le coup, positions[i+1] = après.
 */
export function classifyMove(game, positions, i, classified = []) {
  const mv = game.moves[i];
  const before = positions[i];
  const after = positions[i + 1];
  const c = mv.color;
  const res = { cls: null, loss: 0, accuracy: 100 };

  const top = before.lines[0];
  const second = before.lines[1];
  const wpBest = evalWp(before.eval, c);
  let wpAfter = evalWp(after.eval, c);

  // Si le coup joué fait partie des lignes analysées, on reprend leur évaluation
  // (même profondeur → moins de bruit)
  const playedLine = before.lines.find((l) => l.uci === mv.uci);
  if (playedLine && !after.eval.matedSide) wpAfter = Math.max(wpAfter, evalWp(playedLine, c));
  const isTop = top && top.uci === mv.uci;
  if (isTop) wpAfter = Math.max(wpAfter, wpBest);

  const lossPct = Math.max(0, wpBest - wpAfter);
  res.loss = lossPct / 100;
  res.accuracy = moveAccuracy(lossPct);
  res.wpBest = wpBest;
  res.wpAfter = wpAfter;

  // 1. Coup forcé
  if (mv.legalCount === 1) { res.cls = 'forced'; return res; }

  // 2. Théorie
  const book = lookupOpening(mv.fenAfter);
  if (book && res.loss < 0.20) { res.cls = 'book'; res.loss = Math.min(res.loss, 0.01); res.accuracy = Math.max(res.accuracy, moveAccuracy(1)); res.opening = book.name; return res; }

  // 3. Catégorie de base selon la perte de points attendus
  let cls;
  if (isTop || after.eval.matedSide === (c === 'w' ? 'b' : 'w')) cls = 'best';
  else if (res.loss < 0.02) cls = 'excellent';
  else if (res.loss < 0.05) cls = 'good';
  else if (res.loss < 0.10) cls = 'inaccuracy';
  else if (res.loss < 0.20) cls = 'mistake';
  else cls = 'blunder';

  const wpSecond = second ? evalWp(second, c) : null;

  // 4. Génial : sacrifice correct, sans être déjà totalement gagnant
  if ((cls === 'best' || cls === 'excellent') && wpAfter >= 45 &&
      wpSecond !== null && wpSecond < 90 && isSacrifice(mv.fenBefore, mv)) {
    res.cls = 'brilliant';
    return res;
  }

  // 5. Coup unique : la 2e meilleure option est nettement moins bonne
  const givesMate = !!after.eval.matedSide;
  if (cls === 'best' && !givesMate && wpSecond !== null && wpBest - wpSecond >= 15 && wpBest >= 30 && wpBest < 97) {
    const prev = game.moves[i - 1];
    const isRecapture = prev && prev.captured && prev.to === mv.to && mv.captured;
    if (!isRecapture) cls = 'great';
  }

  // 6. Occasion manquée : l'adversaire venait de se tromper et on ne punit pas
  if (['inaccuracy', 'mistake', 'blunder'].includes(cls) && i > 0) {
    const prevCls = classified[i - 1] && classified[i - 1].cls;
    if (['mistake', 'blunder', 'miss'].includes(prevCls) && wpBest >= 65 && wpAfter < 60 && res.loss >= 0.10) {
      cls = 'miss';
    }
  }

  res.cls = cls;
  return res;
}

// ---------- Commentaires ----------
function evalPhrase(ev, color) {
  if (ev.mate !== undefined && ev.mate !== null && ev.mate !== 0) {
    const forMe = (ev.mate > 0) === (color === 'w');
    return forMe ? `mat en ${Math.abs(ev.mate)}` : `l'adversaire mate en ${Math.abs(ev.mate)}`;
  }
  const cp = (color === 'w' ? 1 : -1) * (ev.cp || 0);
  const v = Math.abs(cp / 100).toFixed(1);
  if (Math.abs(cp) < 40) return 'position équilibrée';
  return cp > 0 ? `avantage de +${v}` : `désavantage de -${v}`;
}

export function explainMove(game, positions, i, info) {
  const mv = game.moves[i];
  const before = positions[i];
  const after = positions[i + 1];
  const c = mv.color;
  const top = before.lines[0];
  const bestSan = top ? uciToSan(mv.fenBefore, top.uci) : null;
  const reply = after.lines[0];
  const replySan = reply ? uciToSan(mv.fenAfter, reply.uci) : null;

  // Matériel perdu par la meilleure réponse adverse
  let threat = '';
  if (reply) {
    const g = new (Chess())(mv.fenAfter);
    const r = g.move({ from: reply.uci.slice(0, 2), to: reply.uci.slice(2, 4), promotion: reply.uci[4] || 'q' });
    if (r && r.captured && VALUE[r.captured] >= 3) threat = ` ${replySan} gagne ${PIECE_FR[r.captured]}.`;
    else if (after.eval.mate && ((after.eval.mate > 0) !== (c === 'w'))) threat = ` L'adversaire a un mat en ${Math.abs(after.eval.mate)} après ${replySan}.`;
    else if (replySan) threat = ` La meilleure réponse est ${replySan}.`;
  }

  switch (info.cls) {
    case 'brilliant': return `${mv.san} est génial ! Un sacrifice qui tient : ${evalPhrase(after.eval, c)}.`;
    case 'great': return `${mv.san} est le seul bon coup ici — les autres options lâchaient l'avantage.`;
    case 'best': return after.eval.matedSide ? `${mv.san} — échec et mat !` : `${mv.san} est le meilleur coup (${evalPhrase(after.eval, c)}).`;
    case 'excellent': return `${mv.san} est excellent, presque aussi fort que ${bestSan}.`;
    case 'good': return `${mv.san} est un bon coup. ${bestSan} était légèrement plus précis.`;
    case 'book': return `${mv.san} est un coup théorique${info.opening ? ` (${info.opening})` : ''}.`;
    case 'forced': return `${mv.san} était le seul coup légal.`;
    case 'inaccuracy': return `${mv.san} est une imprécision. Mieux valait ${bestSan}.${threat}`;
    case 'mistake': return `${mv.san} est une erreur. Le meilleur coup était ${bestSan}.${threat}`;
    case 'miss': return `Occasion manquée ! L'adversaire venait de se tromper : ${bestSan} donnait ${evalPhrase(before.eval, c)}.`;
    case 'blunder': return `${mv.san} est une gaffe. Il fallait jouer ${bestSan}.${threat}`;
    default: return mv.san;
  }
}

// ---------- Typologie des erreurs (pour le bilan multi-parties) ----------
export const TAG_LABELS = {
  hanging: 'Pièce laissée en prise',
  mateAllowed: 'Mat concédé',
  mateMissed: 'Mat manqué',
  tactic: 'Tactique ratée',
  positional: 'Imprécision positionnelle',
};

function errorTag(game, positions, i, info) {
  if (!['inaccuracy', 'mistake', 'blunder', 'miss'].includes(info.cls)) return null;
  const mv = game.moves[i];
  const before = positions[i].eval, after = positions[i + 1].eval;
  const mine = (ev) => ev.mate != null && ev.mate !== 0 && (ev.mate > 0) === (mv.color === 'w');
  const theirs = (ev) => ev.mate != null && ev.mate !== 0 && (ev.mate > 0) !== (mv.color === 'w');
  if (mine(before) && !mine(after)) return 'mateMissed';
  if (theirs(after)) return 'mateAllowed';
  const reply = positions[i + 1].lines[0];
  if (reply) {
    const g = new (Chess())(mv.fenAfter);
    const r = g.move({ from: reply.uci.slice(0, 2), to: reply.uci.slice(2, 4), promotion: reply.uci[4] || 'q' });
    if (r && r.captured && VALUE[r.captured] >= 3) return 'hanging';
  }
  return info.loss >= 0.15 ? 'tactic' : 'positional';
}

// ---------- Rapport complet ----------
function stdDev(xs) {
  const m = xs.reduce((a, b) => a + b, 0) / xs.length;
  return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / xs.length);
}

/** Précision de partie par couleur (méthode pondérée Lichess). */
export function gameAccuracy(game, positions, classified) {
  const wps = positions.map((p) => evalWp(p.eval, 'w'));
  const n = wps.length;
  const win = Math.max(2, Math.min(8, Math.floor(n / 10)));
  const windows = [];
  for (let k = 0; k < Math.min(win, n) - 2; k++) windows.push(wps.slice(0, win));
  for (let k = 0; k + win <= n; k++) windows.push(wps.slice(k, k + win));
  const weights = windows.map((w) => Math.max(0.5, Math.min(12, stdDev(w))));

  const out = {};
  for (const color of ['w', 'b']) {
    let wSum = 0, wTot = 0, hSum = 0, cnt = 0;
    game.moves.forEach((mv, i) => {
      if (mv.color !== color || !classified[i]) return;
      const acc = classified[i].accuracy;
      const w = weights[Math.min(i, weights.length - 1)] ?? 1;
      wSum += acc * w; wTot += w;
      hSum += 1 / Math.max(acc, 1); cnt++;
    });
    out[color] = cnt ? (wSum / wTot + cnt / hSum) / 2 : null;
  }
  return out;
}

/** Estimation indicative du niveau de jeu à partir de la précision. */
export function estimateRating(accuracy) {
  if (accuracy == null) return null;
  const T = [[0, 100], [40, 450], [50, 700], [60, 1000], [70, 1400], [75, 1650], [80, 1900], [85, 2150], [90, 2450], [95, 2750], [98, 2950], [100, 3100]];
  for (let k = 1; k < T.length; k++) {
    if (accuracy <= T[k][0]) {
      const [a0, r0] = T[k - 1], [a1, r1] = T[k];
      return Math.round((r0 + (r1 - r0) * (accuracy - a0) / (a1 - a0)) / 50) * 50;
    }
  }
  return 3000;
}

function phaseOf(fen, ply, lastBookPly) {
  if (ply <= Math.max(lastBookPly, 16) && ply < 30) return 'opening';
  return nonPawnMaterial(fen) <= 26 ? 'endgame' : 'middlegame';
}

/**
 * Construit le rapport complet à partir des positions analysées.
 */
export function buildReport(game, positions) {
  const classified = [];
  for (let i = 0; i < game.moves.length; i++) {
    const info = classifyMove(game, positions, i, classified);
    const mv = game.moves[i];
    const top = positions[i].lines[0];
    info.bestUci = top ? top.uci : null;
    info.bestSan = top ? uciToSan(mv.fenBefore, top.uci) : null;
    info.bestLine = top ? pvToSan(mv.fenBefore, top.pv, 6) : [];
    info.evalAfter = positions[i + 1].eval;
    info.comment = explainMove(game, positions, i, info);
    info.tag = errorTag(game, positions, i, info);
    classified.push(info);
  }

  // Ouverture : dernière position du livre rencontrée
  let opening = null, lastBookPly = -1;
  game.moves.forEach((mv, i) => {
    const b = lookupOpening(mv.fenAfter);
    if (b) { lastBookPly = i; if (b.name) opening = b.name; }
  });

  classified.forEach((c, i) => { c.phase = phaseOf(game.moves[i].fenBefore, i, lastBookPly); });

  const counts = { w: {}, b: {} };
  for (const k of CLASS_KEYS) { counts.w[k] = 0; counts.b[k] = 0; }
  classified.forEach((c, i) => { counts[game.moves[i].color][c.cls]++; });

  const accuracy = gameAccuracy(game, positions, classified);

  // Précision par phase
  const phases = { w: {}, b: {} };
  game.moves.forEach((mv, i) => {
    const ph = phaseOf(mv.fenBefore, i, lastBookPly);
    const bucket = phases[mv.color][ph] || (phases[mv.color][ph] = { sum: 0, n: 0 });
    bucket.sum += classified[i].accuracy; bucket.n++;
  });
  for (const col of ['w', 'b']) {
    for (const ph of Object.keys(phases[col])) {
      const b = phases[col][ph];
      phases[col][ph] = Math.round(b.sum / b.n);
    }
  }

  // Moments clés : plus grandes variations de probabilité
  const swings = game.moves.map((mv, i) => ({
    ply: i, swing: Math.abs(evalWp(positions[i + 1].eval, 'w') - evalWp(positions[i].eval, 'w')),
  })).filter((s) => ['blunder', 'mistake', 'miss', 'brilliant', 'great'].includes(classified[s.ply].cls))
    .sort((a, b) => b.swing - a.swing).slice(0, 6).map((s) => s.ply).sort((a, b) => a - b);

  return {
    moves: classified,
    evals: positions.map((p) => p.eval),
    counts,
    accuracy,
    rating: { w: estimateRating(accuracy.w), b: estimateRating(accuracy.b) },
    phases,
    opening,
    keyMoments: swings,
  };
}
