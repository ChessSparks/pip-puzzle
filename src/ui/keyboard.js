// Keyboard shortcuts. Calls methods on the Game; knows nothing about rendering.

const KEYMAP = {
  ArrowUp: 'up', KeyW: 'up',
  ArrowDown: 'down', KeyS: 'down',
  ArrowLeft: 'left', KeyA: 'left',
  ArrowRight: 'right', KeyD: 'right',
};

export function bindKeyboard(game) {
  window.addEventListener('keydown', (e) => {
    if (game.state === 'menu') {
      if (e.code === 'Enter' && game.ui.menuPanel === 'main') game.startLevel(game.continueIndex);
      if (e.code === 'Escape') game.ui.showMenuPanel('main');
      return;
    }
    if (e.code === 'Escape') {
      game.openMenu();
    } else if (KEYMAP[e.code]) {
      e.preventDefault();
      if (!e.repeat || !game.anim.busy) game.requestMove(KEYMAP[e.code]);
    } else if (e.code === 'KeyU' || e.code === 'KeyZ' || e.code === 'Backspace') { // U (shown); Z, Backspace also work
      game.undo();
    } else if (e.code === 'KeyR') {
      game.restart();
    } else if (e.code === 'KeyH') {
      game.requestHint();
    } else if (e.code === 'KeyM') {
      game.toggleMute();
    } else if (e.code === 'Enter' && game.level.won) {
      game.nextLevel();
    }
  });
}
