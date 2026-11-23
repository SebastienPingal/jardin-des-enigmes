import "../../styles/base.css";
import "../../styles/game.css";
import "./signal.css";
import { load, save as persist } from "../../shared/storage";
import { GLOSS, GLYPHS, LEVELS, type Question } from "./levels";
import { sceneSvg } from "./scene";

/* --- État --- */
const STORAGE_KEY = "signal-v1";
let current = 0;
let solved: boolean[][] = LEVELS.map((l) => l.questions.map(() => false));
let drafts: string[][] = LEVELS.map((l) => l.questions.map(() => "")); // réponses en cours (glyphes, nombre ou choix)
let notes: Record<string, string> = {};

const saved = load<{ current: number; solved: boolean[][]; drafts: string[][]; notes: Record<string, string> }>(STORAGE_KEY);
if (saved && Array.isArray(saved.solved) && saved.solved.length === LEVELS.length) {
  solved = saved.solved;
  drafts = saved.drafts ?? drafts;
  notes = saved.notes ?? {};
  current = saved.current ?? 0;
}
const save = () => persist(STORAGE_KEY, { current, solved, drafts, notes });

const levelDone = (i: number) => solved[i].every(Boolean);
const unlocked = (i: number) => i === 0 || levelDone(i - 1);
if (!unlocked(current)) current = 0;

/* Glyphes connus jusqu'à un niveau, dans l'ordre de première apparition */
function knownGlyphs(upTo: number): string[] {
  const seen: string[] = [];
  for (let i = 0; i <= upTo; i++) {
    for (const t of LEVELS[i].transmissions) for (const g of t.glyphs) if (!seen.includes(g)) seen.push(g);
  }
  return seen;
}
/** Niveau où un glyphe apparaît pour la première fois. */
const glyphLevel = (g: string) => LEVELS.findIndex((l) => l.transmissions.some((t) => t.glyphs.includes(g)));
const glossShown = (g: string) => levelDone(glyphLevel(g));

const $ = (id: string) => document.getElementById(id) as HTMLElement;
const glyph = (g: string, cls = "") =>
  `<span class="glyph ${cls}" data-g="${g}"><svg viewBox="0 0 20 28" aria-hidden="true">${GLYPHS[g]}</svg></span>`;
const message = (s: string, cls = "") =>
  `<span class="msg ${cls}" role="img" aria-label="message de ${s.length} glyphe${s.length > 1 ? "s" : ""}">${[...s].map((g) => glyph(g)).join("")}</span>`;
const escapeHtml = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

function setStatus(msg: string, cls?: "win" | "err") {
  const el = $("status");
  el.textContent = msg;
  el.className = "status" + (cls ? " " + cls : "");
}

/* --- Rendu --- */
function renderTabs() {
  const tabs = $("tabs");
  tabs.innerHTML = "";
  LEVELS.forEach((l, i) => {
    const t = document.createElement("button");
    t.type = "button";
    t.className = "tab" + (levelDone(i) ? " done" : "");
    t.textContent = `${i + 1} · ${l.title}`;
    t.disabled = !unlocked(i);
    if (!unlocked(i)) t.title = "Termine la partie précédente pour recevoir la suite du signal";
    t.setAttribute("aria-pressed", i === current ? "true" : "false");
    t.addEventListener("click", () => {
      current = i;
      save();
      setStatus("");
      render();
    });
    tabs.appendChild(t);
  });
}

function renderTransmissions() {
  const level = LEVELS[current];
  const done = levelDone(current);
  $("transmissions").innerHTML = level.transmissions
    .map((t, i) => {
      const gloss = done
        ? `<span class="gloss">${[...t.glyphs].map((g) => `<span>${escapeHtml(GLOSS[g])}</span>`).join("")}</span>`
        : "";
      return (
        `<li class="transmission"><span class="t-num">T${i + 1}</span>` +
        `<div class="t-text">${message(t.glyphs)}${gloss}</div>` +
        // La légende n'apparaît qu'une fois la partie résolue (avant : seulement pour les lecteurs d'écran)
        `<figure>${sceneSvg(t.scene)}<figcaption class="${done ? "" : "sr-only"}">${t.caption}</figcaption></figure></li>`
      );
    })
    .join("");
}

