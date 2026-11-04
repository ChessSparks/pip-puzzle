// DOM HUD and menu wiring. Game sets the on* callbacks.
const $ = (id) => document.getElementById(id);

const SOUND_ON = '<svg viewBox="0 0 24 24"><path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" /><path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11" /></svg>';
const SOUND_OFF = '<svg viewBox="0 0 24 24"><path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" /><path d="m16 9.5 5 5M21 9.5l-5 5" /></svg>';

const starRow = (n, total = 3) =>
  Array.from({ length: total }, (_, i) => `<span class="star${i < n ? ' on' : ''}">★</span>`).join('');

export function createUI() {
  const ui = {
    onMove: null, onUndo: null, onRestart: null, onNext: null, onMute: null,
    onMenu: null, onPlay: null, onPlayLevel: null, onPlayWorld: null, onQuality: null, onHint: null, onMusic: null,

    showLevel(label, level) {
      $('level-num').textContent = label;
      $('level-name').textContent = level.name;
      $('plates').parentElement.style.display = level.plates.length ? '' : 'none';
      const hint = $('hint');
      hint.textContent = level.hint;
      hint.classList.toggle('faded', !level.hint);
      clearTimeout(ui._hintTimer);
      ui._hintTimer = setTimeout(() => hint.classList.add('faded'), 9000);
    },

    // Sky gradient stops (top-centre -> edge) for the current chapter.
    setSky([a, b, c]) {
      const root = document.documentElement.style;
      root.setProperty('--sky-a', a);
      root.setProperty('--sky-b', b);
      root.setProperty('--sky-c', c);
    },

    // "Oh no" moment: a speech balloon over Pip and a wiggling undo button.
    setStuck(on) {
      $('btn-undo').classList.toggle('nudge', on);
    },

    // Show `text` in Pip's speech balloon (it pops in again when the text
    // changes), or hide the balloon (null).
    say(text) {
      const b = $('bubble');
      const inner = b.firstElementChild;
      if (!text) {
        b.classList.add('hidden');
        return;
      }
      if (inner.textContent !== text || b.classList.contains('hidden')) {
        inner.textContent = text;
        b.classList.add('hidden');
        void b.offsetWidth; // restart the pop-in animation
        b.classList.remove('hidden');
      }
    },

    // Put the balloon's tail at screen point { x, y } (px), or hide it (null).
    // Kept inside the window (the balloon slides; its tail stays centred).
    placeBubble(point) {
      const b = $('bubble');
      b.style.visibility = point ? '' : 'hidden';
      if (!point) return;
      const half = b.firstElementChild.getBoundingClientRect().width / 2;
      const x = Math.min(Math.max(point.x, half + 8), window.innerWidth - half - 8);
      const y = Math.max(point.y, b.firstElementChild.getBoundingClientRect().height + 20);
      b.style.transform = `translate(${x}px, ${y}px)`;
    },

    // Centre of the undo button in px (for Pip's nervous glances), or null.
    undoButtonCenter() {
      const r = $('btn-undo').getBoundingClientRect();
      return r.width ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : null;
    },

    setStats(moves, pressed, total) {
      $('moves').textContent = moves;
      $('plates').textContent = `${pressed}/${total}`;
    },

    showWin({ moves, stars, best, isBest, par, hasNext, spark, finale, title, worldUnlocked }) {
      $('win-title').textContent = finale ? finale.title : title ?? 'Level Complete!';
      $('win-stars').innerHTML = starRow(stars);
      const lines = [];
      if (finale) lines.push(`<span class="story-line">${finale.text}</span>`);
      if (spark) {
        lines.push(`<span class="spark-line">✦ Spark found! ${spark.count}/${spark.total}</span>`);
        lines.push(`<span class="story-line">“${spark.text}”</span>`);
      }
      lines.push(`Solved in ${moves} moves · ${isBest ? 'new best!' : `best ${best}`}`);
      if (worldUnlocked) lines.push('<span class="spark-line">🪐 Star World unlocked! Find it in Levels.</span>');
      if (stars < 3) lines.push(`Finish in ${par} moves or fewer for 3 stars.`);
      if (!hasNext && !finale && !title) lines.push('More levels coming soon!');
      $('win-text').innerHTML = lines.join('<br>');
      $('btn-next').style.display = hasNext ? '' : 'none';
      $('win').classList.remove('hidden');
    },

    hideWin() {
      $('win').classList.add('hidden');
    },

    setMusic(on) {
      const b = $('btn-music');
      b.classList.toggle('off', !on);
      b.title = on ? 'Music: on' : 'Music: off';
    },

    setQuality(q) {
      const b = $('btn-quality');
      b.classList.toggle('off', q === 'low');
      b.title = q === 'low' ? 'Effects: Low (tap for High)' : 'Effects: High (tap for Low)';
    },

    setMuted(muted) {
      $('btn-mute').innerHTML = muted ? SOUND_OFF : SOUND_ON;
      $('btn-sound').innerHTML = muted ? SOUND_OFF : SOUND_ON;
      $('btn-sound').title = muted ? 'Sound off' : 'Sound on';
    },

    // ---- Main menu ----
    showMenu({ continueIndex, anyCompleted, stars, maxStars, sparks, maxSparks }) {
      $('play-label').textContent = anyCompleted ? 'Continue' : 'Play';
      $('play-sub').textContent = anyCompleted ? `Level ${continueIndex + 1}` : '';
      $('star-total').innerHTML = `<span class="star on">★</span> ${stars}/${maxStars}`
        + ` <span class="spark-count" title="Sparks for the Great Portal">✦ ${sparks}/${maxSparks}</span>`;
      ui.showMenuPanel('main');
      document.body.classList.add('in-menu');
      $('menu').classList.remove('hidden');
    },

    hideMenu() {
      document.body.classList.remove('in-menu');
      $('menu').classList.add('hidden');
    },

    get menuPanel() {
      return $('menu-levels').classList.contains('hidden') ? 'main' : 'levels';
    },

    showMenuPanel(which) {
      $('menu-main').classList.toggle('hidden', which !== 'main');
      $('menu-levels').classList.toggle('hidden', which !== 'levels');
    },

    // chapters: [{ name, levels: [{ index, name, unlocked, best, stars }] }]
    showLevelSelect(chapters, currentIndex) {
      const grid = $('level-grid');
      grid.innerHTML = chapters
        .map((c, ci) => {
          const got = c.levels.reduce((n, l) => n + l.stars, 0);
          const tiles = c.levels
            .map((l) => {
              const cls = `level-tile${l.unlocked ? '' : ' locked'}${l.index === currentIndex ? ' current' : ''}`;
              const title = `${l.index + 1}. ${l.name}${l.best !== null ? ` · best ${l.best}` : ''}`;
              return `<button class="${cls}" data-index="${l.index}" title="${title}" ${l.unlocked ? '' : 'disabled'}>
                <span class="lt-num">${l.unlocked ? l.index + 1 : '🔒'}</span>
                <span class="lt-stars">${starRow(l.stars)}</span>
              </button>`;
            })
            .join('');
          const w = c.world;
          const worldTile = w.open
            ? `<button class="level-tile star-world" data-world="${ci}" title="Star World: ${w.name}${w.best !== null ? ` · best ${w.best}` : ''}">
                <span class="lt-num">🪐</span><span class="lt-stars">${starRow(w.stars)}</span></button>`
            : `<button class="level-tile star-world locked" disabled title="Star World: get 3 stars on every level in this chapter">
                <span class="lt-num">🪐</span><span class="lt-stars">${got}/${c.levels.length * 3}</span></button>`;
          return `<section class="chapter">
            <div class="chapter-head"><span>${ci + 1} · ${c.name}${c.spark ? ' <span class="spark-count" title="Spark found">✦</span>' : ''}</span><span class="ch-stars"><span class="star on">★</span> ${got}/${c.levels.length * 3}</span></div>
            <div class="level-tiles">${tiles}${worldTile}</div>
          </section>`;
        })
        .join('');
      for (const b of grid.querySelectorAll('.level-tile:not(.locked)')) {
        b.onclick = () => (b.dataset.world !== undefined
          ? ui.onPlayWorld?.(Number(b.dataset.world))
          : ui.onPlayLevel?.(Number(b.dataset.index)));
      }
      ui.showMenuPanel('levels');
      grid.querySelector('.level-tile.current')?.closest('.chapter')?.scrollIntoView({ block: 'nearest' });
    },
  };

  $('btn-menu').onclick = () => ui.onMenu?.();
  $('btn-undo').onclick = () => ui.onUndo?.();
  $('btn-restart').onclick = () => ui.onRestart?.();
  $('btn-mute').onclick = () => ui.onMute?.();
  $('btn-next').onclick = () => ui.onNext?.();
  $('btn-replay').onclick = () => ui.onRestart?.();
  $('btn-win-menu').onclick = () => ui.onMenu?.();
  $('btn-play').onclick = () => ui.onPlay?.();
  $('btn-levels').onclick = () => ui.onLevels?.();
  $('btn-back').onclick = () => ui.showMenuPanel('main');
  $('btn-sound').onclick = () => ui.onMute?.();
  $('btn-quality').onclick = () => ui.onQuality?.();
  $('btn-hint').onclick = () => ui.onHint?.();
  $('btn-music').onclick = () => ui.onMusic?.();
  for (const b of document.querySelectorAll('#dpad button')) {
    b.onpointerdown = (e) => {
      e.preventDefault();
      ui.onMove?.(b.dataset.dir);
    };
  }
  // Buttons shouldn't keep focus, or Space/Enter would re-trigger them.
  document.addEventListener('mouseup', (e) => e.target.closest?.('button')?.blur());
  trackInputMode();
  trackUiScale();
  // Expose the HUD's bottom edge so the touch level hint can sit below it.
  const hud = document.querySelector('.hud');
  new ResizeObserver(() => {
    document.documentElement.style.setProperty('--hud-h', `${hud.getBoundingClientRect().bottom}px`);
  }).observe(hud);
  return ui;
}

