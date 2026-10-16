// ============================================================
//  Livre d'ouvertures compact (noms français).
//  Indexé par position (FEN sans compteurs) → gère les transpositions.
// ============================================================

const LINES = [
  ['Ouverture du pion roi', 'e4'],
  ['Ouverture du pion dame', 'd4'],
  ['Ouverture anglaise', 'c4'],
  ['Ouverture Réti', 'Nf3'],
  ['Ouverture Bird', 'f4'],
  ['Ouverture Larsen', 'b3'],
  ['Ouverture hongroise', 'g3'],
  ['Ouverture polonaise', 'b4'],
  ['Ouverture Van Geet', 'Nc3'],
  ['Ouverture Van \'t Kruijs', 'e3'],

  ['Partie ouverte', 'e4 e5'],
  ['Partie du cavalier roi', 'e4 e5 Nf3'],
  ['Partie espagnole', 'e4 e5 Nf3 Nc6 Bb5'],
  ['Espagnole, défense Morphy', 'e4 e5 Nf3 Nc6 Bb5 a6'],
  ['Espagnole, variante d\'échange', 'e4 e5 Nf3 Nc6 Bb5 a6 Bxc6'],
  ['Espagnole fermée', 'e4 e5 Nf3 Nc6 Bb5 a6 Ba4 Nf6 O-O Be7'],
  ['Espagnole ouverte', 'e4 e5 Nf3 Nc6 Bb5 a6 Ba4 Nf6 O-O Nxe4'],
  ['Espagnole, défense berlinoise', 'e4 e5 Nf3 Nc6 Bb5 Nf6'],
  ['Partie italienne', 'e4 e5 Nf3 Nc6 Bc4'],
  ['Giuoco Piano', 'e4 e5 Nf3 Nc6 Bc4 Bc5'],
  ['Giuoco Piano, ligne principale', 'e4 e5 Nf3 Nc6 Bc4 Bc5 c3'],
  ['Giuoco Pianissimo', 'e4 e5 Nf3 Nc6 Bc4 Bc5 d3'],
  ['Gambit Evans', 'e4 e5 Nf3 Nc6 Bc4 Bc5 b4'],
  ['Défense des deux cavaliers', 'e4 e5 Nf3 Nc6 Bc4 Nf6'],
  ['Deux cavaliers, variante Cg5', 'e4 e5 Nf3 Nc6 Bc4 Nf6 Ng5'],
  ['Attaque Fegatello', 'e4 e5 Nf3 Nc6 Bc4 Nf6 Ng5 d5 exd5 Nxd5 Nxf7'],
  ['Défense hongroise', 'e4 e5 Nf3 Nc6 Bc4 Be7'],
  ['Partie écossaise', 'e4 e5 Nf3 Nc6 d4'],
  ['Partie écossaise, ligne principale', 'e4 e5 Nf3 Nc6 d4 exd4 Nxd4'],
  ['Gambit Göring', 'e4 e5 Nf3 Nc6 d4 exd4 c3'],
  ['Partie des trois cavaliers', 'e4 e5 Nf3 Nc6 Nc3'],
  ['Partie des quatre cavaliers', 'e4 e5 Nf3 Nc6 Nc3 Nf6'],
  ['Ouverture Ponziani', 'e4 e5 Nf3 Nc6 c3'],
  ['Défense Petrov', 'e4 e5 Nf3 Nf6'],
  ['Défense Philidor', 'e4 e5 Nf3 d6'],
  ['Défense Damiano', 'e4 e5 Nf3 f6'],
  ['Contre-gambit Elephant', 'e4 e5 Nf3 d5'],
  ['Gambit letton', 'e4 e5 Nf3 f5'],
  ['Gambit du roi', 'e4 e5 f4'],
  ['Gambit du roi accepté', 'e4 e5 f4 exf4'],
  ['Gambit du roi refusé', 'e4 e5 f4 Bc5'],
  ['Partie viennoise', 'e4 e5 Nc3'],
  ['Partie viennoise, gambit', 'e4 e5 Nc3 Nf6 f4'],
  ['Ouverture du fou', 'e4 e5 Bc4'],
  ['Partie du centre', 'e4 e5 d4 exd4 Qxd4'],
  ['Gambit danois', 'e4 e5 d4 exd4 c3'],
  ['Ouverture Parham', 'e4 e5 Qh5'],

  ['Défense sicilienne', 'e4 c5'],
  ['Sicilienne ouverte', 'e4 c5 Nf3 d6 d4 cxd4 Nxd4'],
  ['Sicilienne Najdorf', 'e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 a6'],
  ['Sicilienne Dragon', 'e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 g6'],
  ['Sicilienne Scheveningen', 'e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 e6'],
  ['Sicilienne classique', 'e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 Nc6'],
  ['Sicilienne, Dragon accéléré', 'e4 c5 Nf3 Nc6 d4 cxd4 Nxd4 g6'],
  ['Sicilienne Sveshnikov', 'e4 c5 Nf3 Nc6 d4 cxd4 Nxd4 Nf6 Nc3 e5'],
  ['Sicilienne Kan', 'e4 c5 Nf3 e6 d4 cxd4 Nxd4 a6'],
  ['Sicilienne Taimanov', 'e4 c5 Nf3 e6 d4 cxd4 Nxd4 Nc6'],
  ['Sicilienne Rossolimo', 'e4 c5 Nf3 Nc6 Bb5'],
  ['Sicilienne Moscou', 'e4 c5 Nf3 d6 Bb5+'],
  ['Sicilienne fermée', 'e4 c5 Nc3'],
  ['Sicilienne Alapine', 'e4 c5 c3'],
  ['Gambit Smith-Morra', 'e4 c5 d4 cxd4 c3'],
  ['Attaque Grand Prix', 'e4 c5 f4'],

  ['Défense française', 'e4 e6'],
  ['Française, variante d\'avance', 'e4 e6 d4 d5 e5'],
  ['Française, variante d\'échange', 'e4 e6 d4 d5 exd5 exd5'],
  ['Française Winawer', 'e4 e6 d4 d5 Nc3 Bb4'],
  ['Française classique', 'e4 e6 d4 d5 Nc3 Nf6'],
  ['Française Rubinstein', 'e4 e6 d4 d5 Nc3 dxe4'],
  ['Française Tarrasch', 'e4 e6 d4 d5 Nd2'],

  ['Défense Caro-Kann', 'e4 c6'],
  ['Caro-Kann, variante d\'avance', 'e4 c6 d4 d5 e5'],
  ['Caro-Kann, variante d\'échange', 'e4 c6 d4 d5 exd5 cxd5'],
  ['Caro-Kann, attaque Panov', 'e4 c6 d4 d5 exd5 cxd5 c4'],
  ['Caro-Kann classique', 'e4 c6 d4 d5 Nc3 dxe4 Nxe4 Bf5'],
  ['Caro-Kann, variante Karpov', 'e4 c6 d4 d5 Nc3 dxe4 Nxe4 Nd7'],

  ['Défense scandinave', 'e4 d5'],
  ['Scandinave, prise de la dame', 'e4 d5 exd5 Qxd5'],
  ['Scandinave, ligne principale', 'e4 d5 exd5 Qxd5 Nc3 Qa5'],
  ['Scandinave moderne', 'e4 d5 exd5 Nf6'],
  ['Défense Alekhine', 'e4 Nf6'],
  ['Défense Pirc', 'e4 d6 d4 Nf6 Nc3 g6'],
  ['Défense Pirc', 'e4 d6'],
  ['Défense moderne', 'e4 g6'],
  ['Défense Nimzowitsch', 'e4 Nc6'],
  ['Défense Owen', 'e4 b6'],

  ['Partie fermée', 'd4 d5'],
  ['Gambit dame', 'd4 d5 c4'],
  ['Gambit dame refusé', 'd4 d5 c4 e6'],
  ['Gambit dame refusé, orthodoxe', 'd4 d5 c4 e6 Nc3 Nf6 Bg5'],
  ['Gambit dame accepté', 'd4 d5 c4 dxc4'],
  ['Défense slave', 'd4 d5 c4 c6'],
  ['Défense semi-slave', 'd4 d5 c4 c6 Nf3 Nf6 Nc3 e6'],
  ['Défense Tchigorine', 'd4 d5 c4 Nc6'],
  ['Contre-gambit Albin', 'd4 d5 c4 e5'],
  ['Système de Londres', 'd4 d5 Bf4'],
  ['Système de Londres', 'd4 d5 Nf3 Nf6 Bf4'],
  ['Système de Londres', 'd4 Nf6 Bf4'],
  ['Système de Londres', 'd4 Nf6 Nf3 d5 Bf4'],
  ['Système Colle', 'd4 d5 Nf3 Nf6 e3'],
  ['Attaque Levitsky', 'd4 d5 Bg5'],
  ['Gambit Blackmar-Diemer', 'd4 d5 e4'],
  ['Défense indienne', 'd4 Nf6'],
  ['Attaque Trompowsky', 'd4 Nf6 Bg5'],
  ['Défense est-indienne', 'd4 Nf6 c4 g6 Nc3 Bg7 e4 d6'],
  ['Défense Grünfeld', 'd4 Nf6 c4 g6 Nc3 d5'],
  ['Défense nimzo-indienne', 'd4 Nf6 c4 e6 Nc3 Bb4'],
  ['Défense ouest-indienne', 'd4 Nf6 c4 e6 Nf3 b6'],
  ['Défense bogo-indienne', 'd4 Nf6 c4 e6 Nf3 Bb4+'],
  ['Ouverture catalane', 'd4 Nf6 c4 e6 g3'],
  ['Gambit Benko', 'd4 Nf6 c4 c5 d5 b5'],
  ['Benoni moderne', 'd4 Nf6 c4 c5 d5 e6'],
  ['Gambit de Budapest', 'd4 Nf6 c4 e5'],
  ['Défense hollandaise', 'd4 f5'],
  ['Gambit Englund', 'd4 e5'],

  ['Anglaise, sicilienne inversée', 'c4 e5'],
  ['Anglaise symétrique', 'c4 c5'],
  ['Anglaise, anglo-indienne', 'c4 Nf6'],
  ['Ouverture Réti', 'Nf3 d5 c4'],
];

let INDEX = null;

const key = (fen) => fen.split(' ').slice(0, 4).join(' ');

/** Construit l'index position → nom (à appeler une fois, chess.js requis). */
export function buildOpeningIndex() {
  if (INDEX) return INDEX;
  const C = globalThis.Chess;
  INDEX = new Map();
  for (const [name, seq] of LINES) {
    const g = new C();
    const moves = seq.split(' ');
    moves.forEach((san, i) => {
      const mv = g.move(san);
      if (!mv) throw new Error(`Ouverture invalide : ${name} (${san})`);
      const k = key(g.fen());
      // Un nom plus spécifique (ligne plus longue) l'emporte sur la même position
      const isFinal = i === moves.length - 1;
      const prev = INDEX.get(k);
      if (isFinal || !prev) INDEX.set(k, { name: isFinal ? name : (prev ? prev.name : null), depth: i + 1 });
    });
  }
  return INDEX;
}

/** Renvoie l'entrée du livre pour une position, ou null. */
export function lookupOpening(fen) {
  const idx = buildOpeningIndex();
  return idx.get(key(fen)) || null;
}

export const OPENING_COUNT = LINES.length;
