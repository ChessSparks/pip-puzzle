// All levels, grouped into chapters (one file per chapter in ./levels/).
// Each level: { name, map, par, solution, hint? }.
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
import { PORTAL_ISLES } from './levels/portalIsles.js';
import { CRUMBLING_CANYON } from './levels/crumblingCanyon.js';
import { WINDY_WOLDS } from './levels/windyWolds.js';
import { EMBER_FORGE } from './levels/emberForge.js';
import { STAR_WORLD_LEVELS } from './levels/starWorlds.js';

// `theme` picks the island scenery (render/themes.js). New chapters go at the
// end: progress is saved by level index.
export const CHAPTERS = [
  { name: 'First Steps', theme: 'meadow', levels: FIRST_STEPS },
  { name: 'Meadow Maze', theme: 'blossom', levels: MEADOW },
  { name: 'Riverlands', theme: 'river', levels: RIVERLANDS },
  { name: 'Frostbite Fields', theme: 'frost', levels: FROSTBITE },
  { name: 'Thawing Rivers', theme: 'thaw', levels: THAW },
  { name: 'Sky Summit', theme: 'summit', levels: SUMMIT },
  { name: 'Portal Isles', theme: 'twilight', levels: PORTAL_ISLES },
  { name: 'Crumbling Canyon', theme: 'canyon', levels: CRUMBLING_CANYON },
  { name: 'Windy Wolds', theme: 'autumn', levels: WINDY_WOLDS },
  { name: 'Ember Forge', theme: 'forge', levels: EMBER_FORGE },
];

// Flat list used by the game; each level knows its chapter index.
export const LEVELS = CHAPTERS.flatMap((c, chapter) => c.levels.map((l) => ({ ...l, chapter })));

// Bonus Star Worlds, one per chapter (index = chapter): little round planets
// (maps wrap left/right, see Level.js) unlocked by 3-starring every level of
// that chapter. Kept out of LEVELS so saved level indices never shift.
export const STAR_WORLDS = STAR_WORLD_LEVELS.map((l, chapter) => ({ ...l, chapter, wrap: true, starWorld: true }));

export function starsFor(level, moves) {
  if (moves <= level.par) return 3;
  if (moves <= Math.round(level.par * 1.4)) return 2;
  return 1;
}
