// Données de Signal. Les transmissions et les réponses doivent rester identiques à tools/signal/verify.py,
// qui vérifie que chaque réponse est entièrement déterminée par ce que le joueur a reçu.

/* --- L'alphabet : des glyphes tracés au trait (viewBox 0 0 20 28), sans ressemblance voulue avec nos écritures --- */
export const GLYPHS: Record<string, string> = {
  A: '<circle cx="10" cy="14" r="5.5"/>',
  B: '<path d="M5 8 H15 V22"/>',
  C: '<path d="M3 8 L7 20 L10 12 L13 20 L17 8"/>',
  D: '<path d="M4 22 L10 6 L16 22 Z"/>',
  E: '<path d="M5 6 H15 M10 6 V22 M5 22 H15"/>',
  F: '<path d="M4 11 Q10 3 16 11 M10 8 V22"/>',
  G: '<path d="M6 6 L15 14 L6 22"/>',
  H: '<path d="M4 19 H16"/><circle cx="10" cy="11" r="3"/>',
  I: '<path d="M5 6 V22 M15 6 V22 M5 14 H15"/>',
  J: '<path d="M6 6 Q17 14 6 22"/>',
  K: '<path d="M5 7 H15 L5 21 H15"/>',
  L: '<path d="M5 6 Q10 18 15 6 M10 12 V23"/>',
};

/** Sens de chaque glyphe, révélé une fois le niveau où il apparaît résolu. */
export const GLOSS: Record<string, string> = {
  A: "3", B: "0", C: "1", D: "2",
  E: "soleil", F: "planète", G: "lune", H: "tourner autour",
  I: "être (eux)", J: "s'éteindre", K: "aller vers", L: "(au futur)",
};

/* --- Scènes : ce que montre l'image jointe à une transmission --- */
export type Noun = "soleil" | "planete" | "lune" | "etre";
export type Group = { noun: Noun; n: number };
export type Scene =
  | { kind: "dots"; n: number }
  | { kind: "group"; g: Group }
  | { kind: "orbit"; a: Group; c: Group } // a tourne autour de c
  | { kind: "die"; s: Group; fut: boolean }
  | { kind: "go"; s: Group; g: Group; fut: boolean };

export interface Transmission {
  glyphs: string;
  scene: Scene;
  caption: string;
}

export type Question =
  | { kind: "read-number"; glyphs: string; prompt: string; answer: number }
  | { kind: "write"; prompt: string; scene: Scene; answer: string }
  | { kind: "choose"; lines: string[]; prompt: string; options: { id: string; text: string }[]; answer: string };

export interface Level {
  title: string;
  intro: string;
  transmissions: Transmission[];
  questions: Question[];
  epilogue: string;
}

