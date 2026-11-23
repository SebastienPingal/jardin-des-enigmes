# Jardin des énigmes

Des puzzles de logique originaux, à solution unique, jouables dans le navigateur.

## Jeux

- **Lanternes** (`/lanternes/`) : placer une lanterne par ligne et par colonne. Les lanternes éclairent en diagonale, les rochers arrêtent la lumière, aucune lanterne ne doit en éclairer une autre, et les chiffres indiquent combien de lanternes éclairent une case.
- **Racines** (`/racines/`) : retrouver où étaient plantées trois graines. Les racines avancent d'une case par jour en contournant les rochers ; une case fleurit de la première racine arrivée, ou reste nue en cas d'égalité. Les grilles viennent de `tools/racines/generate.py` (Python + numpy), qui vérifie l'unicité et la résolution sans hypothèse.

## Développement

```bash
npm install
npm run dev
```

`npm run build` produit le site statique dans `dist/`. Il est déployé sur Vercel à chaque push sur `main`.

## Ajouter un jeu

1. Créer `<jeu>/index.html`, qui charge `src/games/<jeu>/main.ts`.
2. Ajouter la page dans `rollupOptions.input` de `vite.config.ts`.
3. Ajouter une carte sur la page d'accueil (`index.html`).

Code partagé :

- `src/styles/base.css` : thème (couleurs, polices).
- `src/styles/game.css` : mise en page d'une page de jeu (plateau, onglets, règles, cases, croix).
- `src/shared/cellInput.ts` : contrôleur de saisie. Les gestes sont les mêmes partout (clic gauche, clic droit ou appui long pour la croix, touches `X` et `P`) ; chaque jeu fournit ses propres effets via `bindCellInput(case, { primary, cross, maybe })`.
- `src/shared/storage.ts` : sauvegarde locale de la progression.
