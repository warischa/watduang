// node --test — no framework, no dependency. gh#288 Phase 3: src/styles/web.css is the web-only
// interaction layer (focus ring, .ui-press hover and press, .wd-reveal result reveal, .tool-go
// disabled look). Pinned at the source-text level, same bargain as the other .astro seam tests:
//
//   1. The connector: PageChrome imports web.css, and PageChrome is the one component every web page
//      renders and no play route does — so these classes exist on web pages only.
//   2. Reduced motion is reduced, not removed (ADR-0046): the reduced block keeps a form of every
//      effect and never writes animation/transition none.
//   3. Hover sits only under (hover: hover); press is :active; both skip :disabled.
//   4. Every duration and easing is a motion token from tokens.css, never a literal.
//   5. The tools hub, which has no test file of its own, tags its pop cards and uses the muted
//      underline link hover.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';

const read = (rel) => readFileSync(new URL(rel, import.meta.url), 'utf8');
const stripCss = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '');

/** Flat CSS rule walk: every `{...}` block with its prelude and the preludes of its enclosing
 *  blocks. Enough for a hand-written sheet with at-rules one level deep; not a CSS parser. */
function parseRules(css) {
  const out = [];
  const stack = [];
  let buf = '';
  for (const ch of css) {
    if (ch === '{') {
      stack.push(buf.trim());
      buf = '';
    } else if (ch === '}') {
      const prelude = stack.pop();
      out.push({ prelude, body: buf.trim(), parents: [...stack] });
      buf = '';
    } else {
      buf += ch;
    }
  }
  return out;
}

const selectorsOf = (rule) => rule.prelude.split(',').map((s) => s.trim().replace(/\s+/g, ' '));
const REDUCED = /prefers-reduced-motion:\s*reduce/;
const HOVER_MQ = /\(hover:\s*hover\)/;

const webCss = read('./web.css');
const code = stripCss(webCss);
const rules = parseRules(code);
const leaf = rules.filter((r) => !r.prelude.startsWith('@'));
const inReduced = (r) => r.parents.some((p) => REDUCED.test(p));
const find = (selector, pred = () => true) =>
  leaf.filter((r) => selectorsOf(r).includes(selector) && pred(r));

// positive control: the comment strip and the rule walk must leave real declarations behind, or every
// absence check below is vacuously green (gh#130).
assert.ok(find('.ui-press').length > 0, 'positive control: the rule walk found no .ui-press rule');

test('the connector: PageChrome imports web.css, Base does not, and no play route renders PageChrome', () => {
  const chrome = read('../components/PageChrome.astro');
  const frontmatter = chrome.match(/^---\n([\s\S]*?)\n---/);
  assert.ok(frontmatter, 'positive control: PageChrome still has a frontmatter fence');
  assert.match(frontmatter[1], /^import '\.\.\/styles\/web\.css';$/m, 'PageChrome must import web.css');
  assert.doesNotMatch(read('../layouts/Base.astro'), /web\.css/, 'Base serves play routes too, so it must never import web.css');

  const gameDir = new URL('../pages/game/', import.meta.url);
  const playRoutes = readdirSync(gameDir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && existsSync(new URL(`${d.name}/play.astro`, gameDir)))
    .map((d) => d.name);
  assert.ok(playRoutes.length > 0, 'positive control: no play route found to scan');
  for (const id of playRoutes) {
    const src = readFileSync(new URL(`${id}/play.astro`, gameDir), 'utf8');
    assert.doesNotMatch(src, /PageChrome|web\.css/, `play route ${id} must not reach the web-only layer`);
  }
});

test('focus ring: one global :focus-visible ring, gold on every ink band, identical under reduced motion', () => {
  const ring = find(':focus-visible', (r) => r.parents.length === 0);
  assert.equal(ring.length, 1, 'exactly one top-level :focus-visible rule');
  assert.match(ring[0].body, /outline:\s*var\(--focus-ring\)/);
  assert.match(ring[0].body, /outline-offset:\s*var\(--focus-offset\)/);

  // The ink bands web pages render: PageChrome's top bar and footer, and the home page's band.
  const bands = leaf.filter((r) => /outline-color/.test(r.body));
  assert.equal(bands.length, 1, 'one ink-band override rule');
  assert.deepEqual(selectorsOf(bands[0]).sort(), ['.band :focus-visible', '.chrome-bar :focus-visible']);
  assert.match(bands[0].body, /outline-color:\s*var\(--surface-sun\)/);
  assert.equal(bands[0].parents.length, 0, 'the band override must not be gated by a media query');

  assert.ok(
    !leaf.some((r) => inReduced(r) && /outline/.test(r.body)),
    'the ring is not animated, so the reduced block must not restate or alter it',
  );
});

