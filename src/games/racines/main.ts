import "../../styles/base.css";
import "../../styles/game.css";
import "./racines.css";
import { createInputController, refocusCell, type InputMode } from "../../shared/cellInput";
import { load, save as persist } from "../../shared/storage";
import { PUZZLES, type ClueKind, type Flower, type RacinesPuzzle } from "./puzzles";

/* Choix de la palette : une des trois fleurs, ou « inconnue » (une graine est là, mais laquelle ?). */
const UNKNOWN = 3;
type Tool = Flower | typeof UNKNOWN;
const TOOLS: Tool[] = [0, 1, 2, UNKNOWN];

/* Marques du joueur sur une case : une graine (stylo), une croix, et des notes cumulables (crayon),
   une par choix de palette, chacune dans un coin fixe de la case. */
interface CellMarks {
  seed?: Flower;
  cross?: boolean;
  notes?: Tool[];
}
type Marks = Record<string, CellMarks>;

/** Convertit les anciens formats de sauvegarde vers le format actuel. */
function normalize(raw: Record<string, unknown>): Marks {
  const out: Marks = {};
  for (const [k, v] of Object.entries(raw ?? {})) {
    if (typeof v === "string") {
      // tout premier format : "s0" graine, "m1" possible, "x" croix
      const f = Number(v[1]) as Flower;
      if (v[0] === "s") out[k] = { seed: f };
      else if (v[0] === "m") out[k] = { notes: [f] };
      else if (v === "x") out[k] = { cross: true };
    } else if (v && typeof v === "object") {
      const old = v as { seed?: Flower; cross?: boolean; maybe?: Flower[]; neutral?: boolean; notes?: Tool[] };
      const notes: Tool[] = [...(old.notes ?? old.maybe ?? []), ...(old.neutral ? [UNKNOWN] : [])];
      const cell: CellMarks = {};
      if (old.seed !== undefined) cell.seed = old.seed;
      if (old.cross) cell.cross = true;
      if (notes.length) cell.notes = notes;
      out[k] = cell;
    }
  }
  return out;
}

const STORAGE_KEY = "racines-v1";
const FLOWERS: Flower[] = [0, 1, 2];
const NAMES = ["coquelicot", "bleuet", "bouton d'or"];
const OF = ["du coquelicot", "du bleuet", "du bouton d'or"];
const DAY_MS = 420;

const FLOWER_SVG = (extra = "") =>
  `<svg class="flower ${extra}" viewBox="0 0 40 40" aria-hidden="true">` +
  [0, 72, 144, 216, 288]
    .map((a) => `<ellipse class="petal" cx="20" cy="10.5" rx="6.5" ry="9" transform="rotate(${a} 20 20)"/>`)
    .join("") +
  `<circle class="heart" cx="20" cy="20" r="5"/></svg>`;
const SEED_SVG =
  '<svg class="seed" viewBox="0 0 40 40" aria-hidden="true"><path d="M20 5C27 14 31 21 31 26a11 11 0 0 1-22 0c0-5 4-12 11-21z"/></svg>';
const NOTE_LABEL = ["coquelicot", "bleuet", "bouton d'or", "graine inconnue"];
const toolClass = (t: Tool) => (t === UNKNOWN ? "fn" : `f${t}`);

let current = 0;
let selected: Tool = 0;
let mode: InputMode = "place";
let marks: Marks[] = PUZZLES.map(() => ({}));
let solved: boolean[] = PUZZLES.map(() => false);
let showDays = false; // affiche le jour d'arrivée sur chaque case fleurie

const saved = load<{
  marks: Record<string, unknown>[];
  solved: boolean[];
  current: number;
  selected: Tool;
  mode?: InputMode;
  showDays?: boolean;
}>(STORAGE_KEY);
if (saved && Array.isArray(saved.marks) && saved.marks.length === PUZZLES.length) {
  marks = saved.marks.map(normalize);
  solved = saved.solved ?? solved;
  current = saved.current ?? 0;
  selected = saved.selected ?? 0;
  mode = saved.mode ?? "place";
  showDays = saved.showDays ?? false;
}
const save = () => persist(STORAGE_KEY, { marks, solved, current, selected, mode, showDays });
const dayTag = (day: number) => (showDays ? `<span class="day">J${day}</span>` : "");

