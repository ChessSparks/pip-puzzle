// Pip's little story, told through his speech balloon.
//
// The Great Portal at the top of the sky has gone dark and its sparks are
// scattered over the islands. Each chapter's last level returns one spark;
// the tenth relights the portal.
//
//   intro   lines Pip says the first time a chapter starts (after landing)
//   spark   his line when the chapter's spark is found (last level, first win)
//
// Lines may use {sparks} (sparks found so far) and {left} (still missing).
// Entries follow CHAPTERS in levels.js. No DOM here; text is easy to edit.
import { storage } from './storage.js';

export const STORY = [
  {
    intro: [
      'Whoa… the Great Portal up there went dark!',
      'Its ten sparks fell all over the sky islands.',
      "I'll bring them back, one island at a time!",
    ],
    spark: 'A spark! Did you see the portal flicker?',
  },
  {
    intro: ['Flowers everywhere! A spark must be hiding in this maze.'],
    spark: 'Another spark! It smells a bit like flowers.',
  },
  {
    intro: ['Rivers! I can’t swim…', 'But a crate pushed in becomes a bridge!'],
    spark: 'Got it! Only slightly soggy.',
  },
  {
    intro: ['Brr… the islands up here are frozen!', 'On ice, everything slides until it hits something.'],
    spark: 'A warm spark! Just what I needed.',
  },
  {
    intro: ['The ice is melting into rivers.', 'Bridges AND sliding? Let’s do this!'],
    spark: 'Spark found! {left} more to go.',
  },
  {
    intro: ['The Sky Summit! I can see the portal from here…', 'Still dark. {left} sparks to go!'],
    spark: 'The summit spark! The portal is humming now!',
  },
  {
    intro: ['It’s night on these islands… and what are these glowing pads?', 'Step on one and you pop out of its twin!'],
    spark: 'This spark glows just like the portals!',
  },
  {
    intro: ['Careful… this ground is cracking!', 'Each cracked tile only holds me once.'],
    spark: 'Grabbed it before the ground gave way!',
  },
  {
    intro: ['The wind only blows one way here.', 'Arrows are one-way, for me and for crates!'],
    spark: 'The wind blew this one right to me!',
  },
  {
    intro: ['So hot! The last spark is somewhere in this forge.', 'Switches flip the spikes. Timing is everything!'],
    spark: 'The last spark!',
  },
];

// The first time Pip lands on a Star World.
export const STAR_WORLD_INTRO = ['Whoa, a tiny round world!', 'Walk off one side and you come back on the other!'];

// Shown on the win card after the final level.
export const FINALE = {
  title: 'The Great Portal shines again!',
  text: 'All ten sparks are home. Thank you for helping me, friend! ♥',
};

export const fill = (line, sparks, total) =>
  line.replace('{sparks}', sparks).replace('{left}', total - sparks);

// Which chapter intros the player has already seen (saved).
const SEEN_KEY = 'crateKeeper.storySeen';

export const storySeen = {
  has(chapter) {
    return seenList().includes(chapter);
  },
  add(chapter) {
    const list = seenList();
    if (!list.includes(chapter)) storage.set(SEEN_KEY, JSON.stringify([...list, chapter]));
  },
};

function seenList() {
  try {
    const v = JSON.parse(storage.get(SEEN_KEY) ?? '[]');
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}
