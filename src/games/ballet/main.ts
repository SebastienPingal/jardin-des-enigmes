import "../../styles/base.css";
import "../../styles/game.css";
import "./ballet.css";
import { createInputController, refocusCell, type InputMode } from "../../shared/cellInput";
import { load, save as persist } from "../../shared/storage";
import { FIGURES, capitalize, ordinal, transform, type BalletPuzzle, type Clue, type FigureId } from "./figures";
import { PUZZLES } from "./puzzles";

type SnapClue = Extract<Clue, { kind: "snap" }>;

/* --- Lucioles : une couleur et une forme chacune, pour rester lisibles sans les couleurs --- */
const FIREFLIES = [
  { name: "luciole rouge", color: "#ff6a4d", shape: '<circle cx="10" cy="10" r="8"/>' },
  { name: "luciole bleue", color: "#7aa8ff", shape: '<rect x="2.5" y="2.5" width="15" height="15" rx="2.5"/>' },
  { name: "luciole jaune", color: "#ffd84d", shape: '<polygon points="10,1.5 18.5,17.5 1.5,17.5"/>' },
  { name: "luciole verte", color: "#6fe39a", shape: '<polygon points="10,1 19,10 10,19 1,10"/>' },
  { name: "luciole violette", color: "#c79bff", shape: `<polygon points="${starPoints()}"/>` },
  { name: "luciole blanche", color: "#f4efe2", shape: '<polygon points="10,1 18,5.5 18,14.5 10,19 2,14.5 2,5.5"/>' },
];

function starPoints() {
  const pts: string[] = [];
  for (let i = 0; i < 10; i++) {
    const r = i % 2 ? 4.2 : 9.2;
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    pts.push(`${(10 + r * Math.cos(a)).toFixed(2)},${(10.6 + r * Math.sin(a)).toFixed(2)}`);
  }
  return pts.join(" ");
}

const firefly = (b: number, extra = "") =>
  `<span class="bead ${extra}" title="${FIREFLIES[b].name}" style="--bc:${FIREFLIES[b].color}">` +
  `<svg viewBox="0 0 20 20" aria-hidden="true">${FIREFLIES[b].shape}</svg></span>`;
const unknownFirefly = () => '<span class="bead unknown" title="luciole non aperçue">?</span>';
const lineLabel = (n: (number | null)[]) =>
  n.map((b, i) => `${i + 1} : ${b === null ? "inconnue" : FIREFLIES[b].name}`).join(", ");

/** Schéma d'une figure : chaque place du haut est reliée à la place où la luciole arrive en bas. */
function figureDiagram(f: FigureId, cls = "diagram") {
  const x = (i: number) => 8 + i * 16;
  const perm = FIGURES[f].perm;
  const lines = perm
    .map((from, to) => `<line class="${from === to ? "still" : "move"}" x1="${x(from)}" y1="6" x2="${x(to)}" y2="30"/>`)
    .join("");
  const dots = [0, 1, 2, 3, 4, 5].map((i) => `<circle cx="${x(i)}" cy="6" r="2.6"/><circle cx="${x(i)}" cy="30" r="2.6"/>`).join("");
  return `<svg class="${cls}" viewBox="0 0 96 36" aria-hidden="true">${lines}${dots}</svg>`;
}

/* --- État du joueur --- */
interface SlotMarks {
  figure?: FigureId;
  notes?: FigureId[];
  crosses?: FigureId[];
}

const STORAGE_KEY = "ballet-v1";
const STEP_MS = 550;

let current = 0;
let selected = 0; // index dans la liste des figures de la soirée courante
let mode: InputMode = "place";
let slots: SlotMarks[][] = PUZZLES.map((p) => p.order.map(() => ({})));
let solved: boolean[] = PUZZLES.map(() => false);
// Lignes de brouillon : drafts[soirée][étape][place] = luciole supposée, ou null
type Draft = (number | null)[];
let drafts: Record<number, Draft>[] = PUZZLES.map(() => ({}));

