// ============================================================
//  Vue « Profil » : statistiques, historique, réglages
// ============================================================

import { $, $$, toast, escapeHtml, formatDate } from '../ui/common.js';
import { store, save, resetAll, deleteReview } from '../store.js';

let app;

const SETTINGS = [
  ['liveClassify', 'Qualité des coups en direct', 'Classe chacun de tes coups pendant la partie contre un bot.'],
  ['showEvalBar', 'Barre d\'évaluation en partie', 'Affiche l\'avantage estimé pendant que tu joues.'],
  ['showLegal', 'Montrer les coups légaux', 'Affiche les cases accessibles quand tu sélectionnes une pièce.'],
];

export function init(a) {
  app = a;
  $('#pf-settings').innerHTML = SETTINGS.map(([k, label, help]) => `
    <label class="switch-row">
      <span><strong>${label}</strong><small>${help}</small></span>
      <input type="checkbox" data-setting="${k}" ${store.settings[k] ? 'checked' : ''}><i class="switch"></i>
    </label>`).join('');
  $$('#pf-settings [data-setting]').forEach((i) => i.addEventListener('change', () => {
    store.settings[i.dataset.setting] = i.checked; save();
  }));
  $$('#pf-themes [data-theme]').forEach((b) => b.addEventListener('click', () => {
    store.settings.boardTheme = b.dataset.theme; save();
    app.refreshHeader(); renderThemes();
  }));
  $('#pf-reset').addEventListener('click', () => {
    if (!confirm('Effacer ton profil, tes classements et toutes tes analyses ?')) return;
    resetAll(); app.refreshHeader(); render(); toast('Profil réinitialisé', 'info');
  });
}

export function onShow() { render(); }

function renderThemes() {
  $$('#pf-themes [data-theme]').forEach((b) => b.classList.toggle('active', b.dataset.theme === store.settings.boardTheme));
}

function render() {
  const p = store.profile;
  $('#pf-elo').textContent = p.elo;
  $('#pf-pelo').textContent = p.puzzleElo;
  $('#pf-games').textContent = p.games;
  $('#pf-wdl').innerHTML = `<b class="win">${p.wins}</b> / <b class="draw">${p.draws}</b> / <b class="loss">${p.losses}</b>`;
  const tot = p.puzzleSolved + p.puzzleFailed;
  $('#pf-prate').textContent = tot ? `${Math.round(p.puzzleSolved / tot * 100)} %` : '—';
  $('#pf-pbest').textContent = p.puzzleBestStreak;
  renderSpark();
  renderThemes();
  $$('#pf-settings [data-setting]').forEach((i) => { i.checked = !!store.settings[i.dataset.setting]; });

  const box = $('#pf-history');
  if (!store.history.length) {
    box.innerHTML = '<p class="empty">Aucune analyse pour l\'instant. Importe une partie depuis l\'onglet Analyse.</p>';
    return;
  }
  box.innerHTML = `<table class="hist"><thead><tr><th>Partie</th><th>Ouverture</th><th>Précision</th><th>Date</th><th></th></tr></thead><tbody>
    ${store.history.map((h) => `<tr>
      <td><button class="link" data-open="${h.id}">${escapeHtml(h.white)} – ${escapeHtml(h.black)}</button> <span class="muted">${escapeHtml(h.result || '')}</span></td>
      <td class="muted">${escapeHtml(h.opening || '—')}</td>
      <td><b>${h.accW ?? '—'}</b> / <b>${h.accB ?? '—'}</b></td>
      <td class="muted">${formatDate(h.date)}</td>
      <td><button class="icon-btn" title="Supprimer" data-del="${h.id}">✕</button></td></tr>`).join('')}
  </tbody></table>`;
  $$('#pf-history [data-open]').forEach((b) => b.addEventListener('click', () => app.go('analyse', { historyId: b.dataset.open })));
  $$('#pf-history [data-del]').forEach((b) => b.addEventListener('click', () => { deleteReview(b.dataset.del); render(); }));
}

function renderSpark() {
  const pts = store.profile.eloHistory;
  const el = $('#pf-spark');
  if (pts.length < 2) { el.innerHTML = '<p class="empty">Joue quelques parties contre les bots pour voir ta progression.</p>'; return; }
  const W = 400, H = 90;
  const ys = pts.map((p) => p.elo);
  const min = Math.min(...ys) - 20, max = Math.max(...ys) + 20;
  const path = pts.map((p, i) => `${i ? 'L' : 'M'}${(i / (pts.length - 1) * W).toFixed(1)},${(H - (p.elo - min) / (max - min) * H).toFixed(1)}`).join(' ');
  el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none"><path d="${path} L${W},${H} L0,${H} Z" class="spark-area"/><path d="${path}" class="spark-line"/></svg>
    <div class="spark-legend"><span>${Math.min(...ys)}</span><span>max ${Math.max(...ys)}</span></div>`;
}