function renderLexicon() {
  const lex = $("lexicon");
  lex.innerHTML = "";
  for (const g of knownGlyphs(current)) {
    const li = document.createElement("li");
    const shown = glossShown(g);
    li.className = "lex-item" + (shown ? " confirmed" : "");
    li.innerHTML =
      glyph(g, "big") +
      (shown
        ? `<span class="lex-gloss">${escapeHtml(GLOSS[g])}</span>`
        : `<input type="text" id="note-${g}" maxlength="24" placeholder="sens supposé…" aria-label="Ton hypothèse pour ce glyphe" value="${escapeHtml(notes[g] ?? "")}">`);
    const input = li.querySelector("input");
    input?.addEventListener("input", () => {
      notes[g] = input.value;
      save();
    });
    lex.appendChild(li);
  }
}

function questionHtml(q: Question, qi: number): string {
  const ok = solved[current][qi];
  const draft = drafts[current][qi] ?? "";
  let body = "";
  if (q.kind === "read-number") {
    body += `<div class="q-msg">${message(q.glyphs)}</div>`;
    body += ok
      ? `<p class="q-done">✓ ${q.answer} points.</p>`
      : `<div class="q-answer"><input type="number" min="0" max="999" inputmode="numeric" id="num-${qi}" value="${escapeHtml(draft)}" aria-label="Ta traduction">` +
        `<button class="btn primary" type="button" data-check="${qi}">Vérifier</button></div>`;
  } else if (q.kind === "write") {
    body += `<figure class="q-scene">${sceneSvg(q.scene)}</figure>`;
    if (ok) {
      body += `<p class="q-done">✓ ${message(q.answer)}</p>`;
    } else {
      const palette = knownGlyphs(current)
        .map((g) => `<button type="button" class="key" data-key="${g}" data-q="${qi}" aria-label="Ajouter le glyphe ${g}">${glyph(g)}</button>`)
        .join("");
      body +=
        `<div class="composer"><div class="answer-line" aria-label="Ta réponse">${draft ? message(draft) : '<span class="placeholder">Touche les glyphes ci-dessous, dans l\'ordre.</span>'}</div>` +
        `<div class="keys">${palette}</div>` +
        `<div class="q-actions"><button class="btn" type="button" data-back="${qi}">⌫ Effacer</button>` +
        `<button class="btn" type="button" data-clear="${qi}">Vider</button>` +
        `<button class="btn primary" type="button" data-check="${qi}">Envoyer</button></div></div>`;
    }
  } else {
    body += `<div class="q-msg lines">${q.lines.map((l) => message(l)).join("")}</div>`;
    body += `<div class="options" role="radiogroup" aria-label="Traductions possibles">${q.options
      .map(
        (o) =>
          `<label class="option${ok && o.id === q.answer ? " right" : ""}"><input type="radio" name="opt-${qi}" value="${o.id}"${draft === o.id || (ok && o.id === q.answer) ? " checked" : ""}${ok ? " disabled" : ""}> <span>${o.text}</span></label>`,
      )
      .join("")}</div>`;
    if (!ok) body += `<div class="q-actions"><button class="btn primary" type="button" data-check="${qi}">C'est ça</button></div>`;
  }
  return `<li class="question${ok ? " solved" : ""}" data-qi="${qi}"><div class="q-body">${body}</div><p class="q-feedback" id="fb-${qi}" role="status"></p></li>`;
}

