// Entry of the zones game's own page (gh#315): hands the real document to the shared demo (../_prize-reveal/demo.ts),
// which plays a fixed demo outcome in memory through the shared reveal host. This file is the browser wiring
// only; everything testable lives in demo.ts.
import { mountDemo } from '../_prize-reveal/demo.ts';

const root = document.getElementById('app');
const live = document.getElementById('pr-live');
if (root && live) {
  const demo = mountDemo({
    doc: document,
    root,
    live,
    game: 'zones',
    whenBoldLoaded: (cb) => void document.fonts?.load('700 20px Sarabun').then(cb, cb),
  });
  // Names were fitted with whatever face had loaded; fit again once the site's faces are in.
  document.fonts?.ready.then(() => demo.refit());
  window.addEventListener('resize', () => demo.refit());
}
