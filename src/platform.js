// CrazyGames SDK v3 wrapper. Everything here is optional: if the SDK script
// can't load (offline, ad blocker) or the game runs outside CrazyGames and
// localhost, every call is a no-op and the game plays exactly as before.
// Docs: https://docs.crazygames.com/sdk/
import { useStorage } from './core/storage.js';

const SDK_URL = 'https://sdk.crazygames.com/crazygames-sdk-v3.js';
const LOAD_TIMEOUT = 5000;

let sdk = null; // window.CrazyGames.SDK once initialised and enabled
let playing = false; // last gameplayStart/Stop we reported
let inAd = false;

function loadScript() {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = SDK_URL;
    s.onload = resolve;
    s.onerror = reject;
    document.head.append(s);
    setTimeout(() => reject(new Error('CrazyGames SDK load timed out')), LOAD_TIMEOUT);
  });
}

// Wrap an SDK call so a thrown error never breaks the game.
function call(fn) {
  if (!sdk) return;
  try {
    fn(sdk);
  } catch (e) {
    console.warn('[CrazyGames]', e);
  }
}

export const platform = {
  // Called by the game while an ad plays: (true) = pause + mute, (false) = resume.
  onAdPause: null,
  // Called when the portal's "mute audio" setting changes: (muted) => void.
  onMuteSetting: null,

  async init() {
    // ?nosdk skips the SDK (headless tools, debugging).
    if (new URLSearchParams(location.search).has('nosdk')) return;
    try {
      await loadScript();
      const SDK = window.CrazyGames.SDK;
      await SDK.init();
      if (SDK.environment === 'disabled') return;
      sdk = SDK;
      // Cloud-synced saves on CrazyGames. On localhost keep plain
      // localStorage so dev tools (playtest/promo) can seed progress.
      if (SDK.environment === 'crazygames') useStorage(SDK.data);
      SDK.game.addSettingsChangeListener((settings) => this.onMuteSetting?.(!!settings.muteAudio));
    } catch (e) {
      console.warn('[CrazyGames] SDK unavailable, running standalone.', e);
      sdk = null;
    }
  },

  get enabled() {
    return !!sdk;
  },

  // The portal can ask for audio to be muted (e.g. on its own page mute).
  get muteAudio() {
    try {
      return !!sdk?.game.settings?.muteAudio;
    } catch {
      return false;
    }
  },

  loadingStart() {
    call((s) => s.game.loadingStart());
  },
  loadingStop() {
    call((s) => s.game.loadingStop());
  },

  // Tell the portal when the player is actively playing (not in menus,
  // win screens or ads). Deduplicated so callers can be liberal.
  gameplayStart() {
    if (playing || inAd) return;
    playing = true;
    call((s) => s.game.gameplayStart());
  },
  gameplayStop() {
    if (!playing) return;
    playing = false;
    call((s) => s.game.gameplayStop());
  },

  // A celebration moment (level cleared).
  happytime() {
    call((s) => s.game.happytime());
  },

  // Midgame ad at a natural break. Resolves when it's over, was skipped,
  // or failed; never rejects. The SDK itself rate-limits how often ads show.
  midgameAd() {
    if (!sdk || inAd) return Promise.resolve();
    return new Promise((resolve) => {
      const wasPlaying = playing;
      const end = () => {
        if (!inAd) return resolve();
        inAd = false;
        this.onAdPause?.(false);
        if (wasPlaying) this.gameplayStart();
        resolve();
      };
      try {
        sdk.ad.requestAd('midgame', {
          adStarted: () => {
            inAd = true;
            this.gameplayStop();
            this.onAdPause?.(true);
          },
          adFinished: end,
          adError: end,
        });
      } catch (e) {
        console.warn('[CrazyGames]', e);
        resolve();
      }
    });
  },
};
