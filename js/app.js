// ============================================================
//  Fianchetto — point d'entrée
// ============================================================

import { Engine } from './core/engine.js';
import { buildOpeningIndex } from './core/openings.js';
import { loadPieceSprite } from './ui/board.js';
import { injectIconSprite } from './ui/icons.js';
import { $, $$, toast } from './ui/common.js';
import { store } from './store.js';
import * as play from './views/play.js';
import * as analysis from './views/analysis.js';
import * as puzzles from './views/puzzles.js';
import * as profile from './views/profile.js';

const VIEWS = { jouer: play, analyse: analysis, problemes: puzzles, profil: profile };

export const engines = {
  play: new Engine(),      // coups des bots
  analysis: new Engine(),  // classification en direct, rapports, problèmes
  live: new Engine(),      // lignes moteur continues de l'exploration
};

export const app = {
  engines,
  go(view, params) {
    showView(view, params);
    if (location.hash.slice(1) !== view) history.pushState(null, '', '#' + view);
  },
  refreshHeader,
};

function setEngineStatus(state, text) {
  const pill = $('#engine-status');
  pill.dataset.state = state;
  pill.querySelector('.label').textContent = text;
}

async function bootEngines() {
  setEngineStatus('loading', 'Chargement du moteur…');
  try {
    await Promise.all([engines.play.init(), engines.analysis.init(), engines.live.init()]);
    setEngineStatus('ready', 'Stockfish prêt');
  } catch (e) {
    console.error(e);
    setEngineStatus('error', 'Moteur indisponible');
    toast('Le moteur n\'a pas pu démarrer. Ouvre le site via un serveur web (voir README), pas en double-cliquant le fichier.', 'error', 9000);
  }
}

function refreshHeader() {
  $('#hdr-elo').textContent = store.profile.elo;
  $('#hdr-puzzle').textContent = store.profile.puzzleElo;
  document.documentElement.dataset.board = store.settings.boardTheme;
}

let current = null;
function showView(name, params) {
  if (!VIEWS[name]) name = 'jouer';
  $$('.view').forEach((v) => v.classList.toggle('active', v.id === `view-${name}`));
  $$('[data-nav]').forEach((a) => a.classList.toggle('active', a.dataset.nav === name));
  if (current && current !== VIEWS[name] && current.onHide) current.onHide();
  current = VIEWS[name];
  if (current.onShow) current.onShow(params);
  window.scrollTo({ top: 0 });
}

async function main() {
  buildOpeningIndex();
  refreshHeader();
  injectIconSprite();
  await loadPieceSprite();
  for (const v of Object.values(VIEWS)) v.init(app);

  $$('[data-nav]').forEach((a) => a.addEventListener('click', (e) => {
    e.preventDefault();
    app.go(a.dataset.nav);
  }));
  window.addEventListener('hashchange', () => showView(location.hash.slice(1)));
  document.addEventListener('keydown', (e) => {
    if (/input|textarea|select/i.test(e.target.tagName)) return;
    if (current && current.onKey) current.onKey(e);
  });

  showView(location.hash.slice(1) || 'jouer');
  document.body.classList.remove('booting');
  bootEngines();
}

main();
