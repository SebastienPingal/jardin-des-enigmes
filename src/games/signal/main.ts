import "../../styles/base.css";
import "../../styles/game.css";
import "./signal.css";
import { load, save as persist } from "../../shared/storage";
import { GLOSS, GLYPHS, LEVELS, type Noun, type Question, type Scene } from "./levels";
import { iconSvg, sceneSvg } from "./scene";

/* --- Constructeur d'image (questions de lecture) : uniquement des pièces dessinées, aucun mot --- */
type Action = "die" | "go" | "orbit";
interface Build {
  noun?: Noun;
  n: number;
  action?: Action;
  tnoun?: Noun;
  tn: number;
  fut: boolean;
}
const NOUNS: Noun[] = ["soleil", "planete", "lune", "etre"];
const NOUN_LABEL: Record<Noun, string> = { soleil: "soleil", planete: "planète", lune: "lune", etre: "être" };
const ACTIONS: { id: Action; label: string; svg: string }[] = [
  {
    id: "die", label: "s'éteindre",
    svg: '<svg class="piece" viewBox="0 0 40 40" aria-hidden="true"><circle class="a-fade" cx="20" cy="20" r="10"/><path class="a-line" d="M12 28 L28 12"/></svg>',
  },
  {
    id: "go", label: "aller vers",
    svg: '<svg class="piece" viewBox="0 0 40 40" aria-hidden="true"><path class="a-line" d="M8 20 H30 M24 14 L31 20 L24 26"/></svg>',
  },
  {
    id: "orbit", label: "tourner autour",
    svg: '<svg class="piece" viewBox="0 0 40 40" aria-hidden="true"><ellipse class="a-path" cx="20" cy="20" rx="15" ry="8"/><circle class="a-dot" cx="20" cy="20" r="3"/><circle class="a-dot" cx="35" cy="20" r="2.5"/></svg>',
  },
];
const LATER_SVG =
  '<svg class="piece" viewBox="0 0 40 40" aria-hidden="true"><path class="a-line" d="M13 9 H27 L20 20 L27 31 H13 L20 20 Z"/></svg>';
const NOW_SVG = '<svg class="piece" viewBox="0 0 40 40" aria-hidden="true"><circle class="a-dot" cx="20" cy="20" r="5"/></svg>';

function parseBuild(draft: string): Build {
  try {
    const b = JSON.parse(draft) as Partial<Build>;
    return { n: 1, tn: 1, fut: false, ...b };
  } catch {
    return { n: 1, tn: 1, fut: false };
  }
}

function buildScene(b: Build): Scene | null {
  if (!b.noun || !(b.n >= 1)) return null;
  const s = { noun: b.noun, n: b.n };
  if (!b.action) return { kind: "group", g: s };
  if (b.action === "die") return { kind: "die", s, fut: b.fut };
  if (!b.tnoun || !(b.tn >= 1)) return null;
  const t = { noun: b.tnoun, n: b.tn };
  return b.action === "go" ? { kind: "go", s, g: t, fut: b.fut } : { kind: "orbit", a: s, c: t };
}

/** Forme canonique d'une scène, pour comparer une construction à la réponse attendue. */
function canon(sc: Scene | null): string {
  if (!sc) return "";
  switch (sc.kind) {
    case "dots": return `dots:${sc.n}`;
    case "group": return `group:${sc.g.noun}:${sc.g.n}`;
    case "orbit": return `orbit:${sc.a.noun}:${sc.a.n}:${sc.c.noun}:${sc.c.n}`;
    case "die": return `die:${sc.s.noun}:${sc.s.n}:${sc.fut}`;
    case "go": return `go:${sc.s.noun}:${sc.s.n}:${sc.g.noun}:${sc.g.n}:${sc.fut}`;
  }
}

const opt = (qi: number, field: string, value: string, pressed: boolean, label: string, inner: string) =>
  `<button type="button" class="b-opt" data-bq="${qi}" data-bf="${field}" data-bv="${value}" aria-pressed="${pressed}" aria-label="${label}" title="${label}">${inner}</button>`;

function builderHtml(qi: number, b: Build): string {
  const target = b.action === "go" || b.action === "orbit";
  const preview = buildScene(b);
  return (
    `<div class="builder">` +
    `<div class="b-row"><span class="b-label">Qui ?</span><div class="b-opts">` +
    NOUNS.map((n) => opt(qi, "noun", n, b.noun === n, NOUN_LABEL[n], iconSvg(n))).join("") +
    `</div><label class="b-count">×<input type="number" min="1" max="999" inputmode="numeric" data-bq="${qi}" data-bn="n" value="${b.n}" aria-label="Combien"></label></div>` +
    `<div class="b-row"><span class="b-label">Action ?</span><div class="b-opts">` +
    ACTIONS.map((a) => opt(qi, "action", a.id, b.action === a.id, a.label, a.svg)).join("") +
    `</div></div>` +
    (target
      ? `<div class="b-row"><span class="b-label">Vers ?</span><div class="b-opts">` +
        NOUNS.map((n) => opt(qi, "tnoun", n, b.tnoun === n, NOUN_LABEL[n], iconSvg(n))).join("") +
        `</div><label class="b-count">×<input type="number" min="1" max="999" inputmode="numeric" data-bq="${qi}" data-bn="tn" value="${b.tn}" aria-label="Combien"></label></div>`
      : "") +
    (b.action === "orbit"
      ? ""
      : `<div class="b-row"><span class="b-label">Quand ?</span><div class="b-opts">` +
        opt(qi, "fut", "0", !b.fut, "maintenant", NOW_SVG) +
        opt(qi, "fut", "1", b.fut, "plus tard", LATER_SVG) +
        `</div></div>`) +
    `<figure class="b-preview" id="preview-${qi}">${preview ? sceneSvg(preview) : '<div class="b-empty">?</div>'}</figure>` +
    `<div class="q-actions"><button class="btn primary" type="button" data-check="${qi}">Envoyer</button></div>` +
    `</div>`
  );
}

