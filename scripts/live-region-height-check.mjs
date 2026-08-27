#!/usr/bin/env node
// Content-dependent-height gate for the live regions above an .ad-slot (gh#120).
//
// THE HAZARD, confirmed on ubuntu-latest and not reproducible on macOS: a tool page reserves space
// for a status line with `min-height`, which is a FLOOR, not a bound. The site ships no @font-face
// (src/styles/tokens.css names 'Noto Sans Thai' / 'Sarabun' / 'Mitr' and nothing serves them), so
// both the line box and the wrap point are the visitor's OS. On a platform whose Thai font runs
// wider the initial text wraps past the floor, the script rewrites it shorter, the element drops
// back to the floor, and everything below it — the ad slot included — moves. /tool/wheel/ measured
// -9px this way at 320px while every local run reported 0px. The fix is a fixed `height` plus the
// element's own scroll; /tool/draw/ and /tool/team/ carry it already. This gate refuses the floor
// coming back.
//
// THE SET IS OURS, which is why this converges: the four tool pages under src/pages/tool/, each a
// single .astro file carrying its own markup and its own scoped <style>. A new tool page is covered
// the moment it lands — the glob is the set, no registration.
//
// WHAT IT REFUSES: an element that (a) sits in the page markup BEFORE that page's .ad-slot, (b) is
// announced — carries aria-live or role="status" — and (c) is matched by a rule in the page's own
// <style> that declares min-height or min-block-size at anything other than 0/auto.
//
// THE ONE EXEMPTION, and the real instance behind it: /tool/draw/ wraps its result paragraph in a
// fixed-height scrolling box, and the paragraph keeps a min-height inside it. A min-height under an
// ancestor with a fixed `height` cannot move a sibling of that ancestor — the overflow is the
// ancestor's problem, not the page's — so an announced element is exempt when SOME ancestor between
// it and <body> is matched by a rule declaring `height`/`block-size` at a non-auto value. Note the
// exemption is ancestor-only on purpose: a fixed `height` on the element ITSELF does not excuse its
// own min-height, because in CSS min-height wins over height.
//
// WHAT ITS GREEN DOES NOT MEAN. It is a static scan of one page's own <style>, so it does not see:
// a height written by a script at runtime, a floor arriving from a global stylesheet or a component
// the page imports, a padding/border/gap that grows with content, or an element that changes height
// for any reason OTHER than a min-height (a wrapping flex list, an image without dimensions).
// scripts/ad-reflow-first-list-load-probe.mjs is what measures the actual reflow in a browser; this
// gate only makes the one mechanism that already shipped twice impossible to reintroduce silently.
//
// ITS RENDERED COMPANION, for the first three of those blind spots: scripts/live-region-floor-probe.mjs
// (gh#124) reads getComputedStyle on the same live regions in the BUILT page, so a floor arriving from
// a global stylesheet, the cascade, or a style string built in a .ts module is caught by where it
// lands rather than by where it was written. That leg is why this scan's .astro scope stays as narrow
// as it is: widening it would trade an owned, converging set for every file that can emit a style.
//
//   node scripts/live-region-height-check.mjs             -> scan src/pages/tool/*.astro, exit non-zero on any hit
//   node scripts/live-region-height-check.mjs --selftest   -> calibration both ways on fixtures (never reads src/)

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const PAGES_DIR = path.join(repoRoot, 'src/pages/tool');

const FLOOR_PROPS = ['min-height', 'min-block-size'];
const BOUND_PROPS = ['height', 'block-size'];
// A floor of 0/auto/none reserves nothing, so it cannot be the mechanism.
const INERT_VALUES = new Set(['0', '0px', '0em', '0rem', 'auto', 'none', 'initial', 'unset', 'revert']);

// Tags that never nest (so a missing close tag cannot corrupt the ancestor stack).
const VOID_TAGS = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr']);

