// ============================================================
//  Persistance locale (localStorage) : profil, réglages,
//  historique des parties et rapports d'analyse.
// ============================================================

const KEY = 'fianchetto:v1';
const REVIEW_PREFIX = 'fianchetto:review:';
const MAX_REVIEWS = 40;

const DEFAULTS = {
  profile: {
    elo: 1200, games: 0, wins: 0, draws: 0, losses: 0,
    puzzleElo: 1200, puzzleSolved: 0, puzzleFailed: 0, puzzleStreak: 0, puzzleBestStreak: 0,
    eloHistory: [],
  },
  settings: {
    boardTheme: 'sable', liveClassify: true, showEvalBar: true, showLegal: true,
    reviewDepth: 14, liveLines: true, showBestArrow: true, chesscomUser: '', lichessUser: '', puzzleTheme: 'mix', puzzleDifficulty: 'normal',
  },
  history: [], // { id, date, white, black, result, source, accW, accB, opening, userColor }
};

function safeGet(k) { try { return localStorage.getItem(k); } catch { return null; } }
function safeSet(k, v) { try { localStorage.setItem(k, v); return true; } catch { return false; } }
function safeDel(k) { try { localStorage.removeItem(k); } catch { /* ignore */ } }

function load() {
  const raw = safeGet(KEY);
  let data = {};
  try { data = raw ? JSON.parse(raw) : {}; } catch { data = {}; }
  return {
    profile: { ...DEFAULTS.profile, ...(data.profile || {}) },
    settings: { ...DEFAULTS.settings, ...(data.settings || {}) },
    history: Array.isArray(data.history) ? data.history : [],
  };
}

export const store = load();

export function save() { safeSet(KEY, JSON.stringify(store)); }

export function resetAll() {
  store.history.forEach((h) => safeDel(REVIEW_PREFIX + h.id));
  // Efface aussi les rapports orphelins et tout ce qui a été ajouté au store (ex. dernier bilan)
  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i);
      if (k && k.startsWith('fianchetto:')) safeDel(k);
    }
  } catch { /* stockage indisponible */ }
  Object.keys(store).forEach((k) => { if (!(k in DEFAULTS)) delete store[k]; });
  Object.assign(store, JSON.parse(JSON.stringify(DEFAULTS)));
  save();
}

/** Empreinte stable d'une partie (coups + profondeur). */
export function gameId(pgnMoves, depth) {
  let h = 5381;
  const s = pgnMoves.join(' ') + '|' + depth;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

export function saveReview(meta, payload) {
  const data = JSON.stringify(payload);
  let ok = safeSet(REVIEW_PREFIX + meta.id, data);
  // Stockage plein : on libère les plus anciens rapports puis on réessaie
  while (!ok && store.history.length) {
    const old = store.history.pop();
    safeDel(REVIEW_PREFIX + old.id);
    ok = safeSet(REVIEW_PREFIX + meta.id, data);
  }
  store.history = [meta, ...store.history.filter((h) => h.id !== meta.id)];
  while (store.history.length > MAX_REVIEWS) {
    const old = store.history.pop();
    safeDel(REVIEW_PREFIX + old.id);
  }
  save();
  return ok;
}

export function loadReview(id) {
  const raw = safeGet(REVIEW_PREFIX + id);
  try { return raw ? JSON.parse(raw) : null; } catch { return null; }
}

export function deleteReview(id) {
  safeDel(REVIEW_PREFIX + id);
  store.history = store.history.filter((h) => h.id !== id);
  save();
}
