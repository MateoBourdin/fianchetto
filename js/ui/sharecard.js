// ============================================================
//  Carte de partage : image PNG (1200×630, format réseaux sociaux)
//  - « coup » : position + flèche + icône du coup (ex. coup génial)
//  - « partie » : résumé (précisions, compteurs, ouverture)
// ============================================================

import { iconStandalone } from './icons.js';
import { CLASSES } from '../core/review.js';

const W = 1200, H = 630;
const BOARD_THEMES = {
  sable: ['#e6dcc6', '#6d8299'], menthe: ['#e4ecdc', '#6f9a83'],
  nuit: ['#a9b3c6', '#46506a'], corail: ['#f1e3d6', '#c9826b'],
};

const imgCache = new Map();
function loadImage(svg) {
  if (imgCache.has(svg)) return imgCache.get(svg);
  const p = new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  });
  imgCache.set(svg, p);
  return p;
}

function pieceSvg(code) {
  const g = document.getElementById(code);
  if (!g) return null;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40" width="160" height="160">${g.outerHTML}</svg>`;
}

const LOGO = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="128" height="128"><defs><linearGradient id="b" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffd683"/><stop offset="1" stop-color="#ee9f22"/></linearGradient></defs><rect width="32" height="32" rx="8" fill="#151a24"/><path d="M4.5 27.5 27.5 4.5" stroke="#f4b740" stroke-width="5" stroke-linecap="round" opacity=".13"/><rect x="3.4" y="23.6" width="5" height="5" rx="1.2" fill="#f4b740" opacity=".55"/><rect x="23.6" y="3.4" width="5" height="5" rx="1.2" fill="#f4b740" opacity=".55"/><circle cx="16" cy="6.6" r="1.8" fill="url(#b)"/><path d="M16 8.6c3.7 2.3 5.3 5.4 4.5 8.4-.4 1.7-1.9 2.8-4.5 2.8s-4.1-1.1-4.5-2.8c-.8-3 .8-6.1 4.5-8.4z" fill="url(#b)"/><path d="M18.1 11.5 15.3 15" stroke="#151a24" stroke-width="1.6" stroke-linecap="round"/><rect x="12.3" y="20.7" width="7.4" height="1.7" rx=".85" fill="url(#b)"/><path d="M11.4 23.4h9.2l1.6 2.9a.8.8 0 0 1-.7 1.2H10.5a.8.8 0 0 1-.7-1.2z" fill="url(#b)"/></svg>`;

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

async function drawBoard(ctx, fen, x, y, size, { orientation = 'w', lastMove = null, arrow = null, badge = null, theme = 'sable' }) {
  const [light, dark] = BOARD_THEMES[theme] || BOARD_THEMES.sable;
  const sq = size / 8;
  const coords = (s) => {
    const f = 'abcdefgh'.indexOf(s[0]), r = +s[1] - 1;
    return orientation === 'w' ? [f, 7 - r] : [7 - f, r];
  };
  ctx.save();
  roundRect(ctx, x, y, size, size, 14);
  ctx.clip();
  for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
    ctx.fillStyle = (r + c) % 2 === 0 ? light : dark;
    ctx.fillRect(x + c * sq, y + r * sq, sq, sq);
  }
  if (lastMove) {
    ctx.fillStyle = 'rgba(244,183,64,.45)';
    for (const s of lastMove) { const [c, r] = coords(s); ctx.fillRect(x + c * sq, y + r * sq, sq, sq); }
  }
  ctx.restore();

  const rows = fen.split(' ')[0].split('/');
  const jobs = [];
  rows.forEach((row, ri) => {
    let fi = 0;
    for (const ch of row) {
      if (/\d/.test(ch)) { fi += +ch; continue; }
      const code = (ch === ch.toUpperCase() ? 'w' : 'b') + ch.toLowerCase();
      const square = 'abcdefgh'[fi] + (8 - ri);
      const [c, r] = coords(square);
      const svg = pieceSvg(code);
      if (svg) jobs.push(loadImage(svg).then((img) => ctx.drawImage(img, x + c * sq, y + r * sq, sq, sq)));
      fi++;
    }
  });
  await Promise.all(jobs);

  if (arrow) {
    const [c1, r1] = coords(arrow.from), [c2, r2] = coords(arrow.to);
    const x1 = x + (c1 + .5) * sq, y1 = y + (r1 + .5) * sq, x2 = x + (c2 + .5) * sq, y2 = y + (r2 + .5) * sq;
    const ang = Math.atan2(y2 - y1, x2 - x1);
    const head = sq * .42;
    ctx.save();
    ctx.globalAlpha = .85;
    ctx.strokeStyle = ctx.fillStyle = arrow.color || '#2dd4bf';
    ctx.lineWidth = sq * .18;
    ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2 - Math.cos(ang) * head * .8, y2 - Math.sin(ang) * head * .8); ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x2, y2);
    ctx.lineTo(x2 - head * Math.cos(ang - .5), y2 - head * Math.sin(ang - .5));
    ctx.lineTo(x2 - head * Math.cos(ang + .5), y2 - head * Math.sin(ang + .5));
    ctx.closePath(); ctx.fill();
    ctx.restore();
  }
  if (badge) {
    const [c, r] = coords(badge.square);
    const img = await loadImage(iconStandalone(badge.cls, 128));
    const bs = sq * .52;
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,.45)'; ctx.shadowBlur = 10; ctx.shadowOffsetY = 3;
    ctx.drawImage(img, x + (c + 1) * sq - bs * .72, y + r * sq - bs * .28, bs, bs);
    ctx.restore();
  }
}

