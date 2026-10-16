// ============================================================
//  Vue « Analyse » : import de parties, progression, bilan
//  multi-parties ; délègue l'écran de rapport à reviewer.js
// ============================================================

import { $, $$, toast, escapeHtml, formatDate, TIME_CLASS_FR } from '../ui/common.js';
import { gameFromPgn, splitPgnGames, computeTimeSpent } from '../core/pgn.js';
import { analyzePositions, refinePositions, buildReport } from '../core/review.js';
import { chesscomArchives, chesscomMonth, lichessGames } from '../importers.js';
import { store, save, gameId, saveReview, loadReview } from '../store.js';
import { initReviewer, showReview, leaveReview, onKey as reviewerKey } from './reviewer.js';
import { runBatch, cancelBatch, render as renderBatch } from './batch.js';

const DEPTHS = { 11: 'Rapide', 14: 'Standard', 18: 'Approfondie' };

let app;
let running = null;
let imported = [];
let filter = 'all';
let hasBatch = false;

export function init(a) {
  app = a;
  initReviewer(app);

  $$('#import-tabs [data-tab]').forEach((t) => t.addEventListener('click', () => selectTab(t.dataset.tab)));
  $('#cc-user').value = store.settings.chesscomUser;
  $('#li-user').value = store.settings.lichessUser;
  $('#cc-form').addEventListener('submit', (e) => { e.preventDefault(); loadChesscom(); });
  $('#li-form').addEventListener('submit', (e) => { e.preventDefault(); loadLichess(); });
  $('#cc-month').addEventListener('change', () => loadChesscomMonth($('#cc-month').value));
  $('#pgn-form').addEventListener('submit', (e) => { e.preventDefault(); analysePastedPgn(); });
  $('#pgn-file').addEventListener('change', async (e) => {
    const f = e.target.files[0];
    if (f) $('#pgn-text').value = await f.text();
  });
  $$('#game-filters [data-filter]').forEach((b) => b.addEventListener('click', () => {
    filter = b.dataset.filter;
    $$('#game-filters [data-filter]').forEach((x) => x.classList.toggle('active', x === b));
    renderGameList();
  }));

  const depthSel = $('#an-depth');
  depthSel.innerHTML = Object.entries(DEPTHS).map(([d, l]) => `<option value="${d}">${l} · profondeur ${d}</option>`).join('');
  depthSel.value = String(store.settings.reviewDepth);
  depthSel.addEventListener('change', () => { store.settings.reviewDepth = +depthSel.value; save(); });

  $('#an-cancel').addEventListener('click', () => { if (running) running.cancelled = true; app.engines.analysis.cancelAll(); });
  $('#an-import-new').addEventListener('click', () => setMode('import'));
  $('#an-export').addEventListener('click', exportPgn);
  $('#batch-start').addEventListener('click', startBatch);
  $('#batch-cancel').addEventListener('click', () => cancelBatch(app));
  $('#batch-back').addEventListener('click', () => setMode('import'));
  $('#an-back-batch').addEventListener('click', () => setMode('batch'));

  // Glisser-déposer d'un fichier PGN n'importe où sur la page d'import
  const drop = $('.mode-import');
  drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('drag'); });
  drop.addEventListener('dragleave', () => drop.classList.remove('drag'));
  drop.addEventListener('drop', async (e) => {
    e.preventDefault(); drop.classList.remove('drag');
    const f = e.dataTransfer.files[0];
    if (!f) return;
    selectTab('pgn');
    $('#pgn-text').value = await f.text();
  });
  setMode('import');
}

export function onShow(params) {
  renderRecent();
  if (params && params.pgn) openReview(params);
  else if (params && params.historyId) openFromHistory(params.historyId);
}

export function onHide() { leaveReview(); }

export function onKey(e) {
  if ($('#view-analyse').dataset.mode === 'review') reviewerKey(e);
}

let current = null;
function setMode(mode) {
  $('#view-analyse').dataset.mode = mode;
  $('main').classList.toggle('wide', mode === 'review' || mode === 'batch');
  if (mode !== 'review') leaveReview();
}

function selectTab(tab) {
  $$('#import-tabs [data-tab]').forEach((t) => t.classList.toggle('active', t.dataset.tab === tab));
  $$('.import-pane').forEach((p) => p.classList.toggle('active', p.dataset.pane === tab));
  $('#batch-box').hidden = tab === 'pgn' || !imported.length;
}

// ---------------------------------------------------------------
//  Import
// ---------------------------------------------------------------
function setListState(html) { $('#game-list').innerHTML = `<div class="list-state">${html}</div>`; }

