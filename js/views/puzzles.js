// ============================================================
//  Vue « Problèmes » : tactiques Lichess (CC0), pack hors-ligne,
//  et entraînement sur ses propres erreurs.
// ============================================================

import { Board } from '../ui/board.js';
import { $, $$, toast, escapeHtml, moveNo } from '../ui/common.js';
import { lichessPuzzle } from '../importers.js';
import { LOCAL_PUZZLES } from '../core/local-puzzles.js';
import { analyzeOne, evalWp, uciToSan } from '../core/review.js';
import { store, save } from '../store.js';

export const THEMES = {
  mix: 'Mélange', mateIn1: 'Mat en 1', mateIn2: 'Mat en 2', mateIn3: 'Mat en 3', fork: 'Fourchette',
  pin: 'Clouage', skewer: 'Enfilade', discoveredAttack: 'Attaque à la découverte', sacrifice: 'Sacrifice',
  hangingPiece: 'Pièce en prise', deflection: 'Déviation', attraction: 'Attraction', backRankMate: 'Mat du couloir',
  smotheredMate: 'Mat étouffé', promotion: 'Promotion', endgame: 'Finale', opening: 'Ouverture', middlegame: 'Milieu de jeu',
  trappedPiece: 'Pièce piégée', quietMove: 'Coup tranquille', defensiveMove: 'Coup défensif', zugzwang: 'Zugzwang',
  kingsideAttack: 'Attaque sur le roque', intermezzo: 'Coup intermédiaire', capturingDefender: 'Élimination du défenseur',
  exposedKing: 'Roi exposé', xRayAttack: 'Rayons X', rookEndgame: 'Finale de tours', pawnEndgame: 'Finale de pions',
  short: 'Court', long: 'Long', veryLong: 'Très long', oneMove: 'Un coup', crushing: 'Écrasant', advantage: 'Avantage',
  mate: 'Mat', master: 'Partie de maître', equality: 'Égalité', clearance: 'Dégagement', doubleCheck: 'Échec double',
  enPassant: 'En passant', castling: 'Roque', underPromotion: 'Sous-promotion', queenEndgame: 'Finale de dames',
  bishopEndgame: 'Finale de fous', knightEndgame: 'Finale de cavaliers', mateIn4: 'Mat en 4', mateIn5: 'Mat en 5+',
};
const DIFF = { easiest: 'Très facile', easier: 'Facile', normal: 'Normal', harder: 'Difficile', hardest: 'Très difficile' };

let app, board;
let source = 'lichess';
let pz = null;          // problème courant
let trainQueue = [];    // positions issues des erreurs du joueur
let localIdx = 0;

export function init(a) {
  app = a;
  board = new Board($('#pz-board'), { movable: null, onMove: onMove });

  $('#pz-theme').innerHTML = ['mix', 'mateIn1', 'mateIn2', 'mateIn3', 'fork', 'pin', 'skewer', 'discoveredAttack', 'sacrifice',
    'hangingPiece', 'deflection', 'backRankMate', 'smotheredMate', 'trappedPiece', 'endgame', 'opening', 'promotion', 'zugzwang']
    .map((k) => `<option value="${k}">${THEMES[k]}</option>`).join('');
  $('#pz-diff').innerHTML = Object.entries(DIFF).map(([k, v]) => `<option value="${k}">${v}</option>`).join('');
  $('#pz-theme').value = store.settings.puzzleTheme;
  $('#pz-diff').value = store.settings.puzzleDifficulty;
  $('#pz-theme').addEventListener('change', (e) => { store.settings.puzzleTheme = e.target.value; save(); });
  $('#pz-diff').addEventListener('change', (e) => { store.settings.puzzleDifficulty = e.target.value; save(); });

  $$('#pz-sources [data-src]').forEach((b) => b.addEventListener('click', () => { setSource(b.dataset.src); next(); }));
  $('#pz-next').addEventListener('click', next);
  $('#pz-hint').addEventListener('click', hint);
  $('#pz-solution').addEventListener('click', revealSolution);
  $('#pz-retry').addEventListener('click', () => pz && startPuzzle(pz.def));
  renderStats();
}

export function onShow(params) {
  renderStats();
  if (params && params.trainFrom) {
    buildTrainQueue(params.trainFrom);
    setSource('mine');
    next();
  } else if (!pz) next();
}

function setSource(s) {
  source = s;
  $$('#pz-sources [data-src]').forEach((b) => b.classList.toggle('active', b.dataset.src === s));
  $('#pz-filters').hidden = s !== 'lichess';
}

function buildTrainQueue(r) {
  trainQueue = [];
  r.game.moves.forEach((m, i) => {
    const info = r.report.moves[i];
    if (m.color !== r.userColor || !['mistake', 'blunder', 'miss'].includes(info.cls) || !info.bestUci) return;
    trainQueue.push({
      id: `mine-${i}`, title: `Ta partie · coup ${moveNo(r.game, i)}`, fen: m.fenBefore,
      solution: [info.bestUci], rating: null, themes: [info.cls === 'blunder' ? 'Gaffe à corriger' : info.cls === 'miss' ? 'Occasion manquée' : 'Erreur à corriger'],
      flexible: true, playedSan: m.san,
    });
  });
  toast(`${trainQueue.length} position${trainQueue.length > 1 ? 's' : ''} à retravailler`, 'info');
}