const saved = load<{
  slots: SlotMarks[][];
  solved: boolean[];
  current: number;
  selected: number;
  mode?: InputMode;
  drafts?: Record<number, Draft>[];
}>(STORAGE_KEY);
if (saved && Array.isArray(saved.slots) && saved.slots.length === PUZZLES.length) {
  slots = saved.slots;
  solved = saved.solved ?? solved;
  current = saved.current ?? 0;
  selected = saved.selected ?? 0;
  mode = saved.mode ?? "place";
  if (Array.isArray(saved.drafts) && saved.drafts.length === PUZZLES.length) drafts = saved.drafts;
}
const save = () => persist(STORAGE_KEY, { slots, solved, current, selected, mode, drafts });

/* Menu de choix de luciole ouvert sous un emplacement de brouillon */
let picker: { step: number; pos: number } | null = null;

/* Vue « ballet » : les figures s'enchaînent, étape par étape */
let view: "edit" | "play" = "edit";
let playStep = 0;
let timer: number | undefined;

const $ = (id: string) => document.getElementById(id) as HTMLElement;
const timelineEl = $("timeline");
const figuresEl = $("figures");
const remarksEl = $("remarks");
const statusEl = $("status");
const tabsEl = $("tabs");

const puzzle = (): BalletPuzzle => PUZZLES[current];
const selectedFigure = (): FigureId => {
  const list = puzzle().figures;
  return list[Math.min(selected, list.length - 1)];
};

function statesOf(order: FigureId[]): number[][] {
  const out = [puzzle().start];
  for (const f of order) out.push(transform(f, out[out.length - 1]));
  return out;
}

function placedOrder(): FigureId[] | null {
  const order = slots[current].map((s) => s.figure);
  return order.every(Boolean) ? (order as FigureId[]) : null;
}

/* --- Effets des gestes --- */
function stopPlay() {
  window.clearInterval(timer);
  timer = undefined;
  view = "edit";
}

function updateSlot(i: number, change: (slot: SlotMarks) => void) {
  const slot = slots[current][i];
  change(slot);
  if (slot.notes && !slot.notes.length) delete slot.notes;
  if (slot.crosses && !slot.crosses.length) delete slot.crosses;
  stopPlay();
  setStatus("");
  render();
  save();
  refocusCell(timelineEl, String(i));
}

const without = (list: FigureId[] | undefined, f: FigureId) => (list ?? []).filter((x) => x !== f);
const toggled = (list: FigureId[] | undefined, f: FigureId) =>
  list?.includes(f) ? without(list, f) : [...(list ?? []), f];

function putFigure(slot: SlotMarks, f: FigureId) {
  // chaque figure n'est dansée qu'une fois : on la retire de son ancienne place
  for (const other of slots[current]) if (other !== slot && other.figure === f) delete other.figure;
  slot.figure = f;
  slot.crosses = without(slot.crosses, f);
}

function place(i: number) {
  const f = selectedFigure();
  updateSlot(i, (slot) => {
    if (slot.figure === f) delete slot.figure;
    else putFigure(slot, f);
  });
}

function note(i: number) {
  const f = selectedFigure();
  updateSlot(i, (slot) => {
    slot.notes = toggled(slot.notes, f);
  });
}

function cross(i: number) {
  const f = selectedFigure();
  updateSlot(i, (slot) => {
    slot.crosses = toggled(slot.crosses, f);
    if (slot.crosses.includes(f) && slot.figure === f) delete slot.figure;
  });
}

function backToEdit() {
  stopPlay();
  setStatus("");
  render();
}
const unlessPlaying = (action: () => void) => () => (view === "play" ? backToEdit() : action());

const input = createInputController({
  switchEl: $("mode"),
  placeLabel: "Placer",
  initialMode: mode,
  onModeChange: (m) => {
    mode = m;
    save();
  },
});

function selectFigure(i: number) {
  selected = i;
  save();
  renderFigures();
}

document.addEventListener("keydown", (e) => {
  const n = Number(e.key);
  if (Number.isInteger(n) && n >= 1 && n <= puzzle().figures.length) selectFigure(n - 1);
  if (e.key === "Escape" && picker) {
    const { step, pos } = picker;
    picker = null;
    render();
    timelineEl.querySelector<HTMLElement>(`[data-step="${step}"][data-pos="${pos}"]`)?.focus({ preventScroll: true });
  } else if (e.key === "Escape" && view === "play") backToEdit();
});