export const LEVELS: Level[] = [
  {
    title: "Compter",
    intro:
      "3 h 12, station de Pic-Noir. Le radiotélescope capte un signal qui se répète, venu d'une étoile à quarante années-lumière. Chaque transmission arrive avec une image : des points. Quelqu'un, là-bas, essaie de nous apprendre à compter.",
    transmissions: [
      { glyphs: "C", scene: { kind: "dots", n: 1 }, caption: "1 point" },
      { glyphs: "A", scene: { kind: "dots", n: 3 }, caption: "3 points" },
      { glyphs: "CB", scene: { kind: "dots", n: 4 }, caption: "4 points" },
      { glyphs: "CD", scene: { kind: "dots", n: 6 }, caption: "6 points" },
      { glyphs: "DC", scene: { kind: "dots", n: 9 }, caption: "9 points" },
      { glyphs: "AA", scene: { kind: "dots", n: 15 }, caption: "15 points" },
    ],
    questions: [
      { kind: "read-number", glyphs: "AD", prompt: "Une nouvelle transmission arrive, sans image. Combien de points désigne-t-elle ?", answer: 14 },
      { kind: "write", prompt: "Réponds-leur dans leur langue : onze points.", scene: { kind: "dots", n: 11 }, answer: "DA" },
      { kind: "write", prompt: "Et maintenant : seize points.", scene: { kind: "dots", n: 16 }, answer: "CBB" },
    ],
    epilogue:
      "Ils comptent par paquets de quatre, comme nous comptons par dix. Tes réponses partent vers eux, mais le signal ne les attend pas : il poursuit sa leçon, imperturbable. Ce n'est pas une conversation. C'est un message émis il y a quarante ans. Les images changent : cette fois, ce sont des astres.",
  },
  {
    title: "Le ciel",
    intro:
      "Les nouvelles images montrent des soleils, des planètes, des lunes. Ils décrivent leur ciel. Garde ton lexique sous la main : les nombres d'hier reviennent.",
    transmissions: [
      { glyphs: "ED", scene: { kind: "group", g: { noun: "soleil", n: 2 } }, caption: "deux soleils" },
      { glyphs: "F", scene: { kind: "group", g: { noun: "planete", n: 1 } }, caption: "une planète" },
      { glyphs: "GA", scene: { kind: "group", g: { noun: "lune", n: 3 } }, caption: "trois lunes" },
      {
        glyphs: "FEDH",
        scene: { kind: "orbit", a: { noun: "planete", n: 1 }, c: { noun: "soleil", n: 2 } },
        caption: "une planète tourne autour de deux soleils",
      },
      {
        glyphs: "GDFH",
        scene: { kind: "orbit", a: { noun: "lune", n: 2 }, c: { noun: "planete", n: 1 } },
        caption: "deux lunes tournent autour d'une planète",
      },
    ],
    questions: [
      {
        kind: "write",
        prompt: "À ton tour de décrire notre ciel. Huit planètes tournent autour d'un soleil.",
        scene: { kind: "orbit", a: { noun: "planete", n: 8 }, c: { noun: "soleil", n: 1 } },
        answer: "FDBEH",
      },
      {
        kind: "write",
        prompt: "Et une lune tourne autour de notre planète.",
        scene: { kind: "orbit", a: { noun: "lune", n: 1 }, c: { noun: "planete", n: 1 } },
        answer: "GFH",
      },
    ],
    epilogue:
      "Leur monde tourne autour de deux soleils, accompagné de deux lunes. Ta description du nôtre est partie vers eux : huit planètes, un seul soleil, une lune. Elle mettra quarante ans à leur parvenir. Le signal, lui, change de rythme : il arrive à la partie qu'ils voulaient vraiment nous dire.",
  },
  {
    title: "Le message",
    intro:
      "La dernière partie du signal est plus longue, plus lente. De nouvelles images apparaissent : des êtres à quatre doigts, des astres qui pâlissent, des voyages. Puis vient un message sans aucune image.",
    transmissions: [
      { glyphs: "I", scene: { kind: "group", g: { noun: "etre", n: 1 } }, caption: "un être" },
      { glyphs: "IA", scene: { kind: "group", g: { noun: "etre", n: 3 } }, caption: "trois êtres" },
      { glyphs: "EJ", scene: { kind: "die", s: { noun: "soleil", n: 1 }, fut: false }, caption: "un soleil s'éteint" },
      {
        glyphs: "FDJL",
        scene: { kind: "die", s: { noun: "planete", n: 2 }, fut: true },
        caption: "deux planètes s'éteindront (plus tard)",
      },
      {
        glyphs: "IDEK",
        scene: { kind: "go", s: { noun: "etre", n: 2 }, g: { noun: "soleil", n: 1 }, fut: false },
        caption: "deux êtres vont vers un soleil",
      },
      {
        glyphs: "IFKL",
        scene: { kind: "go", s: { noun: "etre", n: 1 }, g: { noun: "planete", n: 1 }, fut: true },
        caption: "un être ira vers une planète (plus tard)",
      },
    ],
    questions: [
      {
        kind: "write",
        prompt: "Vérifie que tu les comprends : écris « trois soleils s'éteindront ».",
        scene: { kind: "die", s: { noun: "soleil", n: 3 }, fut: true },
        answer: "EAJL",
      },
      {
        kind: "write",
        prompt: "Écris « un être va vers deux planètes ».",
        scene: { kind: "go", s: { noun: "etre", n: 1 }, g: { noun: "planete", n: 2 }, fut: false },
        answer: "IFDK",
      },
      {
        kind: "choose",
        lines: ["EDJL", "ICBBBEKL"],
        prompt: "Leur dernier message, sans image. Que disent-ils ?",
        options: [
          { id: "a", text: "Deux soleils s'éteindront. Soixante-quatre êtres iront vers un soleil." },
          { id: "b", text: "Deux soleils s'éteignent. Soixante-quatre êtres vont vers un soleil." },
          { id: "c", text: "Deux soleils s'éteindront. Seize êtres iront vers deux soleils." },
          { id: "d", text: "Un soleil s'éteindra. Soixante-quatre êtres iront vers deux soleils." },
        ],
        answer: "a",
      },
    ],
    epilogue:
      "Leurs deux soleils allaient s'éteindre. Soixante-quatre d'entre eux devaient partir vers un soleil, un seul. Ce message a quarante ans : ils sont peut-être déjà en route. Dans quarante ans, ta réponse leur parviendra : huit planètes, une lune, un soleil. Sauront-ils qu'ils ont trouvé ? Le signal se tait. Sur l'écran de la station, la dernière image reste figée : quatre doigts levés, comme un salut.",
  },
];
