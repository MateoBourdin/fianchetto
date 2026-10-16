// ============================================================
//  Vue « Jouer » : parties contre des bots à personnalité
//  avec qualité des coups affichée en direct.
// ============================================================

import { Board } from '../ui/board.js';
import { $, $$, toast, EvalBar, renderMoveList } from '../ui/common.js';
import { clsIcon } from '../ui/icons.js';
import { analyzeOne, classifyMove, CLASSES } from '../core/review.js';
import { toPgn } from '../core/pgn.js';
import { store, save } from '../store.js';

export const BOTS = [
  { id: 'pip',    name: 'Pip',    elo: 500,  hue: 150, style: 'Débutant curieux',  bio: 'Découvre les règles, laisse souvent traîner ses pièces.',
    depth: 4, multipv: 5, random: 0.35, blunder: 0.25, temp: 300 },
  { id: 'lou',    name: 'Lou',    elo: 900,  hue: 195, style: 'Joueuse du dimanche', bio: 'Connaît les bases mais se laisse surprendre par les tactiques.',
    depth: 6, multipv: 5, random: 0.12, blunder: 0.12, temp: 160 },
  { id: 'basile', name: 'Basile', elo: 1200, hue: 35,  style: 'Joueur de club',    bio: 'Solide, attaque volontiers, commet encore des imprécisions.',
    depth: 8, multipv: 4, random: 0.05, blunder: 0.07, temp: 90 },
  { id: 'iris',   name: 'Iris',   elo: 1500, hue: 280, style: 'Tacticienne',       bio: 'Repère les fourchettes et les clouages. Punit les pièces en prise.',
    depth: 10, multipv: 3, random: 0.02, blunder: 0.03, temp: 50 },
  { id: 'orion',  name: 'Orion',  elo: 1900, hue: 220, style: 'Stratège',          bio: 'Joue juste et patient. Il faut le battre à la régulière.',
    depth: 12, multipv: 2, random: 0, blunder: 0.01, temp: 22 },
  { id: 'titan',  name: 'Titan',  elo: 2500, hue: 0,   style: 'Moteur à pleine puissance', bio: 'Stockfish sans retenue. Bonne chance.',
    depth: 16, multipv: 1, random: 0, blunder: 0, temp: 1 },
];

const LIVE_DEPTH = 11;

let app, board, evalbar;
let bot = BOTS[2];
let colorChoice = 'w';
let state = null; // partie en cours
let customFen = null; // position de départ venant de l'analyse

export function init(a) {
  app = a;
  renderBots();
  board = new Board($('#play-board'), { movable: null, onMove: onUserMove, showLegal: store.settings.showLegal });
  evalbar = new EvalBar($('#play-evalbar'));

  $$('#play-color [data-color]').forEach((b) => b.addEventListener('click', () => {
    colorChoice = b.dataset.color;
    $$('#play-color [data-color]').forEach((x) => x.classList.toggle('active', x === b));
  }));
  $('#play-start').addEventListener('click', startGame);
  $('#play-undo').addEventListener('click', takeBack);
  $('#play-hint').addEventListener('click', showHint);
  $('#play-resign').addEventListener('click', resign);
  $('#play-flip').addEventListener('click', () => { board.flip(); evalbar.setOrientation(board.orientation); });
  $('#play-new').addEventListener('click', () => setPhase('setup'));
  $('#play-review').addEventListener('click', openReview);
  $('#result-review').addEventListener('click', () => { closeResult(); openReview(); });
  $('#result-again').addEventListener('click', () => { closeResult(); startGame(); });
  $('#result-close').addEventListener('click', closeResult);
  setPhase('setup');
}

