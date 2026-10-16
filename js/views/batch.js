// ============================================================
//  Bilan multi-parties : analyse en lot + tableau de bord
// ============================================================

import { $, $$, escapeHtml, formatDate, TIME_CLASS_FR } from '../ui/common.js';
import { clsIcon } from '../ui/icons.js';
import { gameFromPgn, computeTimeSpent } from '../core/pgn.js';
import { analyzePositions, refinePositions, buildReport, TAG_LABELS } from '../core/review.js';
import { store, gameId, saveReview, loadReview } from '../store.js';

const PHASE_FR = { opening: 'l\'ouverture', middlegame: 'le milieu de jeu', endgame: 'la finale' };
const PHASE_TITLE = { opening: 'Ouverture', middlegame: 'Milieu de jeu', endgame: 'Finale' };
const ERR = ['mistake', 'blunder', 'miss'];

let job = null;

/** Résumé exploitable d'une partie analysée, du point de vue du joueur. */
export function summarizeGame(meta, game, report, reviewId) {
  const me = meta.userColor;
  const opp = me === 'w' ? 'b' : 'w';
  const tc = /^(\d+)/.exec(game.headers.TimeControl || meta.timeControl || '');
  const base = tc ? +tc[1] : null;
  const limit = base ? Math.max(20, base * 0.12) : null;
  const tags = Object.fromEntries(Object.keys(TAG_LABELS).map((k) => [k, 0]));
  const errorsByPhase = { opening: 0, middlegame: 0, endgame: 0 };
  let errors = 0, pressured = 0, clocked = 0;
  report.moves.forEach((m, i) => {
    const mv = game.moves[i];
    if (mv.color !== me || !ERR.includes(m.cls)) return;
    errors++;
    if (m.tag) tags[m.tag]++;
    if (m.phase) errorsByPhase[m.phase]++;
    if (mv.clock != null && limit) { clocked++; if (mv.clock < limit) pressured++; }
  });
  return {
    reviewId, endTime: meta.endTime, url: meta.url, source: meta.source,
    opp: meta.opp, me: meta.me, outcome: meta.outcome, timeClass: meta.timeClass, color: me,
    opening: report.opening || 'Ouverture non répertoriée',
    acc: report.accuracy[me], oppAcc: report.accuracy[opp], rating: report.rating[me],
    counts: report.counts[me], phases: report.phases[me],
    tags, errors, errorsByPhase, pressured, clocked, pressureLimit: limit,
  };
}

/**
 * Lance l'analyse d'une liste de parties importées.
 * @param games parties au format importers.js
 */
export async function runBatch(app, games, { depth = 10, onOpen }) {
  if (job) job.cancelled = true;
  const me = { cancelled: false, results: [] };
  job = me;
  $('#batch-title').textContent = `Bilan de tes ${games.length} dernières parties`;
  $('#batch-progress').hidden = false;
  render(me.results, onOpen);

  for (let k = 0; k < games.length; k++) {
    if (me.cancelled) break;
    const meta = games[k];
    setProgress(k, games.length, `Partie ${k + 1} / ${games.length} · ${meta.me.name} contre ${meta.opp.name}`);
    try {
      const game = gameFromPgn(meta.pgn);
      computeTimeSpent(game);
      if (!game.moves.length) continue;
      const id = gameId(game.moves.map((m) => m.san), depth);
      let report = (loadReview(id) || {}).report;
      if (!report) {
        const positions = await analyzePositions(game, app.engines.review, {
          depth, isCancelled: () => me.cancelled,
          onProgress: (d, t) => setProgress(k + d / t * 0.85, games.length),
        });
        await refinePositions(game, positions, app.engines.review, { depth, isCancelled: () => me.cancelled });
        report = buildReport(game, positions);
        saveReview({
          id, date: Date.now(), source: meta.source, url: meta.url,
          white: game.headers.White || 'Blancs', black: game.headers.Black || 'Noirs', result: game.result,
          accW: report.accuracy.w != null ? Math.round(report.accuracy.w) : null,
          accB: report.accuracy.b != null ? Math.round(report.accuracy.b) : null,
          opening: report.opening, userColor: meta.userColor,
        }, { pgn: meta.pgn, report });
      }
      me.results.push(summarizeGame(meta, game, report, id));
      render(me.results, onOpen);
    } catch (e) {
      if (e.message === 'cancelled') break;
      console.warn('Partie ignorée', e);
    }
  }
  setProgress(games.length, games.length, me.cancelled ? 'Bilan interrompu — résultats partiels' : 'Bilan terminé');
  setTimeout(() => { if (job === me) $('#batch-progress').hidden = true; }, 1600);
  store.lastBatch = me.results.map((r) => ({ ...r }));
  return me.results;
}

