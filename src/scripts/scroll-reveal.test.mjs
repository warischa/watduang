// node --test — no framework, no dependency. gh#288 Phase 3: the scroll reveal below the first
// screen. The module's selection and lifecycle are exercised against a hand-rolled fake DOM (the
// harness style this repo's DOM tests use; no jsdom). What a fake cannot prove — that the selector
// matches the real pages, and that a real browser fires the observer — is the home page probe's job
// (scripts/home-page-probe.mjs, the scroll-reveal verdict).
//
// Invariants:
//   1. A target is decided once, at the moment the script runs, against the CURRENT viewport:
//      rect.top > innerHeight. Anything at or above the fold is never hidden.
//   2. Never an ad slot, the hero, or #stage — neither inside one nor containing one.
//   3. No IntersectionObserver, or a back/forward or reload navigation (the browser restores the
//      scroll position, possibly after this runs): nothing is hidden.
//   4. threshold 0, rootMargin "0px 0px -10% 0px", once per element, then unobserve.
//   5. The script's classes are temporary: once the fade ends they come off, so the element is back
//      on its own rules (its hover transition, its rest transform).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TARGET_SELECTOR, NEVER_SELECTOR, ROOT_MARGIN, FALLBACK_MARGIN_MS, transitionMs, startScrollReveal } from './scroll-reveal.ts';

class FakeClassList {
  constructor() { this.set = new Set(); }
  add(...c) { c.forEach((x) => this.set.add(x)); }
  remove(...c) { c.forEach((x) => this.set.delete(x)); }
  contains(c) { return this.set.has(c); }
}

class FakeEl {
  constructor(name, top, { insideNever = false, containsNever = false } = {}) {
    this.name = name;
    this.top = top;
    this.insideNever = insideNever;
    this.containsNever = containsNever;
    this.classList = new FakeClassList();
    this.listeners = {};
  }
  getBoundingClientRect() { return { top: this.top, bottom: this.top + 100 }; }
  closest(sel) { assert.equal(sel, NEVER_SELECTOR); return this.insideNever ? {} : null; }
  querySelector(sel) { assert.equal(sel, NEVER_SELECTOR); return this.containsNever ? {} : null; }
  addEventListener(type, fn) { (this.listeners[type] ??= []).push(fn); }
  removeEventListener(type, fn) { this.listeners[type] = (this.listeners[type] ?? []).filter((f) => f !== fn); }
  fire(type, ev) { (this.listeners[type] ?? []).slice().forEach((fn) => fn({ target: this, ...ev })); }
}

function makeEnv(elements, { io = true, navType = 'navigate', innerHeight = 800 } = {}) {
  const observers = [];
  class FakeIO {
    constructor(cb, options) { this.cb = cb; this.options = options; this.observed = new Set(); observers.push(this); }
    observe(el) { this.observed.add(el); }
    unobserve(el) { this.observed.delete(el); }
    emit(el, isIntersecting) { this.cb([{ target: el, isIntersecting }], this); }
  }
  const winListeners = {};
  const timers = [];
  const win = {
    innerHeight,
    computed: { transitionDuration: '0.45s, 0.45s', transitionDelay: '0s, 0s' },
    getComputedStyle() { return this.computed; },
    setTimeout(fn, ms) { timers.push({ fn, ms, cleared: false }); return timers.length; },
    clearTimeout(id) { if (timers[id - 1]) timers[id - 1].cleared = true; },
    timers,
    performance: { getEntriesByType: (t) => (t === 'navigation' && navType ? [{ type: navType }] : []) },
    addEventListener(type, fn) { (winListeners[type] ??= []).push(fn); },
    fire(type, ev) { (winListeners[type] ?? []).forEach((fn) => fn(ev)); },
  };
  if (io) win.IntersectionObserver = FakeIO;
  const doc = {
    querySelectorAll(sel) { assert.equal(sel, TARGET_SELECTOR); return elements; },
  };
  return { win, doc, observers };
}

const pending = (el) => el.classList.contains('reveal-pending');

