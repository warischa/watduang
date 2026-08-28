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

// Anchored to the destructure SITE (`const { ... } = Astro.props`), not a bare token scan of the
// whole file — a comment mentioning `noindex = false` anywhere above the real destructure must not
// be mistaken for it. Uses matchAll so a SECOND thing that happens to look like a destructure site
// (e.g. a comment quoting `const { ... } = Astro.props` verbatim) is not silently resolved by taking
// the first match — it throws instead. A human must look; the alternative is "which of two
// candidates is real", which is grammar-owned (ways to write a JS comment) and never converges.
function extractNoindexDefault(src) {
  const sites = [...src.matchAll(/const\s*\{([^}]*)\}\s*=\s*Astro\.props/g)];
  if (sites.length !== 1) {
    throw new Error(`expected exactly 1 Astro.props destructure site, found ${sites.length} (the site regex cannot span nested braces)`);
  }
  const m = sites[0][1].match(/\bnoindex\s*=\s*([^,}]+)/);
  return m ? m[1].trim() : null;
}

test('Base.astro noindex prop defaults to falsy', () => {
  const value = extractNoindexDefault(baseSrc);
  assert.equal(value, 'false', `noindex must default to false, found "${value}"`);
});

test('matcher reads the destructure site, not a commented-out default sitting above it', () => {
  // Reproduces gh#130: a comment line quoting `noindex = false` sits above the real destructure,
  // which itself defaults noindex to `true`. A bare token scan takes the comment's `false` first
  // and the test goes green while every page would ship noindex. The site-anchored matcher must
  // read `true` from the real destructure, not `false` from the comment.
  const decoy = `
// Props defaults: noindex = false, chrome = false
const { title, description, noindex = true, chrome = false } = Astro.props as Props;
`;
  assert.equal(extractNoindexDefault(decoy), 'true', 'must read the destructure site, not the comment above it');
});

test('matcher fails loud when more than one Astro.props destructure site is found', () => {
  // A doc comment that quotes the fix's own pattern verbatim (`const { ... } = Astro.props`) creates
  // a second candidate site. Silently picking the first one is exactly the gh#130 bug class moved,
  // not closed — this must throw, not answer wrong.
  const decoyA = '\n// e.g. const { title, noindex = false } = Astro.props\nconst { title, noindex = true } = Astro.props as Props;\n';
  assert.throws(
    () => extractNoindexDefault(decoyA),
    /expected exactly 1 Astro\.props destructure site, found 2/,
    'a second destructure-shaped candidate (even an innocent comment) must fail loud, not lose silently to a first-match pick'
  );
});

test('Base.astro gates the robots noindex meta on the positive condition', () => {
  assert.match(baseSrc, /\{\s*noindex\s*&&/, 'must render on `{noindex &&`, not a negated or always-true condition');
  assert.doesNotMatch(baseSrc, /\{\s*!\s*noindex/, 'must not gate on the negated `!noindex` condition');
});