// ---------------------------------------------------------------
//  Chargement
// ---------------------------------------------------------------
function setLoading(on, text = 'Chargement du problème…') {
  $('#pz-loading').hidden = !on;
  $('#pz-loading-label').textContent = text;
}

async function next() {
  if (source === 'mine') {
    if (!trainQueue.length) {
      feedback('Plus aucune position à retravailler. Analyse une partie puis clique sur « S\'entraîner sur mes erreurs ».', 'info');
      return;
    }
    return startPuzzle(trainQueue.shift());
  }
  if (source === 'local') {
    const def = LOCAL_PUZZLES[localIdx % LOCAL_PUZZLES.length];
    localIdx++;
    return startPuzzle(def);
  }
  setLoading(true);
  try {
    const data = await lichessPuzzle({ theme: store.settings.puzzleTheme, difficulty: store.settings.puzzleDifficulty });
    startPuzzle(fromLichess(data));
  } catch (e) {
    console.warn(e);
    toast('Lichess injoignable — problème du pack hors-ligne à la place.', 'error', 4500);
    setSource('local');
    startPuzzle(LOCAL_PUZZLES[localIdx++ % LOCAL_PUZZLES.length]);
  } finally {
    setLoading(false);
  }
}

/** Reconstruit la position d'un problème Lichess à partir de la partie d'origine. */
function fromLichess(data) {
  const C = globalThis.Chess;
  const sans = data.game.pgn.split(/\s+/).filter((t) => t && !/^\d+\.+$/.test(t));
  const p = data.puzzle;
  const tryBuild = (count) => {
    const g = new C();
    for (const san of sans.slice(0, count)) if (!g.move(san)) return null;
    const u = p.solution[0];
    const probe = new C(g.fen());
    return probe.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] || 'q' }) ? g : null;
  };
  const g = tryBuild(sans.length) || tryBuild(p.initialPly + 1) || tryBuild(p.initialPly);
  if (!g) throw new Error('Problème illisible');
  const last = g.undo();
  const prelude = g.fen();
  g.move(last);
  return {
    id: p.id, title: `Problème Lichess #${p.id}`, fen: g.fen(), prelude, preludeMove: last,
    solution: p.solution, rating: p.rating, themes: p.themes, url: `https://lichess.org/training/${p.id}`,
  };
}

async function startPuzzle(def) {
  pz = { def, step: 0, errors: 0, hinted: false, done: false, g: new globalThis.Chess(def.fen) };
  const color = pz.g.turn();
  board.setOrientation(color);
  board.setArrows([]); board.setBadge(null); board.setMarks({});
  feedback('', '');

  $('#pz-title').textContent = def.title;
  $('#pz-turn').innerHTML = `<span class="dot ${color}"></span> ${color === 'w' ? 'Les Blancs' : 'Les Noirs'} jouent`;
  $('#pz-task').textContent = def.flexible
    ? `Tu avais joué ${def.playedSan}. Trouve mieux !`
    : def.themes.some((t) => /^mateIn/.test(t) || /mat en/i.test(t)) ? 'Trouve le mat.' : 'Trouve la meilleure suite.';
  $('#pz-rating').textContent = def.rating ? `Niveau ${def.rating}` : '';
  $('#pz-themes').innerHTML = (def.themes || []).slice(0, 5).map((t) => `<span class="tag">${escapeHtml(THEMES[t] || t)}</span>`).join('');
  $('#pz-link').innerHTML = def.url ? `<a href="${def.url}" target="_blank" rel="noopener">Voir sur Lichess ↗</a>` : '';
  setButtons(false);

  // Animation du dernier coup adverse (comme dans une vraie partie)
  if (def.prelude && def.preludeMove) {
    board.setMovable(null);
    board.setPosition(def.prelude, { animate: false });
    await new Promise((r) => setTimeout(r, 500));
    if (pz.def !== def) return;
    board.setPosition(def.fen, { lastMove: [def.preludeMove.from, def.preludeMove.to] });
  } else {
    board.setPosition(def.fen, { animate: false });
  }
  board.setMovable(color);
}

function setButtons(finished) {
  $('#pz-hint').disabled = finished;
  $('#pz-solution').disabled = finished;
  $('#pz-next').classList.toggle('btn-primary', finished);
}

