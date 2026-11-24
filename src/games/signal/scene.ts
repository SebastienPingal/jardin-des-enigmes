// Dessin des images jointes aux transmissions (SVG, viewBox 0 0 200 100). Les couleurs viennent du CSS.
import type { Group, Noun, Scene } from "./levels";

const f = (n: number) => n.toFixed(1);

function icon(noun: Noun, x: number, y: number, s: number): string {
  switch (noun) {
    case "soleil": {
      const rays = Array.from({ length: 8 }, (_, i) => {
        const a = (i * Math.PI) / 4;
        const r1 = s * 0.42, r2 = s * 0.6;
        return `<line x1="${f(x + r1 * Math.cos(a))}" y1="${f(y + r1 * Math.sin(a))}" x2="${f(x + r2 * Math.cos(a))}" y2="${f(y + r2 * Math.sin(a))}"/>`;
      }).join("");
      return `<g class="sc-sun"><circle cx="${f(x)}" cy="${f(y)}" r="${f(s * 0.32)}"/>${rays}</g>`;
    }
    case "planete":
      return (
        `<g class="sc-planet"><circle cx="${f(x)}" cy="${f(y)}" r="${f(s * 0.3)}"/>` +
        `<ellipse class="ring" cx="${f(x)}" cy="${f(y)}" rx="${f(s * 0.5)}" ry="${f(s * 0.13)}"/></g>`
      );
    case "lune": {
      const r = s * 0.3;
      return `<path class="sc-moon" d="M${f(x)} ${f(y - r)} A${f(r)} ${f(r)} 0 1 0 ${f(x)} ${f(y + r)} A${f(r * 0.72)} ${f(r)} 0 1 1 ${f(x)} ${f(y - r)} Z"/>`;
    }
    case "etre": {
      // un être à quatre doigts, bras levés
      const h = s * 0.5;
      const fingers = (hx: number, hy: number, dir: number) =>
        [-0.75, -0.25, 0.25, 0.75]
          .map((k) => `<line x1="${f(hx)}" y1="${f(hy)}" x2="${f(hx + dir * s * 0.05 + k * s * 0.07)}" y2="${f(hy - s * 0.12)}"/>`)
          .join("");
      return (
        `<g class="sc-being">` +
        `<ellipse cx="${f(x)}" cy="${f(y - h * 0.55)}" rx="${f(s * 0.17)}" ry="${f(s * 0.2)}"/>` +
        `<path class="body" d="M${f(x - s * 0.14)} ${f(y + h * 0.75)} Q${f(x)} ${f(y - h * 0.4)} ${f(x + s * 0.14)} ${f(y + h * 0.75)} Z"/>` +
        `<path class="arm" d="M${f(x - s * 0.08)} ${f(y)} L${f(x - s * 0.3)} ${f(y - h * 0.4)} M${f(x + s * 0.08)} ${f(y)} L${f(x + s * 0.3)} ${f(y - h * 0.4)}"/>` +
        `<g class="arm">${fingers(x - s * 0.3, y - h * 0.4, -1)}${fingers(x + s * 0.3, y - h * 0.4, 1)}</g>` +
        `<circle class="eye" cx="${f(x - s * 0.06)}" cy="${f(y - h * 0.6)}" r="${f(s * 0.035)}"/>` +
        `<circle class="eye" cx="${f(x + s * 0.06)}" cy="${f(y - h * 0.6)}" r="${f(s * 0.035)}"/>` +
        `</g>`
      );
    }
  }
}

/** Icône seule, pour les pièces du constructeur d'image. */
export function iconSvg(noun: Noun): string {
  return `<svg class="piece" viewBox="0 0 40 40" aria-hidden="true">${icon(noun, 20, 21, 40)}</svg>`;
}

const MAX_DRAWN = 8;

/** Dispose n icônes dans une boîte, sur une ou deux rangées (au-delà de 8 : une icône et « ×n »). */
function group(g: Group, bx: number, by: number, bw: number, bh: number, cls = ""): string {
  if (g.n > MAX_DRAWN) {
    const s = Math.min(bw * 0.5, bh, 44);
    return (
      `<g class="${cls}">${icon(g.noun, bx + bw * 0.32, by + bh / 2, s)}` +
      `<text class="sc-count" x="${f(bx + bw * 0.58)}" y="${f(by + bh / 2 + 6)}">×${g.n}</text></g>`
    );
  }
  const rows = g.n > 4 ? 2 : 1;
  const perRow = Math.ceil(g.n / rows);
  const s = Math.min(bw / perRow, bh / rows, 44);
  let out = "";
  for (let i = 0; i < g.n; i++) {
    const row = Math.floor(i / perRow);
    const inRow = Math.min(perRow, g.n - row * perRow);
    const col = i - row * perRow;
    const x = bx + bw / 2 + (col - (inRow - 1) / 2) * s;
    const y = by + bh / 2 + (row - (rows - 1) / 2) * s;
    out += icon(g.noun, x, y, s);
  }
  return `<g class="${cls}">${out}</g>`;
}

const hourglass =
  '<g class="sc-later" transform="translate(178 8)"><path d="M0 0 H14 L7 9 L14 18 H0 L7 9 Z"/></g>';

export function sceneSvg(sc: Scene): string {
  let body = "";
  switch (sc.kind) {
    case "dots": {
      const perRow = 5;
      const rows = Math.ceil(sc.n / perRow);
      for (let i = 0; i < sc.n; i++) {
        const row = Math.floor(i / perRow), col = i % perRow;
        const inRow = Math.min(perRow, sc.n - row * perRow);
        body += `<circle class="sc-dot" cx="${f(100 + (col - (inRow - 1) / 2) * 18)}" cy="${f(50 + (row - (rows - 1) / 2) * 18)}" r="5"/>`;
      }
      break;
    }
    case "group":
      body = group(sc.g, 20, 10, 160, 80);
      break;
    case "orbit": {
      body = `<ellipse class="sc-path" cx="100" cy="50" rx="78" ry="33"/>`;
      body += `<path class="sc-arrow" d="M96 14 L104 17 L96 20"/>`;
      body += group(sc.c, 70, 30, 60, 40);
      const n = Math.min(sc.a.n, MAX_DRAWN);
      const s = n > 4 ? 22 : 30;
      for (let i = 0; i < n; i++) {
        const a = Math.PI / 2 + (i * 2 * Math.PI) / n + (n === 1 ? 0.6 : 0);
        body += icon(sc.a.noun, 100 + 78 * Math.cos(a), 50 + 33 * Math.sin(a), s);
      }
      if (sc.a.n > MAX_DRAWN) body += `<text class="sc-count" x="128" y="96">×${sc.a.n}</text>`;
      break;
    }
    case "die":
      body = group(sc.s, 20, 10, 160, 80, "sc-dying");
      break;
    case "go":
      body =
        group(sc.s, 6, 15, 76, 70) +
        `<path class="sc-travel" d="M86 50 H118"/><path class="sc-arrow" d="M112 44 L120 50 L112 56"/>` +
        group(sc.g, 124, 15, 70, 70);
      break;
  }
  const fut = "fut" in sc && sc.fut;
  const frame = fut ? '<rect class="sc-frame" x="2" y="2" width="196" height="96" rx="8"/>' + hourglass : "";
  return `<svg class="scene" viewBox="0 0 200 100" aria-hidden="true">${frame}${body}</svg>`;
}
