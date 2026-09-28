// DOM HUD and menu wiring. Game sets the on* callbacks.
const $ = (id) => document.getElementById(id);

const SOUND_ON = '<svg viewBox="0 0 24 24"><path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" /><path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11" /></svg>';
const SOUND_OFF = '<svg viewBox="0 0 24 24"><path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" /><path d="m16 9.5 5 5M21 9.5l-5 5" /></svg>';

const starRow = (n, total = 3) =>
  Array.from({ length: total }, (_, i) => `<span class="star${i < n ? ' on' : ''}">★</span>`).join('');

export function createUI() {
  const ui = {
    onMove: null, onUndo: null, onRestart: null, onNext: null, onMute: null,
    onMenu: null, onPlay: null, onPlayLevel: null,

    showLevel(index, chapterName, level) {
      $('level-num').textContent = `${chapterName} · Level ${index + 1}`;
      $('level-name').textContent = level.name;
      $('plates').parentElement.style.display = level.plates.length ? '' : 'none';
      const hint = $('hint');
      hint.textContent = level.hint;
      hint.classList.toggle('faded', !level.hint);
      clearTimeout(ui._hintTimer);
      ui._hintTimer = setTimeout(() => hint.classList.add('faded'), 9000);
    },

    setStats(moves, pressed, total) {
      $('moves').textContent = moves;
      $('plates').textContent = `${pressed}/${total}`;
    },

    showWin({ moves, stars, best, isBest, par, hasNext }) {
      $('win-stars').innerHTML = starRow(stars);
      const lines = [`Solved in ${moves} moves · ${isBest ? 'new best!' : `best ${best}`}`];
      if (stars < 3) lines.push(`Finish in ${par} moves or fewer for 3 stars.`);
      if (!hasNext) lines.push('More levels coming soon!');
      $('win-text').innerHTML = lines.join('<br>');
      $('btn-next').style.display = hasNext ? '' : 'none';
      $('win').classList.remove('hidden');
    },

    hideWin() {
      $('win').classList.add('hidden');
    },

    setMuted(muted) {
      $('btn-mute').innerHTML = muted ? SOUND_OFF : SOUND_ON;
      $('btn-sound').innerHTML = muted ? SOUND_OFF : SOUND_ON;
      $('btn-sound').title = muted ? 'Sound off' : 'Sound on';
    },

    // ---- Main menu ----
    showMenu({ continueIndex, anyCompleted, stars, maxStars }) {
      $('play-label').textContent = anyCompleted ? 'Continue' : 'Play';
      $('play-sub').textContent = anyCompleted ? `Level ${continueIndex + 1}` : '';
      $('star-total').innerHTML = `<span class="star on">★</span> ${stars}/${maxStars}`;
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
          return `<section class="chapter">
            <div class="chapter-head"><span>${ci + 1} · ${c.name}</span><span class="ch-stars"><span class="star on">★</span> ${got}/${c.levels.length * 3}</span></div>
            <div class="level-tiles">${tiles}</div>
          </section>`;
        })
        .join('');
      for (const b of grid.querySelectorAll('.level-tile:not(.locked)')) {
        b.onclick = () => ui.onPlayLevel?.(Number(b.dataset.index));
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
