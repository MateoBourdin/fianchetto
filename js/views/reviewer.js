// ============================================================
//  Écran de rapport : navigation, exploration libre (variantes),
//  lignes moteur en direct, menaces, « Réessayer ce coup »,
//  « Devine le coup », partage, jouer depuis la position.
// ============================================================

import { Board } from '../ui/board.js';
import { LiveAnalysis } from '../ui/live.js';
import { renderShareCard } from '../ui/sharecard.js';
import { clsIcon } from '../ui/icons.js';
import {
  $, $$, toast, clsBadge, EvalBar, renderEvalGraph, renderMoveList, escapeHtml, moveNo,
} from '../ui/common.js';
import {
  analyzeOne, classifyMove, explainMove, CLASSES, CLASS_KEYS, formatEval, evalWp,
} from '../core/review.js';
import { store, save } from '../store.js';

const ERRORS = ['inaccuracy', 'mistake', 'blunder', 'miss'];
const EXPLORE_DEPTH = 14;
const PIECE_GLYPH = { p: '♟', n: '♞', b: '♝', r: '♜', q: '♛' };
const VAL = { p: 1, n: 3, b: 3, r: 5, q: 9 };

let app, board, evalbar, live;
let R = null;          // { game, report, userColor, meta }
let ply = -1;          // coup courant de la partie (-1 = départ)
let ex = null;         // exploration { base, line: [], idx }
let mode = 'review';   // 'review' | 'retry' | 'guess'
let retry = null, guess = null;
let liveState = null;  // dernier état des lignes moteur
let threatsOn = false;
const posCache = new Map();
const threatCache = new Map();

// ---------------------------------------------------------------
//  Initialisation
// ---------------------------------------------------------------
export function initReviewer(a) {
  app = a;
  board = new Board($('#an-board'), { movable: 'both', onMove });
  evalbar = new EvalBar($('#an-evalbar'));
  live = new LiveAnalysis(app.engines.live, onLive);
  live.enabled = store.settings.liveLines !== false;
  $('#rv-lines-toggle').checked = live.enabled;

  $('#an-first').addEventListener('click', () => nav('start'));
  $('#an-prev').addEventListener('click', () => nav('prev'));
  $('#an-next').addEventListener('click', () => nav('next'));
  $('#an-last').addEventListener('click', () => nav('end'));
  $('#an-flip').addEventListener('click', () => { board.flip(); evalbar.setOrientation(board.orientation); renderPlayers(); });
  $('#an-threats').addEventListener('click', () => {
    threatsOn = !threatsOn;
    $('#an-threats').setAttribute('aria-pressed', threatsOn);
    drawArrows();
  });
  $('#an-best-toggle').addEventListener('click', () => {
    const on = $('#an-best-toggle').getAttribute('aria-pressed') !== 'true';
    $('#an-best-toggle').setAttribute('aria-pressed', on);
    store.settings.showBestArrow = on; save();
    drawArrows();
  });
  $('#an-best-toggle').setAttribute('aria-pressed', store.settings.showBestArrow !== false);
  $('#an-play-here').addEventListener('click', () => app.go('jouer', { fen: currentView().fen }));
  $('#rv-lines-toggle').addEventListener('change', (e) => {
    live.setEnabled(e.target.checked);
    store.settings.liveLines = e.target.checked; save();
    if (!e.target.checked) renderLines(null);
  });
  $('#rv-guess').addEventListener('click', () => openGuessPicker());
  $('#rv-share-game').addEventListener('click', () => share('game'));
  $('#share-close').addEventListener('click', () => { $('#share-modal').hidden = true; });
  $('#an-board').addEventListener('wheel', (e) => {
    if (mode !== 'review') return;
    e.preventDefault();
    nav(e.deltaY > 0 ? 'next' : 'prev');
  }, { passive: false });
}

export function showReview(r) {
  R = r;
  ply = r.game.moves.length - 1;
  ex = null; mode = 'review'; retry = null; guess = null;
  posCache.clear(); threatCache.clear();
  board.setOrientation(r.userColor);
  evalbar.setOrientation(r.userColor);
  renderSummary();
  render();
}

export function leaveReview() { live.stop(); }

export function onKey(e) {
  if (!R) return;
  const keys = { ArrowLeft: 'prev', ArrowRight: 'next', ArrowUp: 'start', Home: 'start', ArrowDown: 'end', End: 'end' };
  if (keys[e.key] && mode === 'review') { e.preventDefault(); nav(keys[e.key]); }
  if (e.key === 'Escape') {
    if (mode !== 'review') exitMode();
    else if (ex) { const b = ex.base; ex = null; goTo(b); }
  }
  if (e.key === 'f') { board.flip(); evalbar.setOrientation(board.orientation); renderPlayers(); }
  if (e.key === 't') $('#an-threats').click();
}

// ---------------------------------------------------------------
//  Position affichée
// ---------------------------------------------------------------
function currentView() {
  if (ex && ex.idx >= 0) {
    const m = ex.line[ex.idx];
    return { fen: m.fen, lastMove: [m.from, m.to], exMove: m, base: ex.base };
  }
  const base = ex ? ex.base : ply;
  const mv = R.game.moves[base];
  return { fen: base < 0 ? R.game.initialFen : mv.fenAfter, lastMove: mv ? [mv.from, mv.to] : null, mainPly: base, base };
}

function goTo(p) {
  if (!R) return;
  ply = Math.max(-1, Math.min(R.game.moves.length - 1, p));
  ex = null;
  render();
}

