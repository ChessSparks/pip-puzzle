import { Game } from './Game.js';
import { createUI } from './ui/ui.js';
import { platform } from '#platform';

// Init the portal SDK first (Y8 build),
// then start. In the standalone build init() does nothing.
platform.init().then(async () => {
  platform.loadingStart();
  const game = new Game(document.getElementById('scene'), createUI());
  window.game = game; // handy for debugging in the console
  await document.fonts.ready;
  platform.loadingStop();
  replayFromUrl(game);
});

// Dev helper: ?play=RRUULL replays a move string (U/D/L/R), e.g. a solver output.
function replayFromUrl(game) {
  const play = new URLSearchParams(location.search).get('play');
  if (!play) return;
  const names = { U: 'up', D: 'down', L: 'left', R: 'right' };
  [...play.toUpperCase()].forEach((c, i) => setTimeout(() => game.requestMove(names[c]), 400 + i * 180));
}
