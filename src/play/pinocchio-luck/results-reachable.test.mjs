// gh#195. Why this file exists at all: the play-screen fit probe CANNOT reach this route's results
// screen, so the screen where the damage would appear is outside everything CI measures. A fix that
// made the results panel unreachable would ship under a green probe -- reproduced, see below.
//
// WHAT WAS MEASURED IN A REAL BROWSER, 2026-09-03, headless Chrome 152 on CDP, a true 320x568
// emulated viewport (innerWidth/innerHeight read back as 320/568), against a real `npm run build`
// served from dist/. The walk reached renderResults by pressing the route's own controls and using
// its own `?qa` seam to answer wrongly every turn, which is what produces a loser at all:
//
//   TODAY, 4 players and 10 players alike:
//     document scroll 244px · no box in the chain from .view.result.bad up to <html> clips
//     scrolled to 244 -> the last control ("edit names") sits fully inside the viewport
//     REACHABLE: true.  10 players measures identically -- .standings caps at max-height 230px with
//     its own overflow-y:auto, so the panel's height does not grow with the roster.
//
//   WITH THE REVERTED FIX PLANTED (#app{height:100svh;max-height:100svh}):
//     document scroll 0px · main#app CLIPS 219px · last control bottom 752.6 against a 568 viewport
//     REACHABLE: false.  The scroll became a clip, exactly as gh#195 predicted.
//
//   AND THE PROBE STAYED GREEN ON THAT PLANT (exit 0). Its 320x568 row moved 107px scroll -> 0px
//     scroll / 81px clipped, and its 390x844 row moved 14px scroll -> 0px scroll. On two of three
//     rows the numbers read as an IMPROVEMENT while the results screen was unreachable.
//
//   CALIBRATION of the measurement, one real contributing element, one predicted number: shrinking
//     .standings' max-height 230px -> 130px predicts the document scroll drops 244 -> 144. Measured
//     144, and the panel's own height moved 490.6 -> 390.6. The number tracks the element.
//
// WHY THE PROBE CANNOT REACH IT, arithmetic rather than assertion. Reaching renderResults costs one
// press to start plus three per player (ready, answer, next): 1 + 3N. Measured at N=4: 13 presses.
// PRESS_CAP in scripts/play-screen-fit-probe.mjs is 6, and the cheapest possible round is N=2 at 7
// presses -- so no player count on this route is reachable within the cap. Raising the cap would not
// fix it either: the probe presses the largest visible button and never forces a WRONG answer, and a
// correct-answer round ends on renderAllSafe, a different screen.
//
// SO THIS IS WHAT GUARDS THE SCREEN INSTEAD, and it guards the SHAPE that makes it reachable rather
// than re-measuring pixels: inside #app's overflow:hidden clip, nothing on the path from the results
// panel up to #app may be given a height BOUND without also being made scrollable. A bound there is
// precisely the edit that converts today's document scroll into a clip.
//
// STATED CEILING, so nobody reads more into a green: this is a check on CSS text, not a layout
// measurement. It cannot see a bound arriving from JS, from a CSS variable resolved elsewhere, or a
// panel that grows past the screen for some other reason. It catches the one regression gh#195
// documents -- the height bound -- and says nothing about the rest.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { FakeElement } from '../../games/_fake-dom.mjs';

const here = import.meta.dirname;
const read = (f) => fs.readFileSync(path.join(here, f), 'utf8');

/** The markup chain from #panel up to #app, derived rather than hand-listed: a restructure that
 *  moves the panel out of #app, or wraps it in a new box, changes this list and must be re-thought
 *  rather than silently inheriting a pass. */
function chainToApp() {
  const root = new FakeElement('div', null);
  root.innerHTML = read('markup.html');
  const path_ = [];
  const walk = (node, trail) => {
    for (const child of node.children) {
      const next = [...trail, child];
      if (child.getAttribute('id') === 'panel') path_.push(...next);
      else walk(child, next);
    }
  };
  walk(root, []);
  assert.ok(path_.length, 'markup.html no longer contains #panel -- this test is measuring nothing');
  const app = path_.findIndex((el) => el.getAttribute('id') === 'app');
  assert.notEqual(app, -1, '#panel is no longer inside #app -- the clipping context changed, re-derive this test');
  return path_.slice(app);
}