/* Vue « floraison » : animation jour par jour du jardin issu des graines posées */
let view: "plant" | "bloom" = "plant";
let bloomDay = 0;
let bloomMax = 0;
let bloomDone = false;
let timer: number | undefined;
let garden = new Map<string, { kind: ClueKind; day: number }>();

const $ = (id: string) => document.getElementById(id) as HTMLElement;
const boardEl = $("board");
const statusEl = $("status");
const counterEl = $("counter");
const tabsEl = $("tabs");
const paletteEl = $("palette");

const key = (r: number, c: number) => `${r},${c}`;
const puzzle = (): RacinesPuzzle => PUZZLES[current];

/* --- Simulation --- */
function distances(p: RacinesPuzzle, rocks: Set<string>, start: string): Map<string, number> {
  const dist = new Map<string, number>([[start, 0]]);
  const queue = [start];
  while (queue.length) {
    const k = queue.shift()!;
    const [r, c] = k.split(",").map(Number);
    for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const rr = r + dr, cc = c + dc, nk = key(rr, cc);
      if (rr < 0 || rr >= p.n || cc < 0 || cc >= p.n || rocks.has(nk) || dist.has(nk)) continue;
      dist.set(nk, dist.get(k)! + 1);
      queue.push(nk);
    }
  }
  return dist;
}

function grow(p: RacinesPuzzle, seeds: string[]) {
  const rocks = new Set(p.rocks.map(([r, c]) => key(r, c)));
  const maps = seeds.map((s) => distances(p, rocks, s));
  const out = new Map<string, { kind: ClueKind; day: number }>();
  for (let r = 0; r < p.n; r++) for (let c = 0; c < p.n; c++) {
    const k = key(r, c);
    if (rocks.has(k)) continue;
    const ds = maps.map((m) => m.get(k) ?? Infinity);
    const best = Math.min(...ds);
    if (best === Infinity) continue;
    const winners = FLOWERS.filter((f) => ds[f] === best);
    out.set(k, { kind: winners.length === 1 ? winners[0] : "nue", day: best });
  }
  return out;
}

function placedSeeds(): (string | null)[] {
  const st = marks[current];
  return FLOWERS.map((f) => Object.keys(st).find((k) => st[k].seed === f) ?? null);
}

function clueMatches(k: string, kind: ClueKind, day: number | null): boolean {
  const g = garden.get(k);
  if (!g) return false;
  return g.kind === kind && (day === null || g.day === day);
}

/* --- Effets des gestes (les gestes eux-mêmes sont dans shared/cellInput) --- */
function stopBloom() {
  window.clearInterval(timer);
  timer = undefined;
  view = "plant";
}

/** Modifie les marques d'une case, puis nettoie, redessine et sauvegarde. */
function updateCell(k: string, change: (cell: CellMarks) => void) {
  const st = marks[current];
  const cell = st[k] ?? {};
  change(cell);
  if (cell.notes && !cell.notes.length) delete cell.notes;
  if (!cell.cross) delete cell.cross;
  if (cell.seed === undefined && !cell.cross && !cell.notes) delete st[k];
  else st[k] = cell;
  stopBloom();
  setStatus("");
  render();
  save();
  refocusCell(boardEl, k);
}

function plantSeed(cell: CellMarks, f: Flower) {
  // une seule graine par fleur : on la retire de son ancienne case (et on oublie la case si elle est vide)
  const st = marks[current];
  for (const [k, other] of Object.entries(st)) {
    if (other === cell || other.seed !== f) continue;
    delete other.seed;
    if (!other.cross && !other.notes?.length) delete st[k];
  }
  cell.seed = f;
  cell.cross = false;
}

/** Stylo : pose la graine de la fleur choisie, ou l'enlève si elle est déjà là. Les notes ne bougent pas. */
function place(k: string) {
  if (selected === UNKNOWN) return note(k); // « inconnue » n'existe qu'en note
  const f = selected;
  updateCell(k, (cell) => {
    if (cell.seed === f) delete cell.seed;
    else plantSeed(cell, f);
  });
}