async function loadChesscom() {
  const user = $('#cc-user').value.trim();
  if (!user) return toast('Entre ton pseudo Chess.com', 'error');
  store.settings.chesscomUser = user; save();
  setListState('<span class="spinner"></span> Récupération des archives…');
  try {
    const archives = await chesscomArchives(user);
    if (!archives.length) { setListState('Aucune partie publique trouvée pour ce joueur.'); return; }
    const sel = $('#cc-month');
    sel.innerHTML = archives.map((a) => `<option value="${a.url}">${new Date(a.year, a.month - 1).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })}</option>`).join('');
    sel.hidden = false;
    await loadChesscomMonth(archives[0].url);
  } catch (e) { setListState(escapeHtml(e.message)); }
}

async function loadChesscomMonth(url) {
  setListState('<span class="spinner"></span> Chargement des parties…');
  try {
    imported = await chesscomMonth(url, $('#cc-user').value);
    renderGameList();
  } catch (e) { setListState(escapeHtml(e.message)); }
}

async function loadLichess() {
  const user = $('#li-user').value.trim();
  if (!user) return toast('Entre ton pseudo Lichess', 'error');
  store.settings.lichessUser = user; save();
  setListState('<span class="spinner"></span> Chargement des parties…');
  try {
    imported = await lichessGames(user, 50);
    renderGameList();
  } catch (e) { setListState(escapeHtml(e.message)); }
}

function filtered() {
  return imported.filter((g) => filter === 'all' || g.timeClass === filter ||
    (filter === 'daily' && g.timeClass === 'correspondence') || (filter === 'rapid' && g.timeClass === 'classical'));
}

function renderGameList() {
  const list = filtered();
  $('#batch-box').hidden = !list.length;
  $('#batch-count').innerHTML = [5, 10, 20, 30].filter((n, i) => i === 0 || n <= Math.max(5, list.length))
    .map((n) => `<option value="${n}" ${n === Math.min(10, list.length) ? 'selected' : ''}>${Math.min(n, list.length)} dernières</option>`).join('');
  if (!list.length) { setListState('Aucune partie pour ce filtre.'); return; }
  const OUT = { win: 'Victoire', loss: 'Défaite', draw: 'Nulle' };
  const reviewed = new Set(store.history.map((h) => h.url).filter(Boolean));
  $('#game-list').innerHTML = list.map((g) => `
    <article class="game-row" data-outcome="${g.outcome}">
      <span class="game-result" title="${OUT[g.outcome]}">${g.outcome === 'win' ? '1' : g.outcome === 'loss' ? '0' : '½'}</span>
      <div class="game-main">
        <div class="game-players"><span class="dot ${g.userColor}"></span>${escapeHtml(g.me.name)} <em>${g.me.rating || ''}</em>
          <span class="vs">contre</span> ${escapeHtml(g.opp.name)} <em>${g.opp.rating || ''}</em></div>
        <div class="game-sub">${TIME_CLASS_FR[g.timeClass] || g.timeClass || ''} · ${formatDate(g.endTime)} · ${g.source}${reviewed.has(g.url) ? ' · <span class="seen">déjà analysée</span>' : ''}</div>
      </div>
      <button class="btn btn-primary btn-sm" data-idx="${imported.indexOf(g)}">Analyser</button>
    </article>`).join('');
  $$('#game-list [data-idx]').forEach((b) => b.addEventListener('click', () => {
    const g = imported[+b.dataset.idx];
    openReview({ pgn: g.pgn, userColor: g.userColor, source: g.source, url: g.url });
  }));
}

function analysePastedPgn() {
  const text = $('#pgn-text').value.trim();
  if (!text) return toast('Colle un PGN ou choisis un fichier.', 'error');
  const first = splitPgnGames(text)[0];
  openReview({ pgn: first, userColor: $('#pgn-color').value, source: 'pgn' });
}

function renderRecent() {
  const box = $('#an-recent');
  if (!store.history.length) { box.innerHTML = '<p class="empty">Tes analyses apparaîtront ici.</p>'; return; }
  box.innerHTML = store.history.slice(0, 10).map((h) => `
    <button class="recent-row" data-id="${h.id}">
      <span class="recent-players">${escapeHtml(h.white)} – ${escapeHtml(h.black)}</span>
      <span class="recent-acc"><b>${h.accW ?? '—'}</b> / <b>${h.accB ?? '—'}</b></span>
      <span class="recent-sub">${escapeHtml(h.opening || '')} · ${formatDate(h.date)}</span>
    </button>`).join('');
  $$('#an-recent [data-id]').forEach((b) => b.addEventListener('click', () => openFromHistory(b.dataset.id)));
}