// ---------------------------------------------------------------
//  Résolution
// ---------------------------------------------------------------
async function onMove(from, to, promo) {
  if (!pz || pz.done) return false;
  const expected = pz.def.solution[pz.step];
  const uci = from + to + (promo || '');
  const g = pz.g;
  const mv = g.move({ from, to, promotion: promo || 'q' });
  if (!mv) return false;

  let correct = uci === expected || (expected.length === 4 && uci.slice(0, 4) === expected) || g.in_checkmate();

  // Mode « mes erreurs » : on accepte toute alternative presque aussi bonne
  if (!correct && pz.def.flexible) {
    board.setPosition(g.fen(), { lastMove: [from, to] });
    feedback('Vérification par le moteur…', 'info');
    board.setMovable(null);
    const [before, after] = await Promise.all([
      analyzeOne(pz.def.fen, app.engines.analysis, 12),
      analyzeOne(g.fen(), app.engines.analysis, 12),
    ]);
    const c = mv.color;
    correct = evalWp(before.eval, c) - evalWp(after.eval, c) < 4;
  }

  if (!correct) {
    g.undo();
    pz.errors++;
    board.setMarks({ [to]: 'wrong' });
    setTimeout(() => board.setMarks({}), 700);
    board.setPosition(g.fen(), { lastMove: board.lastMove });
    board.setMovable(g.turn());
    feedback(pz.errors === 1 ? 'Ce n\'est pas ça. Réessaie !' : 'Toujours pas… un indice peut aider.', 'error');
    return true;
  }

  board.setPosition(g.fen(), { lastMove: [from, to] });
  board.setMarks({ [to]: 'right' });
  setTimeout(() => board.setMarks({}), 500);
  pz.step++;

  if (g.in_checkmate() || pz.step >= pz.def.solution.length || pz.def.flexible) return finish(true);

  // Réponse adverse automatique
  feedback('Bien vu ! Continue…', 'success');
  board.setMovable(null);
  await new Promise((r) => setTimeout(r, 450));
  const reply = pz.def.solution[pz.step];
  const rm = g.move({ from: reply.slice(0, 2), to: reply.slice(2, 4), promotion: reply[4] || 'q' });
  pz.step++;
  if (rm) board.setPosition(g.fen(), { lastMove: [rm.from, rm.to] });
  if (pz.step >= pz.def.solution.length) return finish(true);
  board.setMovable(g.turn());
  return true;
}

function finish(solvedByUser) {
  pz.done = true;
  board.setMovable(null);
  setButtons(true);
  const clean = solvedByUser && pz.errors === 0 && !pz.hinted;
  const p = store.profile;
  let msg;

  if (pz.def.rating) {
    const score = clean ? 1 : (solvedByUser && pz.errors === 0 ? 0.5 : 0);
    const expected = 1 / (1 + 10 ** ((pz.def.rating - p.puzzleElo) / 400));
    const K = p.puzzleSolved + p.puzzleFailed < 30 ? 32 : 20;
    const delta = Math.round(K * (score - expected));
    p.puzzleElo = Math.max(100, p.puzzleElo + delta);
    msg = delta ? ` (${delta > 0 ? '+' : ''}${delta})` : '';
  } else msg = '';

  if (clean) {
    p.puzzleSolved++; p.puzzleStreak++;
    p.puzzleBestStreak = Math.max(p.puzzleBestStreak, p.puzzleStreak);
    feedback(`Résolu ! ${msg}`, 'success');
  } else {
    p.puzzleFailed++; p.puzzleStreak = 0;
    feedback(solvedByUser ? `Résolu avec aide.${msg}` : `Voici la solution.${msg}`, solvedByUser ? 'info' : 'error');
  }
  save();
  app.refreshHeader();
  renderStats();
  return true;
}

function hint() {
  if (!pz || pz.done) return;
  pz.hinted = true;
  const exp = pz.def.solution[pz.step];
  board.setMarks({ [exp.slice(0, 2)]: 'hint' });
  feedback('La pièce à jouer est surlignée.', 'info');
}

async function revealSolution() {
  if (!pz || pz.done) return;
  pz.done = true;
  board.setMovable(null);
  const g = pz.g;
  const names = [];
  for (let i = pz.step; i < pz.def.solution.length; i++) {
    const u = pz.def.solution[i];
    names.push(uciToSan(g.fen(), u));
    const m = g.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] || 'q' });
    if (!m) break;
    board.setPosition(g.fen(), { lastMove: [m.from, m.to] });
    board.setArrows([{ from: m.from, to: m.to, kind: 'best' }]);
    await new Promise((r) => setTimeout(r, 700));
  }
  board.setArrows([]);
  pz.done = false;
  finish(false);
  feedback(`Solution : ${names.filter(Boolean).join(' ')}`, 'error');
}

function feedback(text, kind) {
  const f = $('#pz-feedback');
  f.textContent = text;
  f.dataset.kind = kind;
  f.hidden = !text;
}

function renderStats() {
  const p = store.profile;
  $('#pz-elo').textContent = p.puzzleElo;
  $('#pz-solved').textContent = p.puzzleSolved;
  $('#pz-streak').textContent = p.puzzleStreak;
  $('#pz-best').textContent = p.puzzleBestStreak;
}

export function onKey(e) {
  if (e.key === 'Enter' || e.key === 'n') next();
}