/** Crayon : coche ou décoche la note du choix courant, sans toucher aux autres notes ni à la graine. */
function note(k: string) {
  const t = selected;
  updateCell(k, (cell) => {
    const notes = cell.notes ?? [];
    cell.notes = notes.includes(t) ? notes.filter((n) => n !== t) : [...notes, t];
  });
}

function toggleCross(k: string) {
  updateCell(k, (cell) => {
    cell.cross = !cell.cross;
    if (cell.cross) delete cell.seed; // une croix veut dire « pas de graine ici »
  });
}

/** Quitte la floraison et retrouve les graines telles qu'elles étaient plantées. */
function backToSeeds() {
  stopBloom();
  setStatus("");
  render();
}

// Pendant la floraison, un geste sur une case ramène d'abord aux graines, sans rien modifier.
const unlessBlooming = (action: () => void) => () => (view === "bloom" ? backToSeeds() : action());

const input = createInputController({
  switchEl: $("mode"),
  placeLabel: "Planter",
  initialMode: mode,
  onModeChange: (m) => {
    mode = m;
    save();
  },
});

function bindCell(b: HTMLButtonElement, k: string) {
  b.dataset.key = k;
  input.bind(b, {
    place: unlessBlooming(() => place(k)),
    note: unlessBlooming(() => note(k)),
    cross: unlessBlooming(() => toggleCross(k)),
  });
}

document.addEventListener("keydown", (e) => {
  if (["1", "2", "3", "4"].includes(e.key)) selectTool((Number(e.key) - 1) as Tool);
  if (e.key === "Escape" && view === "bloom") backToSeeds();
});

function selectTool(t: Tool) {
  selected = t;
  save();
  renderPalette();
}

/* --- Rendu --- */
function renderPalette() {
  const seeds = placedSeeds();
  paletteEl.innerHTML = "";
  for (const t of TOOLS) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = `pick ${toolClass(t)}` + (t !== UNKNOWN && seeds[t] ? " placed" : "");
    b.setAttribute("role", "radio");
    b.setAttribute("aria-checked", t === selected ? "true" : "false");
    if (t === UNKNOWN) {
      b.title = "Note seulement : une graine est ici, mais tu ne sais pas encore laquelle";
      b.innerHTML = '<span class="unknown-icon" aria-hidden="true">?</span><span class="pick-state">inconnue</span>';
    } else {
      b.innerHTML = `${FLOWER_SVG()}<span class="pick-state">${NAMES[t]}</span>`;
    }
    b.addEventListener("click", () => selectTool(t));
    paletteEl.appendChild(b);
  }
}