test('.ui-press: hover only under (hover: hover), press on :active, both skip :disabled', () => {
  const hoverRules = leaf.filter((r) => selectorsOf(r).some((s) => s.startsWith('.ui-press') && s.includes(':hover')));
  assert.ok(hoverRules.length >= 2, 'a full and a reduced hover rule');
  for (const r of hoverRules) {
    assert.ok(r.parents.some((p) => HOVER_MQ.test(p)), `hover outside (hover: hover): ${r.prelude}`);
  }
  for (const r of leaf.filter((x) => selectorsOf(x).some((s) => s.startsWith('.ui-press:')))) {
    for (const s of selectorsOf(r)) assert.match(s, /:not\(:disabled\)/, `state rule must skip :disabled: ${s}`);
  }

  const full = (sel) => find(sel, (r) => !inReduced(r));
  const base = full('.ui-press');
  assert.equal(base.length, 1);
  assert.match(base[0].body, /transition:\s*transform var\(--motion-ui\) var\(--ease-out\),\s*box-shadow var\(--motion-ui\) var\(--ease-out\)/);

  const hover = full('.ui-press:hover:not(:disabled)');
  assert.equal(hover.length, 1);
  assert.match(hover[0].body, /transform:\s*translate\(-2px,\s*-2px\)/);
  assert.match(hover[0].body, /box-shadow:\s*6px 6px 0 var\(--ink\)/);

  const press = full('.ui-press:active:not(:disabled)');
  assert.equal(press.length, 1);
  assert.match(press[0].body, /transform:\s*translate\(4px,\s*4px\)/);
  assert.match(press[0].body, /box-shadow:\s*0 0 0 var\(--ink\)/);
  // Same specificity as hover, so source order decides: a pressed control is also hovered and must
  // show the press.
  assert.ok(leaf.indexOf(press[0]) > leaf.indexOf(hover[0]), 'press must come after hover');
});

test('reduced motion is reduced, not removed', () => {
  assert.ok(rules.some((r) => REDUCED.test(r.prelude)), 'a prefers-reduced-motion: reduce block exists');
  assert.doesNotMatch(code, /\b(animation|transition)\s*:\s*none\b/, 'never remove an effect under reduced motion');

  const base = find('.ui-press', inReduced);
  assert.equal(base.length, 1, 'a reduced .ui-press base rule');
  assert.match(base[0].body, /transition:\s*box-shadow var\(--motion-rm-quick\) var\(--ease-rm\)/);
  assert.doesNotMatch(base[0].body, /transform/, 'the reduced transition carries the shadow cue only');

  const hover = find('.ui-press:hover:not(:disabled)', inReduced);
  const press = find('.ui-press:active:not(:disabled)', inReduced);
  assert.equal(hover.length, 1);
  assert.equal(press.length, 1);
  assert.match(hover[0].body, /transform:\s*none/);
  assert.match(hover[0].body, /box-shadow:\s*6px 6px 0 var\(--ink\)/);
  assert.match(press[0].body, /transform:\s*none/);
  assert.match(press[0].body, /box-shadow:\s*0 0 0 var\(--ink\)/);
  assert.ok(leaf.indexOf(press[0]) > leaf.indexOf(hover[0]), 'reduced press must come after reduced hover');

  const reveal = find('.wd-reveal', inReduced);
  assert.equal(reveal.length, 1);
  assert.match(reveal[0].body, /animation:\s*wd-reveal-rm var\(--motion-rm-fade\) var\(--ease-rm\) both/);
});

test('.wd-reveal: one shared keyframe, opacity from 0.4, scale only in the full form', () => {
  const reveal = find('.wd-reveal', (r) => !inReduced(r));
  assert.equal(reveal.length, 1);
  assert.match(reveal[0].body, /animation:\s*wd-reveal var\(--motion-reveal\) var\(--ease-out\) both/);

  const frames = (name) => rules.filter((r) => r.parents.at(-1) === `@keyframes ${name}`);
  const full = frames('wd-reveal');
  assert.match(full.find((r) => r.prelude === 'from')?.body ?? '', /opacity:\s*0?\.4;[\s\S]*transform:\s*scale\(0?\.96\)/);
  assert.match(full.find((r) => r.prelude === 'to')?.body ?? '', /opacity:\s*1;[\s\S]*transform:\s*none/);
  const rm = frames('wd-reveal-rm');
  assert.match(rm.find((r) => r.prelude === 'from')?.body ?? '', /^opacity:\s*0?\.4;?$/);
  assert.match(rm.find((r) => r.prelude === 'to')?.body ?? '', /^opacity:\s*1;?$/);
});

