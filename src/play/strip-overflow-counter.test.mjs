// issue #184: the `+N` counter on the three scrolling player strips.
//
// The one thing this file exists to stop: a counter that renders a number without measuring anything.
// A test that asserted "the band is there and says +8" would pass a hardcoded `+8`, and a hardcoded
// count is exactly what would sit on top of the active chip at maximum scroll — which is the failure
// the design brief singles out. So the assertions below drive ONE chip set through several scroll
// positions and require the number to change with the geometry, including down to 0.
//
// ponytail: no DOM. This repo has no jsdom, so trailingOverflowCount is fed plain objects that answer
// getBoundingClientRect(), which is the whole of its input. What that costs is stated: this proves the
// ARITHMETIC of N and (by source match, below) that each route hands its own strip to the shared
// mount. It proves nothing about the rendered band — its height, its opacity, or whether a real
// browser agrees about which chip is flush with the edge. Only a browser pass proves those.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { makeDocument } from '../games/_fake-dom.mjs';
import {
  STRIP_COUNTER_CLASS,
  mountStripOverflowCounter,
  trailingOverflowCount,
} from './_strip-overflow.ts';

/** A strip whose right edge is at `edge`, holding chips at the given [left-ignored, right] edges. */
const strip = (edge, rights) => ({
  getBoundingClientRect: () => ({ right: edge }),
  children: rights.map((right) => ({ getBoundingClientRect: () => ({ right }) })),
});

// Ten seats, 100px apart, in a 320px-wide strip. Scrolling is modelled by subtracting the scroll
// offset from every chip's right edge, which is what a scroll actually does to a client rect.
const TEN_SEATS = [100, 200, 300, 400, 500, 600, 700, 800, 900, 1000];
const scrolledBy = (px) => strip(320, TEN_SEATS.map((r) => r - px));

test('N is the count of chips not fully inside on the trailing side', () => {
  // Unscrolled: chips ending at 100, 200 and 300 are inside a 320px strip; the other seven are not.
  assert.equal(trailingOverflowCount(scrolledBy(0), null), 7);
});

test('N falls as the player swipes forward — the same chips, a different number', () => {
  const counts = [0, 100, 200, 300, 400, 500, 680].map((px) =>
    trailingOverflowCount(scrolledBy(px), null),
  );
  assert.deepEqual(counts, [7, 6, 5, 4, 3, 2, 0]);
  // The positive control against a hardcoded number: a constant would make this set size 1.
  assert.ok(new Set(counts).size > 1, 'N never changed — the counter is not measuring the strip');
});

test('at maximum scroll N is 0, so the band cannot occlude an auto-centred last seat', () => {
  // The last chip flush with the trailing edge is exactly where scrollIntoView({inline:"center"})
  // leaves the active seat when it is the last one. Nothing is past the edge, so the band is hidden.
  assert.equal(trailingOverflowCount(scrolledBy(680), null), 0);
});

test('a chip a hair past the edge is not counted, one clearly past it is', () => {
  assert.equal(trailingOverflowCount(strip(320, [319.9, 320.4]), null), 0);
  assert.equal(trailingOverflowCount(strip(320, [320.6]), null), 1);
});

test('the counter element is not counted as a seat', () => {
  const s = strip(320, [400, 500]);
  const counter = s.children[1];
  assert.equal(trailingOverflowCount(s, null), 2);
  assert.equal(trailingOverflowCount(s, counter), 1);
});

// The same hostile roster value ./name-escaping.test.mjs uses: a Thai name carrying an attribute
// break and a whole anchor element.
const HOSTILE = 'นัท"><a href="/x">boom</a>';