export function onShow(params) {
  board.showLegal = store.settings.showLegal;
  $('#play-evalbar').hidden = !store.settings.showEvalBar;
  if (params && params.fen) {
    if (state && !state.over && state.game.moves.length && !confirm('Abandonner la partie en cours pour jouer cette position ?')) return;
    state = null;
    customFen = params.fen;
    colorChoice = params.fen.split(' ')[1];
    $$('#play-color [data-color]').forEach((x) => x.classList.toggle('active', x.dataset.color === colorChoice));
    setPhase('setup');
  }
}

function renderLegend() {
  const items = [
    ['brilliant', 'sacrifice correct'], ['great', 'seul coup qui tient'], ['best'], ['excellent'], ['good'], ['book'],
    ['forced'], ['inaccuracy'], ['mistake'], ['miss'], ['blunder'],
  ];
  $('#legend-list').innerHTML = items.map(([k, sub]) =>
    `<li><span class="ic-wrap">${clsIcon(k)}</span>${CLASSES[k].label}${sub ? `<small>${sub}</small>` : ''}</li>`).join('');
}

function avatar(b, size = '') {
  return `<span class="avatar ${size}" style="--h:${b.hue}">${b.name[0]}</span>`;
}

function renderBots() {
  $('#bot-list').innerHTML = BOTS.map((b) => `
    <button class="bot-card ${b.id === bot.id ? 'active' : ''}" data-bot="${b.id}">
      ${avatar(b)}
      <span class="bot-meta">
        <span class="bot-name">${b.name} <em>${b.elo}</em></span>
        <span class="bot-style">${b.style}</span>
      </span>
    </button>`).join('');
  $$('#bot-list .bot-card').forEach((c) => c.addEventListener('click', () => {
    bot = BOTS.find((b) => b.id === c.dataset.bot);
    renderBots();
    renderBotBio();
  }));
  renderBotBio();
}

function renderBotBio() {
  $('#bot-bio').innerHTML = `${avatar(bot, 'lg')}<div><h3>${bot.name} <span class="muted">· ${bot.elo}</span></h3><p>${bot.bio}</p></div>`;
}

function setPhase(phase) {
  $('#view-jouer').dataset.phase = phase;
  if (phase === 'setup') {
    board.setMovable(null);
    board.setArrows([]);
    board.setBadge(null);
    const fen = customFen || 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
    board.setOrientation(customFen ? customFen.split(' ')[1] : 'w');
    board.setPosition(fen);
    $('#play-custom').hidden = !customFen;
    evalbar.set(null);
    renderPlayers();
  }
}

// ---------------------------------------------------------------
//  Déroulement de la partie
// ---------------------------------------------------------------
function startGame() {
  const userColor = colorChoice === 'r' ? (Math.random() < 0.5 ? 'w' : 'b') : colorChoice;
  const chess = customFen ? new globalThis.Chess(customFen) : new globalThis.Chess();
  state = {
    gen: (state ? state.gen : 0) + 1,
    chess, userColor, bot, over: false, hints: 0,
    game: { initialFen: chess.fen(), moves: [], headers: {} },
    positions: [], classified: [],
    analysisChain: Promise.resolve(),
  };
  app.engines.play.newGame();
  board.setOrientation(userColor);
  evalbar.setOrientation(userColor);
  board.setPosition(chess.fen(), { animate: false });
  board.setArrows([]); board.setBadge(null);
  setPhase('playing');
  renderPlayers();
  renderMoves();
  queueAnalysis(0, chess.fen());
  if (chess.turn() === userColor) { board.setMovable(userColor); setStatus('À toi de jouer'); }
  else { board.setMovable(null); botTurn(); }
}

function renderPlayers() {
  const userColor = state ? state.userColor : 'w';
  const botHtml = `${avatar(bot, 'sm')}<div><strong>${bot.name}</strong><span class="muted"> ${bot.elo}</span></div><span class="thinking" id="bot-thinking" hidden><i></i><i></i><i></i></span>`;
  const youHtml = `<span class="avatar sm you">Toi</span><div><strong>Toi</strong><span class="muted"> ${store.profile.elo}</span></div>`;
  $('#play-top').innerHTML = botHtml;
  $('#play-bottom').innerHTML = youHtml;
  $('#play-top').dataset.color = userColor === 'w' ? 'b' : 'w';
  $('#play-bottom').dataset.color = userColor;
}