function render() {
  const p = puzzle();
  const rocks = new Set(p.rocks.map(([r, c]) => key(r, c)));
  const clues = new Map(p.clues.map(([r, c, kind, day]) => [key(r, c), { kind, day }]));
  const st = marks[current];
  boardEl.style.setProperty("--n", String(p.n));
  boardEl.innerHTML = "";

  for (let r = 0; r < p.n; r++) for (let c = 0; c < p.n; c++) {
    const k = key(r, c);
    const where = `ligne ${r + 1}, colonne ${c + 1}`;
    const b = document.createElement("button");
    b.type = "button";
    b.className = "cell";
    b.setAttribute("role", "gridcell");

    if (rocks.has(k)) {
      b.classList.add("rock");
      b.disabled = true;
      b.innerHTML = '<span class="stone"></span>';
      b.setAttribute("aria-label", "Rocher");
      boardEl.appendChild(b);
      continue;
    }

    const clue = clues.get(k);
    if (clue && view === "bloom") {
      // Floraison : on montre ce qui a réellement poussé, et l'attendu dans une pastille en coin.
      b.classList.add("clue");
      b.tabIndex = -1;
      const g = garden.get(k);
      const shown = g && g.day <= bloomDay ? g : undefined;
      let html = "";
      let got = "rien pour l'instant";
      if (shown && shown.kind === "nue") {
        b.classList.add("bare");
        html = '<span class="label">nue</span>' + dayTag(shown.day);
        got = `terre nue (jour ${shown.day})`;
      } else if (shown) {
        const kind = shown.kind as Flower;
        b.classList.add("bloom", `f${kind}`);
        const pop = shown.day === bloomDay && !bloomDone ? "pop" : "";
        html = FLOWER_SVG(pop) + dayTag(shown.day);
        got = `${NAMES[kind]}, jour ${shown.day}`;
      }
      const expected = clue.kind === "nue" ? "terre nue" : `${NAMES[clue.kind]}${clue.day !== null ? `, jour ${clue.day}` : ""}`;
      html +=
        clue.kind === "nue"
          ? '<span class="expect expect-bare">nue</span>'
          : `<span class="expect f${clue.kind}">${FLOWER_SVG()}${clue.day !== null ? `J${clue.day}` : ""}</span>`;
      b.innerHTML = html;
      if (bloomDone) b.classList.add(clueMatches(k, clue.kind, clue.day) ? "ok" : "bad");
      b.setAttribute("aria-label", `Indice ${where} : attendu ${expected} ; obtenu ${got}`);
      boardEl.appendChild(b);
      continue;
    }
    if (clue) {
      b.classList.add("clue");
      b.tabIndex = -1;
      if (clue.kind === "nue") {
        b.classList.add("bare");
        b.innerHTML = '<span class="label">nue</span>';
        b.setAttribute("aria-label", `Indice : terre nue, ${where}`);
      } else {
        b.classList.add(`f${clue.kind}`);
        b.innerHTML = FLOWER_SVG() + (clue.day !== null ? `<span class="day">J${clue.day}</span>` : "");
        b.setAttribute(
          "aria-label",
          `Indice : ${NAMES[clue.kind]}${clue.day !== null ? `, arrivé le jour ${clue.day}` : ""}, ${where}`,
        );
      }
      boardEl.appendChild(b);
      continue;
    }

    const cell = st[k];
    const hasSeed = cell?.seed !== undefined;
    let html = "";
    const parts: string[] = [];
    if (cell?.seed !== undefined) {
      b.classList.add("seed-cell", `f${cell.seed}`);
      html += SEED_SVG;
      parts.push(`graine ${OF[cell.seed]}`);
    }
    if (cell?.cross) {
      html += '<span class="cross"></span>';
      parts.push("croix");
    }
    const notes = cell?.notes ?? [];
    if (notes.length) {
      // un coin fixe par choix : coquelicot ↖, bleuet ↗, bouton d'or ↙, inconnue ↘
      html += TOOLS.filter((t) => notes.includes(t))
        .map((t) => `<i class="pencil n${t} ${toolClass(t)}"></i>`)
        .join("");
      parts.push(`notes : ${TOOLS.filter((t) => notes.includes(t)).map((t) => NOTE_LABEL[t]).join(", ")}`);
    }
    const label = `${parts.length ? parts.join(", ") : "Case vide"}, ${where}`;

    if (view === "bloom") {
      const g = garden.get(k);
      if (g && g.day <= bloomDay) {
        b.classList.add("bloom");
        const pop = g.day === bloomDay && !bloomDone ? "pop" : "";
        if (g.kind === "nue") {
          b.classList.add("bare-bloom");
          html = (hasSeed ? SEED_SVG : "") + dayTag(g.day);
        } else {
          b.classList.remove("f0", "f1", "f2");
          b.classList.add(`f${g.kind}`);
          html = FLOWER_SVG(pop) + (hasSeed ? SEED_SVG : "") + dayTag(g.day);
        }
      }
    }
    b.innerHTML = html;
    b.setAttribute("aria-label", label);
    bindCell(b, k);
    boardEl.appendChild(b);
  }

  $("grow").textContent = view === "bloom" ? "Revenir aux graines" : "Faire pousser";
  const count = placedSeeds().filter(Boolean).length;
  counterEl.innerHTML = view === "bloom"
    ? `<span class="daybar">Jour ${bloomDay}</span>`
    : `${count} / 3 graines plantées`;
  tabsEl.querySelectorAll(".tab").forEach((t, i) => {
    t.setAttribute("aria-pressed", i === current ? "true" : "false");
    t.classList.toggle("done", !!solved[i]);
  });
  renderPalette();
}