/* --- Rendu --- */
function renderFigures() {
  const p = puzzle();
  figuresEl.innerHTML = "";
  p.figures.forEach((id, i) => {
    const f = FIGURES[id];
    const at = slots[current].findIndex((s) => s.figure === id);
    const b = document.createElement("button");
    b.type = "button";
    b.className = "figure-card" + (at >= 0 ? " used" : "");
    b.setAttribute("role", "radio");
    b.setAttribute("aria-checked", i === Math.min(selected, p.figures.length - 1) ? "true" : "false");
    b.setAttribute("aria-label", `${f.title} : ${f.rule}${at >= 0 ? `, placée en ${ordinal(at + 1)}` : ""}`);
    b.innerHTML =
      `<span class="who">${f.title}${at >= 0 ? `<span class="where">${ordinal(at + 1)}</span>` : ""}</span>` +
      figureDiagram(id) +
      `<span class="rule">${capitalize(f.rule)}.</span>`;
    b.addEventListener("click", () => selectFigure(i));
    figuresEl.appendChild(b);
  });
}

function lineRow(label: string, html: string, aria: string, cls = "") {
  return `<div class="row ${cls}"><span class="row-label">${label}</span><div class="necklace" role="img" aria-label="${aria}">${html}</div></div>`;
}

/** Ligne intermédiaire : lucioles aperçues fixes, les autres sont un brouillon à remplir. */
function draftRow(step: number, label: string, clueFlies: (number | null)[]) {
  const draft = drafts[current][step] ?? [];
  const cells = clueFlies
    .map((b, pos) => {
      if (b !== null) return firefly(b);
      const d = draft[pos] ?? null;
      const open = picker?.step === step && picker.pos === pos;
      return (
        `<button type="button" class="bead-btn${open ? " open" : ""}" data-step="${step}" data-pos="${pos}" ` +
        `aria-expanded="${open}" aria-label="Brouillon ${label.toLowerCase()}, place ${pos + 1} : ${d === null ? "vide" : FIREFLIES[d].name}">` +
        `${d === null ? unknownFirefly() : firefly(d, "draft")}</button>`
      );
    })
    .join("");
  let html = `<div class="row"><span class="row-label">${label}</span><div class="necklace">${cells}</div></div>`;
  if (picker?.step === step) {
    const fixed = new Set(clueFlies.filter((b): b is number => b !== null));
    html +=
      `<div class="bead-picker" role="group" aria-label="Place ${picker.pos + 1}, ${label.toLowerCase()}">` +
      FIREFLIES.map(
        (_, b) =>
          `<button type="button" data-pick="${b}"${fixed.has(b) ? " disabled" : ""} aria-label="${FIREFLIES[b].name}">${firefly(b)}</button>`,
      ).join("") +
      '<button type="button" class="erase" data-pick="-1">Effacer</button></div>';
  }
  return html;
}

function setDraft(step: number, pos: number, b: number) {
  const row = (drafts[current][step] ??= [null, null, null, null, null, null]);
  if (b >= 0) {
    // les six lucioles sont toutes différentes : on retire celle-ci de son ancienne place sur la ligne
    for (let i = 0; i < row.length; i++) if (row[i] === b) row[i] = null;
    row[pos] = b;
  } else {
    row[pos] = null;
  }
  picker = null;
  save();
  render();
  timelineEl.querySelector<HTMLElement>(`[data-step="${step}"][data-pos="${pos}"]`)?.focus({ preventScroll: true });
}

// Brouillons : un seul écouteur pour toute la frise
timelineEl.addEventListener("click", (e) => {
  const target = e.target as HTMLElement;
  const pick = target.closest<HTMLElement>("[data-pick]");
  if (pick && picker) return setDraft(picker.step, picker.pos, Number(pick.dataset.pick));
  const spot = target.closest<HTMLElement>("[data-step]");
  if (!spot) return;
  if (view === "play") return backToEdit();
  const step = Number(spot.dataset.step), pos = Number(spot.dataset.pos);
  picker = picker?.step === step && picker.pos === pos ? null : { step, pos };
  render();
  timelineEl.querySelector<HTMLElement>(picker ? "[data-pick]:not([disabled])" : `[data-step="${step}"][data-pos="${pos}"]`)
    ?.focus({ preventScroll: true });
});