export function cancelBatch(app) {
  if (job) job.cancelled = true;
  app.engines.review.cancelAll();
}

function setProgress(done, total, label) {
  $('#batch-bar').style.width = `${Math.min(100, done / total * 100)}%`;
  if (label) $('#batch-label').textContent = label;
}

const avg = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const pct = (x) => (x == null ? '—' : `${Math.round(x)} %`);

/** Rendu du tableau de bord (appelé après chaque partie). */
export function render(results, onOpen) {
  const n = results.length;
  const wins = results.filter((r) => r.outcome === 'win').length;
  const draws = results.filter((r) => r.outcome === 'draw').length;
  const losses = n - wins - draws;
  const accs = results.map((r) => r.acc).filter((x) => x != null);
  const totalErr = results.reduce((a, r) => a + r.errors, 0);
  const blunders = results.reduce((a, r) => a + r.counts.blunder, 0);

  $('#batch-kpis').innerHTML = [
    ['Parties', n],
    ['Score', n ? `${Math.round((wins + draws / 2) / n * 100)} %` : '—', `${wins} V · ${draws} N · ${losses} D`],
    ['Précision moyenne', pct(avg(accs))],
    ['Niveau estimé', n ? Math.round(avg(results.map((r) => r.rating || 0)) / 50) * 50 : '—'],
    ['Gaffes / partie', n ? (blunders / n).toFixed(1) : '—'],
  ].map(([l, v, sub]) => `<div class="kpi"><small>${l}</small><b>${v}</b>${sub ? `<span>${sub}</span>` : ''}</div>`).join('');

  // Tendance
  const sorted = [...results].sort((a, b) => a.endTime - b.endTime);
  $('#batch-trend').innerHTML = n ? `<div class="trend">${sorted.map((r) => `
      <button class="trend-bar" data-id="${r.reviewId}" data-outcome="${r.outcome}" style="--h:${Math.max(4, r.acc || 0)}%"
        title="${escapeHtml(r.opp.name)} · ${pct(r.acc)} · ${formatDate(r.endTime)}"><i></i></button>`).join('')}</div>
      <div class="trend-legend"><span><i class="win"></i>Victoire</span><span><i class="draw"></i>Nulle</span><span><i class="loss"></i>Défaite</span></div>`
    : '<p class="empty">Les parties apparaîtront ici au fil de l\'analyse.</p>';

  // Phases
  const ph = {};
  for (const k of Object.keys(PHASE_TITLE)) ph[k] = avg(results.map((r) => r.phases[k]).filter((x) => x != null));
  const valid = Object.entries(ph).filter(([, v]) => v != null);
  const weakest = valid.length > 1 ? valid.sort((a, b) => a[1] - b[1])[0][0] : null;
  $('#batch-phases').innerHTML = Object.keys(PHASE_TITLE).map((k) => `
    <div class="phase-row ${k === weakest ? 'weak' : ''}"><span>${PHASE_TITLE[k]}</span>
      <div class="meter"><i style="width:${ph[k] || 0}%"></i></div><b>${pct(ph[k])}</b></div>`).join('');

  // Types d'erreurs
  const tags = Object.fromEntries(Object.keys(TAG_LABELS).map((k) => [k, results.reduce((a, r) => a + r.tags[k], 0)]));
  const maxTag = Math.max(1, ...Object.values(tags));
  $('#batch-errors').innerHTML = Object.entries(tags).sort((a, b) => b[1] - a[1]).map(([k, v]) => `
    <div class="phase-row"><span>${TAG_LABELS[k]}</span><div class="meter err"><i style="width:${v / maxTag * 100}%"></i></div><b>${v}</b></div>`).join('');

  // Ouvertures
  const op = new Map();
  for (const r of results) {
    const key = `${r.opening}|${r.color}`;
    const o = op.get(key) || { name: r.opening, color: r.color, n: 0, pts: 0, acc: [] };
    o.n++; o.pts += r.outcome === 'win' ? 1 : r.outcome === 'draw' ? 0.5 : 0;
    if (r.acc != null) o.acc.push(r.acc);
    op.set(key, o);
  }
  const ops = [...op.values()].sort((a, b) => b.n - a.n || b.pts - a.pts);
  $('#batch-openings').innerHTML = ops.length ? `<table class="hist"><thead><tr><th>Ouverture</th><th>Parties</th><th>Score</th><th>Précision</th></tr></thead><tbody>
    ${ops.slice(0, 7).map((o) => `<tr><td><span class="dot ${o.color}"></span> ${escapeHtml(o.name)}</td><td>${o.n}</td>
      <td><span class="score-pill" style="--s:${o.pts / o.n}">${Math.round(o.pts / o.n * 100)} %</span></td><td>${pct(avg(o.acc))}</td></tr>`).join('')}
    </tbody></table>` : '';

  // Liste des parties
  $('#batch-games').innerHTML = sorted.slice().reverse().map((r) => `
    <button class="game-row compact" data-id="${r.reviewId}" data-outcome="${r.outcome}">
      <span class="game-result">${r.outcome === 'win' ? '1' : r.outcome === 'loss' ? '0' : '½'}</span>
      <span class="game-main"><span class="game-players"><span class="dot ${r.color}"></span>${escapeHtml(r.opp.name)} <em>${r.opp.rating || ''}</em></span>
        <span class="game-sub">${TIME_CLASS_FR[r.timeClass] || ''} · ${formatDate(r.endTime)}</span></span>
      <span class="game-acc">${pct(r.acc)}</span>
      <span class="game-icons">${r.counts.blunder ? `${clsIcon('blunder', 'xs')}${r.counts.blunder}` : ''}${r.counts.brilliant ? `${clsIcon('brilliant', 'xs')}${r.counts.brilliant}` : ''}</span>
    </button>`).join('');

  $$('#view-analyse [data-mode-batch] [data-id]').forEach((b) => b.addEventListener('click', () => onOpen(b.dataset.id)));

  // Conseils
  const tips = [];
  if (weakest && valid.length > 1) {
    const best = Object.entries(ph).filter(([, v]) => v != null).sort((a, b) => b[1] - a[1])[0];
    if (best[1] - ph[weakest] >= 3) tips.push(`Ta précision chute dans <b>${PHASE_FR[weakest]}</b> (${pct(ph[weakest])} contre ${pct(best[1])} dans ${PHASE_FR[best[0]]}). C'est là que tu progresseras le plus vite.`);
  }
  const topTag = Object.entries(tags).sort((a, b) => b[1] - a[1])[0];
  if (topTag && topTag[1] && totalErr) {
    const advice = {
      hanging: 'avant chaque coup, vérifie quelles pièces l\'adversaire peut prendre.',
      mateAllowed: 'surveille la sécurité de ton roi : cases autour, diagonales ouvertes, couloir.',
      mateMissed: 'cherche systématiquement les échecs et les captures quand le roi adverse est exposé.',
      tactic: 'entraîne-toi aux problèmes tactiques (onglet Problèmes).',
      positional: 'prends le temps de comparer deux ou trois coups candidats.',
    }[topTag[0]];
    tips.push(`<b>${TAG_LABELS[topTag[0]]}</b> : ${topTag[1]} de tes ${totalErr} erreurs. Conseil : ${advice}`);
  }
  const pressured = results.reduce((a, r) => a + r.pressured, 0), clocked = results.reduce((a, r) => a + r.clocked, 0);
  if (clocked >= 4 && pressured / clocked >= 0.3) tips.push(`<b>${Math.round(pressured / clocked * 100)} %</b> de tes erreurs surviennent en zeitnot (peu de temps à la pendule). Garde une réserve de temps pour la fin de partie.`);
  const accW = avg(results.filter((r) => r.outcome === 'win' && r.acc != null).map((r) => r.acc));
  const accL = avg(results.filter((r) => r.outcome === 'loss' && r.acc != null).map((r) => r.acc));
  if (accW != null && accL != null) tips.push(`Précision moyenne : <b>${pct(accW)}</b> dans tes victoires, <b>${pct(accL)}</b> dans tes défaites.`);
  if (ops.length) {
    const good = ops.filter((o) => o.n >= 2).sort((a, b) => b.pts / b.n - a.pts / a.n);
    if (good.length) tips.push(`Ouverture qui te réussit le mieux : <b>${escapeHtml(good[0].name)}</b> avec les ${good[0].color === 'w' ? 'Blancs' : 'Noirs'} (${Math.round(good[0].pts / good[0].n * 100)} %).`);
    if (good.length > 1) {
      const bad = good[good.length - 1];
      if (bad.pts / bad.n < 0.5) tips.push(`À retravailler : <b>${escapeHtml(bad.name)}</b> avec les ${bad.color === 'w' ? 'Blancs' : 'Noirs'} (${Math.round(bad.pts / bad.n * 100)} %).`);
    }
  }
  $('#batch-tips').innerHTML = tips.length ? tips.map((t) => `<li>${t}</li>`).join('') : '<li class="empty">Les conseils apparaîtront après quelques parties.</li>';
}
