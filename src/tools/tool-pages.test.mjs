// node --test src/tools/tool-pages.test.mjs
// Source-level pins for the four tool pages (gh#288 Phase 3, tool track). The page scripts are inline
// <script> blocks no plain node can import, so these read the .astro text, the same bargain
// number.test.mjs makes. Ceiling: a source scan pins the spellings below and nothing else; the
// rendered look is measured by the integration browser probes, not here.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const read = (rel) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');

const PAGES = ['draw', 'team', 'number', 'wheel'];
const page = Object.fromEntries(PAGES.map((n) => [n, read(`../pages/tool/${n}.astro`)]));

/** Template markup only: everything before the page's own <style> block, comments blanked. */
const markup = (src) => src.slice(0, src.indexOf('<style>')).replace(/\{\/\*[\s\S]*?\*\/\}/g, '');
/** The page's inline script body. */
const script = (src) => src.slice(src.indexOf('<script>'));
/** The opening tag of the element carrying `id`, as written in the template. */
function openingTag(src, id) {
  const m = markup(src).match(new RegExp(`<(?:button)\\b[^>]*\\bid="${id}"[^>]*>`));
  assert.ok(m, `no <button id="${id}"> in the template`);
  return m[0];
}
const classesOf = (tag) => (tag.match(/\bclass="([^"]*)"/)?.[1] ?? '').split(/\s+/);

test('all four tool pages render the shared ToolHeader, and none keeps a header of its own', () => {
  for (const name of PAGES) {
    assert.match(page[name], /import ToolHeader from '..\/..\/components\/ToolHeader\.astro'/, `${name}: ToolHeader not imported`);
    assert.match(markup(page[name]), /<ToolHeader\b/, `${name}: ToolHeader not rendered`);
    assert.doesNotMatch(markup(page[name]), /<h1\b/, `${name}: the h1 must come from ToolHeader only`);
    assert.doesNotMatch(markup(page[name]), /tool-chrome|tool-eyebrow|tool-breadcrumb|tool-badge/, `${name}: retired header rows must be gone`);
  }
});

test('ToolHeader owns the band: h1, tagline, 26px phone / 38px desktop', () => {
  const header = read('../components/ToolHeader.astro');
  assert.match(header, /<header class="tool-head">/);
  assert.match(header, /<h1>\{title\}<\/h1>/);
  assert.match(header, /tool-tagline/);
  assert.match(header, /font-size:\s*26px/);
  assert.match(header, /font-size:\s*38px/);
  assert.match(header, /border-bottom:\s*3px solid var\(--color-line-strong\)/);
  assert.match(header, /border-bottom-width:\s*5px/);
});

test('every go button carries tool-go and ui-press', () => {
  const go = { draw: ['draw-go'], team: ['team-split'], number: ['number-go'], wheel: ['wheel-spin', 'wheel-stop'] };
  for (const [name, ids] of Object.entries(go)) {
    for (const id of ids) {
      const classes = classesOf(openingTag(page[name], id));
      assert.ok(classes.includes('tool-go'), `${name} #${id}: missing tool-go`);
      assert.ok(classes.includes('ui-press'), `${name} #${id}: missing ui-press`);
    }
  }
  const entry = read('../components/ToolNameEntry.astro');
  assert.ok(classesOf(openingTag(entry, 'name-start')).includes('ui-press'), 'ToolNameEntry #name-start: missing ui-press');
});

