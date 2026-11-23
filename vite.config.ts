import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const page = (path: string) => fileURLToPath(new URL(path, import.meta.url));

// Site multi-pages : une page d'accueil + un dossier par jeu.
// Pour ajouter un jeu : créer <jeu>/index.html et l'ajouter ici.
export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        accueil: page("./index.html"),
        lanternes: page("./lanternes/index.html"),
        racines: page("./racines/index.html"),
        ballet: page("./ballet/index.html"),
        signal: page("./signal/index.html"),
      },
    },
  },
});