function nav(dir) {
  if (mode !== 'review' || !R) return;
  if (ex) {
    if (dir === 'next' && ex.idx < ex.line.length - 1) { ex.idx++; return render(); }
    if (dir === 'prev') { if (ex.idx >= 0) { ex.idx--; return render(); } const b = ex.base; ex = null; return goTo(b); }
    if (dir === 'start' || dir === 'end') { ex = null; return goTo(dir === 'start' ? -1 : R.game.moves.length - 1); }
    if (dir === 'next') { const b = ex.base; ex = null; return goTo(b + 1); }
  }
  if (dir === 'prev') goTo(ply - 1);
  if (dir === 'next') goTo(ply + 1);
  if (dir === 'start') goTo(-1);
  if (dir === 'end') goTo(R.game.moves.length - 1);
}

// ---------------------------------------------------------------
//  Rendu
// ---------------------------------------------------------------
function render() {
  const v = currentView();
  board.setPosition(v.fen, { lastMove: v.lastMove });
  board.setMovable(mode === 'review' ? 'both' : board.movable);

  // Badge
  if (v.exMove) {
    board.setBadge(v.exMove.cls ? { square: v.exMove.to, cls: v.exMove.cls } : null);
  } else if (v.mainPly >= 0) {
    const mv = R.game.moves[v.mainPly];
    board.setBadge({ square: mv.to, cls: R.report.moves[v.mainPly].cls });
  } else board.setBadge(null);

  // Évaluation
  if (!ex) evalbar.set(R.report.evals[ply + 1]);
  else {
    const cached = posCache.get(v.fen);
    if (cached) evalbar.set(cached.eval);
  }

  renderCoach();
  renderMoves();
  renderVariation();
  renderPlayers();
  renderEvalGraph($('#an-graph'), R.report.evals, R.report.moves, v.base, (p) => { if (mode === 'review') goTo(p); });
  $('#an-ply').textContent = ex ? `Variante` : ply < 0 ? 'Départ' : `Coup ${moveNo(R.game, ply)}`;
  $('#an-ply').classList.toggle('is-var', !!ex);

  liveState = null;
  drawArrows();
  if (mode === 'review') {
    renderLines(live.enabled ? { fen: v.fen, lines: [], depth: 0, loading: true } : null);
    live.start(v.fen);
  }
}

function drawArrows() {
  if (!R) return;
  const v = currentView();
  const arrows = [];
  const showBest = store.settings.showBestArrow !== false;
  if (mode === 'review' && showBest) {
    if (!ex && v.mainPly >= 0) {
      const info = R.report.moves[v.mainPly];
      const mv = R.game.moves[v.mainPly];
      if (info.bestUci && info.bestUci !== mv.uci && !['book', 'forced', 'best', 'brilliant', 'great'].includes(info.cls)) {
        arrows.push({ from: info.bestUci.slice(0, 2), to: info.bestUci.slice(2, 4), kind: 'best' });
      }
    } else if (ex && liveState && liveState.fen === v.fen && liveState.lines[0]) {
      const u = liveState.lines[0].uci;
      arrows.push({ from: u.slice(0, 2), to: u.slice(2, 4), kind: 'best' });
    }
  }
  if (threatsOn && mode === 'review') {
    const t = threatCache.get(v.fen);
    if (t) arrows.push({ from: t.slice(0, 2), to: t.slice(2, 4), kind: 'threat' });
    else if (t === undefined) computeThreat(v.fen);
  }
  board.setArrows(arrows);
}

async function computeThreat(fen) {
  threatCache.set(fen, null);
  const g = new globalThis.Chess(fen);
  if (g.in_check() || g.game_over()) return;
  const parts = fen.split(' ');
  parts[1] = parts[1] === 'w' ? 'b' : 'w';
  parts[3] = '-';
  const probe = new globalThis.Chess();
  if (!probe.load(parts.join(' '))) return;
  try {
    const res = await app.engines.analysis.analyse(parts.join(' '), { depth: 12, multipv: 1 });
    if (res.bestmove) {
      threatCache.set(fen, res.bestmove);
      if (currentView().fen === fen) drawArrows();
    }
  } catch { /* annulé */ }
}

// ---------- Coach ----------
function coachHtml(cls, title, sub, text, extra = '', evalTxt = '') {
  return `<div class="coach-head">${cls ? clsBadge(cls, 'xl') : '<span class="ic-wrap xl neutral"></span>'}
      <div><strong>${title}</strong><span class="muted">${sub}</span></div>
      ${evalTxt ? `<span class="coach-eval">${evalTxt}</span>` : ''}</div>
    <p class="coach-text">${text}</p>${extra}`;
}

