import { createRequire } from 'module';
const require = createRequire(import.meta.url);
globalThis.Chess = require('../vendor/chess.js').Chess;
const createSf = require('./sfnode.cjs');
const { gameFromPgn, splitPgnGames, computeTimeSpent } = await import('../js/core/pgn.js');
const { Engine } = await import('../js/core/engine.js');
const R = await import('../js/core/review.js');
const { buildOpeningIndex, OPENING_COUNT } = await import('../js/core/openings.js');

buildOpeningIndex(); console.log('ouvertures OK:', OPENING_COUNT);

// Partie Opéra (Morphy 1858) au format chess.com avec horloges
const pgn = `[Event "Live Chess"]
[Site "Chess.com"]
[White "Morphy"]
[Black "Duke"]
[Result "1-0"]
[TimeControl "180+2"]

1. e4 {[%clk 0:03:01]} 1... e5 {[%clk 0:03:00]} 2. Nf3 {[%clk 0:02:59]} 2... d6 {[%clk 0:02:58]}
3. d4 {[%clk 0:02:58]} 3... Bg4 {[%clk 0:02:55]} 4. dxe5 Bxf3 5. Qxf3 dxe5 6. Bc4 Nf6 7. Qb3 Qe7
8. Nc3 c6 9. Bg5 b5 10. Nxb5 cxb5 11. Bxb5+ Nbd7 12. O-O-O Rd8 13. Rxd7 Rxd7 14. Rd1 Qe6
15. Bxd7+ Nxd7 16. Qb8+ Nxb8 17. Rd8# 1-0`;

const game = gameFromPgn(pgn);
computeTimeSpent(game);
console.log('coups:', game.moves.length, 'mat:', game.terminal.checkmate, 'clk1:', game.moves[0].clock, 'spent2:', game.moves[2].timeSpent);
console.log('split 2 parties:', splitPgnGames(pgn + '\n\n' + pgn).length);

const engine = new Engine({ createWorker: createSf });
const t0 = Date.now();
const positions = await R.analyzePositions(game, engine, { depth: 9 });
console.log('analyse en', ((Date.now() - t0) / 1000).toFixed(1), 's');
const rep = R.buildReport(game, positions);
rep.moves.forEach((m, i) => {
  const mv = game.moves[i];
  console.log(`${(i % 2 ? '   ...' : (i / 2 + 1) + '.').padEnd(6)} ${mv.san.padEnd(7)} ${R.CLASSES[m.cls].label.padEnd(16)} loss=${m.loss.toFixed(3)} acc=${m.accuracy.toFixed(0).padStart(3)} | ${m.comment}`);
});
console.log('Précision', rep.accuracy, 'Perf', rep.rating, 'Ouverture:', rep.opening);
console.log('Phases', JSON.stringify(rep.phases), 'Moments', rep.keyMoments);
process.exit(0);
