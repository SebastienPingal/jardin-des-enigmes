// Grilles produites par tools/racines/generate.py : solution unique, trouvable sans hypothèse.
// Couleurs : 0 coquelicot, 1 bleuet, 2 bouton d'or.
// clues : [ligne, colonne, couleur ou "nue", jour d'arrivée ou null si non montré].
export type Flower = 0 | 1 | 2;
export type ClueKind = Flower | "nue";

export interface RacinesPuzzle {
  name: string;
  n: number;
  rocks: [number, number][];
  seeds: [number, number][]; // seeds[couleur] = [ligne, colonne]
  clues: [number, number, ClueKind, number | null][];
}

export const PUZZLES: RacinesPuzzle[] = [
  {
    name: "Jardin 1", n: 6,
    rocks: [[1, 3], [5, 1], [5, 2], [5, 4]],
    seeds: [[3, 3], [0, 5], [3, 0]],
    clues: [[0, 1, "nue", null], [0, 2, 1, 3], [1, 4, 1, null], [2, 3, 0, 1], [4, 2, 0, null]],
  },
  {
    name: "Jardin 2", n: 6,
    rocks: [[1, 0], [3, 1], [4, 4]],
    seeds: [[5, 3], [3, 4], [4, 1]],
    clues: [[0, 5, 1, 4], [1, 2, "nue", null], [2, 0, 2, 3], [4, 3, 0, 1]],
  },
  {
    name: "Jardin 3", n: 6,
    rocks: [[4, 0], [4, 5], [5, 5]],
    seeds: [[3, 1], [4, 3], [2, 3]],
    clues: [[1, 5, 2, null], [2, 1, 0, 1], [2, 2, 2, null], [3, 3, "nue", null], [3, 5, "nue", null], [5, 0, 0, null]],
  },
];
