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
