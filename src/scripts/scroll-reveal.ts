// gh#288 Phase 3: the scroll reveal below the first screen (design/Gh288MotionSheet.dc.html,
// owner-approved 2026-10-25). Run by PageChrome's bundled script, so it exists on web pages only;
// no play route renders PageChrome. The values (fade, rise, durations, reduced form) live in
// src/styles/web.css; this file only adds and removes two classes, never a style write.
//
// No-JS shows everything: no stylesheet rule hides an element until this script has put
// .reveal-pending on it, and it only does so for elements that are below the first screen at the
// moment it runs.

/** main's sections, plus the tiles and cards inside main (home tiles and featured card, the
 *  category cards, the tools hub cards). */
export const TARGET_SELECTOR =
  'main section, main .tile, main .featured, main .game-card, main .cross-card, main .tool-card';

/** Never hidden, and never inside or wrapping a hidden element: an ad slot must stay viewable, the
 *  hero is the first screen, and #stage is a game's play surface. */
export const NEVER_SELECTOR = '.ad-slot, .hero, #stage';

/** The element counts as in view once its top clears the bottom 10% of the viewport. */
export const ROOT_MARGIN = '0px 0px -10% 0px';

const PENDING = 'reveal-pending';
const IN = 'is-in';

type RevealWindow = Pick<Window, 'innerHeight' | 'addEventListener'> & {
  IntersectionObserver?: typeof IntersectionObserver;
  performance?: Pick<Performance, 'getEntriesByType'>;
};

/** Marks the below-the-fold targets and reveals each once as it scrolls into view. Returns how many
 *  elements it marked (0 when it chose to hide nothing). */
export function startScrollReveal(win: RevealWindow, doc: Pick<Document, 'querySelectorAll'>): number {
  const IO = win.IntersectionObserver;
  if (typeof IO !== 'function') return 0;

  // A back/forward or reload navigation restores the old scroll position, and the browser may do that
  // after this runs: an element measured below the fold here could be on screen a moment later. Hide
  // nothing on those navigations rather than race the restore.
  const nav = win.performance?.getEntriesByType?.('navigation')?.[0] as PerformanceNavigationTiming | undefined;
  if (nav && (nav.type === 'back_forward' || nav.type === 'reload')) return 0;

  // Measured once, against the viewport as it is right now.
  const fold = win.innerHeight;
  const targets = [...doc.querySelectorAll(TARGET_SELECTOR)].filter(
    (el) =>
      !el.closest(NEVER_SELECTOR) &&
      !el.querySelector(NEVER_SELECTOR) &&
      el.getBoundingClientRect().top > fold,
  );
  if (targets.length === 0) return 0;

  const reveal = (el: Element, io: IntersectionObserver) => {
    io.unobserve(el);
    // The classes come off when the element's own fade ends (a child's transition bubbles here too),
    // so the element goes back to its own transition and transform rules.
    const done = (ev: Event) => {
      if (ev.target !== el || (ev as TransitionEvent).propertyName !== 'opacity') return;
      el.removeEventListener('transitionend', done);
      el.classList.remove(PENDING, IN);
    };
    el.addEventListener('transitionend', done);
    el.classList.add(IN);
  };

  const io = new IO(
    (entries, observer) => {
      for (const entry of entries) if (entry.isIntersecting) reveal(entry.target, observer);
    },
    { threshold: 0, rootMargin: ROOT_MARGIN },
  );
  for (const el of targets) {
    el.classList.add(PENDING);
    io.observe(el);
  }

  // A page restored from the back/forward cache keeps its DOM: reveal anything still pending that is
  // already on screen instead of waiting for a scroll.
  win.addEventListener('pageshow', (ev) => {
    if (!(ev as PageTransitionEvent).persisted) return;
    for (const el of targets) {
      if (el.classList.contains(PENDING) && !el.classList.contains(IN) && el.getBoundingClientRect().top < win.innerHeight) {
        reveal(el, io);
      }
    }
  });

  return targets.length;
}
