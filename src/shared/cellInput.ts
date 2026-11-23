/**
 * Contrôleur de saisie commun aux grilles, sur le modèle stylo / crayon des applis de sudoku.
 *
 * Gestes identiques dans tous les jeux ; chaque jeu fournit ses effets :
 * - clic (ou Entrée) → place() en mode « poser », note() en mode « noter »
 * - Maj + clic, ou touche P → note(), quel que soit le mode
 * - clic droit, appui long sur écran tactile, ou touche X → cross()
 * - touche N → bascule entre « poser » et « noter »
 */
export type InputMode = "place" | "note";

export interface CellActions {
  place: () => void;
  note: () => void;
  cross: () => void;
}

export interface InputController {
  /** Branche les gestes d'une case sur ses effets. */
  bind(el: HTMLElement, actions: CellActions): void;
  readonly mode: InputMode;
}

interface Options {
  /** Conteneur où dessiner l'interrupteur de mode. */
  switchEl: HTMLElement;
  /** Libellé du mode « poser » propre au jeu (ex. « Poser », « Planter »). */
  placeLabel: string;
  initialMode?: InputMode;
  onModeChange?: (mode: InputMode) => void;
}

const LONG_PRESS_MS = 450;

export function createInputController(opts: Options): InputController {
  let mode: InputMode = opts.initialMode ?? "place";
  // Un appui long ne doit pas être suivi du clic qu'il déclenche.
  let suppressClickUntil = 0;
  let pressTimer: number | undefined;

  const group = document.createElement("div");
  group.className = "mode-switch";
  group.setAttribute("role", "radiogroup");
  group.setAttribute("aria-label", "Ce que fait un clic");
  const buttons = (["place", "note"] as InputMode[]).map((m) => {
    const b = document.createElement("button");
    b.type = "button";
    b.setAttribute("role", "radio");
    b.textContent = m === "place" ? opts.placeLabel : "Noter";
    b.title = m === "place" ? `Un clic : ${opts.placeLabel.toLowerCase()}` : "Un clic : noter une possibilité (touche N pour basculer)";
    b.addEventListener("click", () => setMode(m));
    group.appendChild(b);
    return { m, b };
  });
  opts.switchEl.replaceChildren(group);

  function setMode(m: InputMode) {
    mode = m;
    for (const { m: bm, b } of buttons) b.setAttribute("aria-checked", bm === mode ? "true" : "false");
    opts.onModeChange?.(mode);
  }
  setMode(mode);

  document.addEventListener("keydown", (e) => {
    if (e.key.toLowerCase() === "n" && !e.ctrlKey && !e.metaKey && !e.altKey) {
      setMode(mode === "place" ? "note" : "place");
    }
  });

  return {
    get mode() {
      return mode;
    },
    bind(el, actions) {
      el.addEventListener("click", (e) => {
        if (Date.now() < suppressClickUntil) return;
        if (mode === "note" || e.shiftKey) actions.note();
        else actions.place();
      });
      el.addEventListener("contextmenu", (e) => {
        e.preventDefault();
        if (Date.now() < suppressClickUntil) return;
        actions.cross();
      });
      el.addEventListener("pointerdown", (e) => {
        if (e.pointerType === "mouse") return;
        window.clearTimeout(pressTimer);
        pressTimer = window.setTimeout(() => {
          suppressClickUntil = Date.now() + 800;
          actions.cross();
        }, LONG_PRESS_MS);
      });
      for (const ev of ["pointerup", "pointerleave", "pointercancel"]) {
        el.addEventListener(ev, () => window.clearTimeout(pressTimer));
      }
      el.addEventListener("keydown", (e) => {
        const pressed = e.key.toLowerCase();
        if (pressed === "x") {
          e.preventDefault();
          actions.cross();
        } else if (pressed === "p") {
          e.preventDefault();
          actions.note();
        }
      });
    },
  };
}

/** Après un nouveau rendu de la grille, rend le focus clavier à la case qui vient d'être modifiée. */
export function refocusCell(board: HTMLElement, cellKey: string): void {
  const el = board.querySelector<HTMLElement>(`[data-key="${cellKey}"]`);
  if (el && document.activeElement === document.body) el.focus({ preventScroll: true });
}
