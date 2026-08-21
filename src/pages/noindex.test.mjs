// node --test — no framework, no dependency.
// Reads every page's source text directly; no build/dist involved, so `npm test` stays independent
// of `npm run build`.
//
// The invariant: exactly one page (404.astro) ships noindex — a soft-404 that stays indexable is the
// same bug class fixed in 85a32e7, and a regression on the OTHER half (some real page silently gains
// noindex) deindexes the whole site with nothing loud to catch it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const pagesDir = dirname(fileURLToPath(import.meta.url));

function listPages(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listPages(full));
    else if (entry.name.endsWith('.astro')) out.push(full);
  }
  return out;
}

// Matches the `noindex` boolean-shorthand attribute Astro/JSX allow on <Base ...>, via a negative
// lookahead that requires the bare word NOT be followed by `=`. Deliberately does NOT match
// `noindex={false}`, `noindex={someVar}`, or `noindex="..."` — only bare truthy shorthand counts,
// which is the only form this codebase ever passes (see 404.astro).
const PASSES_NOINDEX = /<Base\b[^>]*\bnoindex\b(?!\s*=)/;

test('404.astro passes noindex to Base', () => {
  const src = readFileSync(join(pagesDir, '404.astro'), 'utf8');
  assert.match(src, PASSES_NOINDEX, '404.astro must render <Base noindex ...> so crawlers get noindex');
});

test('no other page under src/pages passes noindex — a soft-404 fix must not deindex the real site', () => {
  const offenders = listPages(pagesDir)
    .filter((f) => f !== join(pagesDir, '404.astro'))
    .filter((f) => PASSES_NOINDEX.test(readFileSync(f, 'utf8')));

  assert.deepEqual(offenders, [], 'only 404.astro may pass noindex to Base');
});

// The page-level checks above are half the invariant. The other half lives in Base.astro itself:
// if its default flips to truthy, or its render gate flips to `!noindex`, every page ships noindex
// with zero pages caught by the checks above — the worst outcome on a site whose business model is
// organic search. Read as source text, no dist/build involved.
const baseSrc = readFileSync(join(pagesDir, '..', 'layouts', 'Base.astro'), 'utf8');

test('Base.astro noindex prop defaults to falsy', () => {
  const m = baseSrc.match(/\bnoindex\s*=\s*([^,}]+)/);
  assert.ok(m, 'Base.astro must destructure a noindex default from Astro.props');
  assert.equal(m[1].trim(), 'false', `noindex must default to false, found "${m[1].trim()}"`);
});

test('Base.astro gates the robots noindex meta on the positive condition', () => {
  assert.match(baseSrc, /\{\s*noindex\s*&&/, 'must render on `{noindex &&`, not a negated or always-true condition');
  assert.doesNotMatch(baseSrc, /\{\s*!\s*noindex/, 'must not gate on the negated `!noindex` condition');
});
