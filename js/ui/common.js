// ============================================================
//  Briques d'interface partagées
// ============================================================

import { CLASSES, evalWp, formatEval } from '../core/review.js';
import { clsIcon } from './icons.js';

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// ---------- Notifications ----------
export function toast(message, type = 'info', ms = 3000) {
  const box = $('#toasts');
  const t = document.createElement('div');
  t.className = `toast toast-${type}`;
  t.textContent = message;
  box.appendChild(t);
  setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 250); }, ms);
}

// ---------- Badges de classification ----------
export function clsBadge(cls, extra = '') {
  if (!cls) return `<span class="ic-wrap pending ${extra}" title="Analyse en cours…"></span>`;
  return `<span class="ic-wrap ${extra}" title="${CLASSES[cls].label}">${clsIcon(cls)}</span>`;
}

/** Numéro de coup lisible (« 12. » ou « 12… »), y compris depuis une position personnalisée. */
export function moveNo(game, ply) {
  const parts = (game.initialFen || '').split(' ');
  const blackFirst = parts[1] === 'b';
  const start = +(parts[5] || 1);
  const idx = ply + (blackFirst ? 1 : 0);
  return `${start + Math.floor(idx / 2)}${idx % 2 === 0 ? '.' : '…'}`;
}

// ---------- Barre d'évaluation ----------
export class EvalBar {
  constructor(el) {
    this.el = el;
    el.classList.add('evalbar');
    el.innerHTML = '<div class="evalbar-fill"></div><span class="evalbar-label"></span>';
    this.fill = el.firstElementChild;
    this.label = el.lastElementChild;
    this.orientation = 'w';
    this.set(null);
  }
  setOrientation(o) { this.orientation = o; this.el.classList.toggle('flipped', o === 'b'); }
  set(ev, { loading = false } = {}) {
    this.el.classList.toggle('loading', loading);
    const wp = ev ? evalWp(ev, 'w') : 50;
    this.fill.style.height = `${wp}%`;
    const txt = ev ? formatEval(ev).replace('+', '') : '0.0';
    this.label.textContent = txt;
    const whiteAhead = wp >= 50;
    this.label.classList.toggle('on-white', whiteAhead);
  }
}

// ---------- Graphe d'évaluation ----------
export function renderEvalGraph(el, evals, moves, current, onPick) {
  const W = 600, H = 120, n = Math.max(evals.length - 1, 1);
  const pts = evals.map((ev, i) => [i / n * W, H - evalWp(ev, 'w') / 100 * H]);
  const area = `M0,${H} ` + pts.map(([x, y]) => `L${x.toFixed(1)},${y.toFixed(1)}`).join(' ') + ` L${W},${H} Z`;
  const line = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const dots = (moves || []).map((m, i) => {
    if (!m || !['blunder', 'mistake', 'miss', 'brilliant', 'great', 'inaccuracy'].includes(m.cls)) return '';
    const [x, y] = pts[i + 1];
    return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${m.cls === 'inaccuracy' ? 2.6 : 3.6}" class="gdot cls-fill-${m.cls}"/>`;
  }).join('');
  const cx = current >= 0 ? pts[Math.min(current + 1, pts.length - 1)][0] : 0;
  el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" class="evalgraph-svg">
      <rect width="${W}" height="${H}" class="g-bg"/>
      <path d="${area}" class="g-area"/>
      <line x1="0" y1="${H / 2}" x2="${W}" y2="${H / 2}" class="g-mid"/>
      <path d="${line}" class="g-line"/>
      <line x1="${cx}" y1="0" x2="${cx}" y2="${H}" class="g-cursor"/>
      ${dots}
    </svg>`;
  el.onclick = (e) => {
    const r = el.getBoundingClientRect();
    const ply = Math.round(((e.clientX - r.left) / r.width) * n) - 1;
    onPick(Math.max(-1, Math.min(n - 1, ply)));
  };
}

// ---------- Liste des coups ----------
/**
 * @param moves [{san, cls?, timeSpent?}]
 * @param current indice du coup courant (-1 = position initiale)
 */
export function renderMoveList(el, moves, current, onPick, { showTime = false, initialFen = null } = {}) {
  if (!moves.length) {
    el.innerHTML = '<p class="empty">Aucun coup pour l\'instant.</p>';
    return;
  }
  const maxT = Math.max(1, ...moves.map((m) => m.timeSpent || 0));
  const parts = (initialFen || '').split(' ');
  const off = parts[1] === 'b' ? 1 : 0;
  const startNum = +(parts[5] || 1);
  let html = '';
  for (let i = -off; i < moves.length; i += 2) {
    html += `<div class="mrow"><span class="mnum">${startNum + (i + off) / 2}.</span>`;
    for (const j of [i, i + 1]) {
      const m = moves[j];
      if (!m) { html += j < 0 ? '<span class="mv ghost">…</span>' : '<span></span>'; continue; }
      const t = showTime && m.timeSpent != null
        ? `<span class="mtime" title="${m.timeSpent.toFixed(1)} s"><i style="width:${Math.max(4, m.timeSpent / maxT * 100)}%"></i></span>` : '';
      html += `<button class="mv ${j === current ? 'current' : ''}" data-ply="${j}">
        <span class="san">${escapeHtml(m.san)}</span>${m.cls !== undefined ? clsBadge(m.cls, 'sm') : ''}${t}</button>`;
    }
    html += '</div>';
  }
  el.innerHTML = html;
  el.onclick = (e) => {
    const b = e.target.closest('.mv');
    if (b) onPick(+b.dataset.ply);
  };
  const cur = el.querySelector('.mv.current');
  if (cur) cur.scrollIntoView({ block: 'nearest' });
  else el.scrollTop = el.scrollHeight;
}

export function formatDate(ts) {
  if (!ts) return '';
  return new Date(ts).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function initials(name) {
  return String(name || '?').trim().slice(0, 2).toUpperCase();
}

export const TIME_CLASS_FR = { bullet: 'Bullet', blitz: 'Blitz', rapid: 'Rapide', daily: 'Différé', classical: 'Classique', correspondence: 'Différé', ultraBullet: 'Ultrabullet' };