function setStatus(text, kind = '') {
  const s = $('#play-status');
  s.textContent = text;
  s.dataset.kind = kind;
}

function recordMove(mv, fenBefore, legalCount) {
  const g = state.chess;
  return {
    ply: state.game.moves.length, san: mv.san,
    uci: mv.from + mv.to + (mv.promotion || ''),
    from: mv.from, to: mv.to, promotion: mv.promotion || null,
    color: mv.color, piece: mv.piece, captured: mv.captured || null, flags: mv.flags,
    fenBefore, fenAfter: g.fen(), legalCount, clock: null,
  };
}

function applyMove(from, to, promotion) {
  const g = state.chess;
  const fenBefore = g.fen();
  const legalCount = g.moves().length;
  const mv = g.move({ from, to, promotion: promotion || 'q' });
  if (!mv) return null;
  const rec = recordMove(mv, fenBefore, legalCount);
  state.game.moves.push(rec);
  board.setPosition(g.fen(), { lastMove: [from, to] });
  board.setArrows([]);
  renderMoves();
  queueAnalysis(state.game.moves.length, g.fen());
  return mv;
}

async function onUserMove(from, to, promo) {
  if (!state || state.over || state.chess.turn() !== state.userColor) return false;
  const mv = applyMove(from, to, promo);
  if (!mv) return false;
  if (checkEnd()) return true;
  botTurn();
  return true;
}

async function botTurn() {
  const gen = state.gen;
  board.setMovable(null);
  setStatus(`${bot.name} réfléchit…`, 'thinking');
  const th = $('#bot-thinking'); if (th) th.hidden = false;
  const t0 = performance.now();
  let choice;
  try {
    choice = await chooseBotMove(bot, state.chess.fen());
  } catch (e) {
    if (e.message === 'cancelled') return;
    console.error(e);
    toast('Le moteur ne répond pas.', 'error');
    return;
  }
  const wait = Math.max(0, 450 + Math.random() * 500 - (performance.now() - t0));
  await new Promise((r) => setTimeout(r, wait));
  if (!state || state.gen !== gen || state.over) return;
  if (th) th.hidden = true;
  applyMove(choice.slice(0, 2), choice.slice(2, 4), choice[4]);
  if (checkEnd()) return;
  board.setMovable(state.userColor);
  setStatus(state.chess.in_check() ? 'Échec ! À toi de jouer' : 'À toi de jouer', state.chess.in_check() ? 'check' : 'turn');
}

/** Choix du coup d'un bot : MultiPV + température + erreurs volontaires. */
async function chooseBotMove(b, fen) {
  const g = new globalThis.Chess(fen);
  const legal = g.moves({ verbose: true });
  const toUci = (m) => m.from + m.to + (m.promotion || '');
  if (legal.length === 1) return toUci(legal[0]);

  if (Math.random() < b.random) {
    const caps = legal.filter((m) => m.captured);
    const pool = caps.length && Math.random() < 0.5 ? caps : legal;
    return toUci(pool[Math.floor(Math.random() * pool.length)]);
  }

  const res = await app.engines.play.analyse(fen, { depth: b.depth, multipv: b.multipv });
  const sign = g.turn() === 'w' ? 1 : -1;
  const lines = res.lines.filter((l) => l && l.uci).map((l) => ({
    uci: l.uci,
    score: l.mate != null ? Math.sign(l.mate * sign) * (100000 - Math.abs(l.mate) * 100) : l.cp * sign,
  }));
  if (!lines.length) return res.bestmove;
  if (lines.length > 1 && Math.random() < b.blunder) return lines[lines.length - 1].uci;
  const best = Math.max(...lines.map((l) => l.score));
  const weights = lines.map((l) => Math.exp(-(best - l.score) / b.temp));
  let r = Math.random() * weights.reduce((a, x) => a + x, 0);
  for (let i = 0; i < lines.length; i++) { r -= weights[i]; if (r <= 0) return lines[i].uci; }
  return lines[0].uci;
}

