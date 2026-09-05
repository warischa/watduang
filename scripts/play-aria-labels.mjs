#!/usr/bin/env node
// Thai accessible names for icon-only play-route controls: the shared detector, and the injector
// that puts a label back after an extraction has thrown it away.
//
// WHY THIS EXISTS AT ALL. scripts/extract-mockup.mjs writes markup.html, style.css AND main.js under
// src/play/<route>/ from the mockup's body, byte-for-byte by design. So an aria-label typed into any
// of those three is undone the next time anyone re-extracts that route. Measured on 2026-09-05:
// ZERO_TRIGGER's mockup ships aria-label="Audio Toggle" / "Rules" / "Home" itself, over three
// controls whose title attributes are already correct Thai, so a screen-reader user heard English
// while a hovering mouse user read Thai. Fixing the mockup was rejected as the home: ~/claude/
// mockup-games is not a git repository, exists on one machine, and has no directory for short-stick.
// overrides.css was rejected too — CSS cannot write an attribute, and generated content is not a
// reliable accessible name. So the label's home is src/play/_aria-labels.json, a file the extractor
// does not own, and the extractor re-applies it to every file it writes.
//
// WHAT THIS COSTS, stated plainly: extract-mockup.mjs is no longer byte-for-byte identical to the
// mockup body. Its header's reason for that invariant is that a script cannot paraphrase, so the
// copy question stops being a review problem. That reason survives — this injector only ADDS or
// REPLACES one attribute on a button the table names by id or class, and can neither reach nor
// rewrite any visible string.
//
// THE DETECTOR, shared with scripts/play-icon-label-check.mjs so the gate and the injector cannot
// disagree about what an icon-only control is. A button is icon-only when its own literal text
// carries no letter in any script and no digit — a glyph, an emoji, or nothing. A digit IS a usable
// accessible name, so a keypad key reading "7" and a step button reading "-10" are deliberately out
// of the set; gating those would be gating the mockup author's free choice of wording, which is not
// a set this repo owns. A button whose text holds a template interpolation is also out: its name is
// computed at runtime and this file cannot see it.
//
//   node scripts/play-aria-labels.mjs            -> report what the table would change, write nothing
//   node scripts/play-aria-labels.mjs --apply    -> write the labels into the route files
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const PLAY_DIR = path.join(repoRoot, 'src', 'play');
const TABLE_PATH = path.join(PLAY_DIR, '_aria-labels.json');

// The three basenames a route can hold a button in. style.css is extractor-owned too but holds no
// markup, so it is not read here.
export const ROUTE_FILES = ['markup.html', 'main.js', 'main.ts'];

// House idiom, copied from scripts/thai-comments.mjs: a Unicode script property, never a literal
// range, so this file carries no Thai byte of its own for a sweep to mangle.
const THAI = /\p{Script=Thai}/u;
const LETTER_OR_DIGIT = /[\p{L}\p{N}]/u;

