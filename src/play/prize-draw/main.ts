// Entry of the prize-draw projector route: hands the real document, event store and clock to mountStage.
// Everything testable lives in stage.ts; this file is the browser wiring only.
import { mountStage } from './stage.ts';
import { openEventStore } from '../../prize-event/store.ts';
import { LOBBY_KEY, parseLobby } from '../../prize-event/qr-event.ts';

const root = document.getElementById('app');
const live = document.getElementById('pd-live');
if (root && live) {
  const stage = mountStage({
    doc: document,
    root,
    live,
    // The window is the store's environment: its IndexedDB, the old localStorage key to migrate, and the
    // BroadcastChannel other tabs announce their commits on. A browser that refuses IndexedDB gets the
    // refused-browser message (store.ts).
    store: openEventStore(window),
    // The literal query is what the motion gate reads; the reveal's wave honours it in stage.ts.
    reducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    nextFrame: (cb) => requestAnimationFrame(() => cb()),
    whenBoldLoaded: (cb) => void document.fonts?.load('700 20px Sarabun').then(cb, cb),
    // A newer version of the page took the database over: reload onto it (stage.ts StageDeps.reload).
    reload: () => window.location.reload(),
    // QR mode (gh#308): the lobby the setup page writes to this origin's localStorage, followed through the
    // storage event, which fires in every other tab of the origin. A storage that throws is no lobby.
    lobby: {
      read: () => {
        try {
          return parseLobby(window.localStorage.getItem(LOBBY_KEY), Date.now());
        } catch {
          return null;
        }
      },
      subscribe: (onChange) => {
        const listener = (event: StorageEvent): void => {
          if (event.key === null || event.key === LOBBY_KEY) onChange();
        };
        window.addEventListener('storage', listener);
        return () => window.removeEventListener('storage', listener);
      },
    },
    joinOrigin: window.location.origin,
  });
  // Names were fitted with whatever face had loaded; fit again once the site's faces are in.
  document.fonts?.ready.then(() => stage.refit());
}