// ---------------------------------------------------------------
//  Analyse en direct (n'interrompt jamais le jeu)
// ---------------------------------------------------------------
function queueAnalysis(index, fen) {
  const s = state;
  const gen = s.gen;
  s.analysisChain = s.analysisChain.then(async () => {
    if (!state || state.gen !== gen) return;
    if (!store.settings.liveClassify && !store.settings.showEvalBar) return;
    try {
      const pos = await analyzeOne(fen, app.engines.analysis, LIVE_DEPTH);
      const expected = index === 0 ? state && state.game.initialFen : state && state.game.moves[index - 1] && state.game.moves[index - 1].fenAfter;
      if (!state || state.gen !== gen || expected !== fen) return;
      s.positions[index] = pos;
      evalbar.set(pos.eval);
      classifyReady();
    } catch (e) {
      if (e.message !== 'cancelled') console.warn(e);
    }
  });
}

function classifyReady() {
  const s = state;
  for (let i = 0; i < s.game.moves.length; i++) {
    if (s.classified[i] || !s.positions[i] || !s.positions[i + 1]) continue;
    s.classified[i] = classifyMove(s.game, s.positions, i, s.classified);
  }
  renderMoves();
  const last = s.game.moves.length - 1;
  if (last >= 0 && s.classified[last] && store.settings.liveClassify) {
    const c = s.classified[last].cls;
    board.setBadge({ square: s.game.moves[last].to, cls: c, sym: CLASSES[c].sym });
  }
}

function renderMoves() {
  const s = state;
  const live = store.settings.liveClassify;
  const list = s ? s.game.moves.map((m, i) => ({ san: m.san, cls: live ? (s.classified[i] ? s.classified[i].cls : null) : undefined })) : [];
  renderMoveList($('#play-moves'), list, -1, () => {}, { initialFen: s && s.game.initialFen });
  if (s && live) {
    const mine = s.classified.filter((c, i) => c && s.game.moves[i].color === s.userColor);
    const acc = mine.length ? mine.reduce((a, c) => a + c.accuracy, 0) / mine.length : null;
    $('#play-live-acc').textContent = acc == null ? '—' : `${acc.toFixed(0)} %`;
  }
}

// ---------------------------------------------------------------
//  Actions
// ---------------------------------------------------------------
function takeBack() {
  const s = state;
  if (!s || s.over || s.chess.turn() !== s.userColor) return;
  const n = s.game.moves.length >= 2 ? 2 : 0;
  if (!n) return;
  for (let k = 0; k < n; k++) { s.chess.undo(); s.game.moves.pop(); }
  s.positions.length = s.game.moves.length + 1;
  s.classified.length = s.game.moves.length;
  const last = s.game.moves[s.game.moves.length - 1];
  board.setPosition(s.chess.fen(), { lastMove: last ? [last.from, last.to] : null });
  board.setBadge(null); board.setArrows([]);
  if (s.positions[s.game.moves.length]) evalbar.set(s.positions[s.game.moves.length].eval);
  renderMoves();
}

async function showHint() {
  const s = state;
  if (!s || s.over || s.chess.turn() !== s.userColor) return;
  const btn = $('#play-hint');
  btn.disabled = true;
  try {
    const pos = s.positions[s.game.moves.length] || await analyzeOne(s.chess.fen(), app.engines.analysis, LIVE_DEPTH);
    const uci = pos.lines[0] && pos.lines[0].uci;
    if (uci) {
      s.hints++;
      board.setArrows([{ from: uci.slice(0, 2), to: uci.slice(2, 4), kind: 'hint' }]);
      setTimeout(() => { if (state === s) board.setArrows([]); }, 2500);
    }
  } finally { btn.disabled = false; }
}

