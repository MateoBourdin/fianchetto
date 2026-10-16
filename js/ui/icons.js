// ============================================================
//  Jeu d'icônes Fianchetto — qualité des coups
//  Hexagone arrondi à dégradé + pictogramme blanc dessiné.
//  Injecté une fois dans la page comme sprite SVG (<symbol>).
// ============================================================

const HEX = 'M12 1.6 21 6.8v10.4L12 22.4 3 17.2V6.8z';

export const ICON_COLORS = {
  brilliant:  ['#d8b4fe', '#9b5cf0'],
  great:      ['#7dd3fc', '#1e93d6'],
  best:       ['#5eead4', '#0fa597'],
  excellent:  ['#86efac', '#22b35e'],
  good:       ['#c3d4b8', '#7f9672'],
  book:       ['#e8c39e', '#b07d4a'],
  forced:     ['#b6c2d3', '#6b7a90'],
  inaccuracy: ['#fde68a', '#e0a800'],
  mistake:    ['#fdba74', '#ea6c12'],
  miss:       ['#f9a8d4', '#d9468f'],
  blunder:    ['#fca5a5', '#d42626'],
};

// Pictogrammes (blancs), dessinés dans une zone 6–18
const GLYPHS = {
  // Gemme taillée
  brilliant: `<path d="M7 10.2 9.4 7h5.2l2.4 3.2L12 17.6z" fill="#fff"/>
    <path d="M7 10.2h10M9.4 7l2.6 3.2L14.6 7M12 10.2v7.4" stroke="var(--g)" stroke-width=".9" fill="none" stroke-linejoin="round"/>
    <path d="M17.6 5.4v1.8M16.7 6.3h1.8" stroke="#fff" stroke-width="1.1" stroke-linecap="round"/>`,
  // Cible : le seul coup juste
  great: `<circle cx="12" cy="12" r="5.4" fill="none" stroke="#fff" stroke-width="2"/>
    <circle cx="12" cy="12" r="2" fill="#fff"/>`,
  // Couronne
  best: `<path d="M6.6 15.2 7.4 8.6l2.8 2.7L12 7.4l1.8 3.9 2.8-2.7.8 6.6z" fill="#fff" stroke="#fff" stroke-width=".8" stroke-linejoin="round"/>
    <rect x="6.6" y="16.1" width="10.8" height="1.8" rx=".9" fill="#fff"/>`,
  // Coche appuyée
  excellent: `<path d="M7.3 12.4l3.2 3.2 6.2-6.8" fill="none" stroke="#fff" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>`,
  // Coche fine dans un anneau
  good: `<circle cx="12" cy="12" r="5.6" fill="none" stroke="#fff" stroke-width="1.5" opacity=".9"/>
    <path d="M9.3 12.2l1.9 1.9 3.6-3.9" fill="none" stroke="#fff" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/>`,
  // Boussole : chemin balisé de la théorie
  book: `<circle cx="12" cy="12" r="5.6" fill="none" stroke="#fff" stroke-width="1.6"/>
    <path d="M14.4 9.6 12.9 12.9 9.6 14.4 11.1 11.1z" fill="#fff"/>`,
  // Double chevron
  forced: `<path d="M8 8.2 11.8 12 8 15.8M12.4 8.2l3.8 3.8-3.8 3.8" fill="none" stroke="#fff" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"/>`,
  // ?!
  inaccuracy: `<path d="M7.3 9.5a2.5 2.5 0 1 1 3.5 2.3c-.75.35-1.15.95-1.15 1.75v.5" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round"/>
    <circle cx="9.65" cy="16.6" r="1.15" fill="#fff"/>
    <path d="M15.2 7.6v6.3" stroke="#fff" stroke-width="2.2" stroke-linecap="round"/>
    <circle cx="15.2" cy="16.6" r="1.15" fill="#fff"/>`,
  // ?
  mistake: `<path d="M9.2 9.4a2.85 2.85 0 1 1 4 2.6c-.85.4-1.3 1.1-1.3 2v.6" fill="none" stroke="#fff" stroke-width="2.3" stroke-linecap="round"/>
    <circle cx="11.9" cy="17" r="1.3" fill="#fff"/>`,
  // Cible manquée
  miss: `<circle cx="12" cy="12" r="5.2" fill="none" stroke="#fff" stroke-width="1.8"/>
    <path d="M7.6 16.4 16.4 7.6" stroke="#fff" stroke-width="2" stroke-linecap="round"/>`,
  // ??
  blunder: `<path d="M6.4 9.3a2.4 2.4 0 1 1 3.35 2.2c-.7.33-1.1.9-1.1 1.65v.45" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round"/>
    <circle cx="8.65" cy="16.6" r="1.1" fill="#fff"/>
    <path d="M12.9 9.3a2.4 2.4 0 1 1 3.35 2.2c-.7.33-1.1.9-1.1 1.65v.45" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round"/>
    <circle cx="15.15" cy="16.6" r="1.1" fill="#fff"/>`,
};

/** Code SVG d'une icône autonome (utilisée aussi pour la carte de partage). */
export function iconStandalone(cls, size = 24) {
  const [top, bottom] = ICON_COLORS[cls];
  const id = `g-${cls}-${Math.random().toString(36).slice(2, 6)}`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="${size}" height="${size}">
    <defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${top}"/><stop offset="1" stop-color="${bottom}"/></linearGradient>
    <filter id="ic-shadow" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy=".5" stdDeviation=".35" flood-color="#000" flood-opacity=".28"/></filter></defs>
    ${symbolBody(cls, `url(#${id})`, bottom)}
  </svg>`;
}

function symbolBody(cls, fill, bottom) {
  return `<path d="${HEX}" fill="${fill}" stroke="${fill}" stroke-width="2.2" stroke-linejoin="round"/>
    <path d="${HEX}" fill="none" stroke="rgba(0,0,0,.18)" stroke-width=".6" stroke-linejoin="round"/>
    <path d="M12 3.2 19.4 7.5" stroke="rgba(255,255,255,.35)" stroke-width=".9" stroke-linecap="round"/>
    <g filter="url(#ic-shadow)">${GLYPHS[cls].replace(/var\(--g\)/g, bottom)}</g>`;
}

let injected = false;
/** Injecte le sprite des icônes dans le document (une seule fois). */
export function injectIconSprite() {
  if (injected || typeof document === 'undefined') return;
  injected = true;
  const grads = Object.entries(ICON_COLORS).map(([k, [t, b]]) =>
    `<linearGradient id="icg-${k}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${t}"/><stop offset="1" stop-color="${b}"/></linearGradient>`).join('');
  const symbols = Object.keys(GLYPHS).map((k) =>
    `<symbol id="ic-${k}" viewBox="0 0 24 24">${symbolBody(k, `url(#icg-${k})`, ICON_COLORS[k][1])}</symbol>`).join('');
  const holder = document.createElement('div');
  holder.setAttribute('aria-hidden', 'true');
  holder.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden';
  holder.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg"><defs>${grads}
    <filter id="ic-shadow" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy=".5" stdDeviation=".35" flood-color="#000" flood-opacity=".28"/></filter>
    </defs>${symbols}</svg>`;
  document.body.prepend(holder);
}

/** Icône utilisable dans le HTML. */
export function clsIcon(cls, extra = '') {
  return `<svg class="ic ${extra}" viewBox="0 0 24 24" aria-hidden="true"><use href="#ic-${cls}"></use></svg>`;
}

export const ICON_KEYS = Object.keys(GLYPHS);