/** Selector tokens that address a box: its id and each of its classes. */
function tokensFor(el) {
  const out = [];
  const id = el.getAttribute('id');
  if (id) out.push(`#${id}`);
  for (const c of (el.className || '').trim().split(/\s+/).filter(Boolean)) out.push(`.${c}`);
  return out;
}

/** Every rule in the route's own CSS as { selector, decls }. Comments are stripped first -- these
 *  files carry long prose that names #app and .panel-wrap, and a checker cannot tell use from
 *  mention. @media wrappers are unwrapped rather than parsed: a bound inside one bounds the box just
 *  as hard, and the route's 320x568 screen is served by a max-height media query. */
function rules() {
  const css = ['style.css', 'overrides.css']
    .map(read)
    .join('\n')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/@media[^{]*\{/g, '');
  return css
    .split('}')
    .map((chunk) => {
      const i = chunk.indexOf('{');
      return i === -1 ? null : { selector: chunk.slice(0, i).trim(), decls: chunk.slice(i + 1) };
    })
    .filter(Boolean);
}

const addressed = (selector, token) =>
  new RegExp(`${token.replace(/[.#]/g, '\\$&')}(?![\\w-])`).test(selector);

// A pseudo-element is a different box from the one it hangs off, so a height on #app:before does not
// bound #app. Rules that only address pseudo-elements are skipped.
const isPseudoOnly = (selector) =>
  selector.split(',').every((s) => /::?(before|after)/.test(s));

const HEIGHT_BOUND = /(^|;|\s)(max-height|height)\s*:/;
const SCROLLABLE = /(^|;|\s)overflow(-y)?\s*:[^;]*\b(auto|scroll)\b/;

test('#app still clips, which is the premise everything below rests on', () => {
  const appRules = rules().filter((r) => !isPseudoOnly(r.selector) && addressed(r.selector, '#app'));
  assert.ok(
    appRules.some((r) => /(^|;|\s)overflow\s*:\s*hidden/.test(r.decls)),
    '#app no longer declares overflow:hidden -- gh#195 reasoned about a clip that is now gone, so re-derive this test rather than trusting its green',
  );
});

test('nothing between the results panel and #app is height-bounded without being scrollable', () => {
  const chain = chainToApp();
  const all = rules().filter((r) => !isPseudoOnly(r.selector));
  const offenders = [];

  for (const box of chain) {
    const tokens = tokensFor(box);
    assert.ok(tokens.length, `a box in the #app -> #panel chain carries no id or class to address it: <${box.tagName}>`);
    const mine = all.filter((r) => tokens.some((t) => addressed(r.selector, t)));
    const bounded = mine.filter((r) => HEIGHT_BOUND.test(r.decls));
    if (!bounded.length) continue;
    // A bound is only safe if that same box is a scroll container: then the overflow it creates is
    // reachable inside it, instead of being clipped away by #app.
    if (mine.some((r) => SCROLLABLE.test(r.decls))) continue;
    offenders.push(`${tokens.join('/')} bounded by: ${bounded.map((r) => r.selector).join(' | ')}`);
  }

  assert.deepEqual(
    offenders,
    [],
    'a box on the path from the results panel to #app was given a height bound with no scroll region. ' +
      'Measured 2026-09-03: that converts a 244px document scroll into a 219px clip and the last control ' +
      'on the results screen becomes unreachable, and the fit probe stays GREEN on it. Give the bounded ' +
      'box overflow-y:auto, or do not bound it.',
  );
});

test('the results panel keeps the inner scroll region that stops it growing with the roster', () => {
  // .standings caps the leaderboard at a fixed height with its own scroller, which is why 10 players
  // measured the same 244px as 4. Losing that cap does not clip anything, but it does make the panel
  // grow without limit, which is the other half of what gh#195 asks about.
  const standings = rules().filter((r) => addressed(r.selector, '.standings'));
  assert.ok(standings.length, 'style.css no longer declares .standings');
  assert.ok(
    standings.some((r) => HEIGHT_BOUND.test(r.decls) && SCROLLABLE.test(r.decls)),
    '.standings no longer caps its height with its own scroll region -- the results panel now grows with the roster',
  );
});
