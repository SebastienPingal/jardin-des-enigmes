/**
 * Contrôleur de saisie commun aux grilles.
 *
 * Les gestes sont les mêmes dans tous les jeux, seul l'effet change :
 * - clic gauche, Entrée ou Espace → primary (ex. lanterne → possible → vide)
 * - clic droit, appui long sur écran tactile, touche X → cross
 * - touche P → maybe (marque « possible »)
 */
export interface CellActions {
  primary: () => void;
  cross: () => void;
  maybe?: () => void;
}

const LONG_PRESS_MS = 450;

// Partagé entre toutes les cases : un appui long ne doit pas être suivi du clic qu'il déclenche.
let suppressClickUntil = 0;
let pressTimer: number | undefined;

export function bindCellInput(el: HTMLElement, actions: CellActions): void {
  el.addEventListener("click", () => {
    if (Date.now() < suppressClickUntil) return;
    actions.primary();
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
    } else if (pressed === "p" && actions.maybe) {
      e.preventDefault();
      actions.maybe();
    }
  });
}

/** Après un nouveau rendu de la grille, rend le focus clavier à la case qui vient d'être modifiée. */
export function refocusCell(board: HTMLElement, cellKey: string): void {
  const el = board.querySelector<HTMLElement>(`[data-key="${cellKey}"]`);
  if (el && document.activeElement === document.body) el.focus({ preventScroll: true });
}
