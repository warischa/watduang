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

/** How long past the computed transition the fallback waits for transitionend before taking the
 *  classes off itself. A frame or two of slack for a busy main thread; it only matters when the
 *  fade never fires (a stylesheet elsewhere forcing `transition: none`), and then the element is
 *  already fully shown and only the classes are left to clear. */
export const FALLBACK_MARGIN_MS = 100;

const PENDING = 'reveal-pending';
const IN = 'is-in';

const toMs = (t: string): number => {
  const v = parseFloat(t);
  if (!Number.isFinite(v)) return 0;
  return t.trim().endsWith('ms') ? v : v * 1000;
};

/** The longest duration + delay pair in a computed style's transition lists, in ms (0 when none).
 *  CSS repeats the shorter list to the longer one's length, so pairs are read the same way. */
export function transitionMs(cs: Pick<CSSStyleDeclaration, 'transitionDuration' | 'transitionDelay'>): number {
  const durations = (cs.transitionDuration || '').split(',').filter((x) => x.trim() !== '');
  const delays = (cs.transitionDelay || '').split(',').filter((x) => x.trim() !== '');
  let max = 0;
  for (let i = 0; i < Math.max(durations.length, delays.length); i++) {
    const d = durations.length ? toMs(durations[i % durations.length]) : 0;
    const w = delays.length ? toMs(delays[i % delays.length]) : 0;
    max = Math.max(max, d + w);
  }
  return max;
}

type RevealWindow = Pick<Window, 'innerHeight' | 'addEventListener' | 'getComputedStyle' | 'setTimeout' | 'clearTimeout'> & {
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
    // so the element goes back to its own transition and transform rules. If no fade runs at all (a
    // stylesheet elsewhere forcing `transition: none`), transitionend never fires; the fallback timer
    // clears the classes once the computed transition time plus a margin has passed.
    let timer = 0;
    const finish = () => {
      win.clearTimeout(timer);
      el.removeEventListener('transitionend', done);
      el.classList.remove(PENDING, IN);
    };
    const done = (ev: Event) => {
      if (ev.target !== el || (ev as TransitionEvent).propertyName !== 'opacity') return;
      finish();
    };
    el.addEventListener('transitionend', done);
    el.classList.add(IN);
    timer = win.setTimeout(finish, transitionMs(win.getComputedStyle(el)) + FALLBACK_MARGIN_MS);
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
