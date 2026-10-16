// ============================================================
//  Échiquier interactif (composant maison, sans dépendance)
//  - glisser-déposer et clic-clic, coups légaux, promotion
//  - animations des pièces, flèches, surbrillances, badges
// ============================================================

import { clsIcon } from './icons.js';

const FILES = 'abcdefgh';
const SPRITE_URL = new URL('../../assets/pieces.svg', import.meta.url);
let spritePromise = null;

/** Injecte le sprite SVG des pièces une seule fois dans la page. */
export function loadPieceSprite() {
  if (!spritePromise) {
    spritePromise = fetch(SPRITE_URL).then((r) => r.text()).then((svg) => {
      const holder = document.createElement('div');
      holder.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden';
      holder.setAttribute('aria-hidden', 'true');
      holder.innerHTML = svg.replace(/<\?xml[^>]*>/, '');
      document.body.prepend(holder);
    });
  }
  return spritePromise;
}

function pieceSvg(code) {
  return `<svg viewBox="0 0 40 40"><use href="#${code}"></use></svg>`;
}

function parseFenBoard(fen) {
  const map = {};
  fen.split(' ')[0].split('/').forEach((row, r) => {
    let f = 0;
    for (const ch of row) {
      if (/\d/.test(ch)) { f += +ch; continue; }
      const color = ch === ch.toUpperCase() ? 'w' : 'b';
      map[FILES[f] + (8 - r)] = color + ch.toLowerCase();
      f++;
    }
  });
  return map;
}

export class Board {
  /**
   * @param {HTMLElement} el
   * @param {object} opts { orientation, movable ('w'|'b'|'both'|null), showLegal, onMove(from,to,promo) }
   */
  constructor(el, opts = {}) {
    this.el = el;
    this.orientation = opts.orientation || 'w';
    this.movable = opts.movable ?? null;
    this.showLegal = opts.showLegal ?? true;
    this.onMove = opts.onMove || (() => false);
    this.fen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
    this.pieces = new Map(); // id -> {el, code, sq}
    this.nextId = 1;
    this.selected = null;
    this.lastMove = null;
    this.badge = null;
    this.arrows = [];
    this.marks = {};
    this._build();
    this.setPosition(this.fen);
  }