function renderCoach() {
  const box = $('#an-coach');
  if (mode === 'retry') return renderRetryCoach();
  if (mode === 'guess') return renderGuessCoach();
  const v = currentView();

  if (v.exMove) {
    const m = v.exMove;
    box.dataset.cls = m.cls || '';
    if (!m.cls) {
      box.innerHTML = coachHtml(null, 'Analyse du coup…', `Variante · ${escapeHtml(m.san)}`,
        '<span class="spinner"></span> Le moteur évalue ton coup.');
    } else {
      box.innerHTML = coachHtml(m.cls, CLASSES[m.cls].label, `Variante · ${escapeHtml(m.san)}`, escapeHtml(m.info.comment), '',
        formatEval(m.evalAfter));
    }
    return;
  }

  if (v.mainPly < 0) {
    box.dataset.cls = '';
    box.innerHTML = coachHtml(null, 'Position de départ', escapeHtml(R.report.opening || ''),
      'Parcours la partie avec ← → ou la molette. <b>Déplace une pièce</b> pour explorer une variante : le moteur l\'évalue en direct.');
    return;
  }
  const mv = R.game.moves[v.mainPly];
  const info = R.report.moves[v.mainPly];
  box.dataset.cls = info.cls;
  const who = mv.color === 'w' ? (R.game.headers.White || 'Blancs') : (R.game.headers.Black || 'Noirs');
  const line = info.bestLine && info.bestLine.length && info.bestUci !== mv.uci
    ? `<div class="coach-line"><span class="muted">Meilleure suite :</span> ${info.bestLine.map(escapeHtml).join(' ')}</div>` : '';
  const actions = [];
  if (ERRORS.includes(info.cls)) actions.push('<button class="btn btn-primary btn-sm" data-act="retry">↻ Réessayer ce coup</button>');
  if (info.bestLine && info.bestLine.length && info.bestUci !== mv.uci) actions.push('<button class="btn btn-sm" data-act="line">▶ Voir la suite</button>');
  if (['brilliant', 'great', 'best'].includes(info.cls)) actions.push('<button class="btn btn-sm" data-act="share">⇪ Partager ce coup</button>');
  box.innerHTML = coachHtml(info.cls, CLASSES[info.cls].label, `${escapeHtml(who)} · ${moveNo(R.game, v.mainPly)} ${escapeHtml(mv.san)}`,
    escapeHtml(info.comment), line + (actions.length ? `<div class="coach-actions">${actions.join('')}</div>` : ''),
    formatEval(R.report.evals[v.mainPly + 1]));
  $$('#an-coach [data-act]').forEach((b) => b.addEventListener('click', () => {
    if (b.dataset.act === 'retry') startRetry(v.mainPly);
    if (b.dataset.act === 'line') playBestLine(v.mainPly);
    if (b.dataset.act === 'share') share('move');
  }));
}

// ---------- Liste des coups ----------
function renderMoves() {
  const upto = mode === 'guess' ? guess.i : R.game.moves.length;
  const cur = ex ? ex.base : ply;
  const list = R.game.moves.slice(0, upto).map((m, i) => ({ san: m.san, cls: R.report.moves[i].cls, timeSpent: m.timeSpent }));
  renderMoveList($('#an-moves'), list, mode === 'guess' ? upto - 1 : cur, (p) => { if (mode === 'review') goTo(p); },
    { showTime: true, initialFen: R.game.initialFen });
  $('#an-moves').classList.toggle('in-var', !!ex);
}

function renderVariation() {
  const box = $('#rv-variation');
  if (!ex || mode !== 'review') { box.hidden = true; return; }
  box.hidden = false;
  const baseLabel = ex.base < 0 ? 'la position de départ' : `${moveNo(R.game, ex.base)} ${R.game.moves[ex.base].san}`;
  const g0 = { initialFen: R.game.moves[ex.base] ? R.game.moves[ex.base].fenAfter : R.game.initialFen };
  box.innerHTML = `<div class="var-head"><span>Variante après <b>${escapeHtml(baseLabel)}</b></span>
      <button class="btn btn-ghost btn-sm" id="rv-var-exit" title="Revenir à la partie (Échap)">✕ Revenir à la partie</button></div>
    <div class="var-moves">${ex.line.map((m, i) => `<button class="var-mv ${i === ex.idx ? 'current' : ''}" data-i="${i}">
      <span class="muted">${moveNo(g0, i)}</span> ${escapeHtml(m.san)} ${m.cls ? clsBadge(m.cls, 'sm') : clsBadge(null, 'sm')}</button>`).join('')}</div>`;
  $('#rv-var-exit').addEventListener('click', () => { const b = ex.base; ex = null; goTo(b); });
  $$('#rv-variation [data-i]').forEach((b) => b.addEventListener('click', () => { ex.idx = +b.dataset.i; render(); }));
}

// ---------- Joueurs (nom, pendule, matériel) ----------
function material(fen) {
  const count = { w: { p: 0, n: 0, b: 0, r: 0, q: 0 }, b: { p: 0, n: 0, b: 0, r: 0, q: 0 } };
  for (const ch of fen.split(' ')[0]) {
    const t = ch.toLowerCase();
    if (count.w[t] === undefined) continue;
    count[ch === t ? 'b' : 'w'][t]++;
  }
  const start = { p: 8, n: 2, b: 2, r: 2, q: 1 };
  const capturedBy = (c) => {
    const opp = c === 'w' ? 'b' : 'w';
    let s = '';
    for (const t of ['q', 'r', 'b', 'n', 'p']) s += PIECE_GLYPH[t].repeat(Math.max(0, start[t] - count[opp][t]));
    return s;
  };
  const score = (c) => Object.entries(count[c]).reduce((a, [t, n]) => a + VAL[t] * n, 0);
  return { w: capturedBy('w'), b: capturedBy('b'), diff: score('w') - score('b') };
}

function clockAt(color, upto) {
  for (let i = upto; i >= 0; i--) {
    const m = R.game.moves[i];
    if (m && m.color === color && m.clock != null) return m.clock;
  }
  return null;
}
const fmtClock = (s) => (s == null ? '' : s >= 3600 ? `${Math.floor(s / 3600)}:${String(Math.floor(s % 3600 / 60)).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}`
  : `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}${s < 20 ? '.' + Math.floor((s % 1) * 10) : ''}`);

