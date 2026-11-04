import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

// `#platform` is the portal layer: none.js (no SDK) normally, y8.js for
// `vite build --mode y8` (npm run build:y8), so the itch.io build never
// loads the Y8 SDK.
export default defineConfig(({ mode }) => ({
  // Relative asset paths, so the build works from any folder (itch.io and
  // Y8 serve HTML games from a subdirectory).
  base: './',
  resolve: {
    alias: {
      '#platform': fileURLToPath(new URL(`./src/platform/${mode === 'y8' ? 'y8' : 'none'}.js`, import.meta.url)),
    },
  },
}));
