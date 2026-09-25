import { Game } from './Game.js';
import { createUI } from './ui/ui.js';

const game = new Game(document.getElementById('scene'), createUI());
window.game = game; // handy for debugging in the console

// Dev helper: ?play=RRUULL replays a move string (U/D/L/R), e.g. a solver output.
const play = new URLSearchParams(location.search).get('play');
if (play) {
  const names = { U: 'up', D: 'down', L: 'left', R: 'right' };
  [...play.toUpperCase()].forEach((c, i) => setTimeout(() => game.requestMove(names[c]), 400 + i * 180));
}
