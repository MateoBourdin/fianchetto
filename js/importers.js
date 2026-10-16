// ============================================================
//  Import de parties depuis des API publiques
//  - Chess.com : Published-Data API (lecture seule, sans clé)
//    https://api.chess.com/pub/player/{user}/games/archives
//  - Lichess   : https://lichess.org/api/games/user/{user}
//  Les requêtes sont faites en série (règle de courtoisie Chess.com).
// ============================================================

const CHESSCOM = 'https://api.chess.com/pub/player/';

async function getJson(url, opts = {}) {
  let res;
  try {
    res = await fetch(url, opts);
  } catch {
    throw new Error('Connexion impossible. Vérifie ta connexion internet.');
  }
  if (res.status === 404) throw new Error('Joueur introuvable.');
  if (res.status === 429) throw new Error('Trop de requêtes — réessaie dans quelques secondes.');
  if (!res.ok) throw new Error(`Erreur du serveur (${res.status}).`);
  return res;
}

/** Liste des mois disponibles (du plus récent au plus ancien). */
export async function chesscomArchives(username) {
  const user = username.trim().toLowerCase();
  if (!user) throw new Error('Entre un nom d\'utilisateur.');
  const res = await getJson(`${CHESSCOM}${encodeURIComponent(user)}/games/archives`);
  const data = await res.json();
  return (data.archives || []).slice().reverse().map((url) => {
    const [y, m] = url.split('/').slice(-2);
    return { url, year: +y, month: +m };
  });
}

/** Parties d'un mois → format commun. */
export async function chesscomMonth(archiveUrl, username) {
  const res = await getJson(archiveUrl);
  const data = await res.json();
  const me = username.trim().toLowerCase();
  return (data.games || [])
    .filter((g) => g.pgn && (g.rules || 'chess') === 'chess')
    .map((g) => {
      const meWhite = g.white.username.toLowerCase() === me;
      const mine = meWhite ? g.white : g.black;
      const opp = meWhite ? g.black : g.white;
      return {
        source: 'chess.com',
        id: g.uuid || g.url,
        url: g.url,
        pgn: g.pgn,
        endTime: (g.end_time || 0) * 1000,
        timeClass: g.time_class,
        timeControl: g.time_control,
        userColor: meWhite ? 'w' : 'b',
        me: { name: mine.username, rating: mine.rating },
        opp: { name: opp.username, rating: opp.rating },
        outcome: outcomeFromChesscom(mine.result),
        rated: g.rated,
      };
    })
    .sort((a, b) => b.endTime - a.endTime);
}

function outcomeFromChesscom(r) {
  if (r === 'win') return 'win';
  if (['agreed', 'repetition', 'stalemate', 'insufficient', '50move', 'timevsinsufficient'].includes(r)) return 'draw';
  return 'loss';
}

/** Dernières parties Lichess (NDJSON). */
export async function lichessGames(username, max = 30) {
  const user = username.trim();
  if (!user) throw new Error('Entre un nom d\'utilisateur.');
  const url = `https://lichess.org/api/games/user/${encodeURIComponent(user)}?max=${max}&pgnInJson=true&clocks=true&opening=true`;
  const res = await getJson(url, { headers: { Accept: 'application/x-ndjson' } });
  const text = await res.text();
  const me = user.toLowerCase();
  return text.split('\n').filter(Boolean).map((line) => JSON.parse(line))
    .filter((g) => g.variant === 'standard' && g.pgn)
    .map((g) => {
      const w = g.players.white, b = g.players.black;
      const wName = (w.user && w.user.name) || (w.aiLevel ? `Stockfish niv. ${w.aiLevel}` : 'Anonyme');
      const bName = (b.user && b.user.name) || (b.aiLevel ? `Stockfish niv. ${b.aiLevel}` : 'Anonyme');
      const meWhite = wName.toLowerCase() === me;
      const myColor = meWhite ? 'white' : 'black';
      return {
        source: 'lichess',
        id: g.id,
        url: `https://lichess.org/${g.id}`,
        pgn: g.pgn,
        endTime: g.lastMoveAt || g.createdAt,
        timeClass: g.speed,
        timeControl: g.clock ? `${g.clock.initial}+${g.clock.increment}` : '-',
        userColor: meWhite ? 'w' : 'b',
        me: { name: meWhite ? wName : bName, rating: (meWhite ? w : b).rating },
        opp: { name: meWhite ? bName : wName, rating: (meWhite ? b : w).rating },
        outcome: !g.winner ? 'draw' : g.winner === myColor ? 'win' : 'loss',
        rated: g.rated,
      };
    });
}

// ---------- Puzzles Lichess (base sous licence CC0) ----------
export async function lichessPuzzle({ theme = 'mix', difficulty = 'normal' } = {}) {
  const qs = new URLSearchParams();
  if (theme && theme !== 'mix') qs.set('angle', theme);
  if (difficulty && difficulty !== 'normal') qs.set('difficulty', difficulty);
  let res;
  try {
    res = await getJson(`https://lichess.org/api/puzzle/next?${qs}`, { headers: { Accept: 'application/json' } });
  } catch (e) {
    // Repli : problème du jour
    res = await getJson('https://lichess.org/api/puzzle/daily', { headers: { Accept: 'application/json' } });
  }
  return res.json();
}
