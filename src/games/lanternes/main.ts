import "../../styles/base.css";
import "../../styles/game.css";
import "./lanternes.css";
import { bindCellInput, refocusCell } from "../../shared/cellInput";
import { load, save as persist } from "../../shared/storage";
import { PUZZLES } from "./puzzles";

/* Marques posées par le joueur : 1 lanterne, 2 croix, 3 possible */
const LANTERN = 1, CROSS = 2, MAYBE = 3;
type Mark = typeof LANTERN | typeof CROSS | typeof MAYBE;
type Marks = Record<string, Mark>;

const STORAGE_KEY = "lanternes-v1";
const DIRS: [number, number][] = [[-1, -1], [-1, 1], [1, -1], [1, 1]];
const LANTERN_HTML = '<i class="roof"></i><i class="box"></i><i class="post"></i><i class="base"></i>';

let current = 0;
let state: Marks[] = PUZZLES.map(() => ({}));
let solved: boolean[] = PUZZLES.map(() => false);

const saved = load<{ state: Marks[]; solved: boolean[]; current: number }>(STORAGE_KEY);
if (saved && Array.isArray(saved.state) && saved.state.length === PUZZLES.length) {
  state = saved.state;
  solved = saved.solved ?? solved;
  current = saved.current ?? 0;
}
const save = () => persist(STORAGE_KEY, { state, solved, current });

const $ = (id: string) => document.getElementById(id) as HTMLElement;
const boardEl = $("board");
const statusEl = $("status");
const counterEl = $("counter");
const tabsEl = $("tabs");

const key = (r: number, c: number) => `${r},${c}`;

function rays(r: number, c: number, n: number, rocks: Set<string>): string[] {
  const out: string[] = [];
  for (const [dr, dc] of DIRS) {
    let rr = r + dr, cc = c + dc;
    while (rr >= 0 && rr < n && cc >= 0 && cc < n && !rocks.has(key(rr, cc))) {
      out.push(key(rr, cc));
      rr += dr; cc += dc;
    }
  }
  return out;
}

interface Analysis {
  n: number;
  rocks: Set<string>;
  clues: Map<string, number>;
  lanterns: [number, number][];
  lit: Map<string, number>;
  bad: Set<string>;
  clueState: Map<string, "" | "ok" | "bad">;
}

function analyse(): Analysis {
  const p = PUZZLES[current];
  const n = p.n;
  const rocks = new Set(p.rocks.map(([r, c]) => key(r, c)));
  const clues = new Map(p.clues.map(([r, c, v]) => [key(r, c), v] as [string, number]));
  const st = state[current];
  const lanterns = Object.keys(st)
    .filter((k) => st[k] === LANTERN)
    .map((k) => k.split(",").map(Number) as [number, number]);

  const lit = new Map<string, number>();
  for (const [r, c] of lanterns) for (const k of rays(r, c, n, rocks)) lit.set(k, (lit.get(k) ?? 0) + 1);

  const rowCount = Array(n).fill(0), colCount = Array(n).fill(0);
  for (const [r, c] of lanterns) { rowCount[r]++; colCount[c]++; }
  const bad = new Set<string>();
  for (const [r, c] of lanterns) {
    if (lit.has(key(r, c)) || rowCount[r] > 1 || colCount[c] > 1) bad.add(key(r, c));
  }

  const clueState = new Map<string, "" | "ok" | "bad">();
  for (const [k, v] of clues) {
    const got = lit.get(k) ?? 0;
    clueState.set(k, got > v ? "bad" : got === v && got > 0 ? "ok" : "");
  }
  return { n, rocks, clues, lanterns, lit, bad, clueState };
}

function isSolved(a: Analysis): boolean {
  if (a.lanterns.length !== a.n || a.bad.size) return false;
  for (const [k, v] of a.clues) if ((a.lit.get(k) ?? 0) !== v) return false;
  return true;
}

/* --- Effets des gestes (les gestes eux-mêmes sont dans shared/cellInput) --- */
function setMark(k: string, mark: Mark | 0) {
  const st = state[current];
  if (mark) st[k] = mark; else delete st[k];
  setStatus("");
  render();
  save();
  refocusCell(boardEl, k);
  if (isSolved(analyse()) && !solved[current]) win();
}

function cycle(k: string) {
  // vide → lanterne → possible → vide (une croix devient lanterne)
  const v = state[current][k] ?? 0;
  setMark(k, v === LANTERN ? MAYBE : v === MAYBE ? 0 : LANTERN);
}

function toggleCross(k: string) {
  setMark(k, state[current][k] === CROSS ? 0 : CROSS);
}

function bindCell(b: HTMLButtonElement, k: string) {
  b.dataset.key = k;
  bindCellInput(b, {
    primary: () => cycle(k),
    cross: () => toggleCross(k),
    maybe: () => setMark(k, state[current][k] === MAYBE ? 0 : MAYBE),
  });
}

