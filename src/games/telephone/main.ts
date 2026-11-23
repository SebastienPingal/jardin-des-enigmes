import "../../styles/base.css";
import "../../styles/game.css";
import "./telephone.css";
import { createInputController, refocusCell, type InputMode } from "../../shared/cellInput";
import { load, save as persist } from "../../shared/storage";
import { ANIMALS, capitalize, ordinal, transform, type AnimalId, type Clue, type TelephonePuzzle } from "./animals";

type SnapClue = Extract<Clue, { kind: "snap" }>;
import { PUZZLES } from "./puzzles";

/* --- Perles : une couleur et une forme chacune, pour rester lisibles sans les couleurs --- */
const BEADS = [
  { name: "rond rouge", color: "#e8563f", shape: '<circle cx="10" cy="10" r="8"/>' },
  { name: "carré bleu", color: "#6f9cf2", shape: '<rect x="2.5" y="2.5" width="15" height="15" rx="2.5"/>' },
  { name: "triangle jaune", color: "#f2cf4a", shape: '<polygon points="10,1.5 18.5,17.5 1.5,17.5"/>' },
  { name: "losange vert", color: "#6cc28a", shape: '<polygon points="10,1 19,10 10,19 1,10"/>' },
  { name: "étoile violette", color: "#b48cf0", shape: `<polygon points="${starPoints()}"/>` },
  { name: "hexagone blanc", color: "#ece6d8", shape: '<polygon points="10,1 18,5.5 18,14.5 10,19 2,14.5 2,5.5"/>' },
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

const bead = (b: number, extra = "") =>
  `<span class="bead ${extra}" title="${BEADS[b].name}" style="--bc:${BEADS[b].color}">` +
  `<svg viewBox="0 0 20 20" aria-hidden="true">${BEADS[b].shape}</svg></span>`;
const unknownBead = () => '<span class="bead unknown" title="perle non aperçue">?</span>';
const necklaceLabel = (n: (number | null)[]) =>
  n.map((b, i) => `${i + 1} : ${b === null ? "inconnue" : BEADS[b].name}`).join(", ");

/* --- État du joueur --- */
interface SlotMarks {
  animal?: AnimalId;
  notes?: AnimalId[];
  crosses?: AnimalId[];
}

const STORAGE_KEY = "telephone-v1";
const STEP_MS = 550;

let current = 0;
let selected = 0; // index dans la liste des animaux du jardin courant
let mode: InputMode = "place";
let slots: SlotMarks[][] = PUZZLES.map((p) => p.order.map(() => ({})));
let solved: boolean[] = PUZZLES.map(() => false);

const saved = load<{ slots: SlotMarks[][]; solved: boolean[]; current: number; selected: number; mode?: InputMode }>(
  STORAGE_KEY,
);
if (saved && Array.isArray(saved.slots) && saved.slots.length === PUZZLES.length) {
  slots = saved.slots;
  solved = saved.solved ?? solved;
  current = saved.current ?? 0;
  selected = saved.selected ?? 0;
  mode = saved.mode ?? "place";
}
const save = () => persist(STORAGE_KEY, { slots, solved, current, selected, mode });

/* Vue « passage » : le collier fait le tour, étape par étape */
let view: "edit" | "play" = "edit";
let playStep = 0;
let timer: number | undefined;

const $ = (id: string) => document.getElementById(id) as HTMLElement;
const timelineEl = $("timeline");
const animalsEl = $("animals");
const remarksEl = $("remarks");
const statusEl = $("status");
const tabsEl = $("tabs");

const puzzle = (): TelephonePuzzle => PUZZLES[current];
const selectedAnimal = (): AnimalId => {
  const list = puzzle().animals;
  return list[Math.min(selected, list.length - 1)];
};

function statesOf(order: AnimalId[]): number[][] {
  const out = [puzzle().start];
  for (const a of order) out.push(transform(a, out[out.length - 1]));
  return out;
}

function placedOrder(): AnimalId[] | null {
  const order = slots[current].map((s) => s.animal);
  return order.every(Boolean) ? (order as AnimalId[]) : null;
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

const without = (list: AnimalId[] | undefined, a: AnimalId) => (list ?? []).filter((x) => x !== a);
const toggled = (list: AnimalId[] | undefined, a: AnimalId) =>
  list?.includes(a) ? without(list, a) : [...(list ?? []), a];

function putAnimal(slot: SlotMarks, a: AnimalId) {
  // un animal ne passe qu'une fois : on le retire de son ancienne place
  for (const other of slots[current]) if (other !== slot && other.animal === a) delete other.animal;
  slot.animal = a;
  slot.crosses = without(slot.crosses, a);
}

function place(i: number) {
  const a = selectedAnimal();
  updateSlot(i, (slot) => {
    if (slot.animal === a) delete slot.animal;
    else putAnimal(slot, a);
  });
}

function note(i: number) {
  const a = selectedAnimal();
  updateSlot(i, (slot) => {
    slot.notes = toggled(slot.notes, a);
  });
}

function cross(i: number) {
  const a = selectedAnimal();
  updateSlot(i, (slot) => {
    slot.crosses = toggled(slot.crosses, a);
    if (slot.crosses.includes(a) && slot.animal === a) delete slot.animal;
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

function selectAnimal(i: number) {
  selected = i;
  save();
  renderAnimals();
}

document.addEventListener("keydown", (e) => {
  const n = Number(e.key);
  if (Number.isInteger(n) && n >= 1 && n <= puzzle().animals.length) selectAnimal(n - 1);
  if (e.key === "Escape" && view === "play") backToEdit();
});

/* --- Rendu --- */
function permDiagram(a: AnimalId) {
  const after = ANIMALS[a].perm.map((p) => p + 1).join("");
  return `<span class="perm" aria-label="positions 123456 deviennent ${after.split("").join(" ")}"><span>123456</span><span class="arrow">→</span><span>${after}</span></span>`;
}

function renderAnimals() {
  const p = puzzle();
  animalsEl.innerHTML = "";
  p.animals.forEach((id, i) => {
    const a = ANIMALS[id];
    const at = slots[current].findIndex((s) => s.animal === id);
    const b = document.createElement("button");
    b.type = "button";
    b.className = "animal-card" + (at >= 0 ? " used" : "");
    b.setAttribute("role", "radio");
    b.setAttribute("aria-checked", i === Math.min(selected, p.animals.length - 1) ? "true" : "false");
    b.innerHTML =
      `<span class="emoji" aria-hidden="true">${a.emoji}</span>` +
      `<span class="who">${capitalize(a.name)}${at >= 0 ? `<span class="where">${ordinal(at + 1)}</span>` : ""}</span>` +
      `<span class="rule">${capitalize(a.rule)}.</span>` +
      permDiagram(id);
    b.addEventListener("click", () => selectAnimal(i));
    animalsEl.appendChild(b);
  });
}

function necklaceRow(label: string, html: string, aria: string, cls = "") {
  return `<div class="row ${cls}"><span class="row-label">${label}</span><div class="necklace" role="img" aria-label="${aria}">${html}</div></div>`;
}

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
    necklaceRow("Départ", p.start.map((b) => bead(b)).join(""), `Collier de départ : ${necklaceLabel(p.start)}`);
  timelineEl.appendChild(startLi);

  for (let i = 0; i < K; i++) {
    const li = document.createElement("li");
    li.className = "step";

    // La place de l'animal
    const slot = slots[current][i];
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "slot" + (slot.animal ? " filled" : "");
    btn.dataset.key = String(i);
    const marks =
      (slot.notes?.length ? `<span class="slot-notes">${slot.notes.map((a) => `<i title="possible : ${ANIMALS[a].name}">${ANIMALS[a].emoji}</i>`).join("")}</span>` : "") +
      (slot.crosses?.length ? `<span class="slot-crosses">${slot.crosses.map((a) => `<i title="pas ici : ${ANIMALS[a].name}">${ANIMALS[a].emoji}</i>`).join("")}</span>` : "");
    btn.innerHTML =
      `<span class="slot-num">${ordinal(i + 1)}</span>` +
      (slot.animal
        ? `<span class="slot-animal"><span class="emoji" aria-hidden="true">${ANIMALS[slot.animal].emoji}</span>${capitalize(ANIMALS[slot.animal].name)}</span>`
        : '<span class="slot-empty">?</span>') +
      marks;
    const parts = [slot.animal ? ANIMALS[slot.animal].name : "vide"];
    if (slot.notes?.length) parts.push(`possibles : ${slot.notes.map((a) => ANIMALS[a].name).join(", ")}`);
    if (slot.crosses?.length) parts.push(`barrés : ${slot.crosses.map((a) => ANIMALS[a].name).join(", ")}`);
    btn.setAttribute("aria-label", `${ordinal(i + 1)} place : ${parts.join(" ; ")}`);
    input.bind(btn, {
      place: unlessPlaying(() => place(i)),
      note: unlessPlaying(() => note(i)),
      cross: unlessPlaying(() => cross(i)),
    });
    li.appendChild(btn);

    // Ce qu'on sait du collier après cet animal
    const step = i + 1;
    const isEnd = step === K;
    const expected: (number | null)[] = isEnd
      ? p.end
      : [0, 1, 2, 3, 4, 5].map((pos) => snaps.find((c) => c.step === step && c.pos === pos)?.bead ?? null);
    const known = expected.some((b) => b !== null);
    const label = isEnd ? "Arrivée" : `Après le ${ordinal(step)}`;
    let rows = "";
    if (known) {
      rows += necklaceRow(
        label,
        expected.map((b) => (b === null ? unknownBead() : bead(b))).join(""),
        `${label}, perles connues : ${necklaceLabel(expected)}`,
        view === "play" ? "expected" : "",
      );
    }
    if (view === "play" && step <= playStep) {
      const got = states[step];
      rows += necklaceRow(
        known ? "obtenu" : label,
        got.map((b, pos) => bead(b, expected[pos] === null ? "" : expected[pos] === b ? "ok" : "bad")).join(""),
        `${label}, collier obtenu : ${necklaceLabel(got)}`,
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
      if (c.kind === "before") return `${capitalize(ANIMALS[c.a].name)} passe avant ${ANIMALS[c.b].name} (pas forcément juste avant).`;
      if (c.kind === "notat") return `${capitalize(ANIMALS[c.a].name)} n'est pas ${ordinal(c.slot + 1)}.`;
      return null;
    })
    .filter(Boolean);
  remarksEl.innerHTML = remarks.length
    ? `<h3>Remarques</h3><ul>${remarks.map((r) => `<li>${r}</li>`).join("")}</ul>`
    : "";

  $("play").textContent = view === "play" ? "Revenir à l'ordre" : "Faire passer le collier";
  tabsEl.querySelectorAll(".tab").forEach((t, i) => {
    t.setAttribute("aria-pressed", i === current ? "true" : "false");
    t.classList.toggle("done", !!solved[i]);
  });
  renderAnimals();
}

function setStatus(msg: string, cls?: "win" | "err") {
  statusEl.textContent = msg;
  statusEl.className = "status" + (cls ? " " + cls : "");
}

/* --- Faire passer le collier --- */
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
      left ? `Le collier arrive intact. Bravo ! Il te reste ${left} jardin${left > 1 ? "s" : ""}.` : "Tous les colliers sont arrivés. Bravo !",
      "win",
    );
    return;
  }
  const problems: string[] = [];
  if (endBad) problems.push("le collier d'arrivée ne correspond pas");
  if (snapsBad) problems.push(`${snapsBad} perle${snapsBad > 1 ? "s aperçues ne correspondent" : " aperçue ne correspond"} pas`);
  if (remarkBad) problems.push(`${remarkBad} remarque${remarkBad > 1 ? "s ne sont pas respectées" : " n'est pas respectée"}`);
  setStatus(`${capitalize(problems.join(", "))}. Les perles cerclées de rouge diffèrent de ce qui était attendu.`, "err");
}

$("play").addEventListener("click", () => {
  if (view === "play") return backToEdit();
  const order = placedOrder();
  if (!order) return setStatus("Il faut un animal à chaque place avant de faire passer le collier.", "err");
  stopPlay();
  view = "play";
  playStep = 0;
  setStatus("Le collier passe de patte en patte…");
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
  const i = p.order.findIndex((a, idx) => slots[current][idx].animal !== a);
  if (i < 0) return setStatus("Tous les animaux sont à la bonne place. Fais passer le collier !");
  const a = p.order[i];
  updateSlot(i, (slot) => putAnimal(slot, a));
  setStatus(`${capitalize(ANIMALS[a].name)} passe en ${ordinal(i + 1)} position.`);
});

$("reset").addEventListener("click", () => {
  slots[current] = puzzle().order.map(() => ({}));
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
  t.textContent = `${p.name} · ${p.order.length} animaux`;
  t.addEventListener("click", () => {
    current = i;
    selected = 0;
    stopPlay();
    save();
    setStatus("");
    render();
  });
  tabsEl.appendChild(t);
});

render();
