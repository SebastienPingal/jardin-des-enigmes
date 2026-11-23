// Les animaux et leur transformation du collier. Doit rester identique à ANIMALS dans tools/telephone/generate.py.
// perm[i] = position d'où vient la perle qui arrive en position i (nouveau[i] = ancien[perm[i]]).
export type AnimalId =
  | "merle" | "renard" | "blaireau" | "ecureuil" | "grenouille" | "herisson" | "escargot" | "chouette";

export interface Animal {
  id: AnimalId;
  name: string; // avec article, ex. « le renard »
  emoji: string;
  perm: number[];
  rule: string;
}

export const ANIMALS: Record<AnimalId, Animal> = {
  merle: { id: "merle", name: "le merle", emoji: "🐦", perm: [5, 4, 3, 2, 1, 0], rule: "retourne tout le collier" },
  renard: { id: "renard", name: "le renard", emoji: "🦊", perm: [1, 0, 2, 3, 4, 5], rule: "échange les deux premières perles" },
  blaireau: {
    id: "blaireau", name: "le blaireau", emoji: "🦡", perm: [5, 0, 1, 2, 3, 4],
    rule: "décale tout d'un cran vers la droite ; la dernière perle passe devant",
  },
  ecureuil: {
    id: "ecureuil", name: "l'écureuil", emoji: "🐿️", perm: [1, 2, 3, 4, 5, 0],
    rule: "décale tout d'un cran vers la gauche ; la première perle passe derrière",
  },
  grenouille: { id: "grenouille", name: "la grenouille", emoji: "🐸", perm: [3, 4, 5, 0, 1, 2], rule: "échange les deux moitiés du collier" },
  herisson: { id: "herisson", name: "le hérisson", emoji: "🦔", perm: [2, 1, 0, 3, 4, 5], rule: "retourne les trois premières perles" },
  escargot: { id: "escargot", name: "l'escargot", emoji: "🐌", perm: [5, 1, 2, 3, 4, 0], rule: "échange la première et la dernière perle" },
  chouette: { id: "chouette", name: "la chouette", emoji: "🦉", perm: [0, 1, 3, 2, 4, 5], rule: "échange les deux perles du milieu" },
};

export type Clue =
  | { kind: "snap"; step: number; pos: number; bead: number } // après `step` animaux, la perle en `pos` est `bead`
  | { kind: "before"; a: AnimalId; b: AnimalId } // a passe avant b (pas forcément juste avant)
  | { kind: "notat"; a: AnimalId; slot: number }; // a n'est pas à la place `slot`

export interface TelephonePuzzle {
  name: string;
  animals: AnimalId[];
  start: number[];
  end: number[];
  order: AnimalId[];
  clues: Clue[];
}

export const transform = (a: AnimalId, necklace: number[]) => ANIMALS[a].perm.map((from) => necklace[from]);

export const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
export const ordinal = (i: number) => (i === 1 ? "1er" : `${i}e`);
