# Jardin des énigmes

Des puzzles de logique originaux, à solution unique, jouables dans le navigateur.

## Jeux

- **Lanternes** (`/lanternes/`) : placer une lanterne par ligne et par colonne. Les lanternes éclairent en diagonale, les rochers arrêtent la lumière, aucune lanterne ne doit en éclairer une autre, et les chiffres indiquent combien de lanternes éclairent une case.

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

Le thème commun est dans `src/styles/base.css` et la sauvegarde locale dans `src/shared/storage.ts`.