/** Every route directory under src/play, derived from the filesystem so a new one is never missed. */
export function routeIds() {
  return fs
    .readdirSync(PLAY_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort();
}

export function loadTable() {
  const raw = JSON.parse(fs.readFileSync(TABLE_PATH, 'utf8'));
  delete raw._readme;
  return raw;
}

export const hasThai = (s) => THAI.test(s);

const attr = (attrs, name) => {
  const m = attrs.match(new RegExp(`${name}=["']([^"']*)["']`));
  return m ? m[1] : null;
};

/**
 * Every icon-only button literal in one file's text. Returns the whole tag, its attribute text, and
 * the offsets, so a caller can either judge it or rewrite it.
 */
export function iconOnlyButtons(text) {
  const out = [];
  for (const m of text.matchAll(/<button\b([^>]*)>([\s\S]{0,600}?)<\/button>/g)) {
    const [, attrs, inner] = m;
    if (inner.includes('${')) continue;
    const visible = inner
      .replace(/<[^>]*>/g, '')
      .replace(/&[a-z]+;/g, ' ')
      .trim();
    if (LETTER_OR_DIGIT.test(visible)) continue;
    out.push({
      attrs,
      visible,
      index: m.index,
      length: m[0].length,
      openTag: m[0].slice(0, m[0].indexOf('>') + 1),
      id: attr(attrs, 'id'),
      classes: (attr(attrs, 'class') || '').split(/\s+/).filter(Boolean),
      attrPairs: Object.fromEntries([...attrs.matchAll(/([a-zA-Z-]+)=["']([^"']*)["']/g)].map((a) => [a[1], a[2]])),
      ariaLabel: attr(attrs, 'aria-label'),
      labelledBy: attr(attrs, 'aria-labelledby'),
      title: attr(attrs, 'title'),
    });
  }
  return out;
}

/**
 * The table key that addresses this button, or null. Most specific first: an id, then an attribute,
 * then a class.
 *
 * The attribute form exists because a class can be too wide to be safe. how-close-is-near's keypad
 * renders `class="num-btn fn-btn"` twice — once for a backspace glyph and once for a clear key
 * reading "ล้าง". Only the glyph is in the icon-only set today, so a `.fn-btn` key applies cleanly
 * NOW; the day someone turns that word into a glyph, the same key would silently give it the
 * backspace label. A wrong Thai name passes the gate, which only asks whether a name is Thai — so
 * this is a silent-wrong hazard, and the narrower key is what removes it rather than a comment
 * warning about it.
 */
export function selectorFor(button, routeTable) {
  if (button.id && routeTable[`#${button.id}`] !== undefined) return `#${button.id}`;
  for (const [name, value] of Object.entries(button.attrPairs)) {
    if (routeTable[`[${name}="${value}"]`] !== undefined) return `[${name}="${value}"]`;
  }
  for (const cls of button.classes) {
    if (routeTable[`.${cls}`] !== undefined) return `.${cls}`;
  }
  return null;
}

/**
 * Put the route's labels into one file's text. Rewrites back to front so earlier offsets stay valid.
 * An existing aria-label is REPLACED, which is the whole point for a mockup that ships English.
 */
export function applyLabels(text, routeId, table = loadTable()) {
  const routeTable = table[routeId];
  if (!routeTable) return { text, changed: 0 };
  let changed = 0;
  let out = text;
  for (const b of iconOnlyButtons(text).reverse()) {
    const sel = selectorFor(b, routeTable);
    if (!sel) continue;
    const label = routeTable[sel];
    if (b.ariaLabel === label) continue;
    const newOpen = b.ariaLabel
      ? b.openTag.replace(/aria-label=["'][^"']*["']/, `aria-label="${label}"`)
      : b.openTag.replace(/>$/, ` aria-label="${label}">`);
    out = out.slice(0, b.index) + newOpen + out.slice(b.index + b.openTag.length);
    changed++;
  }
  return { text: out, changed };
}

function main() {
  const apply = process.argv.includes('--apply');
  const table = loadTable();
  let total = 0;
  for (const id of routeIds()) {
    for (const name of ROUTE_FILES) {
      const p = path.join(PLAY_DIR, id, name);
      if (!fs.existsSync(p)) continue;
      const before = fs.readFileSync(p, 'utf8');
      const { text, changed } = applyLabels(before, id, table);
      if (!changed) continue;
      total += changed;
      console.log(`  ${apply ? 'wrote' : 'would write'} ${changed} label(s) -> src/play/${id}/${name}`);
      if (apply) fs.writeFileSync(p, text, 'utf8');
    }
  }
  console.log(`play-aria-labels: ${total} label(s) ${apply ? 'applied' : 'pending'}`);
  // A table key that matches nothing is a rotted entry, not a pass. Report it rather than let the
  // count quietly cover for it.
  for (const [id, routeTable] of Object.entries(table)) {
    const seen = new Set();
    for (const name of ROUTE_FILES) {
      const p = path.join(PLAY_DIR, id, name);
      if (!fs.existsSync(p)) continue;
      for (const b of iconOnlyButtons(fs.readFileSync(p, 'utf8'))) {
        const sel = selectorFor(b, routeTable);
        if (sel) seen.add(sel);
      }
    }
    for (const key of Object.keys(routeTable)) {
      if (!seen.has(key)) console.log(`  ::warning::${id}: table key ${key} matched no icon-only button`);
    }
  }
}

if (import.meta.url === `file://${process.argv[1]}`) main();