/** Split a .astro file into its template (everything before the first <style>) and its style bodies. */
export function splitAstro(text) {
  const styles = [...text.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map((m) => m[1]);
  const firstStyle = text.indexOf('<style');
  const template = firstStyle === -1 ? text : text.slice(0, firstStyle);
  return { template, css: styles.join('\n') };
}

/** Flatten CSS to { selector, decls } pairs, descending through @media and any other at-rule block. */
export function parseRules(cssWithComments) {
  // Comments out FIRST, and this is load-bearing twice over: these style blocks carry long prose
  // comments that both spell "height:" (a comment before a declaration otherwise swallows it, and
  // the fixed-height ancestor exemption then never fires) and name "min-height" while explaining why
  // it is not used (which would red a correct page).
  const css = cssWithComments.replace(/\/\*[\s\S]*?\*\//g, ' ');
  const rules = [];
  let buf = '';
  let depth = 0;
  const stack = [];
  for (let i = 0; i < css.length; i++) {
    const c = css[i];
    if (c === '{') {
      const selector = buf.trim();
      buf = '';
      depth++;
      stack.push(selector);
      continue;
    }
    if (c === '}') {
      const selector = stack.pop();
      depth--;
      if (selector !== undefined && !selector.startsWith('@')) rules.push({ selector, decls: buf });
      buf = '';
      continue;
    }
    buf += c;
  }
  void depth;
  return rules;
}

/** The declared value of `prop` in a declaration block, or null. Last one wins, as in CSS. */
export function declValue(decls, prop) {
  let found = null;
  for (const part of decls.split(';')) {
    const idx = part.indexOf(':');
    if (idx === -1) continue;
    const name = part.slice(0, idx).trim().toLowerCase();
    if (name !== prop) continue;
    found = part.slice(idx + 1).replace(/!important/i, '').trim().toLowerCase();
  }
  return found;
}

/** Does this selector's SUBJECT (its rightmost compound) match { id, classes }? */
export function selectorMatches(selector, el) {
  for (const alt of selector.split(',')) {
    const compounds = alt.trim().split(/[\s>+~]+/).filter(Boolean);
    const subject = compounds[compounds.length - 1];
    if (!subject) continue;
    const tokens = subject.match(/[#.][A-Za-z0-9_-]+/g);
    if (!tokens) continue; // bare tag / pseudo selector — not matched, this gate is id/class based
    if (/::?[a-z-]+/.test(subject.replace(/[#.][A-Za-z0-9_-]+/g, ''))) continue; // :hover, ::after — a state, not the base box
    const ok = tokens.every((t) => (t[0] === '#' ? el.id === t.slice(1) : el.classes.includes(t.slice(1))));
    if (ok) return true;
  }
  return false;
}

const attr = (tagText, name) => {
  const m = tagText.match(new RegExp(`${name}\\s*=\\s*"([^"]*)"`, 'i'));
  return m ? m[1] : null;
};

/**
 * Walk a page template, returning every announced element that starts before the .ad-slot, each with
 * its ancestor chain. A tag-stack scan: enough for these hand-written templates, and it never has to
 * resolve an Astro component (a component tag is just another stack frame).
 */
export function findAnnouncedAboveAd(template) {
  const adIdx = template.search(/class\s*=\s*"[^"]*\bad-slot\b/);
  if (adIdx === -1) return null; // no ad slot on this page — nothing below to protect
  const found = [];
  const stack = [];
  const tagRe = /<(\/?)([A-Za-z][\w.:-]*)((?:[^>"']|"[^"]*"|'[^']*')*?)(\/?)>/g;
  let m;
  while ((m = tagRe.exec(template))) {
    const [, closing, tag, body, selfClose] = m;
    if (closing) {
      // Pop to the nearest matching frame; an unmatched close tag is ignored rather than trusted.
      for (let i = stack.length - 1; i >= 0; i--) {
        if (stack[i].tag === tag.toLowerCase()) {
          stack.length = i;
          break;
        }
      }
      continue;
    }
    const el = {
      tag: tag.toLowerCase(),
      id: attr(body, 'id') ?? '',
      classes: (attr(body, 'class') ?? '').split(/\s+/).filter(Boolean),
      announced: /\saria-live\s*=/i.test(body) || /\srole\s*=\s*"status"/i.test(body),
      index: m.index,
    };
    if (el.announced && el.index < adIdx) found.push({ el, ancestors: [...stack] });
    if (!selfClose && !VOID_TAGS.has(el.tag)) stack.push(el);
  }
  return found;
}

/** The violations on one page: announced elements above the ad slot carrying a live floor. */
export function scanPage(text) {
  const { template, css } = splitAstro(text);
  const announced = findAnnouncedAboveAd(template);
  if (announced === null) return { skipped: true, announced: 0, violations: [] };
  const rules = parseRules(css);
  const hitFor = (el, props) => {
    for (const r of rules) {
      if (!selectorMatches(r.selector, el)) continue;
      for (const p of props) {
        const v = declValue(r.decls, p);
        if (v !== null && !INERT_VALUES.has(v)) return { selector: r.selector.replace(/\s+/g, ' '), prop: p, value: v };
      }
    }
    return null;
  };
  const violations = [];
  for (const { el, ancestors } of announced) {
    const floor = hitFor(el, FLOOR_PROPS);
    if (!floor) continue;
    const bound = ancestors.map((a) => ({ a, hit: hitFor(a, BOUND_PROPS) })).find((x) => x.hit);
    if (bound) continue; // clipped by a fixed-height ancestor — cannot move the ad slot
    violations.push({ name: el.id ? `#${el.id}` : `.${el.classes[0] ?? el.tag}`, ...floor });
  }
  return { skipped: false, announced: announced.length, violations };
}

export function scanDir(dir) {
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.astro')).sort();
  return files.map((f) => ({ file: f, ...scanPage(fs.readFileSync(path.join(dir, f), 'utf8')) }));
}

const violationMsg = (v) =>
  `${v.name} is announced (aria-live/role="status") and sits above .ad-slot, but "${v.selector}" declares ${v.prop}: ${v.value} — that is a FLOOR over text a script rewrites, and it moves the ad slot on any platform whose font wraps the text past it (gh#120). Use a fixed height plus overflow-y: auto, as /tool/draw/ and /tool/team/ do, or bound it with a fixed-height ancestor.`;

function fixture({ floor = 'min-height: 3em;', announced = true, boxHeight = null, order = 'note-first', comment = false } = {}) {
  const noteAttrs = announced ? ' role="status" aria-live="polite"' : '';
  const note = `<div class="box"><p id="t-note" class="t-note"${noteAttrs}></p></div>`;
  const ad = '<div class="ad-slot" aria-hidden="true" style="min-height: 250px;"></div>';
  return `---
const x = 1;
---
<main>
  ${order === 'note-first' ? note + '\n  ' + ad : ad + '\n  ' + note}
</main>
<style>
  ${comment ? '/* A bound, not a floor (a colon: and prose about min-height live here) */' : ''}
  .box { padding: 4px;${comment ? '\n    /* the reserve, measured: */' : ''}${boxHeight ? ` height: ${boxHeight}; overflow-y: auto;` : ''} }
  .t-note { margin: 0; ${floor} }
  @media (prefers-reduced-motion: reduce) { .t-note { color: red; } }
</style>
`;
}

function selftest() {
  const dir = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'live-region-height-check-'));
  try {
    // known-bad: the exact shipped mechanism — a floor on an announced element above the ad slot.
    const bad = scanPage(fixture());
    assert.equal(bad.announced, 1, 'the announced element must be found');
    assert.deepEqual(bad.violations.map((v) => v.name), ['#t-note'], 'a min-height floor above .ad-slot must red and be named');
    assert.match(violationMsg(bad.violations[0]), /min-height: 3em/, 'the message must quote the offending declaration');

    // known-good: the fix — a bound instead of a floor.
    assert.deepEqual(scanPage(fixture({ floor: 'height: 3em; overflow-y: auto;' })).violations, [], 'a fixed height must green');

    // known-good: min-block-size is the same hazard spelled the logical way, and must red.
    assert.deepEqual(scanPage(fixture({ floor: 'min-block-size: 48px;' })).violations.map((v) => v.prop), ['min-block-size'], 'the logical property must red too');

    // A prose comment is not a declaration, in either direction: one that NAMES min-height must not
    // red, and one sitting immediately before a real declaration must not hide it.
    assert.deepEqual(scanPage(fixture({ floor: '/* min-height: 3em; would move the ad */ height: 3em;' })).violations, [], 'a comment naming min-height must not red');
    assert.deepEqual(scanPage(fixture({ boxHeight: '136px', comment: true })).violations, [], 'a comment before the ancestor height must not hide it');

    // known-good: a floor of 0 reserves nothing.
    assert.deepEqual(scanPage(fixture({ floor: 'min-height: 0;' })).violations, [], 'min-height: 0 must not red');

    // known-good: the /tool/draw/ shape — the floor is clipped by a fixed-height ancestor.
    assert.deepEqual(scanPage(fixture({ boxHeight: '136px' })).violations, [], 'a floor under a fixed-height ancestor must green');
    // ... and that exemption must be the ANCESTOR's height, not just any height on the page.
    assert.deepEqual(scanPage(fixture({ boxHeight: 'auto' })).violations.map((v) => v.name), ['#t-note'], 'height: auto on the ancestor exempts nothing');

    // known-good: not announced -> no screen reader rewrite contract, out of scope.
    assert.deepEqual(scanPage(fixture({ announced: false })).violations, [], 'a silent element is not this gate\'s business');

    // known-good: below the ad slot it cannot move the ad slot.
    assert.deepEqual(scanPage(fixture({ order: 'ad-first' })).violations, [], 'an element after .ad-slot must green');

    // A page with no ad slot is skipped, not silently green-with-zero-scanned.
    assert.equal(scanPage('<main><p role="status" class="t-note"></p></main>\n<style>.t-note { min-height: 3em; }</style>').skipped, true, 'a page without .ad-slot must report skipped');
    console.log('PASS calibration: floor above .ad-slot reds and is named · bound greens · min-block-size reds · 0 greens · fixed-height ancestor exempts · height:auto does not · unannounced and below-the-ad green · no-ad-slot page skipped');

    // End to end over a directory, and the red must clear when the floor is fixed (green again, not only red).
    fs.writeFileSync(path.join(dir, 'broken.astro'), fixture());
    fs.writeFileSync(path.join(dir, 'fixed.astro'), fixture({ floor: 'height: 3em; overflow-y: auto;' }));
    const before = scanDir(dir);
    assert.deepEqual(before.filter((p) => p.violations.length).map((p) => p.file), ['broken.astro'], 'exactly the broken fixture must red');
    fs.writeFileSync(path.join(dir, 'broken.astro'), fixture({ floor: 'height: 3em; overflow-y: auto;' }));
    assert.deepEqual(scanDir(dir).flatMap((p) => p.violations), [], 'fixing the floor must return the gate to green');
    console.log('PASS calibration: directory scan names the offending file, and fixing it returns the gate to green');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

async function main() {
  if (process.argv.includes('--selftest')) return selftest();

  const pages = scanDir(PAGES_DIR);
  if (!pages.length) {
    console.error(`::error::${path.relative(repoRoot, PAGES_DIR)} contains no .astro pages — nothing was scanned, which is not the same as clean (ADR-0019)`);
    process.exit(1);
  }
  const guarded = pages.filter((p) => !p.skipped);
  const announced = guarded.reduce((n, p) => n + p.announced, 0);
  if (!announced) {
    console.error('::error::no announced element (aria-live/role="status") was found above any .ad-slot — every tool page has one, so this is a broken scan, not a clean tree');
    process.exit(1);
  }

  let hits = 0;
  for (const p of pages) {
    for (const v of p.violations) {
      console.error(`::error file=src/pages/tool/${p.file}::${violationMsg(v)}`);
      hits++;
    }
  }
  if (hits) {
    console.error(`\n${hits} live region(s) above an .ad-slot reserve space with a floor instead of a bound.`);
    process.exit(1);
  }
  console.log(`OK ${announced} announced element(s) above an .ad-slot across ${guarded.length} page(s) with an ad slot (${pages.length} scanned): none reserves space with min-height/min-block-size.`);
}

// Entry point only — importing this module for a unit test must not fire the gate as a side effect.
const isEntryPoint = () => {
  if (!process.argv[1]) return false;
  const canonical = (p) => pathToFileURL(fs.realpathSync(p)).href;
  try {
    return canonical(process.argv[1]) === canonical(fileURLToPath(import.meta.url));
  } catch {
    return true;
  }
};
if (isEntryPoint()) await main();
