// Entry of the prize-draw projector route: hands the real document, event store and clock to mountStage.
// Everything testable lives in stage.ts; this file is the browser wiring only.
import { mountStage } from './stage.ts';
import { openEventStore } from '../../prize-event/store.ts';

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
  });
  // Names were fitted with whatever face had loaded; fit again once the site's faces are in.
  document.fonts?.ready.then(() => stage.refit());
}