// Why this test exists at all: ./name-escaping.test.mjs stubs mountStripOverflowCounter out of the
// short-stick and wire-snip-panic harnesses, and the justification for that stub is "the counter
// writes a number, never a name". That sentence was unproven until here. This drives the REAL module
// over a strip whose chips carry HOSTILE and requires the band's text to be digits and nothing else,
// so the counter cannot quietly become an escape sink under a green escape suite.
test('the counter writes digits only, even when every chip carries a hostile name', () => {
  const doc = makeDocument();
  const strip = doc.createElement('div');
  strip.dataset = {};
  strip.getBoundingClientRect = () => ({ right: 320 });
  for (const right of TEN_SEATS) {
    const chip = doc.createElement('span');
    // Raw on purpose. The chip's own escaping is not what this file measures; what it measures is
    // that the counter reads geometry off this chip and copies no character of it.
    chip.innerHTML = `<span class="chip-name">${HOSTILE}</span>`;
    chip.getBoundingClientRect = () => ({ right });
    strip.appendChild(chip);
  }

  mountStripOverflowCounter(strip);

  // Not measuring nothing: the payload really did become an element inside the strip, so a counter
  // that copied chip text would have something dangerous to copy.
  assert.ok(strip.querySelectorAll('a').length > 0, 'the hostile name never rendered — this check is measuring nothing');

  const counter = strip.querySelector(`.${STRIP_COUNTER_CLASS}`);
  assert.ok(counter, 'mount did not create the counter');
  assert.match(counter.textContent, /^\+\d+$/,
    `the counter's text is not digits-only (got ${JSON.stringify(counter.textContent)}) — it is now an escape sink`);
  assert.equal(counter.querySelectorAll('a').length, 0, 'the counter grew an element of its own');
  // And it is still the measured number, not a constant that happens to match the shape.
  assert.equal(counter.textContent, '+7');
});

// The three routes with a horizontally scrolling strip, listed by hand and not globbed: a glob would
// silently shrink to the routes that happen to match and report a green over an empty set.
// cursed-number is absent on purpose — its strip wraps instead of scrolling, so it has no trailing
// edge to hide anything behind. cannon-flag and how-close-is-near have no player strip at all.
const ROUTES = [
  { id: 'short-stick', stripId: 'draw-player-strip' },
  { id: 'wire-snip-panic', stripId: 'hud-player-strip' },
  { id: 'zero-trigger', stripId: 'game-player-strip' },
];

for (const { id, stripId } of ROUTES) {
  test(`${id} wires its own strip to the shared counter`, () => {
    const main = fs.readFileSync(path.join(import.meta.dirname, id, 'main.js'), 'utf8');
    assert.match(
      main,
      /import \{[^}]*mountStripOverflowCounter[^}]*\} from '\.\.\/_strip-overflow\.ts'/,
      'the route does not import the shared counter',
    );
    assert.match(
      main,
      /mountStripOverflowCounter\(strip\)/,
      'the counter is never mounted on the element the render just filled',
    );
    // The strip the route mounts on must be the one it renders into, not some other element.
    assert.ok(main.includes(stripId), `main.js no longer names ${stripId} — this test is measuring nothing`);
  });

  test(`${id} styles the counter and gives it no height of its own`, () => {
    const css = fs.readFileSync(path.join(import.meta.dirname, id, 'overrides.css'), 'utf8');
    assert.ok(css.includes(`.${STRIP_COUNTER_CLASS}`), 'overrides.css does not style the counter');
    // Zero added height, in the only form a text file can carry it: the band never sets a block size,
    // so the strip's height stays the tallest CHIP's height, exactly as it was before this change.
    const block = css.slice(css.indexOf(`.${STRIP_COUNTER_CLASS}`));
    const rule = block.slice(0, block.indexOf('}') + 1);
    assert.doesNotMatch(
      rule,
      /(^|[^-])(min-)?(block-size|height)\s*:/,
      'the band declares a height — it can now outgrow the chips and add height to the strip',
    );
  });

  test(`${id} keeps the counter inert`, () => {
    const main = fs.readFileSync(path.join(import.meta.dirname, id, 'main.js'), 'utf8');
    assert.doesNotMatch(main, new RegExp(`${STRIP_COUNTER_CLASS}[^\\n]*addEventListener`));
    const css = fs.readFileSync(path.join(import.meta.dirname, id, 'overrides.css'), 'utf8');
    assert.doesNotMatch(css, new RegExp(`\\.${STRIP_COUNTER_CLASS}[^{]*:(hover|active|focus)`));
  });
}