function renderPlayers() {
  if (!R) return;
  const v = currentView();
  const mat = material(v.fen);
  const h = R.game.headers;
  const p = (c) => {
    const name = c === 'w' ? (h.White || 'Blancs') : (h.Black || 'Noirs');
    const elo = c === 'w' ? h.WhiteElo : h.BlackElo;
    const adv = c === 'w' ? mat.diff : -mat.diff;
    const clk = mode === 'guess' ? null : clockAt(c, v.base);
    const turn = v.fen.split(' ')[1] === c;
    return `<span class="dot ${c}"></span><strong>${escapeHtml(name)}</strong>${elo && elo !== '?' ? `<span class="muted">${elo}</span>` : ''}
      <span class="captured">${mat[c]}${adv > 0 ? `<em>+${adv}</em>` : ''}</span>
      ${clk != null ? `<span class="clock ${turn ? 'active' : ''}">${fmtClock(clk)}</span>` : ''}`;
  };
  const bottom = board.orientation;
  const top = bottom === 'w' ? 'b' : 'w';
  $('#rv-top').innerHTML = p(top);
  $('#rv-bottom').innerHTML = p(bottom);
}

// ---------- Lignes moteur ----------
function onLive(state) {
  if (!R || mode !== 'review' || state.fen !== currentView().fen) return;
  liveState = state;
  renderLines(state);
  if (ex && state.lines[0]) {
    const l = state.lines[0];
    evalbar.set({ cp: l.cp, mate: l.mate });
    if (state.done || state.depth >= 12) drawArrows();
  }
  if (state.over) renderLines({ ...state, lines: [] });
}

function renderLines(state) {
  const box = $('#rv-lines');
  const head = $('#rv-lines-depth');
  if (!state) { box.innerHTML = '<p class="empty">Lignes moteur désactivées.</p>'; head.textContent = ''; return; }
  if (state.over) { box.innerHTML = '<p class="empty">Partie terminée dans cette position.</p>'; head.textContent = ''; return; }
  head.innerHTML = state.depth ? `prof. ${state.depth}${state.done ? '' : ' <span class="spinner xs"></span>'}` : '<span class="spinner xs"></span>';
  if (!state.lines.length) {
    box.innerHTML = '<div class="line skeleton"></div><div class="line skeleton"></div><div class="line skeleton"></div>';
    return;
  }
  const g0 = { initialFen: state.fen };
  box.innerHTML = state.lines.map((l, i) => {
    const sans = [];
    const g = new globalThis.Chess(state.fen);
    for (const u of l.pv.slice(0, 12)) {
      const m = g.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] || 'q' });
      if (!m) break;
      sans.push(m.san);
    }
    const ev = { cp: l.cp, mate: l.mate };
    const white = evalWp(ev, 'w') >= 50;
    const moves = sans.map((s, k) => {
      const lbl = moveNo(g0, k);
      const showNum = k === 0 || lbl.endsWith('.');
      return `${showNum ? `<span class="muted">${k === 0 && lbl.endsWith('…') ? lbl.replace('…', '...') : lbl}</span>` : ''}${escapeHtml(s)}`;
    }).join(' ');
    return `<button class="line" data-uci="${l.uci}" title="Jouer ${escapeHtml(sans[0] || '')}">
      <span class="line-eval ${white ? 'w' : 'b'}">${formatEval(ev)}</span><span class="line-pv">${moves}</span></button>`;
  }).join('');
  $$('#rv-lines [data-uci]').forEach((b) => b.addEventListener('click', () => {
    const u = b.dataset.uci;
    onMove(u.slice(0, 2), u.slice(2, 4), u[4]);
  }));
}

// ---------------------------------------------------------------
//  Exploration libre
// ---------------------------------------------------------------
async function onMove(from, to, promo) {
  if (!R) return false;
  if (mode === 'retry') return onRetryMove(from, to, promo);
  if (mode === 'guess') return onGuessMove(from, to, promo);

  const v = currentView();
  const g = new globalThis.Chess(v.fen);
  const legalCount = g.moves().length;
  const m = g.move({ from, to, promotion: promo || 'q' });
  if (!m) return false;
  const uci = from + to + (m.promotion || '');

  if (!ex) {
    const next = R.game.moves[ply + 1];
    if (next && next.uci === uci) { goTo(ply + 1); return true; }
    ex = { base: ply, line: [], idx: -1 };
  } else {
    const nxt = ex.line[ex.idx + 1];
    if (nxt && nxt.uci === uci) { ex.idx++; render(); return true; }
    if (ex.idx === -1) {
      const next = R.game.moves[ex.base + 1];
      if (next && next.uci === uci) { const b = ex.base; ex = null; goTo(b + 1); return true; }
    }
  }
  ex.line = ex.line.slice(0, ex.idx + 1);
  const rec = {
    san: m.san, uci, from, to, promotion: m.promotion || null, color: m.color, piece: m.piece,
    captured: m.captured || null, flags: m.flags, fenBefore: v.fen, fen: g.fen(), legalCount, cls: null,
  };
  ex.line.push(rec);
  ex.idx++;
  render();
  classifyExplored(rec);
  return true;
}

async function analyzeCached(fen, depth = EXPLORE_DEPTH) {
  const c = posCache.get(fen);
  if (c && c.depth >= depth) return c;
  const pos = await analyzeOne(fen, app.engines.analysis, depth);
  pos.depth = depth;
  posCache.set(fen, pos);
  return pos;
}

