// ============================================================
//  PGN — lecture robuste (Chess.com, Lichess, PGN collé)
//  Gère : en-têtes, commentaires {...} et ;, variantes (...),
//  NAG $n, horloges [%clk h:mm:ss], FEN de départ.
// ============================================================

const Chess = () => globalThis.Chess;

/** Découpe un texte contenant plusieurs parties PGN. */
export function splitPgnGames(text) {
  const norm = text.replace(/\r\n?/g, '\n').trim();
  if (!norm) return [];
  const parts = [];
  let current = [];
  let inMoves = false;
  for (const line of norm.split('\n')) {
    const isHeader = /^\s*\[\w+\s+".*"\]\s*$/.test(line);
    if (isHeader && inMoves) {
      parts.push(current.join('\n'));
      current = [];
      inMoves = false;
    }
    if (!isHeader && line.trim()) inMoves = true;
    current.push(line);
  }
  if (current.join('').trim()) parts.push(current.join('\n'));
  return parts;
}

function parseClock(comment) {
  const m = /\[%clk\s+(\d+):(\d+):(\d+(?:\.\d+)?)\]/.exec(comment);
  if (!m) return null;
  return (+m[1]) * 3600 + (+m[2]) * 60 + parseFloat(m[3]);
}

/** Parse une partie PGN → { headers, sans: [{san, clock}], result } */
export function parsePgn(text) {
  const headers = {};
  const headerRe = /^\s*\[(\w+)\s+"((?:[^"\\]|\\.)*)"\]\s*$/gm;
  let m;
  while ((m = headerRe.exec(text))) headers[m[1]] = m[2].replace(/\\"/g, '"');

  const body = text.replace(/^\s*\[\w+\s+".*"\]\s*$/gm, ' ');
  const sans = [];
  let result = headers.Result || '*';
  let i = 0;
  let depth = 0; // profondeur des variantes

  while (i < body.length) {
    const ch = body[i];
    if (ch === '{') {
      const end = body.indexOf('}', i);
      const comment = body.slice(i + 1, end === -1 ? body.length : end);
      if (depth === 0 && sans.length) {
        const clk = parseClock(comment);
        if (clk !== null) sans[sans.length - 1].clock = clk;
      }
      i = end === -1 ? body.length : end + 1;
      continue;
    }
    if (ch === ';') {
      const end = body.indexOf('\n', i);
      i = end === -1 ? body.length : end + 1;
      continue;
    }
    if (ch === '(') { depth++; i++; continue; }
    if (ch === ')') { depth = Math.max(0, depth - 1); i++; continue; }
    if (/\s/.test(ch)) { i++; continue; }

    // Lire un jeton
    let j = i;
    while (j < body.length && !/[\s{}();]/.test(body[j])) j++;
    const tok = body.slice(i, j);
    i = j;
    if (depth > 0) continue;
    if (/^(1-0|0-1|1\/2-1\/2|\*)$/.test(tok)) { result = tok; continue; }
    if (/^\$\d+$/.test(tok)) continue;
    let t = tok.replace(/^\d+\.(\.\.)?/, '');           // "12." ou "12..."
    if (!t || /^\.+$/.test(t)) continue;
    t = t.replace(/[!?]+$/, '').replace(/^0-0-0/, 'O-O-O').replace(/^0-0/, 'O-O');
    if (!t) continue;
    sans.push({ san: t, clock: null });
  }
  return { headers, sans, result };
}

/** Rejoue les coups SAN et produit une partie exploitable par l'analyse. */
export function buildGame(parsed) {
  const C = Chess();
  const startFen = parsed.headers.FEN || undefined;
  const game = startFen ? new C(startFen) : new C();
  const initialFen = game.fen();
  const moves = [];

  for (const { san, clock } of parsed.sans) {
    const fenBefore = game.fen();
    const legalCount = game.moves().length;
    const mv = game.move(san, { sloppy: true }) || game.move(san.replace(/[+#]/g, ''), { sloppy: true });
    if (!mv) throw new Error(`Coup illégal ou illisible : « ${san} » (coup ${moves.length + 1})`);
    moves.push({
      ply: moves.length,
      san: mv.san,
      uci: mv.from + mv.to + (mv.promotion || ''),
      from: mv.from, to: mv.to, promotion: mv.promotion || null,
      color: mv.color, piece: mv.piece, captured: mv.captured || null,
      flags: mv.flags,
      fenBefore, fenAfter: game.fen(),
      legalCount, clock,
    });
  }

  const terminal = {
    checkmate: game.in_checkmate(),
    stalemate: game.in_stalemate(),
    draw: game.in_draw() || game.in_threefold_repetition() || game.insufficient_material(),
  };

  return { headers: parsed.headers, result: parsed.result, initialFen, moves, terminal };
}

/** Raccourci : texte PGN → partie construite. */
export function gameFromPgn(text) {
  return buildGame(parsePgn(text));
}

/** Calcule le temps passé par coup à partir des horloges et de la cadence ("180+2"). */
export function computeTimeSpent(game) {
  const tc = game.headers.TimeControl || '';
  const mt = /^(\d+)(?:\+(\d+))?$/.exec(tc);
  if (!mt) return;
  const base = +mt[1], inc = +(mt[2] || 0);
  const last = { w: base, b: base };
  for (const m of game.moves) {
    if (m.clock == null) { m.timeSpent = null; continue; }
    m.timeSpent = Math.max(0, last[m.color] - m.clock + inc);
    last[m.color] = m.clock;
  }
}

/** Exporte une liste de coups SAN en PGN. */
export function toPgn(headers, sanList, result = '*', initialFen = null) {
  const head = Object.entries(headers).map(([k, v]) => `[${k} "${String(v).replace(/"/g, '\\"')}"]`).join('\n');
  const parts = (initialFen || '').split(' ');
  const off = parts[1] === 'b' ? 1 : 0;
  const start = +(parts[5] || 1);
  let body = off ? `${start}... ` : '';
  sanList.forEach((san, i) => {
    const k = i + off;
    if (k % 2 === 0) body += `${start + k / 2}. `;
    body += san + ' ';
  });
  return `${head}\n\n${body}${result}\n`;
}
