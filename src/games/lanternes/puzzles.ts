// Grilles générées et vérifiées par programme : solution unique, trouvable sans essai-erreur.
// rocks : [ligne, colonne] ; clues : [ligne, colonne, nombre de lanternes qui éclairent la case] ;
// sol[ligne] = colonne de la lanterne.
export interface LanternesPuzzle {
  name: string;
  n: number;
  rocks: [number, number][];
  clues: [number, number, number][];
  sol: number[];
}

export const PUZZLES: LanternesPuzzle[] = [
  { name: "Jardin 1", n: 5, rocks: [[1, 4], [2, 3], [3, 1]], clues: [[2, 1, 1], [2, 2, 2], [4, 1, 1], [4, 2, 0]], sol: [1, 3, 0, 2, 4] },
  { name: "Jardin 2", n: 5, rocks: [[0, 3], [2, 2], [2, 4], [4, 3]], clues: [[0, 4, 0], [2, 0, 2], [2, 1, 1]], sol: [2, 0, 3, 1, 4] },
  { name: "Jardin 3", n: 5, rocks: [[0, 1], [1, 4], [2, 1], [3, 3]], clues: [[3, 1, 2], [4, 3, 0]], sol: [4, 1, 3, 0, 2] },
];