function background(ctx) {
  ctx.fillStyle = '#0d1017';
  ctx.fillRect(0, 0, W, H);
  const g1 = ctx.createRadialGradient(W * .9, -40, 10, W * .9, -40, 700);
  g1.addColorStop(0, 'rgba(244,183,64,.16)'); g1.addColorStop(1, 'rgba(244,183,64,0)');
  ctx.fillStyle = g1; ctx.fillRect(0, 0, W, H);
  const g2 = ctx.createRadialGradient(0, H + 60, 10, 0, H + 60, 600);
  g2.addColorStop(0, 'rgba(56,189,248,.12)'); g2.addColorStop(1, 'rgba(56,189,248,0)');
  ctx.fillStyle = g2; ctx.fillRect(0, 0, W, H);
}

async function brand(ctx, x, y) {
  const logo = await loadImage(LOGO);
  ctx.drawImage(logo, x, y, 44, 44);
  ctx.fillStyle = '#e8eaef';
  ctx.font = '700 26px Sora, sans-serif';
  ctx.textBaseline = 'middle';
  ctx.fillText('Fianchetto', x + 58, y + 23);
}

function fitText(ctx, text, maxW) {
  if (ctx.measureText(text).width <= maxW) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(t + '…').width > maxW) t = t.slice(0, -1);
  return t + '…';
}

async function ensureFonts() {
  try {
    await Promise.all([document.fonts.load('700 30px Sora'), document.fonts.load('500 20px Sora'), document.fonts.load('600 20px "JetBrains Mono"')]);
  } catch { /* polices de secours */ }
}

/**
 * @param {object} o { kind:'move'|'game', fen, orientation, lastMove, arrow, badge, title, subtitle,
 *   white, black, accW, accB, counts, opening, result, theme }
 * @returns Promise<HTMLCanvasElement>
 */
export async function renderShareCard(o) {
  await ensureFonts();
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d');
  background(ctx);

  const bsize = 530, bx = 50, by = 50;
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,.5)'; ctx.shadowBlur = 40; ctx.shadowOffsetY = 14;
  ctx.fillStyle = '#000'; roundRect(ctx, bx, by, bsize, bsize, 14); ctx.fill();
  ctx.restore();
  await drawBoard(ctx, o.fen, bx, by, bsize, o);

  const tx = 640, tw = W - tx - 60;
  await brand(ctx, tx, 56);

  if (o.kind === 'move') {
    const cls = CLASSES[o.badge.cls];
    const icon = await loadImage(iconStandalone(o.badge.cls, 256));
    ctx.drawImage(icon, tx, 168, 96, 96);
    ctx.fillStyle = '#e8eaef';
    ctx.font = '700 54px Sora, sans-serif';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(cls.label + (o.badge.cls === 'brilliant' ? ' !!' : ''), tx + 116, 236);
    ctx.font = '600 34px "JetBrains Mono", monospace';
    ctx.fillStyle = '#f4b740';
    ctx.fillText(o.title, tx, 330);
    ctx.font = '400 21px Sora, sans-serif';
    ctx.fillStyle = '#aab3c2';
    wrap(ctx, o.subtitle || '', tx, 376, tw, 30, 4);
  } else {
    ctx.fillStyle = '#e8eaef';
    ctx.font = '700 40px Sora, sans-serif';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText('Rapport de partie', tx, 170);
    ctx.font = '400 20px Sora, sans-serif';
    ctx.fillStyle = '#8f99ab';
    ctx.fillText(fitText(ctx, o.opening || '', tw), tx, 204);
    const card = (x, name, acc, me) => {
      ctx.fillStyle = me ? 'rgba(244,183,64,.1)' : '#161b26';
      roundRect(ctx, x, 236, 236, 150, 16); ctx.fill();
      ctx.strokeStyle = me ? 'rgba(244,183,64,.55)' : '#2a3243'; ctx.lineWidth = 2; ctx.stroke();
      ctx.fillStyle = '#e8eaef'; ctx.font = '600 19px Sora, sans-serif';
      ctx.fillText(fitText(ctx, name, 200), x + 18, 272);
      ctx.font = '700 56px "JetBrains Mono", monospace';
      ctx.fillText(acc == null ? '—' : acc.toFixed(1), x + 18, 340);
      ctx.font = '500 14px Sora, sans-serif'; ctx.fillStyle = '#8f99ab';
      ctx.fillText('PRÉCISION', x + 18, 368);
    };
    card(tx, o.white, o.accW, o.userColor === 'w');
    card(tx + 264, o.black, o.accB, o.userColor === 'b');
    const keys = ['brilliant', 'great', 'best', 'mistake', 'blunder'];
    let cx = tx;
    for (const k of keys) {
      const img = await loadImage(iconStandalone(k, 96));
      ctx.drawImage(img, cx, 412, 36, 36);
      ctx.fillStyle = '#e8eaef'; ctx.font = '600 20px "JetBrains Mono", monospace';
      const me = o.userColor || 'w';
      ctx.fillText(String(o.counts[me][k]), cx + 44, 438);
      cx += 100;
    }
    ctx.font = '400 15px Sora, sans-serif'; ctx.fillStyle = '#5d6679';
    ctx.fillText('Compteurs du joueur mis en avant', tx, 476);
  }

  ctx.font = '500 16px Sora, sans-serif';
  ctx.fillStyle = '#5d6679';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(fitText(ctx, o.footer || '', tw), tx, 572);
  return canvas;
}

function wrap(ctx, text, x, y, maxW, lh, maxLines) {
  const words = text.split(' ');
  let line = '', n = 0;
  for (const w of words) {
    const test = line ? line + ' ' + w : w;
    if (ctx.measureText(test).width > maxW && line) {
      ctx.fillText(line, x, y + n * lh);
      line = w; n++;
      if (n >= maxLines) return;
    } else line = test;
  }
  if (line) ctx.fillText(line, x, y + n * lh);
}