function setStatus(msg: string, cls?: "win" | "err") {
  statusEl.textContent = msg;
  statusEl.className = "status" + (cls ? " " + cls : "");
}

/* --- Faire pousser --- */
function finishBloom() {
  window.clearInterval(timer);
  timer = undefined;
  bloomDay = bloomMax;
  bloomDone = true;
  render();
  const p = puzzle();
  const bad = p.clues.filter(([r, c, kind, day]) => !clueMatches(key(r, c), kind, day)).length;
  if (bad === 0) {
    solved[current] = true;
    save();
    render();
    const left = solved.filter((x) => !x).length;
    setStatus(
      left
        ? `Le jardin a refleuri à l'identique. Bravo ! Il te reste ${left} jardin${left > 1 ? "s" : ""}.`
        : "Tous les jardins ont refleuri. Bravo !",
      "win",
    );
  } else {
    setStatus(
      `${bad} indice${bad > 1 ? "s ne correspondent" : " ne correspond"} pas (cerclé${bad > 1 ? "s" : ""} de rouge). ` +
        "La pastille en pointillés montre ce qui était attendu. « Revenir aux graines » pour corriger.",
      "err",
    );
  }
}

$("grow").addEventListener("click", () => {
  if (view === "bloom") return backToSeeds();
  const seeds = placedSeeds();
  if (seeds.some((s) => !s)) {
    const missing = FLOWERS.filter((f) => !seeds[f]).map((f) => NAMES[f]);
    return setStatus(`Il manque la graine : ${missing.join(", ")}.`, "err");
  }
  stopBloom();
  garden = grow(puzzle(), seeds as string[]);
  bloomMax = Math.max(...[...garden.values()].map((g) => g.day));
  view = "bloom";
  bloomDone = false;
  bloomDay = 0;
  setStatus("Le jardin pousse…");
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return finishBloom();
  render();
  timer = window.setInterval(() => {
    bloomDay++;
    if (bloomDay >= bloomMax) finishBloom();
    else render();
  }, DAY_MS);
});

const daysBtn = $("days");
function renderDaysButton() {
  daysBtn.setAttribute("aria-pressed", showDays ? "true" : "false");
  daysBtn.textContent = showDays ? "Masquer les jours" : "Afficher les jours";
}
daysBtn.addEventListener("click", () => {
  showDays = !showDays;
  save();
  renderDaysButton();
  render();
});
renderDaysButton();

$("hint").addEventListener("click", () => {
  const p = puzzle();
  const seeds = placedSeeds();
  const wrong = FLOWERS.find((f) => seeds[f] && seeds[f] !== key(...p.seeds[f]));
  if (wrong !== undefined) {
    updateCell(seeds[wrong]!, (cell) => {
      delete cell.seed;
    });
    return setStatus(`La graine ${OF[wrong]} n'était pas au bon endroit : je l'ai retirée.`);
  }
  const next = FLOWERS.find((f) => !seeds[f]);
  if (next === undefined) return setStatus("Tes trois graines sont déjà bien placées. Fais pousser le jardin !");
  const [r, c] = p.seeds[next];
  updateCell(key(r, c), (cell) => plantSeed(cell, next));
  setStatus(`La graine ${OF[next]} était en ligne ${r + 1}, colonne ${c + 1}.`);
});

$("reset").addEventListener("click", () => {
  marks[current] = {};
  solved[current] = false;
  stopBloom();
  save();
  setStatus("");
  render();
});

PUZZLES.forEach((p, i) => {
  const t = document.createElement("button");
  t.type = "button";
  t.className = "tab";
  t.textContent = p.name;
  t.addEventListener("click", () => {
    current = i;
    stopBloom();
    save();
    setStatus("");
    render();
  });
  tabsEl.appendChild(t);
});

render();
