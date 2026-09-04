// The inert `+N` seat counter for a horizontally scrolling player strip (issue #184, owner ruling
// 2026-09-04 which reverses the 2026-09-03 one).
//
// What it is for: at 320px a ten-seat strip shows about two chips and slices the third, and a sliced
// chip reads as a rendering fault rather than as "there is more this way". The counter says how many
// seats are still off the trailing edge, and its opaque band gives the sliced chip somewhere to
// dissolve into instead of ending mid-glyph.
//
// What it is NOT: a control. No listener, no tabindex, no role, no `button` element — the counter is
// a `<div>` a finger can land on with nothing happening. That is deliberate. scripts/control-floor-probe.mjs
// selects `button` on a play route, so a counter that became a control would owe 44px, and the strip
// has no height to give (KNOWN_OVERFLOW already records two of these three routes over budget at
// 320x568). "Show fewer chips" means fewer AT ONCE: every seat stays in the strip and stays
// swipeable, which is why nobody's name can be hidden inside the `+N`.
//
// N is COMPUTED on every scroll, never stored and never assumed. That is load-bearing, not tidiness:
// wire-snip-panic auto-centres the active seat each turn, so when the last seat is active the strip
// ends up at maximum scroll, which is the one position where a constant N would sit on top of the
// chip the player is meant to be looking at. Because N is computed, no chip extends past the edge
// there, N is 0, and the band is invisible.
//
// Two separate reasons the active chip is safe, and an earlier version of this comment stated only a
// wrong one. It claimed the last chip sits "against the trailing edge, directly under the band". It
// does not: the band is hidden with `visibility`, which keeps its in-flow box, so the row's scrollable
// width still includes the band's width and the last chip stops short of the container's trailing
// edge by roughly that much. So the chip is clear of the band by a margin even before N reaches 0.
// The conclusion held; the mechanism did not. The margin is unmeasured here on purpose — a number
// written from arithmetic rather than from a browser is the thing that made the first version wrong.
//
// ponytail: scroll only, no ResizeObserver and no orientationchange hook. Every render calls mount(),
// which recomputes, and a rotation that changes the strip's width is followed by a render on the next
// turn. Add an observer when a report says a stale number survived a rotation.
//
// Known residual, carried rather than solved (owner-visible, wire-snip-panic only): because the
// auto-centre scrolls the strip on its own, the number there changes between turns without the player
// having touched it. That is honest — the count really did change — and no machinery is added for it.

/** Class on the counter element. Each route's overrides.css styles it; the module owns the behaviour. */
export const STRIP_COUNTER_CLASS = 'strip-more';

// Sub-pixel slack. Layout maths lands a chip's right edge a fraction past the container's on a
// fractional-DPR screen while the eye sees it flush; without slack the band would announce a seat
// that is fully visible.
const EDGE_TOLERANCE_PX = 0.5;

type RectSource = { getBoundingClientRect(): { right: number } };
type StripLike = RectSource & { children: ArrayLike<RectSource> };

/**
 * How many chips are not fully inside the strip on the TRAILING side — that is, how many have a right
 * edge past the strip's own right edge. The counter element itself is excluded: it is not a seat.
 *
 * Deliberately one-sided. Chips scrolled off the LEADING edge are behind the player, and a count that
 * included them would rise as the player swiped forward, which reads as "you are making it worse".
 */
export function trailingOverflowCount(strip: StripLike, counter: unknown): number {
  const edge = strip.getBoundingClientRect().right;
  let hidden = 0;
  for (const child of Array.from(strip.children)) {
    if (child === counter) continue;
    if (child.getBoundingClientRect().right > edge + EDGE_TOLERANCE_PX) hidden += 1;
  }
  return hidden;
}

/**
 * Writes the current count onto the counter and shows or hides it.
 *
 * `visibility`, never `display`: the counter is a flex item in the scrolled row, so removing it from
 * layout would shrink the strip's scrollWidth, the browser would clamp scrollLeft, that clamp fires a
 * scroll event, and the recount could bring the counter back — a flicker loop at the trailing end.
 * Keeping the box and hiding the paint means the geometry this function measures never moves.
 */
export function updateStripOverflowCounter(strip: HTMLElement): void {
  const counter = strip.querySelector<HTMLElement>(`.${STRIP_COUNTER_CLASS}`);
  if (!counter) return;
  const hidden = trailingOverflowCount(strip as unknown as StripLike, counter);
  counter.textContent = `+${hidden}`;
  counter.style.visibility = hidden > 0 ? 'visible' : 'hidden';
}

/**
 * Call at the END of a strip render, after the chips are in the DOM.
 *
 * Every one of these routes rebuilds its strip with `innerHTML = ''`, which takes the counter with it,
 * so this re-appends when needed and is safe to call on every render. The scroll listener is attached
 * once — the data flag survives innerHTML because it lives on the strip, not on a child — and it is
 * passive: this handler only reads geometry, and a non-passive listener would let it block scrolling.
 */
export function mountStripOverflowCounter(strip: HTMLElement | null): void {
  if (!strip) return;

  if (!strip.querySelector(`.${STRIP_COUNTER_CLASS}`)) {
    const counter = strip.ownerDocument.createElement('div');
    counter.className = STRIP_COUNTER_CLASS;
    // Decorative for a screen reader: every seat is already in the DOM and already read out, so the
    // band would only repeat what the chips just said. Hidden here, never hidden from the eye.
    counter.setAttribute('aria-hidden', 'true');
    strip.appendChild(counter);
  }

  if (!strip.dataset.stripCounter) {
    strip.dataset.stripCounter = 'on';
    strip.addEventListener('scroll', () => updateStripOverflowCounter(strip), { passive: true });
  }

  updateStripOverflowCounter(strip);
}
