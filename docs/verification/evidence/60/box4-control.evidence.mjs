// gh#60 CONTROL — not shipped. Dynamic import on purpose: a static import of a not-yet-existing
// export dies at ESM link time, which takes the whole file down and reports a missing export as if
// every test failed. Dynamic import turns the same absence into a VALUE, so the failure lands on
// the assertion and the control can actually tell a broken mirror from a missing module.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const mod = await import('./number.ts');
const astro = readFileSync(
  fileURLToPath(new URL('../pages/tool/number.astro', import.meta.url)),
  'utf8',
);

test('CONTROL 1 — the core exports a rangeError validator', () => {
  assert.equal(typeof mod.rangeError, 'function');
});

test('CONTROL 2 — a range wider than the cap yields the cap message, not null', () => {
  assert.equal(typeof mod.rangeError, 'function');
  assert.match(String(mod.rangeError(1, 100000)), /ไม่เกิน/);
});

test('CONTROL 3 — a valid range yields null', () => {
  assert.equal(typeof mod.rangeError, 'function');
  assert.equal(mod.rangeError(1, 10), null);
});

test('CONTROL 4 — the island routes range validity through the core, holding none of its own', () => {
  assert.match(astro, /rangeError\(\s*min\s*,\s*max\s*\)/);
  assert.doesNotMatch(astro, /rangeSize\s*[<>]\s*\d/);
  assert.doesNotMatch(astro, /\b10000\b/);
});