async function classifyExplored(rec) {
  try {
    const [b, a] = await Promise.all([analyzeCached(rec.fenBefore), analyzeCached(rec.fen)]);
    const game = { initialFen: rec.fenBefore, moves: [{ ...rec, ply: 0, fenAfter: rec.fen }] };
    const info = classifyMove(game, [b, a], 0, []);
    info.comment = explainMove(game, [b, a], 0, info);
    rec.cls = info.cls; rec.info = info; rec.evalAfter = a.eval;
    if (ex && ex.line.includes(rec)) {
      const v = currentView();
      if (v.exMove === rec) { board.setBadge({ square: rec.to, cls: rec.cls }); renderCoach(); if (!liveState) evalbar.set(a.eval); }
      renderVariation();
    }
  } catch (e) { if (e.message !== 'cancelled') console.warn(e); }
}

async function playBestLine(p) {
  const mv = R.game.moves[p];
  const info = R.report.moves[p];
  if (!info.bestLine.length) return;
  // La meilleure suite devient une variante explorable
  ply = p - 1;
  ex = { base: p - 1, line: [], idx: -1 };
  const g = new globalThis.Chess(mv.fenBefore);
  for (const san of info.bestLine) {
    const fenBefore = g.fen();
    const legalCount = g.moves().length;
    const m = g.move(san);
    if (!m) break;
    ex.line.push({ san: m.san, uci: m.from + m.to + (m.promotion || ''), from: m.from, to: m.to, promotion: m.promotion || null,
      color: m.color, piece: m.piece, captured: m.captured || null, flags: m.flags, fenBefore, fen: g.fen(), legalCount, cls: null });
  }
  for (let i = 0; i < ex.line.length; i++) {
    ex.idx = i;
    render();
    classifyExplored(ex.line[i]);
    await new Promise((r) => setTimeout(r, 700));
    if (!ex || mode !== 'review') return;
  }
}

// ---------------------------------------------------------------
//  « Réessayer ce coup »
// ---------------------------------------------------------------
function startRetry(p) {
  const mv = R.game.moves[p];
  mode = 'retry';
  ex = null;
  retry = { ply: p, tries: 0, solved: false, revealed: false };
  live.stop();
  renderLines(null);
  $('#rv-lines').innerHTML = '<p class="empty">Lignes masquées pendant l\'exercice.</p>';
  board.setArrows([]);
  board.setBadge(null);
  const prev = R.game.moves[p - 1];
  board.setPosition(mv.fenBefore, { lastMove: prev ? [prev.from, prev.to] : null });
  board.setMovable(mv.color);
  evalbar.set(R.report.evals[p]);
  renderRetryCoach();
  $('#view-analyse').dataset.sub = 'retry';
}

function renderRetryCoach(msg = '', kind = '') {
  const mv = R.game.moves[retry.ply];
  const box = $('#an-coach');
  box.dataset.cls = retry.solved ? 'best' : '';
  box.innerHTML = coachHtml(retry.lastCls || null, retry.revealed ? 'Solution' : retry.solved ? 'Bien joué !' : 'Trouve un meilleur coup',
    `Coup ${moveNo(R.game, retry.ply)} · à la place de ${escapeHtml(mv.san)}`,
    msg || `Dans la partie, <b>${escapeHtml(mv.san)}</b> était une ${CLASSES[R.report.moves[retry.ply].cls].label.toLowerCase()}. Joue le coup que tu aurais dû trouver.`,
    `<div class="coach-actions">
      ${retry.solved ? '<button class="btn btn-primary btn-sm" data-act="next">Erreur suivante →</button>' : '<button class="btn btn-sm" data-act="hint">💡 Indice</button><button class="btn btn-sm" data-act="show">Solution</button>'}
      <button class="btn btn-ghost btn-sm" data-act="quit">Retour au rapport</button></div>`);
  if (kind) box.dataset.kind = kind;
  $$('#an-coach [data-act]').forEach((b) => b.addEventListener('click', () => {
    const a = b.dataset.act;
    if (a === 'quit') exitMode(retry.ply);
    if (a === 'next') nextError();
    if (a === 'hint') { const u = R.report.moves[retry.ply].bestUci; board.setMarks({ [u.slice(0, 2)]: 'hint' }); }
    if (a === 'show') revealRetry();
  }));
}

async function onRetryMove(from, to, promo) {
  const mv = R.game.moves[retry.ply];
  const info = R.report.moves[retry.ply];
  const g = new globalThis.Chess(mv.fenBefore);
  const legalCount = g.moves().length;
  const m = g.move({ from, to, promotion: promo || 'q' });
  if (!m) return false;
  const uci = from + to + (m.promotion || '');
  board.setPosition(g.fen(), { lastMove: [from, to] });
  board.setMovable(null);
  board.setMarks({});
  retry.tries++;

  let cls;
  if (uci === info.bestUci) cls = 'best';
  else {
    renderRetryCoach('<span class="spinner"></span> Le moteur vérifie ton coup…');
    const before = { fen: mv.fenBefore, eval: R.report.evals[retry.ply], lines: [] };
    const b = await analyzeCached(mv.fenBefore).catch(() => before);
    const a = await analyzeCached(g.fen());
    const game = { initialFen: mv.fenBefore, moves: [{ san: m.san, uci, from, to, color: m.color, piece: m.piece, captured: m.captured || null,
      promotion: m.promotion || null, flags: m.flags, fenBefore: mv.fenBefore, fenAfter: g.fen(), legalCount, ply: 0 }] };
    cls = classifyMove(game, [b, a], 0, []).cls;
  }
  retry.lastCls = cls;
  board.setBadge({ square: to, cls });
  if (['best', 'brilliant', 'great', 'excellent', 'book'].includes(cls)) {
    retry.solved = true;
    renderRetryCoach(`${escapeHtml(m.san)} est ${CLASSES[cls].label.toLowerCase()} ! ${retry.tries > 1 ? `Trouvé en ${retry.tries} essais.` : 'Du premier coup.'}`);
    return true;
  }
  renderRetryCoach(`${escapeHtml(m.san)} : ${CLASSES[cls].label.toLowerCase()}. Pas encore — réessaie !`);
  setTimeout(() => {
    if (mode !== 'retry' || retry.solved) return;
    const prev = R.game.moves[retry.ply - 1];
    board.setBadge(null);
    board.setPosition(mv.fenBefore, { lastMove: prev ? [prev.from, prev.to] : null });
    board.setMovable(mv.color);
  }, 1100);
  return true;
}