function render() {
  const level = LEVELS[current];
  renderTabs();
  $("intro").textContent = level.intro;
  renderTransmissions();
  $("questions").innerHTML = level.questions.map(questionHtml).join("");
  renderLexicon();
  const ep = $("epilogue");
  if (levelDone(current)) {
    const next = current + 1 < LEVELS.length;
    ep.hidden = false;
    ep.innerHTML =
      `<h2>${next ? "Fin de la transmission" : "Fin du signal"}</h2><p>${level.epilogue}</p>` +
      (next ? `<button class="btn primary" type="button" id="next">Recevoir la suite du signal →</button>` : "");
    document.getElementById("next")?.addEventListener("click", () => {
      current++;
      save();
      setStatus("");
      render();
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  } else {
    ep.hidden = true;
    ep.innerHTML = "";
  }
}

/* --- Actions sur les questions (un seul écouteur) --- */
function feedback(qi: number, msg: string, cls: "ok" | "err") {
  const el = document.getElementById(`fb-${qi}`);
  if (el) {
    el.textContent = msg;
    el.className = `q-feedback ${cls}`;
  }
}

function check(qi: number) {
  const q = LEVELS[current].questions[qi];
  let right = false;
  if (q.kind === "read-number") {
    const v = (document.getElementById(`num-${qi}`) as HTMLInputElement | null)?.value ?? "";
    drafts[current][qi] = v;
    right = Number(v) === q.answer && v.trim() !== "";
  } else if (q.kind === "write") {
    right = drafts[current][qi] === q.answer;
  } else {
    const picked = document.querySelector<HTMLInputElement>(`input[name="opt-${qi}"]:checked`);
    drafts[current][qi] = picked?.value ?? "";
    right = picked?.value === q.answer;
  }
  if (!right) {
    save();
    feedback(qi, "Ce n'est pas la bonne réponse.", "err");
    return;
  }
  solved[current][qi] = true;
  save();
  const nowDone = levelDone(current);
  render();
  if (nowDone) {
    setStatus(current + 1 < LEVELS.length ? "Partie résolue ! Le sens des glyphes s'affiche dans ton lexique." : "Tu as déchiffré tout le signal.", "win");
    document.getElementById("epilogue")?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  } else {
    feedback(qi, "Compris.", "ok");
  }
}

$("questions").addEventListener("click", (e) => {
  const t = (e.target as HTMLElement).closest<HTMLElement>("button");
  if (!t) return;
  const d = t.dataset;
  if (d.key !== undefined && d.q !== undefined) {
    const qi = Number(d.q);
    drafts[current][qi] = (drafts[current][qi] ?? "") + d.key;
  } else if (d.back !== undefined) {
    const qi = Number(d.back);
    drafts[current][qi] = (drafts[current][qi] ?? "").slice(0, -1);
  } else if (d.clear !== undefined) {
    drafts[current][Number(d.clear)] = "";
  } else if (d.check !== undefined) {
    return check(Number(d.check));
  } else {
    return;
  }
  save();
  // On ne redessine que la ligne de réponse pour garder le focus sur le clavier de glyphes
  const qi = Number(d.q ?? d.back ?? d.clear);
  const line = document.querySelector<HTMLElement>(`.question[data-qi="${qi}"] .answer-line`);
  const draft = drafts[current][qi];
  if (line) line.innerHTML = draft ? message(draft) : '<span class="placeholder">Touche les glyphes ci-dessous, dans l\'ordre.</span>';
  feedback(qi, "", "ok");
});

$("questions").addEventListener("keydown", (e) => {
  const input = e.target as HTMLInputElement;
  if (e.key === "Enter" && input.id?.startsWith("num-")) check(Number(input.id.slice(4)));
});

/* --- Indice : révèle le sens d'un glyphe du niveau courant --- */
$("hint").addEventListener("click", () => {
  const own = knownGlyphs(current).filter((g) => glyphLevel(g) === current && !glossShown(g));
  const target = own.find((g) => (notes[g] ?? "").trim().toLowerCase() !== GLOSS[g].toLowerCase());
  if (!target || levelDone(current)) return setStatus("Ton lexique est déjà complet pour cette partie.");
  notes[target] = GLOSS[target];
  save();
  renderLexicon();
  setStatus(`Indice : un des glyphes signifie « ${GLOSS[target]} ». Je l'ai noté dans ton lexique.`);
  document.getElementById(`note-${target}`)?.focus();
});

render();