const chip = (f: FigureId, title: string) => `<i title="${title} : ${FIGURES[f].title}">${figureDiagram(f, "mini")}</i>`;

function render() {
  const p = puzzle();
  const K = p.order.length;
  const snaps = p.clues.filter((c): c is SnapClue => c.kind === "snap");
  const states = view === "play" ? statesOf(placedOrder() ?? []) : [];
  timelineEl.innerHTML = "";

  const startLi = document.createElement("li");
  startLi.className = "step start";
  startLi.innerHTML =
    `<div class="positions" aria-hidden="true">${[1, 2, 3, 4, 5, 6].map((n) => `<span>${n}</span>`).join("")}</div>` +
    lineRow("Début", p.start.map((b) => firefly(b)).join(""), `Ligne au début du bal : ${lineLabel(p.start)}`);
  timelineEl.appendChild(startLi);

  for (let i = 0; i < K; i++) {
    const li = document.createElement("li");
    li.className = "step";

    // La place de la figure
    const slot = slots[current][i];
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "slot" + (slot.figure ? " filled" : "");
    btn.dataset.key = String(i);
    const marks =
      (slot.notes?.length ? `<span class="slot-notes">${slot.notes.map((f) => chip(f, "possible")).join("")}</span>` : "") +
      (slot.crosses?.length ? `<span class="slot-crosses">${slot.crosses.map((f) => chip(f, "pas ici")).join("")}</span>` : "");
    btn.innerHTML =
      `<span class="slot-num">${ordinal(i + 1)}</span>` +
      (slot.figure
        ? `<span class="slot-figure">${figureDiagram(slot.figure, "mini")}${FIGURES[slot.figure].title}</span>`
        : '<span class="slot-empty">?</span>') +
      marks;
    const parts = [slot.figure ? FIGURES[slot.figure].title : "vide"];
    if (slot.notes?.length) parts.push(`possibles : ${slot.notes.map((f) => FIGURES[f].title).join(", ")}`);
    if (slot.crosses?.length) parts.push(`barrées : ${slot.crosses.map((f) => FIGURES[f].title).join(", ")}`);
    btn.setAttribute("aria-label", `${ordinal(i + 1)} figure : ${parts.join(" ; ")}`);
    input.bind(btn, {
      place: unlessPlaying(() => place(i)),
      note: unlessPlaying(() => note(i)),
      cross: unlessPlaying(() => cross(i)),
    });
    li.appendChild(btn);

    // Ce qu'on sait de la ligne après cette figure
    const step = i + 1;
    const isEnd = step === K;
    const expected: (number | null)[] = isEnd
      ? p.end
      : [0, 1, 2, 3, 4, 5].map((pos) => snaps.find((c) => c.step === step && c.pos === pos)?.bead ?? null);
    const known = expected.some((b) => b !== null);
    const label = isEnd ? "Fin du bal" : `Après la ${ordinal(step)}`;
    let rows = "";
    if (view === "edit" && !isEnd) {
      rows += draftRow(step, label, expected);
    } else if (known) {
      rows += lineRow(
        label,
        expected.map((b) => (b === null ? unknownFirefly() : firefly(b))).join(""),
        `${label}, lucioles connues : ${lineLabel(expected)}`,
        view === "play" ? "expected" : "",
      );
    }
    if (view === "play" && step <= playStep) {
      const got = states[step];
      rows += lineRow(
        known ? "obtenu" : label,
        got.map((b, pos) => firefly(b, expected[pos] === null ? "" : expected[pos] === b ? "ok" : "bad")).join(""),
        `${label}, ligne obtenue : ${lineLabel(got)}`,
        "got",
      );
    }
    if (rows) {
      const after = document.createElement("div");
      after.className = "after";
      after.innerHTML = rows;
      li.appendChild(after);
    }
    timelineEl.appendChild(li);
  }

  // Remarques sur l'ordre
  const remarks = p.clues
    .map((c) => {
      if (c.kind === "before") return `${capitalize(FIGURES[c.a].name)} vient avant ${FIGURES[c.b].name} (pas forcément juste avant).`;
      if (c.kind === "notat") return `${capitalize(FIGURES[c.a].name)} n'est pas la ${ordinal(c.slot + 1)} figure.`;
      return null;
    })
    .filter(Boolean);
  remarksEl.innerHTML = remarks.length
    ? `<h3>Remarques</h3><ul>${remarks.map((r) => `<li>${r}</li>`).join("")}</ul>`
    : "";

  $("play").textContent = view === "play" ? "Revenir à la chorégraphie" : "Lancer le ballet";
  tabsEl.querySelectorAll(".tab").forEach((t, i) => {
    t.setAttribute("aria-pressed", i === current ? "true" : "false");
    t.classList.toggle("done", !!solved[i]);
  });
  renderFigures();
}