test('no page keeps its own :disabled look, hover transform or press transform on a go button', () => {
  for (const name of PAGES) {
    const css = page[name].slice(page[name].indexOf('<style>'), page[name].indexOf('</style>'));
    assert.doesNotMatch(css, /#number-go:disabled|#draw-go:disabled|#team-split:disabled|\.wheel-spin:disabled|\.wheel-stop:disabled/, `${name}: own :disabled rule left behind`);
    assert.doesNotMatch(css, /(?:#draw-go|#team-split|#number-go|\.wheel-spin|\.wheel-stop)[^{]*:(?:hover|active)/, `${name}: own hover/press rule left behind`);
  }
});

test('the result path inserts a fresh .wd-reveal child, and never writes text into the live region itself', () => {
  for (const name of ['draw', 'number', 'wheel']) {
    const js = script(page[name]);
    assert.match(js, /wd-reveal/, `${name}: no .wd-reveal insertion`);
    // A non-empty textContent write straight onto the role=status element is the old path.
    assert.doesNotMatch(js, /resultEl\.textContent\s*=\s*(?!['\s])/, `${name}: result text still written onto the live region`);
  }
  const team = script(page.team);
  assert.match(team, /wd-reveal/, 'team: new cards must carry .wd-reveal');
  // The live-region element is never replaced or recreated by the script.
  for (const name of ['draw', 'number', 'wheel', 'team']) {
    assert.doesNotMatch(script(page[name]), /resultEl\.(?:replaceWith|outerHTML)\b|(?<!const\s)\bresultEl\s*=(?!=)/, `${name}: the live region must stay the same node`);
  }
});

test('the ad placeholder is one look: label only, no leftover 728 / ADR label, dashed var(--ad-line)', () => {
  for (const name of PAGES) {
    const src = page[name];
    const slot = markup(src).match(/<div class="ad-slot"[^>]*>[\s\S]*?<\/div>/);
    assert.ok(slot, `${name}: no .ad-slot in the template`);
    assert.doesNotMatch(slot[0], /728|ADR-0004|ad-slot-(?:title|meta|mobile)/, `${name}: wrong ad label left behind`);
    assert.match(slot[0], />\s*ช่องโฆษณา\s*</, `${name}: ad label missing`);
    assert.match(slot[0], /min-height: 250px/, `${name}: the 250px reserve must stay`);
    assert.match(src, /border:\s*3px dashed var\(--ad-line\)/, `${name}: ad border not the shared look`);
  }
});

test('draw and team links hover to the muted colour with a 2px underline, never the primary pink', () => {
  for (const name of ['draw', 'team']) {
    const css = page[name].slice(page[name].indexOf('<style>'), page[name].indexOf('</style>'));
    assert.doesNotMatch(css, /:hover\s*\{[^}]*--color-primary/, `${name}: a hover still uses --color-primary`);
    assert.match(css, /#how-to-use p a:hover[\s\S]*?color:\s*var\(--color-muted\)[\s\S]*?text-decoration-thickness:\s*2px[\s\S]*?text-underline-offset:\s*3px/, `${name}: how-to link hover not the approved one`);
  }
});

test('idle placeholders: draw box, team cards and the empty wheel', () => {
  const draw = page.draw;
  assert.match(draw, /\.draw-result-box:has\(> #draw-result:empty\)/, 'draw: idle placeholder selector missing');
  assert.match(page.team, /\.team-cards:empty/, 'team: idle placeholder selector missing');
  const wheelJs = script(page.wheel);
  assert.doesNotMatch(wheelJs, /names\.length === 0\) return/, 'wheel: drawWheel still returns early on an empty list');
  assert.match(wheelJs, /IDLE_SEGMENTS\s*=\s*8/, 'wheel: idle disc must have 8 segments');
});

// A go button's rest rule must not out-rank the shared .tool-go:disabled and .ui-press rules in
// web.css. Those weigh (0,2,0) and (0,3,0), and a page's scoped class rule weighs (0,2,0) once Astro
// scopes it, so a bare class ties the disabled rule and wins on source order; an id selector beats
// both outright. What is asserted: every selector, in any rule or media block of the page style, that
// names a go button AND whose rule sets box-shadow or cursor is the whole selector inside :where(),
// which weighs 0 before scoping and at most (0,1,0) after it.
test('every go-button rest rule that sets box-shadow or cursor is wrapped in :where()', () => {
  const GO = /#draw-go|#team-split|#number-go|#name-start|\.wheel-spin|\.wheel-stop/;
  const sources = [
    ...PAGES.map((n) => [`${n}.astro`, page[n]]),
    ['ToolNameEntry.astro', read('../components/ToolNameEntry.astro')],
  ];
  let checked = 0;
  for (const [file, src] of sources) {
    const css = src.slice(src.indexOf('<style>'), src.indexOf('</style>')).replace(/\/\*[\s\S]*?\*\//g, '');
    for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      const selectors = m[1].split(',').map((x) => x.trim()).filter((x) => GO.test(x));
      if (!selectors.length || !/(?:^|[;\s])(?:box-shadow|cursor)\s*:/.test(m[2])) continue;
      for (const sel of selectors) {
        checked++;
        assert.match(sel, /^:where\([^()]*\)$/, `${file}: "${sel}" sets box-shadow/cursor and is not wrapped in :where()`);
      }
    }
  }
  assert.ok(checked >= 10, `only ${checked} go-button rest selectors found: the scan is looking at the wrong shape`);
});

// gh#295 B3: the desktop band must keep the phone form's inline padding, or the h1 sits on the
// viewport edge from 1100px until the 1280px column has room to centre. Read both padding
// shorthands off the component and compare their inline halves, so no number is typed here.
test('ToolHeader desktop band keeps the phone inline padding', () => {
  const css = read('../components/ToolHeader.astro').replace(/\/\*[\s\S]*?\*\//g, '');
  const at = css.indexOf('@media (min-width: 1100px)');
  assert.ok(at > 0, 'no 1100px desktop block in ToolHeader');
  const pad = (s) => {
    const m = s.match(/\.tool-band-inner\s*\{[^}]*?\bpadding:\s*([^;]+);/);
    assert.ok(m, 'no .tool-band-inner padding shorthand');
    const v = m[1].trim().split(/\s+/);
    assert.equal(v.length, 4, `padding "${m[1]}" is not the four-value form`);
    return { right: v[1], left: v[3] };
  };
  const phone = pad(css.slice(0, at));
  const desktop = pad(css.slice(at));
  assert.notEqual(phone.left, '0', 'phone form lost its inline padding');
  assert.deepEqual(desktop, phone, 'desktop inline padding differs from the phone form');
});

// gh#295 B6: the name panel sits below the disc, so pressing its CTA left the redrawn disc, the
// status note and the spin control above the viewport. The start listener brings the disc into view;
// render() must not, because it also runs on the eliminate and mode toggles.
test('wheel: the names-in listener scrolls the disc into view, instant under reduced motion', () => {
  const js = script(page.wheel);
  const at = js.indexOf("addEventListener('watduang:start'");
  assert.ok(at > 0, 'wheel: no watduang:start listener');
  const listener = js.slice(at, js.indexOf('\n  });', at));
  assert.match(listener, /\bdisc\.scrollIntoView\(\{[^}]*block:\s*'nearest'/, 'wheel: start listener does not bring the disc into view');
  assert.match(listener, /behavior:\s*reduceMotion\.matches\s*\?\s*'auto'\s*:\s*'smooth'/, 'wheel: scroll is not instant under reduced motion');
  const renderAt = js.indexOf('function render()');
  const renderBody = js.slice(renderAt, js.indexOf('\n  }\n', renderAt));
  assert.doesNotMatch(renderBody, /scrollIntoView|scrollTo|scrollBy/, 'wheel: render() must not scroll');
});

// gh#295 B6 follow-on: the names-in scroll moves the page under the finger, so the second contact of a
// double-tap on the CTA lands on a control the scroll brought there (measured: the eliminate checkbox,
// and the name textarea mid-scroll). The start listener arms the wheel section with the shared gate:
// every button by discovery except the CTA itself (it holds focus, and ADR-0016 never yanks a focused
// control), plus the two non-button controls named.
test('wheel: the names-in listener arms the wheel section, checkbox and textarea included', () => {
  const js = script(page.wheel);
  assert.match(js, /import\s*\{[^}]*\barmAllButtons\b[^}]*\}\s*from\s*'..\/..\/games\/_arm-gate'/, 'wheel: armAllButtons not imported from the shared gate');
  const at = js.indexOf("addEventListener('watduang:start'");
  const listener = js.slice(at, js.indexOf('\n  });', at));
  assert.match(listener, /armAllButtons\(\s*wheelSection\s*,\s*\[\s*startBtn\s*\]\s*,\s*syncControls\s*,\s*\[\s*eliminateBox\s*,\s*nameInput\s*\]\s*\)/, 'wheel: start listener does not arm the section with the CTA excepted and the checkbox and textarea added');
  assert.match(listener, /disarmNames\?\.\(\)/, 'wheel: a previous names-in gate is not cancelled before re-arming');
});

test('the shared gate disables the extra non-button controls it is handed, then hands them back', async () => {
  const { armAllButtons, ARM_DELAY_MS } = await import('../games/_arm-gate.ts');
  const listeners = [];
  const stage = { children: [], addEventListener: (t, f) => listeners.push(f), removeEventListener: () => {} };
  const box = { tagName: 'INPUT', disabled: false, children: [] };
  const area = { tagName: 'TEXTAREA', disabled: false, children: [] };
  const held = { tagName: 'INPUT', disabled: true, children: [] };
  const cancel = armAllButtons(stage, [], undefined, [box, area, held]);
  assert.equal(box.disabled, true, 'checkbox not disabled inside the window');
  assert.equal(area.disabled, true, 'textarea not disabled inside the window');
  await new Promise((r) => setTimeout(r, ARM_DELAY_MS + 50));
  assert.equal(box.disabled, false, 'checkbox not handed back after the window');
  assert.equal(area.disabled, false, 'textarea not handed back after the window');
  assert.equal(held.disabled, true, 'a control the caller had disabled came back enabled');
  cancel();
});

test('the "เล่นเกมต่อ" GameNav sits after the tool section and before #how-to-use on all four pages', () => {
  for (const name of PAGES) {
    const src = markup(page[name]);
    const open = src.search(new RegExp(`<section\\b[^>]*\\bid="${name}"`));
    assert.ok(open >= 0, `${name}: no <section id="${name}"> in the template`);
    const close = src.indexOf('</section>', open);
    assert.ok(close > open, `${name}: tool section is never closed`);
    assert.equal(src.slice(open + 1, close).includes('<section'), false, `${name}: a nested section makes the first close tag the wrong boundary`);
    const nav = src.indexOf('<GameNav');
    const howTo = src.indexOf('<section id="how-to-use"');
    assert.ok(nav >= 0 && howTo >= 0, `${name}: GameNav or #how-to-use missing`);
    assert.ok(nav > close, `${name}: GameNav is still inside the tool section`);
    assert.ok(nav < howTo, `${name}: GameNav does not precede #how-to-use`);
  }
});