/* --- Rendu --- */
function render() {
  const a = analyse();
  boardEl.style.setProperty("--n", String(a.n));
  boardEl.innerHTML = "";
  for (let r = 0; r < a.n; r++) for (let c = 0; c < a.n; c++) {
    const k = key(r, c);
    const where = `ligne ${r + 1}, colonne ${c + 1}`;
    const b = document.createElement("button");
    b.type = "button";
    b.className = "cell";
    b.setAttribute("role", "gridcell");
    const l = a.lit.get(k) ?? 0;

    if (a.rocks.has(k)) {
      b.classList.add("rock");
      b.disabled = true;
      b.innerHTML = '<span class="stone"></span>';
      b.setAttribute("aria-label", "Rocher");
      boardEl.appendChild(b);
      continue;
    }
    if (l) { b.classList.add("lit"); b.style.setProperty("--lit", String(Math.min(l, 4))); }

    if (a.clues.has(k)) {
      b.classList.add("clue");
      const cs = a.clueState.get(k);
      if (cs) b.classList.add(cs);
      b.innerHTML = `<span class="num">${a.clues.get(k)}</span>`;
      b.setAttribute("aria-label", `Chiffre ${a.clues.get(k)}, éclairé par ${l}`);
      b.tabIndex = -1;
    } else {
      const v = state[current][k];
      if (v === LANTERN) {
        b.classList.add("lantern-cell");
        if (a.bad.has(k)) b.classList.add("bad");
        b.innerHTML = `<span class="lantern">${LANTERN_HTML}</span>`;
        b.setAttribute("aria-label", `Lanterne, ${where}`);
      } else if (v === CROSS) {
        b.innerHTML = '<span class="cross"></span>';
        b.setAttribute("aria-label", `Croix, ${where}`);
      } else if (v === MAYBE) {
        b.innerHTML = `<span class="lantern ghost">${LANTERN_HTML}</span>`;
        b.setAttribute("aria-label", `Possible, ${where}`);
      } else {
        b.setAttribute("aria-label", `Case vide, ${where}`);
      }
      bindCell(b, k);
    }
    boardEl.appendChild(b);
  }
  counterEl.textContent = `${a.lanterns.length} / ${a.n} lanternes posées`;
  tabsEl.querySelectorAll(".tab").forEach((t, i) => {
    t.setAttribute("aria-pressed", i === current ? "true" : "false");
    t.classList.toggle("done", !!solved[i]);
  });
}

function setStatus(msg: string, cls?: "win" | "err") {
  statusEl.textContent = msg;
  statusEl.className = "status" + (cls ? " " + cls : "");
}

function win() {
  solved[current] = true;
  save();
  render();
  const left = solved.filter((x) => !x).length;
  setStatus(
    left
      ? `Le jardin s'illumine. Bravo ! Il te reste ${left} jardin${left > 1 ? "s" : ""}.`
      : "Tous les jardins brillent. Bravo !",
    "win",
  );
}

/* --- Boutons --- */
$("check").addEventListener("click", () => {
  const a = analyse();
  if (isSolved(a)) { win(); return; }
  if (a.bad.size) return setStatus("Une lanterne en rouge est éclairée par une autre ou partage sa ligne ou sa colonne.", "err");
  if ([...a.clueState.values()].includes("bad")) return setStatus("Un chiffre en rouge reçoit trop de lumière.", "err");
  const sol = PUZZLES[current].sol;
  if (a.lanterns.some(([r, c]) => sol[r] !== c)) {
    return setStatus("Pas de conflit visible, mais au moins une lanterne n'est pas à sa place.", "err");
  }
  setStatus("Rien de faux pour l'instant. Continue !");
});

$("hint").addEventListener("click", () => {
  const a = analyse();
  const sol = PUZZLES[current].sol;
  const st = state[current];
  const wrong = a.lanterns.find(([r, c]) => sol[r] !== c);
  if (wrong) {
    delete st[key(wrong[0], wrong[1])];
    render();
    save();
    return setStatus(`La lanterne en ligne ${wrong[0] + 1}, colonne ${wrong[1] + 1} était mal placée : je l'ai retirée.`);
  }
  for (let r = 0; r < a.n; r++) {
    const k = key(r, sol[r]);
    if (st[k] !== LANTERN) {
      st[k] = LANTERN;
      render();
      save();
      setStatus(`Une lanterne posée en ligne ${r + 1}, colonne ${sol[r] + 1}.`);
      if (isSolved(analyse()) && !solved[current]) win();
      return;
    }
  }
});

$("reset").addEventListener("click", () => {
  state[current] = {};
  solved[current] = false;
  save();
  setStatus("");
  render();
});

PUZZLES.forEach((p, i) => {
  const t = document.createElement("button");
  t.type = "button";
  t.className = "tab";
  t.textContent = p.name;
  t.addEventListener("click", () => { current = i; save(); setStatus(""); render(); });
  tabsEl.appendChild(t);
});

render();