function setStatus(msg: string, cls?: "win" | "err") {
  statusEl.textContent = msg;
  statusEl.className = "status" + (cls ? " " + cls : "");
}

/* --- Lancer le ballet --- */
function finishPlay() {
  window.clearInterval(timer);
  timer = undefined;
  const p = puzzle();
  const order = placedOrder()!;
  playStep = order.length;
  render();
  const states = statesOf(order);
  const snapsBad = p.clues.filter((c) => c.kind === "snap" && states[c.step][c.pos] !== c.bead).length;
  const endBad = states[order.length].some((b, i) => b !== p.end[i]);
  const remarkBad = p.clues.filter(
    (c) =>
      (c.kind === "before" && order.indexOf(c.a) > order.indexOf(c.b)) ||
      (c.kind === "notat" && order[c.slot] === c.a),
  ).length;
  if (!snapsBad && !endBad && !remarkBad) {
    solved[current] = true;
    save();
    render();
    const left = solved.filter((x) => !x).length;
    setStatus(
      left
        ? `Le bal se termine exactement comme prévu. Bravo ! Il te reste ${left} soirée${left > 1 ? "s" : ""}.`
        : "Toutes les chorégraphies sont retrouvées. Bravo !",
      "win",
    );
    return;
  }
  const problems: string[] = [];
  if (endBad) problems.push("la ligne de fin ne correspond pas");
  if (snapsBad) problems.push(`${snapsBad} luciole${snapsBad > 1 ? "s aperçues ne correspondent" : " aperçue ne correspond"} pas`);
  if (remarkBad) problems.push(`${remarkBad} remarque${remarkBad > 1 ? "s ne sont pas respectées" : " n'est pas respectée"}`);
  setStatus(`${capitalize(problems.join(", "))}. Les lucioles cerclées de rouge diffèrent de ce qui était attendu.`, "err");
}

$("play").addEventListener("click", () => {
  if (view === "play") return backToEdit();
  const order = placedOrder();
  if (!order) return setStatus("Il faut une figure à chaque place avant de lancer le ballet.", "err");
  stopPlay();
  view = "play";
  playStep = 0;
  setStatus("Les lucioles dansent…");
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return finishPlay();
  render();
  timer = window.setInterval(() => {
    playStep++;
    if (playStep >= order.length) finishPlay();
    else render();
  }, STEP_MS);
});

$("hint").addEventListener("click", () => {
  const p = puzzle();
  const i = p.order.findIndex((f, idx) => slots[current][idx].figure !== f);
  if (i < 0) return setStatus("Toutes les figures sont à la bonne place. Lance le ballet !");
  const f = p.order[i];
  updateSlot(i, (slot) => putFigure(slot, f));
  setStatus(`${capitalize(FIGURES[f].name)} est la ${ordinal(i + 1)} figure.`);
});

$("reset").addEventListener("click", () => {
  slots[current] = puzzle().order.map(() => ({}));
  drafts[current] = {};
  picker = null;
  solved[current] = false;
  stopPlay();
  save();
  setStatus("");
  render();
});

PUZZLES.forEach((p, i) => {
  const t = document.createElement("button");
  t.type = "button";
  t.className = "tab";
  t.textContent = `${p.name} · ${p.order.length} figures`;
  t.addEventListener("click", () => {
    current = i;
    selected = 0;
    picker = null;
    stopPlay();
    save();
    setStatus("");
    render();
  });
  tabsEl.appendChild(t);
});

render();
