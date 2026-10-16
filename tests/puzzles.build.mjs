import { createRequire } from 'module';
const require = createRequire(import.meta.url);
globalThis.Chess = require('../vendor/chess.js').Chess;
const { Engine } = await import('../js/core/engine.js');
const e = new Engine({ createWorker: require('./sfnode.cjs') });
const C = [
  { name: 'Mat du berger', moves: 'e4 e5 Qh5 Nc6 Bc4 Nf6', sol: 'Qxf7#', rating: 450, themes: ['mat en 1', 'ouverture'] },
  { name: 'Mat du lion', moves: 'f3 e5 g4', sol: 'Qh4#', rating: 400, themes: ['mat en 1'] },
  { name: 'Couloir', fen: '6k1/5ppp/8/8/8/8/5PPP/3R2K1 w - - 0 1', sol: 'Rd8#', rating: 550, themes: ['mat en 1', 'couloir'] },
  { name: 'Piège Caro-Kann', moves: 'e4 c6 d4 d5 Nc3 dxe4 Nxe4 Nd7 Qe2 Ngf6', sol: 'Nd6#', rating: 900, themes: ['mat en 1', 'mat étouffé'] },
  { name: 'Mat de Légal', moves: 'e4 e5 Nf3 d6 Bc4 Bg4 Nc3 g6 Nxe5 Bxd1', sol: 'Bxf7+ Ke7 Nd5#', rating: 1150, themes: ['mat en 2', 'sacrifice'] },
  { name: 'Mat étouffé de Philidor', fen: '2r4k/6pp/7N/8/2Q5/8/8/6K1 w - - 0 1', sol: 'Qg8+ Rxg8 Nf7#', rating: 1250, themes: ['mat en 2', 'mat étouffé', 'sacrifice'] },
  { name: 'Piège Blackburne-Shilling', moves: 'e4 e5 Nf3 Nc6 Bc4 Nd4 Nxe5 Qg5 Nxf7 Qxg2 Rf1 Qxe4+ Be2', sol: 'Nf3#', rating: 1050, themes: ['mat en 1', 'ouverture'] },
  { name: 'Piège Englund', moves: 'd4 e5 dxe5 Nc6 Nf3 Qe7 Bf4 Qb4+ Bd2 Qxb2 Bc3', sol: 'Bb4 Qd2 Bxc3 Qxc3 Qc1#', rating: 1400, themes: ['mat en 3', 'ouverture'] },
  { name: "L'Opéra de Morphy", moves: 'e4 e5 Nf3 d6 d4 Bg4 dxe5 Bxf3 Qxf3 dxe5 Bc4 Nf6 Qb3 Qe7 Nc3 c6 Bg5 b5 Nxb5 cxb5 Bxb5+ Nbd7 O-O-O Rd8 Rxd7 Rxd7 Rd1 Qe6 Bxd7+ Nxd7', sol: 'Qb8+ Nxb8 Rd8#', rating: 1500, themes: ['mat en 2', 'sacrifice', 'classique'] },
  { name: 'Mat de Damiano', fen: '5rk1/6p1/6P1/7Q/8/8/8/6K1 w - - 0 1', sol: 'Qh7+ Kf7? ', rating: 0, themes: [] },
  { name: 'Mat des deux tours', fen: '6k1/8/8/8/8/8/R7/1R4K1 w - - 0 1', sol: 'Rb8+? ', rating: 0, themes: [] },
  { name: 'Fourchette royale', fen: 'r3k3/8/8/8/8/2N5/8/4K3 w - - 0 1', sol: 'Nd5', rating: 0, themes: [] },
  { name: 'Mat Anastasia', fen: '5r1k/4Nppp/8/8/8/8/8/4R1K1 w - - 0 1', sol: 'Rxe8? ', rating: 0, themes: [] },
  { name: 'Mat du couloir (dame)', fen: '1r4k1/5ppp/8/8/8/8/5PPP/1Q4K1 w - - 0 1', sol: 'Qxb8#', rating: 500, themes: ['mat en 1', 'couloir'] },
  { name: 'Mat arabe', fen: '7k/7p/5N2/8/8/8/8/6RK w - - 0 1', sol: 'Rg8#', rating: 700, themes: ['mat en 1'] },
  { name: 'Mat de l\'épaulette', fen: '3rkr2/8/4Q3/8/8/8/8/4K3 w - - 0 1', sol: 'Qe6? ', rating: 0, themes: [] },
];
const out = [];
for (const p of C) {
  const g = new Chess(p.fen);
  if (p.moves) for (const m of p.moves.split(' ')) if (!g.move(m)) { console.log('✗ prélude', p.name, m); continue; }
  const fen = g.fen();
  const sans = p.sol.trim().split(' ');
  const uci = []; let ok = true;
  for (const s of sans) { const mv = g.move(s.replace(/\?/g, '')); if (!mv) { ok = false; break; } uci.push(mv.from + mv.to + (mv.promotion || '')); }
  if (!ok) { console.log('✗ illégal', p.name); continue; }
  if (!g.in_checkmate() || !p.rating) { console.log('✗ pas mat / ignoré', p.name); continue; }
  const r = await e.analyse(fen, { depth: 12 });
  const engineMate = r.lines[0].mate;
  const sameFirst = r.bestmove === uci[0];
  console.log((sameFirst ? '✓' : '~'), p.name, '| moteur:', r.bestmove, 'mat', engineMate, '| solution:', uci.join(' '));
  if (sameFirst) out.push({ id: 'loc' + (out.length + 1), title: p.name, fen, solution: uci, rating: p.rating, themes: p.themes });
}
const fs = require('fs');
fs.writeFileSync('../js/core/local-puzzles.js', '// Pack hors-ligne généré et vérifié par tests/puzzles.build.mjs (chess.js + Stockfish)\nexport const LOCAL_PUZZLES = ' + JSON.stringify(out, null, 2) + ';\n');
console.log(out.length, 'problèmes retenus');
process.exit(0);
