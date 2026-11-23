// Les figures du ballet et la façon dont chacune réordonne la ligne de lucioles.
// Doit rester identique à FIGURES dans tools/ballet/generate.py.
// perm[i] = place d'où vient la luciole qui arrive à la place i (nouvelle[i] = ancienne[perm[i]]).
export type FigureId =
  | "volteface" | "pasdedeux" | "rondedroite" | "rondegauche" | "chassecroise" | "demivolte" | "grandecart" | "pascroise";

export interface Figure {
  id: FigureId;
  name: string; // avec article, ex. « la volte-face »
  title: string; // nom seul, ex. « Volte-face »
  perm: number[];
  rule: string;
}

export const FIGURES: Record<FigureId, Figure> = {
  volteface: {
    id: "volteface", name: "la volte-face", title: "Volte-face", perm: [5, 4, 3, 2, 1, 0],
    rule: "toute la ligne se retourne",
  },
  pasdedeux: {
    id: "pasdedeux", name: "le pas de deux", title: "Pas de deux", perm: [1, 0, 2, 3, 4, 5],
    rule: "les deux premières échangent leur place",
  },
  rondedroite: {
    id: "rondedroite", name: "la ronde à droite", title: "Ronde à droite", perm: [5, 0, 1, 2, 3, 4],
    rule: "chacune avance d'une place vers la droite ; la dernière revient en tête",
  },
  rondegauche: {
    id: "rondegauche", name: "la ronde à gauche", title: "Ronde à gauche", perm: [1, 2, 3, 4, 5, 0],
    rule: "chacune avance d'une place vers la gauche ; la première file en queue",
  },
  chassecroise: {
    id: "chassecroise", name: "le chassé-croisé", title: "Chassé-croisé", perm: [3, 4, 5, 0, 1, 2],
    rule: "les deux moitiés de la ligne échangent leur place",
  },
  demivolte: {
    id: "demivolte", name: "la demi-volte", title: "Demi-volte", perm: [2, 1, 0, 3, 4, 5],
    rule: "les trois premières se retournent",
  },
  grandecart: {
    id: "grandecart", name: "le grand écart", title: "Grand écart", perm: [5, 1, 2, 3, 4, 0],
    rule: "la première et la dernière échangent leur place",
  },
  pascroise: {
    id: "pascroise", name: "le pas croisé", title: "Pas croisé", perm: [0, 1, 3, 2, 4, 5],
    rule: "les deux du milieu échangent leur place",
  },
};

export type Clue =
  | { kind: "snap"; step: number; pos: number; bead: number } // après `step` figures, la luciole à la place `pos` est `bead`
  | { kind: "before"; a: FigureId; b: FigureId } // a vient avant b (pas forcément juste avant)
  | { kind: "notat"; a: FigureId; slot: number }; // a n'est pas à la place `slot`

export interface BalletPuzzle {
  name: string;
  figures: FigureId[];
  start: number[];
  end: number[];
  order: FigureId[];
  clues: Clue[];
}

export const transform = (f: FigureId, line: number[]) => FIGURES[f].perm.map((from) => line[from]);

export const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
/** Ordinal féminin (« la 1re figure »). */
export const ordinal = (i: number) => (i === 1 ? "1re" : `${i}e`);
