// Entry of the prize-draw projector route: hands the real document, storage, locks and clock to mountStage.
// Everything testable lives in stage.ts; this file is the browser wiring only.
import { mountStage } from './stage.ts';

function storage(): Pick<Storage, 'getItem' | 'setItem'> | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

const root = document.getElementById('app');
const live = document.getElementById('pd-live');
if (root && live) {
  const stage = mountStage({
    doc: document,
    root,
    live,
    storage: storage(),
    // The literal query is what the motion gate reads; the reveal's wave honours it in stage.ts.
    reducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    nextFrame: (cb) => requestAnimationFrame(() => cb()),
    whenBoldLoaded: (cb) => void document.fonts?.load('700 20px Sarabun').then(cb, cb),
    // Web Locks exist only in a secure context; without them the stage shows no event and never writes.
    locks: 'locks' in navigator ? navigator.locks : null,
    onStorage: (changed) => window.addEventListener('storage', (ev) => changed(ev.key)),
  });
  // Names were fitted with whatever face had loaded; fit again once the site's faces are in.
  document.fonts?.ready.then(() => stage.refit());
}