test('the predicate runs once against the current viewport: only top > innerHeight is a target', () => {
  const above = new FakeEl('above', 120);
  const straddle = new FakeEl('straddle', 700);
  const atFold = new FakeEl('at-fold', 800);
  const below = new FakeEl('below', 801);
  // A page restored scrolled: an element the user scrolled past reports a negative top.
  const scrolledPast = new FakeEl('scrolled-past', -2400);
  const { win, doc, observers } = makeEnv([above, straddle, atFold, below, scrolledPast]);
  const n = startScrollReveal(win, doc);
  assert.equal(n, 1);
  assert.deepEqual([above, straddle, atFold, below, scrolledPast].filter(pending).map((e) => e.name), ['below']);
  assert.equal(observers.length, 1);
  assert.deepEqual([...observers[0].observed].map((e) => e.name), ['below']);
});

test('never an ad slot, the hero or #stage — neither inside one nor wrapping one', () => {
  const inside = new FakeEl('inside', 1200, { insideNever: true });
  const wraps = new FakeEl('wraps', 1200, { containsNever: true });
  const plain = new FakeEl('plain', 1200);
  const { win, doc } = makeEnv([inside, wraps, plain]);
  startScrollReveal(win, doc);
  assert.deepEqual([inside, wraps, plain].filter(pending).map((e) => e.name), ['plain']);
});

test('no IntersectionObserver: nothing is hidden', () => {
  const below = new FakeEl('below', 1200);
  const { win, doc } = makeEnv([below], { io: false });
  assert.equal(startScrollReveal(win, doc), 0);
  assert.equal(pending(below), false);
});

test('a back/forward or reload navigation hides nothing: the restored scroll may land after this runs', () => {
  for (const navType of ['back_forward', 'reload']) {
    const below = new FakeEl('below', 1200);
    const { win, doc, observers } = makeEnv([below], { navType });
    assert.equal(startScrollReveal(win, doc), 0, navType);
    assert.equal(pending(below), false, navType);
    assert.equal(observers.length, 0, navType);
  }
  // positive control: the same element on a plain navigation IS a target, so the skip above is the
  // navigation type, not the element.
  const below = new FakeEl('below', 1200);
  const { win, doc } = makeEnv([below], { navType: 'navigate' });
  assert.equal(startScrollReveal(win, doc), 1);
});

test('observer: threshold 0, the -10% bottom margin, once per element, then unobserve', () => {
  assert.equal(ROOT_MARGIN, '0px 0px -10% 0px');
  const below = new FakeEl('below', 1200);
  const { win, doc, observers } = makeEnv([below]);
  startScrollReveal(win, doc);
  const io = observers[0];
  assert.deepEqual(io.options, { threshold: 0, rootMargin: '0px 0px -10% 0px' });

  io.emit(below, false);
  assert.equal(below.classList.contains('is-in'), false, 'a non-intersecting entry reveals nothing');
  assert.ok(io.observed.has(below));

  io.emit(below, true);
  assert.ok(below.classList.contains('is-in'));
  assert.ok(pending(below), 'pending stays on until the fade ends, so the transition runs');
  assert.equal(io.observed.has(below), false, 'unobserved after the first reveal');
});

test('the classes come off when the element own opacity fade ends, not on a child transition', () => {
  const below = new FakeEl('below', 1200);
  const { win, doc, observers } = makeEnv([below]);
  startScrollReveal(win, doc);
  observers[0].emit(below, true);

  below.fire('transitionend', { target: {}, propertyName: 'opacity' });
  assert.ok(below.classList.contains('is-in'), 'a bubbled child transitionend must not end the reveal');
  below.fire('transitionend', { propertyName: 'translate' });
  assert.ok(below.classList.contains('is-in'), 'only the opacity fade ends the reveal');
  below.fire('transitionend', { propertyName: 'opacity' });
  assert.equal(below.classList.contains('is-in'), false);
  assert.equal(pending(below), false);
  assert.equal((below.listeners.transitionend ?? []).length, 0, 'the listener is removed');
});