/* --- État --- */
const STORAGE_KEY = "signal-v1";
let current = 0;
let solved: boolean[][] = LEVELS.map((l) => l.questions.map(() => false));
let drafts: string[][] = LEVELS.map((l) => l.questions.map(() => "")); // réponses en cours (glyphes, nombre ou choix)
let notes: Record<string, string> = {};

const saved = load<{ current: number; solved: boolean[][]; drafts: string[][]; notes: Record<string, string> }>(STORAGE_KEY);
if (saved && Array.isArray(saved.solved) && saved.solved.length === LEVELS.length) {
  // Les questions d'une partie peuvent changer d'une version à l'autre : on recale les tableaux sauvegardés.
  solved = LEVELS.map((l, i) => l.questions.map((_, q) => !!saved.solved[i]?.[q]));
  drafts = LEVELS.map((l, i) => l.questions.map((_, q) => saved.drafts?.[i]?.[q] ?? ""));
  // Une ancienne réponse à une question remplacée par un constructeur d'image ne compte pas
  LEVELS.forEach((l, i) =>
    l.questions.forEach((q, qi) => {
      if (q.kind === "build" && !drafts[i][qi].startsWith("{")) {
        solved[i][qi] = false;
        drafts[i][qi] = "";
      }
    }),
  );
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
  } else if (q.kind === "build") {
    const gloss = levelDone(current)
      ? `<span class="gloss">${[...q.glyphs].map((g) => `<span>${escapeHtml(GLOSS[g])}</span>`).join("")}</span>`
      : "";
    body += `<div class="q-msg t-text">${message(q.glyphs)}${gloss}</div>`;
    body += ok ? `<figure class="q-scene">${sceneSvg(q.answer)}</figure><p class="q-done">✓</p>` : builderHtml(qi, parseBuild(draft));
  } else {
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
  }
  // Le message des extraterrestres est mis en avant : cadre distinct, titre sur la première ligne
  const isFinal = q.kind === "build";
  const firstFinal = LEVELS[current].questions.findIndex((x) => x.kind === "build") === qi;
  const head = isFinal && firstFinal ? `<h3 class="final-title">Leur dernier message</h3>` : "";
  return `<li class="question${isFinal ? " final" : ""}${ok ? " solved" : ""}" data-qi="${qi}">${head}<div class="q-body">${body}</div><p class="q-feedback" id="fb-${qi}" role="status"></p></li>`;
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
  } else if (q.kind === "build") {
    right = canon(buildScene(parseBuild(drafts[current][qi] ?? ""))) === canon(q.answer);
  } else {
    right = drafts[current][qi] === q.answer;
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
  if (d.bf !== undefined && d.bq !== undefined) {
    // Une pièce du constructeur d'image
    const qi = Number(d.bq);
    const b = parseBuild(drafts[current][qi] ?? "");
    if (d.bf === "noun") b.noun = d.bv as Noun;
    else if (d.bf === "tnoun") b.tnoun = d.bv as Noun;
    else if (d.bf === "action") b.action = b.action === d.bv ? undefined : (d.bv as Action);
    else if (d.bf === "fut") b.fut = d.bv === "1";
    drafts[current][qi] = JSON.stringify(b);
    save();
    $("questions").innerHTML = LEVELS[current].questions.map(questionHtml).join("");
    document.querySelector<HTMLElement>(`[data-bq="${qi}"][data-bf="${d.bf}"][data-bv="${d.bv}"]`)?.focus({ preventScroll: true });
    return;
  }
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

// Nombres du constructeur : on ne met à jour que l'aperçu, pour garder le focus dans le champ
$("questions").addEventListener("input", (e) => {
  const input = e.target as HTMLInputElement;
  const qi = Number(input.dataset.bq);
  const field = input.dataset.bn as "n" | "tn" | undefined;
  if (!field || Number.isNaN(qi)) return;
  const b = parseBuild(drafts[current][qi] ?? "");
  b[field] = Math.floor(Number(input.value));
  drafts[current][qi] = JSON.stringify(b);
  save();
  const preview = buildScene(b);
  const fig = document.getElementById(`preview-${qi}`);
  if (fig) fig.innerHTML = preview ? sceneSvg(preview) : '<div class="b-empty">?</div>';
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