  _build() {
    this.el.classList.add('board');
    this.el.innerHTML = `
      <div class="board-squares"></div>
      <div class="board-pieces"></div>
      <svg class="board-arrows" viewBox="0 0 8 8" preserveAspectRatio="none"></svg>
      <div class="board-promo" hidden></div>`;
    this.sqLayer = this.el.querySelector('.board-squares');
    this.pcLayer = this.el.querySelector('.board-pieces');
    this.arrowLayer = this.el.querySelector('.board-arrows');
    this.promoLayer = this.el.querySelector('.board-promo');
    this._renderSquares();
    this.el.addEventListener('pointerdown', (e) => this._onDown(e));
    this.el.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  _coords(sq) {
    const f = FILES.indexOf(sq[0]);
    const r = +sq[1] - 1;
    return this.orientation === 'w' ? { col: f, row: 7 - r } : { col: 7 - f, row: r };
  }

  _squareAt(clientX, clientY) {
    const rect = this.el.getBoundingClientRect();
    const col = Math.floor(((clientX - rect.left) / rect.width) * 8);
    const row = Math.floor(((clientY - rect.top) / rect.height) * 8);
    if (col < 0 || col > 7 || row < 0 || row > 7) return null;
    const f = this.orientation === 'w' ? col : 7 - col;
    const r = this.orientation === 'w' ? 7 - row : row;
    return FILES[f] + (r + 1);
  }

  _renderSquares() {
    let html = '';
    for (let row = 0; row < 8; row++) {
      for (let col = 0; col < 8; col++) {
        const f = this.orientation === 'w' ? col : 7 - col;
        const r = this.orientation === 'w' ? 7 - row : row;
        const sq = FILES[f] + (r + 1);
        const light = (f + r) % 2 === 1;
        let coords = '';
        if (col === 0) coords += `<span class="coord rank">${r + 1}</span>`;
        if (row === 7) coords += `<span class="coord file">${FILES[f]}</span>`;
        html += `<div class="sq ${light ? 'light' : 'dark'}" data-sq="${sq}">${coords}</div>`;
      }
    }
    this.sqLayer.innerHTML = html;
    this._applyMarks();
  }

  _placeEl(el, sq) {
    const { col, row } = this._coords(sq);
    el.style.transform = `translate(${col * 100}%, ${row * 100}%)`;
  }

  /** Met à jour la position (avec animation des pièces déplacées). */
  setPosition(fen, { lastMove = null, animate = true } = {}) {
    this.fen = fen;
    this.lastMove = lastMove;
    this.selected = null;
    const target = parseFenBoard(fen);
    const old = [...this.pieces.entries()].map(([id, p]) => ({ id, ...p }));
    const used = new Set();
    const placed = {};

    // 1) Pièces restées sur place
    for (const [sq, code] of Object.entries(target)) {
      const keep = old.find((p) => !used.has(p.id) && p.sq === sq && p.code === code);
      if (keep) { used.add(keep.id); placed[sq] = keep.id; }
    }
    // 2) Pièces déplacées : on réutilise la plus proche du même type
    for (const [sq, code] of Object.entries(target)) {
      if (placed[sq]) continue;
      const to = this._coords(sq);
      let best = null, bestD = Infinity;
      for (const p of old) {
        if (used.has(p.id) || p.code !== code || target[p.sq] === code) continue;
        const from = this._coords(p.sq);
        const d = Math.abs(from.col - to.col) + Math.abs(from.row - to.row);
        if (d < bestD) { bestD = d; best = p; }
      }
      if (best) {
        used.add(best.id);
        placed[sq] = best.id;
        const rec = this.pieces.get(best.id);
        rec.sq = sq;
        rec.el.classList.toggle('no-anim', !animate);
        this._placeEl(rec.el, sq);
      }
    }
    // 3) Pièces disparues
    for (const p of old) {
      if (!used.has(p.id)) {
        const rec = this.pieces.get(p.id);
        rec.el.classList.add('captured');
        setTimeout(() => rec.el.remove(), animate ? 160 : 0);
        this.pieces.delete(p.id);
      }
    }
    // 4) Nouvelles pièces
    for (const [sq, code] of Object.entries(target)) {
      if (placed[sq]) continue;
      const el = document.createElement('div');
      el.className = 'piece no-anim';
      el.dataset.code = code;
      el.innerHTML = pieceSvg(code);
      this._placeEl(el, sq);
      this.pcLayer.appendChild(el);
      const id = this.nextId++;
      this.pieces.set(id, { el, code, sq });
      requestAnimationFrame(() => el.classList.remove('no-anim'));
    }
    for (const rec of this.pieces.values()) {
      if (!animate) rec.el.classList.add('no-anim');
      else requestAnimationFrame(() => rec.el.classList.remove('no-anim'));
    }
    this._applyMarks();
  }

  setOrientation(color) {
    if (color === this.orientation) return;
    this.orientation = color;
    this._renderSquares();
    for (const rec of this.pieces.values()) {
      rec.el.classList.add('no-anim');
      this._placeEl(rec.el, rec.sq);
    }
    this._drawArrows();
    this._applyMarks();
  }

  flip() { this.setOrientation(this.orientation === 'w' ? 'b' : 'w'); }

  setMovable(color) { this.movable = color; this.selected = null; this._applyMarks(); }

  /** Flèches : [{from, to, kind:'best'|'played'|'hint'|'threat'}] */
  setArrows(arrows = []) { this.arrows = arrows; this._drawArrows(); }

  /** Badge de classification sur une case : {square, cls, sym} */
  setBadge(badge) { this.badge = badge; this._applyMarks(); }

  /** Marques ponctuelles : {square: 'hint'|'wrong'|'right'} */
  setMarks(marks = {}) { this.marks = marks; this._applyMarks(); }

  _applyMarks() {
    if (!this.sqLayer) return;
    const g = new globalThis.Chess(this.fen);
    const checkSq = g.in_check() ? this._kingSquare(g.turn()) : null;
    let legalTargets = [];
    if (this.selected && this.showLegal) {
      legalTargets = g.moves({ square: this.selected, verbose: true }).map((m) => ({ to: m.to, cap: !!m.captured || m.flags.includes('e') }));
    }
    for (const el of this.sqLayer.children) {
      const sq = el.dataset.sq;
      el.classList.toggle('last', !!this.lastMove && (this.lastMove[0] === sq || this.lastMove[1] === sq));
      el.classList.toggle('selected', this.selected === sq);
      el.classList.toggle('check', checkSq === sq);
      const t = legalTargets.find((x) => x.to === sq);
      el.classList.toggle('target', !!t && !t.cap);
      el.classList.toggle('target-cap', !!t && t.cap);
      el.dataset.mark = this.marks[sq] || '';
      let b = el.querySelector('.sq-badge');
      if (this.badge && this.badge.square === sq) {
        if (!b) { b = document.createElement('span'); el.appendChild(b); }
        if (b.dataset.cls !== this.badge.cls) {
          b.className = 'sq-badge';
          b.dataset.cls = this.badge.cls;
          b.innerHTML = clsIcon(this.badge.cls);
        }
      } else if (b) b.remove();
    }
  }

  _kingSquare(color) {
    const map = parseFenBoard(this.fen);
    return Object.keys(map).find((sq) => map[sq] === color + 'k');
  }

  _drawArrows() {
    const parts = [`<defs>${['best', 'played', 'hint', 'threat'].map((k) =>
      `<marker id="ah-${k}-${this._uid()}" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="2.6" markerHeight="2.6" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" class="ah ah-${k}"/></marker>`).join('')}</defs>`];
    for (const a of this.arrows) {
      const f = this._coords(a.from), t = this._coords(a.to);
      const x1 = f.col + 0.5, y1 = f.row + 0.5, x2 = t.col + 0.5, y2 = t.row + 0.5;
      const len = Math.hypot(x2 - x1, y2 - y1);
      const shorten = 0.32;
      const ex = x2 - ((x2 - x1) / len) * shorten, ey = y2 - ((y2 - y1) / len) * shorten;
      parts.push(`<line x1="${x1}" y1="${y1}" x2="${ex}" y2="${ey}" class="arrow arrow-${a.kind || 'best'}" marker-end="url(#ah-${a.kind || 'best'}-${this._uid()})"/>`);
    }
    this.arrowLayer.innerHTML = parts.join('');
  }

  _uid() { return this.__uid || (this.__uid = Math.random().toString(36).slice(2, 7)); }

  _canMove(sq) {
    if (!this.movable) return false;
    const code = parseFenBoard(this.fen)[sq];
    if (!code) return false;
    const turn = this.fen.split(' ')[1];
    if (code[0] !== turn) return false;
    return this.movable === 'both' || this.movable === code[0];
  }

  _pieceAt(sq) {
    for (const rec of this.pieces.values()) if (rec.sq === sq) return rec;
    return null;
  }

  _onDown(e) {
    if (e.button !== 0 || !this.promoLayer.hidden) return;
    const sq = this._squareAt(e.clientX, e.clientY);
    if (!sq) return;

    // Clic-clic : une pièce est déjà sélectionnée
    if (this.selected && sq !== this.selected && !this._canMove(sq)) {
      const from = this.selected;
      this.selected = null;
      this._tryMove(from, sq);
      return;
    }
    if (!this._canMove(sq)) { this.selected = null; this._applyMarks(); return; }

    this.selected = sq;
    this._applyMarks();
    const rec = this._pieceAt(sq);
    if (!rec) return;

    // Glisser-déposer
    e.preventDefault();
    const rect = this.el.getBoundingClientRect();
    const size = rect.width / 8;
    const el = rec.el;
    el.classList.add('dragging', 'no-anim');
    const move = (ev) => {
      const x = ev.clientX - rect.left - size / 2, y = ev.clientY - rect.top - size / 2;
      el.style.transform = `translate(${x}px, ${y}px)`;
    };
    const up = (ev) => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      el.classList.remove('dragging');
      const to = this._squareAt(ev.clientX, ev.clientY);
      this._placeEl(el, rec.sq);
      if (to && to !== sq) {
        this.selected = null;
        this._tryMove(sq, to, true);
      }
    };
    move(e);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }

  async _tryMove(from, to) {
    const g = new globalThis.Chess(this.fen);
    const legal = g.moves({ square: from, verbose: true }).filter((m) => m.to === to);
    if (!legal.length) { this._applyMarks(); return; }
    let promo;
    if (legal.some((m) => m.promotion)) {
      promo = await this._askPromotion(to, g.turn());
      if (!promo) { this._applyMarks(); return; }
    }
    const ok = await this.onMove(from, to, promo);
    if (!ok) this.setPosition(this.fen, { lastMove: this.lastMove, animate: true });
  }

  _askPromotion(sq, color) {
    return new Promise((resolve) => {
      const { col } = this._coords(sq);
      const fromTop = this._coords(sq).row === 0;
      this.promoLayer.innerHTML = ['q', 'n', 'r', 'b'].map((p, i) => {
        const row = fromTop ? i : 7 - i;
        return `<button class="promo-choice" data-p="${p}" style="transform:translate(${col * 100}%, ${row * 100}%)">${pieceSvg(color + p)}</button>`;
      }).join('');
      this.promoLayer.hidden = false;
      const done = (p) => { this.promoLayer.hidden = true; this.promoLayer.innerHTML = ''; resolve(p); };
      this.promoLayer.onclick = (e) => {
        const b = e.target.closest('.promo-choice');
        done(b ? b.dataset.p : null);
      };
    });
  }
}