test('a bfcache restore reveals any still-pending element already in view', () => {
  const nowInView = new FakeEl('now-in-view', 1200);
  const stillBelow = new FakeEl('still-below', 1600);
  const { win, doc, observers } = makeEnv([nowInView, stillBelow]);
  startScrollReveal(win, doc);
  nowInView.top = 300;

  win.fire('pageshow', { persisted: false });
  assert.equal(nowInView.classList.contains('is-in'), false, 'a fresh pageshow changes nothing');

  win.fire('pageshow', { persisted: true });
  assert.ok(nowInView.classList.contains('is-in'));
  assert.equal(observers[0].observed.has(nowInView), false);
  assert.equal(stillBelow.classList.contains('is-in'), false);
  assert.ok(observers[0].observed.has(stillBelow));
});

test('the selectors: main sections and the tiles and cards; never the ad slot, hero or stage', () => {
  assert.match(TARGET_SELECTOR, /(^|,\s*)main section(\s*,|$)/);
  for (const cls of ['tile', 'featured', 'game-card', 'cross-card', 'tool-card']) {
    assert.match(TARGET_SELECTOR, new RegExp(`\\.${cls}\\b`), `.${cls} is a target`);
  }
  assert.deepEqual(NEVER_SELECTOR.split(',').map((s) => s.trim()).sort(), ['#stage', '.ad-slot', '.hero']);
});

// The connector. PageChrome is the one component every web page renders and no play route does, so
// its script is what keeps the reveal off play routes. A bare <script> is one Astro bundles into an
// external module; is:inline, or any attribute, would be inlined or left unprocessed, and the CSP
// (script-src 'self', ADR-0005) blocks inline execution silently.
test('PageChrome runs the reveal from a bundled script, and that script does nothing else', async () => {
  const { readFileSync } = await import('node:fs');
  const chrome = readFileSync(new URL('../components/PageChrome.astro', import.meta.url), 'utf8');
  const scripts = [...chrome.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)];
  assert.equal(scripts.length, 1, 'exactly one script in PageChrome');
  const [, attrs, body] = scripts[0];
  assert.equal(attrs.trim(), '', 'a bare <script>, so Astro bundles it');
  assert.match(body, /import \{ startScrollReveal \} from '\.\.\/scripts\/scroll-reveal';/);
  assert.match(body, /startScrollReveal\(window, document\);/);
});

// Any `transition: none` that outranks the reveal (a page's !important reduced rule, a component's
// own stop) means no transitionend ever fires. A timer at the computed transition time plus a margin
// takes the classes off anyway, so nothing is ever stranded half-revealed.
test('transitionMs reads the longest duration + delay from computed style, in ms', () => {
  assert.equal(transitionMs({ transitionDuration: '0.45s, 0.45s', transitionDelay: '0s, 0s' }), 450);
  assert.equal(transitionMs({ transitionDuration: '200ms', transitionDelay: '0s' }), 200);
  assert.equal(transitionMs({ transitionDuration: '0s', transitionDelay: '0s' }), 0);
  assert.equal(transitionMs({ transitionDuration: '0.1s, 0.3s', transitionDelay: '0.2s, 0s' }), 300);
  assert.equal(transitionMs({ transitionDuration: '', transitionDelay: '' }), 0);
});

test('with no transition at all, the fallback timer takes the classes off at the margin', () => {
  const below = new FakeEl('below', 1200);
  const { win, doc, observers } = makeEnv([below]);
  win.computed = { transitionDuration: '0s', transitionDelay: '0s' };
  startScrollReveal(win, doc);
  observers[0].emit(below, true);
  assert.equal(win.timers.length, 1, 'one fallback timer per reveal');
  assert.equal(win.timers[0].ms, FALLBACK_MARGIN_MS);
  assert.ok(pending(below), 'still pending until the timer fires');
  win.timers[0].fn();
  assert.equal(pending(below), false);
  assert.equal(below.classList.contains('is-in'), false);
  assert.equal((below.listeners.transitionend ?? []).length, 0, 'the transitionend listener goes too');
});

test('the fallback waits for the computed transition, and transitionend first cancels it', () => {
  const below = new FakeEl('below', 1200);
  const { win, doc, observers } = makeEnv([below]);
  startScrollReveal(win, doc);
  observers[0].emit(below, true);
  assert.equal(win.timers[0].ms, 450 + FALLBACK_MARGIN_MS);
  below.fire('transitionend', { propertyName: 'opacity' });
  assert.equal(pending(below), false);
  assert.ok(win.timers[0].cleared, 'the fallback timer is cleared once the fade ends');
});
