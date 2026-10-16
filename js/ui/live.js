// ============================================================
//  Analyse en continu d'une position (lignes moteur progressives)
//  Utilisé par l'exploration libre de la vue Analyse.
// ============================================================

export class LiveAnalysis {
  /**
   * @param engine instance d'Engine dédiée
   * @param onUpdate (state) appelé à chaque nouvelle information (limité à ~8/s)
   */
  constructor(engine, onUpdate) {
    this.engine = engine;
    this.onUpdate = onUpdate;
    this.token = 0;
    this.cache = new Map(); // fen → { lines, depth }
    this.enabled = true;
    this.maxDepth = 20;
    this.multipv = 3;
  }

  start(fen) {
    const token = ++this.token;
    this.fen = fen;
    const g = new globalThis.Chess(fen);
    if (g.game_over()) {
      this.engine.stop();
      this.onUpdate({ fen, lines: [], depth: 0, done: true, over: true });
      return;
    }
    const cached = this.cache.get(fen);
    if (cached) this.onUpdate({ fen, ...cached, done: cached.depth >= this.maxDepth });
    if (!this.enabled || (cached && cached.depth >= this.maxDepth)) { this.engine.stop(); return; }

    this.engine.stop();
    const lines = [];
    let last = 0;
    let depth = 0;
    const emit = (done) => {
      if (token !== this.token) return;
      const snap = { lines: lines.filter(Boolean).map((l) => ({ ...l })), depth };
      const prev = this.cache.get(fen);
      if (!prev || prev.depth <= depth) this.cache.set(fen, snap);
      this.onUpdate({ fen, ...snap, done });
    };
    this.engine.analyse(fen, {
      depth: this.maxDepth,
      multipv: Math.min(this.multipv, g.moves().length),
      onInfo: (entry) => {
        if (token !== this.token) return;
        // On ne publie une profondeur que lorsqu'elle est complète pour la ligne 1
        if (entry.multipv === 1) depth = entry.depth;
        lines[entry.multipv - 1] = entry;
        const now = performance.now();
        if (now - last > 120) { last = now; emit(false); }
      },
    }).then(() => emit(true)).catch(() => { /* annulé */ });
  }

  stop() {
    this.token++;
    this.engine.stop();
  }

  setEnabled(on) {
    this.enabled = on;
    if (!on) this.stop();
    else if (this.fen) this.start(this.fen);
  }
}