function revealRetry() {
  const info = R.report.moves[retry.ply];
  const u = info.bestUci;
  retry.solved = true;
  retry.revealed = true;
  retry.lastCls = 'best';
  const mv = R.game.moves[retry.ply];
  const g = new globalThis.Chess(mv.fenBefore);
  g.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] || 'q' });
  board.setPosition(g.fen(), { lastMove: [u.slice(0, 2), u.slice(2, 4)] });
  board.setArrows([{ from: u.slice(0, 2), to: u.slice(2, 4), kind: 'best' }]);
  board.setMovable(null);
  renderRetryCoach(`La solution était <b>${escapeHtml(info.bestSan)}</b>. Suite : ${info.bestLine.map(escapeHtml).join(' ')}`);
}

function nextError() {
  const me = R.userColor;
  const n = R.game.moves.findIndex((m, i) => i > retry.ply && m.color === me && ['mistake', 'blunder', 'miss'].includes(R.report.moves[i].cls));
  if (n === -1) { toast('Plus d\'erreur à retravailler dans cette partie 🎉', 'success'); exitMode(retry.ply); return; }
  startRetry(n);
}

function exitMode(toPly = ply) {
  mode = 'review';
  retry = null; guess = null;
  board.setMarks({});
  $('#view-analyse').dataset.sub = '';
  board.setOrientation(R.userColor);
  evalbar.setOrientation(R.userColor);
  goTo(toPly);
}

// ---------------------------------------------------------------
//  « Devine le coup »
// ---------------------------------------------------------------
function openGuessPicker() {
  const h = R.game.headers;
  const box = $('#an-coach');
  box.dataset.cls = '';
  box.innerHTML = coachHtml('great', 'Devine le coup', 'Rejoue la partie en devinant chaque coup',
    'Choisis le camp que tu veux incarner. Pour chaque coup, propose le tien : 5 points pour le coup joué ou celui du moteur, moins selon la qualité de ton choix.',
    `<div class="coach-actions">
      <button class="btn btn-sm" data-c="w"><span class="dot w"></span>${escapeHtml(h.White || 'Blancs')}</button>
      <button class="btn btn-sm" data-c="b"><span class="dot b"></span>${escapeHtml(h.Black || 'Noirs')}</button>
      <button class="btn btn-ghost btn-sm" data-c="x">Annuler</button></div>`);
  $$('#an-coach [data-c]').forEach((b) => b.addEventListener('click', () => {
    if (b.dataset.c === 'x') return renderCoach();
    startGuess(b.dataset.c);
  }));
}

function startGuess(color) {
  mode = 'guess';
  ex = null;
  guess = { color, i: 0, score: 0, max: 0, results: [], matched: 0, waiting: false, last: null };
  live.stop();
  $('#rv-lines').innerHTML = '<p class="empty">Lignes masquées pendant le jeu.</p>';
  $('#rv-lines-depth').textContent = '';
  board.setOrientation(color);
  evalbar.setOrientation(color);
  board.setArrows([]); board.setBadge(null);
  $('#view-analyse').dataset.sub = 'guess';
  board.setPosition(R.game.initialFen, { animate: false });
  renderMoves();
  advanceGuess();
}

function advanceGuess() {
  if (mode !== 'guess') return;
  const n = R.game.moves.length;
  if (guess.i >= n) return finishGuess();
  const mv = R.game.moves[guess.i];
  if (mv.color !== guess.color) {
    board.setMovable(null);
    renderGuessCoach();
    setTimeout(() => {
      if (mode !== 'guess') return;
      board.setPosition(mv.fenAfter, { lastMove: [mv.from, mv.to] });
      guess.i++;
      renderMoves(); renderPlayers();
      advanceGuess();
    }, 550);
    return;
  }
  board.setMovable(guess.color);
  renderGuessCoach();
}