test('.tool-go:disabled: dimmed, flat, no pointer', () => {
  const off = find('.tool-go:disabled');
  assert.equal(off.length, 1);
  assert.match(off[0].body, /opacity:\s*0?\.4/);
  assert.match(off[0].body, /box-shadow:\s*none/);
  assert.match(off[0].body, /cursor:\s*default/);
});

test('every duration and easing is a motion token, never a literal', () => {
  const timed = leaf.flatMap((r) => r.body.split(';')).filter((d) => /^\s*(animation|transition)\s*:/.test(d));
  assert.ok(timed.length >= 4, 'positive control: the timed declarations were found');
  for (const d of timed) assert.match(d, /var\(--motion-/, `untokened duration: ${d.trim()}`);
  // The longhands too: the view-transition pseudos set duration and easing one property at a time.
  const decls = leaf.flatMap((r) => r.body.split(';'));
  const durations = decls.filter((d) => /^\s*(animation|transition)-(duration|delay)\s*:/.test(d));
  const easings = decls.filter((d) => /^\s*(animation|transition)-timing-function\s*:/.test(d));
  assert.ok(durations.length >= 2 && easings.length >= 2, 'positive control: the longhand declarations were found');
  for (const d of durations) assert.match(d, /:\s*var\(--motion-[\w-]+\)\s*$/, `untokened longhand duration: ${d.trim()}`);
  for (const d of easings) assert.match(d, /:\s*var\(--ease-[\w-]+\)\s*$/, `untokened longhand easing: ${d.trim()}`);
  const noVars = code.replace(/var\([^)]*\)/g, '');
  assert.doesNotMatch(noVars, /(?<![\w.-])\d*\.?\d+m?s\b/, 'a literal duration');
  assert.doesNotMatch(noVars, /cubic-bezier|steps\(|\bease(-in|-out|-in-out)?\b|\blinear\b/, 'a literal easing');
});

// The tools hub has no test file of its own, so its share of the web layer is pinned here.
test('the tools hub tags its pop cards .ui-press and uses the muted underline link hover', () => {
  const hub = read('../pages/tools/index.astro');
  const hubCss = stripCss(hub.slice(hub.indexOf('<style>')));
  const hubRules = parseRules(hubCss);
  assert.ok(hubRules.length > 5, 'positive control: the hub style block parsed');

  for (const cls of ['tool-card', 'back-link']) {
    assert.match(hub, new RegExp(`class="${cls} ui-press"`), `.${cls} must carry .ui-press`);
  }
  for (const r of hubRules.filter((x) => x.prelude.includes(':hover') || x.prelude.includes(':active'))) {
    assert.doesNotMatch(r.body, /transform|box-shadow/, `own hover/press motion fights .ui-press: ${r.prelude}`);
    assert.doesNotMatch(r.body, /--color-primary/, `--color-primary is no longer a hover colour: ${r.prelude}`);
  }

  const linkHover = hubRules.find((r) => r.prelude === 'main a:hover');
  assert.ok(linkHover, 'main a:hover is still declared');
  assert.match(linkHover.body, /color:\s*var\(--color-muted\)/);
  assert.match(linkHover.body, /text-decoration:\s*underline/);
  assert.match(linkHover.body, /text-decoration-thickness:\s*2px/);
  assert.match(linkHover.body, /text-underline-offset:\s*3px/);

  // Astro's attribute scoping makes `main a:hover` (0,3,2) outrank `.tool-card:hover` (0,3,0), so the
  // card's ink-and-no-underline override needs the `main` prefix to win.
  const cardHover = hubRules.find((r) => r.prelude.replace(/\s+/g, ' ') === 'main .tool-card:hover, main .back-link:hover');
  assert.ok(cardHover, 'the card hover override is main-prefixed');
  assert.match(cardHover.body, /color:\s*var\(--color-line-strong\)/);
  assert.match(cardHover.body, /text-decoration:\s*none/);
});

// Scroll reveal below the first screen. The script (src/scripts/scroll-reveal.ts) puts
// .reveal-pending on below-the-fold targets and .is-in once each is in view. The rise is the
// `translate` property, not `transform`: home tiles carry their own rest rotate, tilt animation and
// hover transform, and the cards carry .ui-press's transform — `translate` composes with all of them
// instead of replacing them.
test('scroll reveal: hidden only under the script class, rise and fade on tokens, reduced keeps the fade', () => {
  const full = (sel) => find(sel, (r) => !inReduced(r));
  const pend = full('main .reveal-pending');
  assert.equal(pend.length, 1);
  assert.match(pend[0].body, /opacity:\s*0;/);
  assert.match(pend[0].body, /translate:\s*0 16px/);
  assert.doesNotMatch(pend[0].body, /transition/, 'the hide is instant; only the reveal animates');

  const shown = full('main .reveal-pending.is-in');
  assert.equal(shown.length, 1);
  assert.match(shown[0].body, /opacity:\s*1/);
  assert.match(shown[0].body, /translate:\s*none/);
  assert.match(shown[0].body, /transition:\s*opacity var\(--motion-scroll\) var\(--ease-out\),\s*translate var\(--motion-scroll\) var\(--ease-out\)/);

  const rmPend = find('main .reveal-pending', inReduced);
  const rmShown = find('main .reveal-pending.is-in', inReduced);
  assert.equal(rmPend.length, 1);
  assert.equal(rmShown.length, 1);
  assert.match(rmPend[0].body, /translate:\s*none/, 'reduced: no rise');
  assert.doesNotMatch(rmPend[0].body, /opacity/, 'reduced keeps the fade, so the hidden start stays');
  assert.match(rmShown[0].body, /transition:\s*opacity var\(--motion-rm-fade\) var\(--ease-rm\)/);
  assert.doesNotMatch(rmShown[0].body, /translate var/, 'reduced: the fade only');

  assert.doesNotMatch(code, /(^|[;{\s])transform:\s*translateY/, 'the rise must not write transform');
});

test('no stylesheet rule hides anything without the script class (no-JS shows everything)', () => {
  const hides = leaf.filter((r) =>
    !r.parents.some((p) => p.startsWith('@keyframes')) &&
    /(^|;)\s*(opacity:\s*0(\.0+)?\s*(;|$)|visibility:\s*hidden|display:\s*none)/m.test(r.body),
  );
  assert.ok(hides.length >= 1, 'positive control: the pending rule itself is found');
  for (const r of hides) {
    for (const s of selectorsOf(r)) assert.match(s, /\.reveal-pending/, `hides without the script class: ${s}`);
  }
});

// Cross-document view transitions, web pages only: web.css reaches PageChrome pages and no play
// route, which is why the opt-in lives here and never in Base. Root cross-fade only — no element is
// named. The built-artifact side (opt-in on every web page, none on a play route, the reduced rule
// wherever the opt-in is) is scripts/page-chrome-check.mjs.
test('view transitions: opt-in, root cross-fade on the page tokens, reduced form, no names', () => {
  const at = rules.filter((r) => r.prelude === '@view-transition');
  assert.equal(at.length, 1, 'exactly one @view-transition rule');
  assert.match(at[0].body, /^navigation:\s*auto;?$/);
  assert.equal(at[0].parents.length, 0, 'the opt-in must not sit inside a media query');

  const pseudos = ['::view-transition-old(root)', '::view-transition-new(root)'];
  const full = leaf.filter((r) => !inReduced(r) && pseudos.every((p) => selectorsOf(r).includes(p)));
  assert.equal(full.length, 1, 'one full rule styling both root pseudos');
  assert.match(full[0].body, /animation-duration:\s*var\(--motion-page\)/);
  assert.match(full[0].body, /animation-timing-function:\s*var\(--ease-page\)/);

  const reduced = leaf.filter((r) => inReduced(r) && pseudos.every((p) => selectorsOf(r).includes(p)));
  assert.equal(reduced.length, 1, 'one reduced rule styling both root pseudos');
  assert.match(reduced[0].body, /animation-duration:\s*var\(--motion-rm-quick\)/);
  assert.match(reduced[0].body, /animation-timing-function:\s*var\(--ease-rm\)/);
  assert.ok(leaf.indexOf(reduced[0]) > leaf.indexOf(full[0]), 'the reduced rule comes after the full one');

  assert.doesNotMatch(code, /view-transition-name/, 'root cross-fade only: nothing is named');
});