// ---------------------------------------------------------------
//  Analyse d'une partie
// ---------------------------------------------------------------
async function openReview({ pgn, userColor = 'w', source = 'pgn', url = null }) {
  let game;
  try { game = gameFromPgn(pgn); } catch (e) { toast(e.message, 'error', 6000); return; }
  if (!game.moves.length) return toast('Cette partie ne contient aucun coup.', 'error');
  computeTimeSpent(game);

  const depth = store.settings.reviewDepth;
  const id = gameId(game.moves.map((m) => m.san), depth);
  const cached = loadReview(id);
  if (cached) return display({ game, report: cached.report, userColor, meta: { id, source, url } });

  if (running) { running.cancelled = true; app.engines.analysis.cancelAll(); }
  const job = { cancelled: false };
  running = job;
  setMode('progress');
  const w = game.headers.White || 'Blancs', b = game.headers.Black || 'Noirs';
  $('#an-progress-title').textContent = `${w} – ${b}`;
  const bar = $('#an-progress-bar'), label = $('#an-progress-label');
  bar.style.width = '0%';
  label.textContent = 'Démarrage du moteur…';
  const t0 = performance.now();
  try {
    const positions = await analyzePositions(game, app.engines.analysis, {
      depth, isCancelled: () => job.cancelled,
      onProgress: (done, total) => {
        bar.style.width = `${(done / total) * 90}%`;
        const el = (performance.now() - t0) / 1000;
        const eta = Math.max(0, Math.round(el / done * (total - done)));
        label.textContent = `Position ${done} / ${total} · ${eta > 0 ? `environ ${eta} s restantes` : 'vérification…'}`;
      },
    });
    await refinePositions(game, positions, app.engines.analysis, {
      depth, isCancelled: () => job.cancelled,
      onProgress: (done, total) => {
        bar.style.width = `${90 + done / total * 10}%`;
        label.textContent = `Vérification des moments critiques · ${done} / ${total}`;
      },
    });
    const report = buildReport(game, positions);
    running = null;
    const meta = {
      id, date: Date.now(), source, url, white: w, black: b, result: game.result,
      accW: report.accuracy.w != null ? Math.round(report.accuracy.w) : null,
      accB: report.accuracy.b != null ? Math.round(report.accuracy.b) : null,
      opening: report.opening, userColor,
    };
    if (!saveReview(meta, { pgn, report })) toast('Stockage local plein : rapport non conservé.', 'error');
    display({ game, report, userColor, meta });
  } catch (e) {
    running = null;
    setMode('import');
    if (e.message === 'cancelled') { toast('Analyse annulée', 'info'); return; }
    console.error(e);
    toast('Erreur pendant l\'analyse : ' + e.message, 'error', 6000);
  }
}

function openFromHistory(id) {
  const meta = store.history.find((h) => h.id === id);
  const data = loadReview(id);
  if (!data) { toast('Ce rapport n\'est plus disponible.', 'error'); return; }
  const game = gameFromPgn(data.pgn);
  computeTimeSpent(game);
  display({ game, report: data.report, userColor: (meta && meta.userColor) || 'w', meta: meta || { id } });
}

function display(r) {
  current = r;
  setMode('review');
  $('#an-back-batch').hidden = !hasBatch;
  showReview(r);
  renderRecent();
}

// ---------------------------------------------------------------
//  Bilan multi-parties
// ---------------------------------------------------------------
async function startBatch() {
  const n = +$('#batch-count').value;
  const games = filtered().slice(0, n);
  if (!games.length) return;
  setMode('batch');
  hasBatch = true;
  renderBatch([], () => {});
  await runBatch(app, games, { depth: Math.min(store.settings.reviewDepth, 11), onOpen: openFromHistory });
}

// ---------------------------------------------------------------
//  Export PGN annoté
// ---------------------------------------------------------------
function exportPgn() {
  if (!current) return;
  const { game, report } = current;
  const NAG = { brilliant: '$3', great: '$1', inaccuracy: '$6', mistake: '$2', miss: '$2', blunder: '$4' };
  const head = Object.entries({ ...game.headers, Annotator: 'Fianchetto (Stockfish)' })
    .map(([k, v]) => `[${k} "${String(v).replace(/"/g, '\\"')}"]`).join('\n');
  const parts = game.initialFen.split(' ');
  const off = parts[1] === 'b' ? 1 : 0, start = +(parts[5] || 1);
  let body = '';
  let needNum = true;
  game.moves.forEach((m, i) => {
    const info = report.moves[i];
    const num = start + Math.floor((i + off) / 2);
    if (m.color === 'w') body += `${num}. `;
    else if (needNum) body += `${num}... `;
    needNum = false;
    body += m.san + (NAG[info.cls] ? ' ' + NAG[info.cls] : '');
    if (['inaccuracy', 'mistake', 'blunder', 'miss', 'brilliant', 'great'].includes(info.cls)) {
      const ev = report.evals[i + 1];
      const evTxt = ev.mate != null ? `#${ev.mate}` : (ev.cp / 100).toFixed(2);
      body += ` { ${info.comment.replace(/[{}]/g, '')} [%eval ${evTxt}] }`;
      needNum = true;
    }
    body += ' ';
  });
  const blob = new Blob([`${head}\n\n${body.trim()} ${game.result}\n`], { type: 'application/x-chess-pgn' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `analyse-${game.headers.White || 'blancs'}-${game.headers.Black || 'noirs'}.pgn`.replace(/\s+/g, '_');
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