// --ui scales the HUD, controls and menus with the screen: bigger on large
// monitors, smaller on short (landscape phone) screens. Registered before the
// Stage's resize listener so framing measures the rescaled controls.
function trackUiScale() {
  const update = () => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const big = Math.min(w / 1440, h / 900);
    const s = big > 1 ? Math.min(big, 2) : Math.max(0.62, Math.min(1, h / 520));
    document.documentElement.style.setProperty('--ui', s.toFixed(3));
  };
  window.addEventListener('resize', update);
  update();
}

const rectOf = (el) => {
  const r = el?.getBoundingClientRect();
  return r && r.width && r.height ? r : null;
};

// Screen rectangles (px) the level may be framed into, avoiding the UI.
// Stage picks whichever candidate shows the level biggest. null = use defaults.
export function freeAreas(mode) {
  const w = window.innerWidth;
  const h = window.innerHeight;
  const pad = 12;
  if (mode === 'menu') {
    const main = rectOf($('menu-main'));
    if (!main) return null;
    if (matchMedia('(max-aspect-ratio: 4/5)').matches) {
      const logo = rectOf(document.querySelector('.logo'));
      const actions = rectOf(document.querySelector('.menu-actions'));
      if (!logo || !actions) return null;
      return [{ left: pad, right: w - pad, top: logo.bottom + pad, bottom: actions.top - pad }];
    }
    return [{ left: main.right + pad, right: w - pad, top: pad, bottom: h - pad }];
  }
  const hud = rectOf(document.querySelector('.hud'));
  const top = (hud ? hud.bottom : 0) + pad;
  const controls = [rectOf($('dpad')), rectOf(document.querySelector('.actions'))].filter(Boolean);
  const onRight = (c) => c.left + c.width / 2 > w / 2;
  const leftEdge = Math.max(0, ...controls.filter((c) => !onRight(c)).map((c) => c.right));
  const rightEdge = Math.min(w, ...controls.filter(onRight).map((c) => c.left));
  return [
    // Between the HUD and the bottom controls, full width...
    { left: pad, right: w - pad, top, bottom: Math.min(h, ...controls.map((c) => c.top)) - pad },
    // ...or between the left and right controls, full height.
    { left: leftEdge + pad, right: rightEdge - pad, top, bottom: h - pad },
  ];
}

// Toggle body.touch based on how the player is actually playing, so the
// D-pad shows only for touch. Fires an 'inputmodechange' event on switch.
function trackInputMode() {
  const set = (touch) => {
    if (document.body.classList.contains('touch') === touch) return;
    document.body.classList.toggle('touch', touch);
    window.dispatchEvent(new Event('inputmodechange'));
  };
  document.body.classList.toggle('touch', matchMedia('(pointer: coarse)').matches);
  window.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'touch') set(true);
    else if (e.pointerType === 'mouse') set(false);
  });
  window.addEventListener('keydown', () => set(false));
}
