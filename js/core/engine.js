// ============================================================
//  Pilote UCI pour Stockfish exécuté dans un Web Worker.
//  - File d'attente : une seule recherche à la fois
//  - Scores normalisés du point de vue des Blancs
//  - MultiPV pour connaître les meilleures alternatives
// ============================================================

function defaultWorkerFactory() {
  const base = new URL('../../vendor/stockfish/', import.meta.url);
  const wasm = typeof WebAssembly === 'object' &&
    WebAssembly.validate(Uint8Array.of(0x0, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00));
  return new Worker(new URL(wasm ? 'stockfish.wasm.js' : 'stockfish.js', base));
}

export class Engine {
  constructor({ createWorker = defaultWorkerFactory, hash = 16 } = {}) {
    this.createWorker = createWorker;
    this.hash = hash;
    this.worker = null;
    this.queue = [];
    this.current = null;
    this.readyPromise = null;
    this.waiters = [];
  }

  /** Démarre le worker (une seule fois) et attend « readyok ». */
  init() {
    if (this.readyPromise) return this.readyPromise;
    this.readyPromise = new Promise((resolve, reject) => {
      try {
        this.worker = this.createWorker();
      } catch (e) {
        reject(e);
        return;
      }
      const onMsg = (e) => String(e.data).split('\n').forEach((l) => this._onLine(l.trim()));
      if (this.worker.addEventListener) this.worker.addEventListener('message', onMsg);
      else this.worker.onmessage = onMsg;
      if (this.worker.addEventListener) this.worker.addEventListener('error', (e) => reject(e));

      this._expect('uciok', () => {
        this._send(`setoption name Hash value ${this.hash}`);
        this._expect('readyok', resolve);
        this._send('isready');
      });
      this._send('uci');
    });
    return this.readyPromise;
  }

  _send(cmd) { this.worker.postMessage(cmd); }

  _expect(token, cb) { this.waiters.push({ token, cb }); }

  _onLine(line) {
    if (!line) return;
    const w = this.waiters.findIndex((x) => line.startsWith(x.token));
    if (w !== -1) {
      const [{ cb }] = this.waiters.splice(w, 1);
      cb(line);
      return;
    }
    const job = this.current;
    if (!job) return;
    if (line.startsWith('info') && line.includes(' pv ')) this._parseInfo(job, line);
    else if (line.startsWith('bestmove')) this._finish(job, line);
  }

  _parseInfo(job, line) {
    const tok = line.split(/\s+/);
    const get = (k) => { const i = tok.indexOf(k); return i === -1 ? null : tok[i + 1]; };
    if (tok.includes('lowerbound') || tok.includes('upperbound')) return;
    const depth = +get('depth');
    const mpv = +(get('multipv') || 1);
    const pvIdx = tok.indexOf('pv');
    const pv = tok.slice(pvIdx + 1);
    const sIdx = tok.indexOf('score');
    const kind = tok[sIdx + 1];
    let val = +tok[sIdx + 2];
    // Score relatif au trait → on le ramène au point de vue des Blancs
    if (job.blackToMove) val = -val;
    const entry = { depth, multipv: mpv, pv, uci: pv[0] };
    if (kind === 'mate') entry.mate = val; else entry.cp = val;
    job.lines[mpv - 1] = entry;
    job.depthReached = Math.max(job.depthReached, depth);
    if (job.onInfo) job.onInfo(entry);
  }

  _finish(job, line) {
    const best = line.split(/\s+/)[1];
    const lines = job.lines.filter(Boolean);
    this.current = null;
    job.resolve({ fen: job.fen, bestmove: best === '(none)' ? null : best, lines, depth: job.depthReached });
    this._next();
  }

  _next() {
    if (this.current || !this.queue.length) return;
    const job = this.queue.shift();
    this.current = job;
    this._send(`setoption name MultiPV value ${job.multipv}`);
    if (job.skill != null) this._send(`setoption name Skill Level value ${job.skill}`);
    this._send(`position fen ${job.fen}`);
    this._send(job.movetime ? `go movetime ${job.movetime}` : `go depth ${job.depth}`);
  }

  /**
   * Analyse une position.
   * @returns Promise<{bestmove, lines:[{uci, pv, cp|mate, depth}], depth}>
   */
  async analyse(fen, { depth = 12, multipv = 1, movetime = null, skill = null, onInfo = null } = {}) {
    await this.init();
    return new Promise((resolve, reject) => {
      this.queue.push({
        fen, depth, multipv, movetime, skill, onInfo, resolve, reject,
        blackToMove: fen.split(' ')[1] === 'b', lines: [], depthReached: 0,
      });
      this._next();
    });
  }

  /** Annule tout le travail en attente (la recherche en cours se termine proprement). */
  cancelAll() {
    const pending = this.queue.splice(0);
    pending.forEach((j) => j.reject(new Error('cancelled')));
    if (this.current) this._send('stop');
  }

  /** Arrête immédiatement tout (file + recherche en cours). */
  stop() { this.cancelAll(); }

  get busy() { return !!this.current || this.queue.length > 0; }

  newGame() {
    if (this.worker) this._send('ucinewgame');
  }

  terminate() {
    if (this.worker) this.worker.terminate();
    this.worker = null;
    this.readyPromise = null;
  }
}
