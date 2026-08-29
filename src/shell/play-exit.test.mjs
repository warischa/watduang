// gh#144 — pins the PlayExit guard so deleting it cannot ship green: arm-gate-coverage-check globs
// src/games/*.ts only, so nothing else polices this component. These are source-shape assertions
// (the component is an .astro file node cannot execute); the behavioral proof lives in the browser
// probe run recorded on gh#144.
// ponytail: text-marker pinning, not a DOM run — if PlayExit grows real logic branches, move to a
// jsdom/fake-dom run like the game tests.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const src = readFileSync(new URL('./PlayExit.astro', import.meta.url), 'utf8');

test('the X renders disabled — inert until armed, never a live tap surface on load', () => {
  assert.match(src, /<button[^>]*\bdisabled\b/s);
});

test('the arm delay is the shared arm-gate constant, not a local copy that can drift', () => {
  assert.match(src, /import\s*\{[^}]*ARM_DELAY_MS[^}]*\}\s*from\s*['"][^'"]*_arm-gate/);
});

test('any contact restarts the quiet window — a tap burst keeps the X disarmed', () => {
  // Pin the listener REGISTRATIONS, not prose: comments in the component mention these words too,
  // so a bare word-match would stay green with the whole listener block deleted.
  assert.match(src, /addEventListener\(\s*['"]pointerdown['"]/);
  assert.match(src, /addEventListener\(\s*['"]pointerup['"]/);
  assert.match(src, /addEventListener\(\s*['"]pointercancel['"]/);
  assert.match(src, /setTimeout\([\s\S]*?ARM_DELAY_MS\s*\)/);
});

test('bfcache restore resets the exit state — the X works after browser back', () => {
  assert.match(src, /addEventListener\(\s*['"]pageshow['"]/);
});

test('every play route mounts the shared PlayExit', () => {
  for (const id of ['cannon-flag', 'freeze-tap', 'power-meter']) {
    const page = readFileSync(
      new URL(`../pages/game/${id}/play.astro`, import.meta.url),
      'utf8',
    );
    assert.match(page, /PlayExit/, `${id} play route is missing PlayExit`);
  }
});