async function onGuessMove(from, to, promo) {
  if (guess.waiting) return false;
  const idx = guess.i;
  const mv = R.game.moves[idx];
  const info = R.report.moves[idx];
  const g = new globalThis.Chess(mv.fenBefore);
  const legalCount = g.moves().length;
  const m = g.move({ from, to, promotion: promo || 'q' });
  if (!m) return false;
  const uci = from + to + (m.promotion || '');
  guess.waiting = true;
  board.setMovable(null);
  board.setPosition(g.fen(), { lastMove: [from, to] });

  let pts, verdict, cls;
  if (uci === mv.uci) { pts = 5; verdict = 'Exactement le coup joué !'; cls = info.cls; guess.matched++; }
  else if (uci === info.bestUci) { pts = 5; verdict = 'Le meilleur coup du moteur — mieux que la partie !'; cls = 'best'; }
  else {
    renderGuessCoach('<span class="spinner"></span> Évaluation de ton coup…');
    const b = await analyzeCached(mv.fenBefore, 12);
    const a = await analyzeCached(g.fen(), 12);
    const game = { initialFen: mv.fenBefore, moves: [{ san: m.san, uci, from, to, color: m.color, piece: m.piece, captured: m.captured || null,
      promotion: m.promotion || null, flags: m.flags, fenBefore: mv.fenBefore, fenAfter: g.fen(), legalCount, ply: 0 }] };
    const res = classifyMove(game, [b, a], 0, []);
    cls = res.cls;
    const loss = res.loss * 100;
    pts = loss < 2 ? 4 : loss < 5 ? 3 : loss < 10 ? 1 : 0;
    verdict = loss < info.loss * 100 - 2 ? 'Meilleur que le coup joué !' : pts >= 3 ? 'Bonne alternative.' : pts ? 'Jouable, mais il y avait mieux.' : 'Ce coup perd l\'avantage.';
  }
  guess.score += pts; guess.max += 5;
  guess.last = { san: m.san, actual: mv.san, pts, verdict, cls, best: info.bestSan };
  guess.results.push(guess.last);
  board.setBadge({ square: to, cls });
  renderGuessCoach();

  await new Promise((r) => setTimeout(r, 900));
  if (mode !== 'guess') return true;
  board.setBadge(null);
  if (uci !== mv.uci) {
    board.setArrows([{ from: mv.from, to: mv.to, kind: 'played' }]);
    board.setPosition(mv.fenBefore, { animate: false });
    await new Promise((r) => setTimeout(r, 350));
  }
  board.setPosition(mv.fenAfter, { lastMove: [mv.from, mv.to] });
  setTimeout(() => board.setArrows([]), 700);
  guess.i++;
  guess.waiting = false;
  renderMoves(); renderPlayers();
  advanceGuess();
  return true;
}

function renderGuessCoach(msg = '') {
  const box = $('#an-coach');
  const pc = guess.max ? Math.round(guess.score / guess.max * 100) : 0;
  const L = guess.last;
  box.dataset.cls = L ? L.cls : '';
  const turn = R.game.moves[guess.i] && R.game.moves[guess.i].color === guess.color;
  const lastHtml = L ? `<div class="guess-last">${clsBadge(L.cls, 'sm')} Tu as joué <b>${escapeHtml(L.san)}</b> · dans la partie <b>${escapeHtml(L.actual)}</b>
      <span class="pts">+${L.pts}</span><div class="muted">${L.verdict}</div></div>` : '';
  box.innerHTML = `<div class="coach-head">${clsBadge('great', 'xl')}<div><strong>Devine le coup</strong>
      <span class="muted">${guess.color === 'w' ? 'Tu joues les Blancs' : 'Tu joues les Noirs'} · coup ${Math.min(guess.i + 1, R.game.moves.length)} / ${R.game.moves.length}</span></div>
      <span class="coach-eval">${guess.score} pts</span></div>
    <div class="guess-meter"><i style="width:${pc}%"></i></div>
    <p class="coach-text">${msg || (turn ? '<b>À toi :</b> quel coup jouerais-tu ici ?' : 'L\'adversaire joue…')}</p>
    ${lastHtml}
    <div class="coach-actions"><button class="btn btn-ghost btn-sm" data-act="quit">Arrêter</button></div>`;
  $('#an-coach [data-act="quit"]').addEventListener('click', () => exitMode(R.game.moves.length - 1));
}

function finishGuess() {
  const pc = guess.max ? Math.round(guess.score / guess.max * 100) : 0;
  const box = $('#an-coach');
  const grade = pc >= 85 ? 'Niveau maître !' : pc >= 70 ? 'Très solide.' : pc >= 50 ? 'Pas mal du tout.' : 'Continue de t\'entraîner.';
  box.dataset.cls = pc >= 70 ? 'best' : 'good';
  box.innerHTML = coachHtml(pc >= 85 ? 'brilliant' : pc >= 70 ? 'best' : 'good', `Score : ${pc} %`,
    `${guess.score} / ${guess.max} points · ${guess.matched} coup${guess.matched > 1 ? 's' : ''} identique${guess.matched > 1 ? 's' : ''} à la partie`,
    grade, `<div class="coach-actions"><button class="btn btn-primary btn-sm" data-act="again">Rejouer</button>
      <button class="btn btn-ghost btn-sm" data-act="quit">Retour au rapport</button></div>`);
  $('#an-coach [data-act="again"]').addEventListener('click', () => startGuess(guess.color));
  $('#an-coach [data-act="quit"]').addEventListener('click', () => exitMode(R.game.moves.length - 1));
}

