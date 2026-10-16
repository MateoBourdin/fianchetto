// Harness: runs browser-worker Stockfish (asm.js) inside node for tests
const vm = require('vm'), fs = require('fs');
module.exports = function createEngine() {
  const listeners = [];
  const ctx = { console, Math, Date, setTimeout, clearTimeout, Uint8Array, Int32Array, Float64Array,
    importScripts: () => {}, close: () => {}, performance: { now: () => Date.now() } };
  ctx.self = ctx; ctx.location = { href: 'http://localhost/stockfish.js' }; ctx.navigator = {}; ctx.postMessage = (m) => setImmediate(() => listeners.forEach(l => l({ data: m })));
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(__dirname + '/../vendor/stockfish/stockfish.js', 'utf8'), ctx);
  return {
    postMessage: (m) => setImmediate(() => ctx.onmessage({ data: m })),
    addEventListener: (t, fn) => { if (t === 'message') listeners.push(fn); },
  };
};