function resign() {
  if (!state || state.over) return;
  if (!confirm('Abandonner la partie ?')) return;
  endGame(state.userColor === 'w' ? '0-1' : '1-0', 'Abandon');
}

function checkEnd() {
  const g = state.chess;
  if (g.in_checkmate()) { endGame(g.turn() === 'w' ? '0-1' : '1-0', 'Échec et mat'); return true; }
  if (g.in_stalemate()) { endGame('1/2-1/2', 'Pat'); return true; }
  if (g.in_threefold_repetition()) { endGame('1/2-1/2', 'Triple répétition'); return true; }
  if (g.insufficient_material()) { endGame('1/2-1/2', 'Matériel insuffisant'); return true; }
  if (g.in_draw()) { endGame('1/2-1/2', 'Règle des 50 coups'); return true; }
  return false;
}

function endGame(result, reason) {
  const s = state;
  s.over = true;
  s.result = result;
  board.setMovable(null);
  const score = result === '1/2-1/2' ? 0.5 : (result === '1-0') === (s.userColor === 'w') ? 1 : 0;

  // Elo (formule FIDE, K dégressif)
  const p = store.profile;
  const expected = 1 / (1 + 10 ** ((bot.elo - p.elo) / 400));
  const K = p.games < 30 ? 32 : p.elo < 2000 ? 20 : 12;
  const delta = Math.round(K * (score - expected));
  p.elo = Math.max(100, p.elo + delta);
  p.games++;
  if (score === 1) p.wins++; else if (score === 0) p.losses++; else p.draws++;
  p.eloHistory.push({ t: Date.now(), elo: p.elo });
  if (p.eloHistory.length > 200) p.eloHistory.shift();
  save();
  app.refreshHeader();
  renderPlayers();

  const title = score === 1 ? 'Victoire !' : score === 0 ? 'Défaite' : 'Match nul';
  setStatus(`${title} — ${reason}`, 'over');
  setPhase('over');
  $('#result-title').textContent = title;
  $('#result-reason').textContent = `${reason} contre ${bot.name}`;
  $('#result-elo').innerHTML = `<span class="${delta >= 0 ? 'up' : 'down'}">${delta >= 0 ? '+' : ''}${delta}</span> Elo · ${p.elo}`;
  $('#result-modal').dataset.outcome = score === 1 ? 'win' : score === 0 ? 'loss' : 'draw';
  $('#result-modal').hidden = false;
}

function closeResult() { $('#result-modal').hidden = true; }

function currentPgn() {
  const s = state;
  const white = s.userColor === 'w' ? 'Toi' : `${bot.name} (bot)`;
  const black = s.userColor === 'b' ? 'Toi' : `${bot.name} (bot)`;
  return toPgn({
    Event: 'Partie contre bot', Site: 'Fianchetto', Date: new Date().toISOString().slice(0, 10).replace(/-/g, '.'),
    White: white, Black: black, Result: s.result || '*',
    WhiteElo: s.userColor === 'w' ? store.profile.elo : bot.elo, BlackElo: s.userColor === 'b' ? store.profile.elo : bot.elo,
    ...(s.game.initialFen !== new globalThis.Chess().fen() ? { SetUp: '1', FEN: s.game.initialFen } : {}),
  }, s.game.moves.map((m) => m.san), s.result || '*', s.game.initialFen);
}

function openReview() {
  if (!state || !state.game.moves.length) return;
  app.go('analyse', { pgn: currentPgn(), userColor: state.userColor, source: 'bot' });
}

export function onKey(e) {
  if (e.key === 'f') { board.flip(); evalbar.setOrientation(board.orientation); }
}