// ---------------------------------------------------------------
//  Résumé (colonne de gauche)
// ---------------------------------------------------------------
function renderSummary() {
  const { report, userColor, game } = R;
  const h = game.headers;
  const name = (c) => (c === 'w' ? h.White || 'Blancs' : h.Black || 'Noirs');
  const acc = (c) => (report.accuracy[c] == null ? '—' : report.accuracy[c].toFixed(1));
  const card = (c) => `<div class="acc-card ${c === userColor ? 'me' : ''}">
      <div class="acc-name"><span class="dot ${c}"></span>${escapeHtml(name(c))}</div>
      <div class="acc-value">${acc(c)}<small>%</small></div>
      <div class="acc-perf">Niveau estimé <b>${report.rating[c] ?? '—'}</b></div></div>`;
  $('#an-acc').innerHTML = card('w') + card('b');
  $('#an-counts').innerHTML = CLASS_KEYS.map((k) => `<tr class="${report.counts.w[k] + report.counts.b[k] ? '' : 'zero'}" data-cls="${k}">
      <td class="n">${report.counts.w[k]}</td><td class="lbl">${clsBadge(k)}<span>${CLASSES[k].label}</span></td><td class="n">${report.counts.b[k]}</td></tr>`).join('');
  // Cliquer sur une catégorie : aller au prochain coup de ce type
  $$('#an-counts tr[data-cls]').forEach((tr) => tr.addEventListener('click', () => {
    const k = tr.dataset.cls;
    const from = (ex ? ex.base : ply) + 1;
    const n = report.moves.length;
    for (let s = 0; s < n; s++) {
      const i = (from + s) % n;
      if (report.moves[i].cls === k) { if (mode === 'review') goTo(i); return; }
    }
  }));

  const PH = { opening: 'Ouverture', middlegame: 'Milieu', endgame: 'Finale' };
  const cell = (c, ph) => {
    const v = report.phases[c][ph];
    if (v == null) return '<span class="muted">—</span>';
    const k = v >= 90 ? 'best' : v >= 80 ? 'excellent' : v >= 65 ? 'good' : v >= 50 ? 'inaccuracy' : 'mistake';
    return `<span class="phase-pill tone-${k}">${v}</span>`;
  };
  $('#an-phases').innerHTML = Object.keys(PH).map((ph) => `<tr><td class="n">${cell('w', ph)}</td><td class="lbl c">${PH[ph]}</td><td class="n">${cell('b', ph)}</td></tr>`).join('');
  $('#an-opening').textContent = report.opening || 'Ouverture non répertoriée';
  $('#an-key').innerHTML = report.keyMoments.length ? report.keyMoments.map((p) => {
    const m = game.moves[p];
    return `<button class="key-chip" data-ply="${p}">${clsBadge(report.moves[p].cls, 'sm')} ${moveNo(game, p)} ${escapeHtml(m.san)}</button>`;
  }).join('') : '<p class="empty">Partie sans grand retournement.</p>';
  $$('#an-key [data-ply]').forEach((b) => b.addEventListener('click', () => { if (mode === 'review') goTo(+b.dataset.ply); }));

  const errs = report.moves.filter((m, i) => game.moves[i].color === userColor && ['mistake', 'blunder', 'miss'].includes(m.cls)).length;
  const tb = $('#an-train');
  tb.disabled = !errs;
  tb.innerHTML = errs ? (errs > 1 ? `↻ Corriger mes ${errs} erreurs` : '↻ Corriger mon erreur') : 'Aucune erreur à corriger';
  tb.onclick = () => {
    const first = game.moves.findIndex((m, i) => m.color === userColor && ['mistake', 'blunder', 'miss'].includes(report.moves[i].cls));
    if (first >= 0) startRetry(first);
  };
  const src = R.meta && R.meta.url;
  $('#an-source').innerHTML = src ? `<a href="${escapeHtml(src)}" target="_blank" rel="noopener">Partie d'origine ↗</a>` : '';
}

// ---------------------------------------------------------------
//  Partage
// ---------------------------------------------------------------
async function share(kind) {
  const modal = $('#share-modal');
  const prev = $('#share-preview');
  modal.hidden = false;
  prev.innerHTML = '<div class="share-loading"><span class="spinner lg"></span></div>';
  const h = R.game.headers;
  let opts;
  if (kind === 'move') {
    const p = currentView().mainPly;
    const mv = R.game.moves[p];
    const info = R.report.moves[p];
    opts = {
      kind, fen: mv.fenAfter, orientation: mv.color, lastMove: [mv.from, mv.to], badge: { square: mv.to, cls: info.cls },
      title: `${moveNo(R.game, p)} ${mv.san}`, subtitle: info.comment,
      footer: `${h.White || 'Blancs'} – ${h.Black || 'Noirs'}${h.Date ? ' · ' + h.Date : ''}`,
    };
  } else {
    const last = R.game.moves[R.game.moves.length - 1];
    opts = {
      kind, fen: last.fenAfter, orientation: R.userColor, lastMove: [last.from, last.to],
      white: h.White || 'Blancs', black: h.Black || 'Noirs', accW: R.report.accuracy.w, accB: R.report.accuracy.b,
      counts: R.report.counts, opening: R.report.opening, userColor: R.userColor,
      footer: `Résultat ${R.game.result}${h.Date ? ' · ' + h.Date : ''} · analysé avec Stockfish`,
    };
  }
  opts.theme = store.settings.boardTheme;
  const canvas = await renderShareCard(opts);
  prev.innerHTML = '';
  prev.appendChild(canvas);
  const fname = kind === 'move' ? 'coup-fianchetto.png' : 'rapport-fianchetto.png';
  $('#share-download').onclick = () => canvas.toBlob((b) => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(b); a.download = fname; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  });
  $('#share-copy').onclick = () => canvas.toBlob(async (b) => {
    try {
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': b })]);
      toast('Image copiée dans le presse-papiers', 'success');
    } catch { toast('Copie impossible dans ce navigateur — utilise Télécharger.', 'error'); }
  });
}

