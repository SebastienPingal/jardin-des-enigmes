import "../../styles/base.css";
import "../../styles/game.css";
import "./racines.css";
import { bindCellInput, refocusCell } from "../../shared/cellInput";
import { load, save as persist } from "../../shared/storage";
import { PUZZLES, type ClueKind, type Flower, type RacinesPuzzle } from "./puzzles";

/* Marques du joueur : "s0".."s2" graine, "m0".."m2" possible, "x" croix */
type Marks = Record<string, string>;

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

let current = 0;
let selected: Flower = 0;
let marks: Marks[] = PUZZLES.map(() => ({}));
let solved: boolean[] = PUZZLES.map(() => false);

const saved = load<{ marks: Marks[]; solved: boolean[]; current: number; selected: Flower }>(STORAGE_KEY);
if (saved && Array.isArray(saved.marks) && saved.marks.length === PUZZLES.length) {
  marks = saved.marks;
  solved = saved.solved ?? solved;
  current = saved.current ?? 0;
  selected = saved.selected ?? 0;
}
const save = () => persist(STORAGE_KEY, { marks, solved, current, selected });

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
  return FLOWERS.map((f) => Object.keys(st).find((k) => st[k] === `s${f}`) ?? null);
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

function setMark(k: string, mark: string | null) {
  const st = marks[current];
  if (mark?.startsWith("s")) {
    for (const other of Object.keys(st)) if (st[other] === mark) delete st[other]; // une seule graine par fleur
  }
  if (mark) st[k] = mark; else delete st[k];
  stopBloom();
  setStatus("");
  render();
  save();
  refocusCell(boardEl, k);
}

function cycle(k: string) {
  // graine de la couleur choisie → possible → vide
  const v = marks[current][k];
  setMark(k, v === `s${selected}` ? `m${selected}` : v === `m${selected}` ? null : `s${selected}`);
}

function toggleCross(k: string) {
  setMark(k, marks[current][k] === "x" ? null : "x");
}

function bindCell(b: HTMLButtonElement, k: string) {
  b.dataset.key = k;
  bindCellInput(b, {
    primary: () => cycle(k),
    cross: () => toggleCross(k),
    maybe: () => setMark(k, marks[current][k] === `m${selected}` ? null : `m${selected}`),
  });
}

document.addEventListener("keydown", (e) => {
  if (e.key === "1" || e.key === "2" || e.key === "3") selectFlower((Number(e.key) - 1) as Flower);
});

function selectFlower(f: Flower) {
  selected = f;
  save();
  renderPalette();
}

/* --- Rendu --- */
function renderPalette() {
  const seeds = placedSeeds();
  paletteEl.innerHTML = "";
  for (const f of FLOWERS) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = `pick f${f}` + (seeds[f] ? " placed" : "");
    b.setAttribute("role", "radio");
    b.setAttribute("aria-checked", f === selected ? "true" : "false");
    b.innerHTML = `${FLOWER_SVG()}<span class="pick-state">${NAMES[f]}</span>`;
    b.addEventListener("click", () => selectFlower(f));
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
      if (view === "bloom" && bloomDone) b.classList.add(clueMatches(k, clue.kind, clue.day) ? "ok" : "bad");
      boardEl.appendChild(b);
      continue;
    }

    const v = st[k];
    let html = "";
    let label = `Case vide, ${where}`;
    if (v?.startsWith("s")) {
      const f = Number(v[1]) as Flower;
      b.classList.add("seed-cell", `f${f}`);
      html = SEED_SVG;
      label = `Graine ${OF[f]}, ${where}`;
    } else if (v?.startsWith("m")) {
      const f = Number(v[1]) as Flower;
      b.classList.add(`f${f}`);
      html = '<span class="maybe"></span>';
      label = `Possible pour le ${NAMES[f]}, ${where}`;
    } else if (v === "x") {
      html = '<span class="cross"></span>';
      label = `Croix, ${where}`;
    }

    if (view === "bloom") {
      const g = garden.get(k);
      if (g && g.day <= bloomDay) {
        b.classList.add("bloom");
        const pop = g.day === bloomDay && !bloomDone ? "pop" : "";
        if (g.kind === "nue") {
          b.classList.add("bare-bloom");
          html = v?.startsWith("s") ? SEED_SVG : "";
        } else {
          b.classList.remove("f0", "f1", "f2");
          b.classList.add(`f${g.kind}`);
          html = FLOWER_SVG(pop) + (v?.startsWith("s") ? SEED_SVG : "");
        }
      }
    }
    b.innerHTML = html;
    b.setAttribute("aria-label", label);
    bindCell(b, k);
    boardEl.appendChild(b);
  }

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
      `${bad} indice${bad > 1 ? "s ne correspondent" : " ne correspond"} pas (cerclé${bad > 1 ? "s" : ""} de rouge). Touche une case pour replanter.`,
      "err",
    );
  }
}

$("grow").addEventListener("click", () => {
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

$("hint").addEventListener("click", () => {
  const p = puzzle();
  const seeds = placedSeeds();
  const st = marks[current];
  const wrong = FLOWERS.find((f) => seeds[f] && seeds[f] !== key(...p.seeds[f]));
  if (wrong !== undefined) {
    delete st[seeds[wrong]!];
    stopBloom();
    render();
    save();
    return setStatus(`La graine ${OF[wrong]} n'était pas au bon endroit : je l'ai retirée.`);
  }
  const next = FLOWERS.find((f) => !seeds[f]);
  if (next === undefined) return setStatus("Tes trois graines sont déjà bien placées. Fais pousser le jardin !");
  const [r, c] = p.seeds[next];
  setMark(key(r, c), `s${next}`);
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
