// All levels, grouped into chapters (one file per chapter in ./levels/).
// Each level: { name, map, par, solution, hint? , tutorial? }.
// `par` is the move count for 3 stars (a little above the optimum).
// `solution` is a known shortest solution (U/D/L/R); `npm run solve` replays it
// and `npm run playtest` plays it in the browser. Search for a new one with
// `npm run solve -- --optimal` after changing a map. See Level.js for the legend.
import { FIRST_STEPS } from './levels/firstSteps.js';
import { MEADOW } from './levels/meadow.js';
import { RIVERLANDS } from './levels/riverlands.js';
import { FROSTBITE } from './levels/frostbite.js';
import { THAW } from './levels/thaw.js';
import { SUMMIT } from './levels/summit.js';

export const CHAPTERS = [
  { name: 'First Steps', levels: FIRST_STEPS },
  { name: 'Meadow Maze', levels: MEADOW },
  { name: 'Riverlands', levels: RIVERLANDS },
  { name: 'Frostbite Fields', levels: FROSTBITE },
  { name: 'Thawing Rivers', levels: THAW },
  { name: 'Sky Summit', levels: SUMMIT },
];

// Flat list used by the game; each level knows its chapter index.
export const LEVELS = CHAPTERS.flatMap((c, chapter) => c.levels.map((l) => ({ ...l, chapter })));

export function starsFor(level, moves) {
  if (moves <= level.par) return 3;
  if (moves <= Math.round(level.par * 1.4)) return 2;
  return 1;
}
