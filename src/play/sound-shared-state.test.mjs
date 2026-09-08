// gh#227, behaviour side: one device-wide mute, observed from every route that has a sound control.
//
// The gate next to this file (scripts/play-sound-shared-state-check.mjs) reads source text -- it can
// say a route names isMuted and setMuted, never that a toggle on one route is the same toggle on
// another. This drives the real synth classes out of the shipped route files and asserts the thing a
// player would notice: mute on route A, and route B is muted too, with no oscillator built.
//
// THE SET IS DERIVED, never listed. Every src/play/<route>/main.js that declares the `enabled`
// accessor pair is driven, and the run asserts it found more than one -- a rename that empties the
// set fails here rather than passing vacuously, which is the failure class gh#221 and gh#223 record.
//
// ponytail: the class is sliced by brace matching (the same _dom-stub idiom four setup-badge tests
// use) and evaluated with a tolerant fake AudioContext, rather than importing main.js -- those
// modules wire a whole route at top level and would be measuring the DOM stub. A slice that goes
// wrong will not compile, so it fails loudly.
//
// NOT PROVED HERE: that the control's LABEL matches the state on mount (no gate in this repo proves
// that; only a browser does), and the shell synth's own tick and boom, which are gated at their
// caller in the timebomb engine and pinned by the test gh#165 shipped next to it. What a muted
// device silences on THESE routes is proved below, by counting oscillators that never get built.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { sliceBlock } from './_dom-stub.mjs';
// The shared TypeScript-parser stripper, so a route that only MENTIONS AudioContext in prose is not
// counted as making sound (the hole scripts/sound-control-coverage-check.mjs records).
import { stripComments, JS } from '../../scripts/strip-comments.mjs';

const PLAY_DIR = import.meta.dirname;

/** A storage that behaves like localStorage and nothing else. Defined onto globalThis rather than
 *  assigned: Node defines its own `localStorage` getter on some builds, and a plain assignment there
 *  fails silently in module scope. */
function installStorage() {
  const map = new Map();
  const stub = {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
    clear: () => map.clear(),
  };
  Object.defineProperty(globalThis, 'localStorage', { value: stub, configurable: true, writable: true });
  return map;
}

/** A tolerant fake Web Audio node: every property answers, so a synth method can chain whatever the
 *  mockup it came from chained. Only the oscillator COUNT is measured. */
function fakeNode() {
  const target = function () {};
  return new Proxy(target, {
    get(_t, prop) {
      if (prop === 'value' || prop === 'currentTime' || prop === 'detune') return 0;
      if (prop === 'onended') return null;
      if (prop === Symbol.toPrimitive) return () => 0;
      return fakeNode();
    },
    set: () => true,
    apply: () => fakeNode(),
  });
}

function fakeAudio() {
  const counts = { oscillators: 0 };
  class FakeContext {
    constructor() {
      this.state = 'running';
      this.currentTime = 0;
      this.destination = fakeNode();
    }
    createOscillator() {
      counts.oscillators += 1;
      return fakeNode();
    }
    resume() {}
    close() {}
  }
  const ctx = new Proxy(FakeContext, {
    construct: (T) => {
      const made = new T();
      return new Proxy(made, {
        get: (t, p) => (p in t ? t[p] : fakeNode()),
        set: (t, p, v) => {
          t[p] = v;
          return true;
        },
      });
    },
  });
  return { counts, AudioContextCtor: ctx };
}

/** Every route whose main.js builds a synth, found on disk -- and each one MUST carry the shared
 *  accessor pair. Skipping a route that lost the pair would let a partial revert shrink this set
 *  silently while the run stayed green; membership is decided by the route making sound, which is
 *  not something a revert can quietly change. */
function routesWithSharedSynth() {
  const found = [];
  for (const entry of fs.readdirSync(PLAY_DIR, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    if (!entry.isDirectory()) continue;
    const main = path.join(PLAY_DIR, entry.name, 'main.js');
    if (!fs.existsSync(main)) continue;
    const source = stripComments(fs.readFileSync(main, 'utf8'), JS);
    if (!/\bAudioContext\b|\bwebkitAudioContext\b/.test(source)) continue;
    assert.ok(
      /get enabled\(\)/.test(source) && /set enabled\(/.test(source),
      `${entry.name}: main.js builds a synth but carries no shared-state accessor pair — its control ` +
        'is back on state of its own, or this test has stopped covering the route',
    );
    const name = /class\s+([\w$]+)\s*\{[\s\S]{0,4000}?get enabled\(\)/.exec(source)?.[1];
    assert.ok(name, `${entry.name}: the accessor pair is there but no class declaration precedes it`);
    found.push({ route: entry.name, className: name, source });
  }
  return found;
}

/** Build one route's synth, wired to the REAL shell audio module. */
async function makeSynth({ route, className, source }, AudioContextCtor) {
  const { isMuted, setMuted } = await import('../shell/audio.ts');
  const body = sliceBlock(source, `class ${className}`);
  assert.ok(body, `${route}: could not slice ${className} — this test would be measuring nothing`);
  // The unlock listeners a synth registers in its constructor are FIRED once below: freeze-tap builds
  // its context only from a first real touch, and a window stub that swallowed the listener would
  // leave that route silent for a reason that has nothing to do with the mute.
  const pending = [];
  const windowStub = {
    AudioContext: AudioContextCtor,
    addEventListener: (_type, fn) => pending.push(fn),
    removeEventListener() {},
  };
  const documentStub = { addEventListener() {}, removeEventListener() {}, getElementById: () => null };
  const factory = new Function(
    'isMuted',
    'setMuted',
    'window',
    'document',
    `${body}\nreturn ${className};`,
  );
  const Ctor = factory(isMuted, setMuted, windowStub, documentStub);
  const synth = new Ctor();
  for (const fn of pending.splice(0)) {
    try {
      fn({ type: 'pointerdown' });
    } catch {
      // An unlock path wanting more of a window than this stub has is not a mute failure.
    }
  }
  return synth;
}

/** Call everything on the synth that could make a noise, and report how many oscillators it built. */
function playEverything(synth, counts) {
  const proto = Object.getPrototypeOf(synth);
  const setup = ['init', 'initContext', 'initOnFirstTouch', 'ensure', 'resume'];
  const skip = new Set(['constructor', 'enabled', 'toggle', 'toggleAudio', ...setup]);
  // The context is built lazily on most of these routes, so the setup methods run first. They make
  // no sound themselves; without them every play method returns early on a null ctx and the un-muted
  // control below would read as silence.
  for (const name of setup) {
    try {
      synth[name]?.();
    } catch {
      // A route without that entry point, or one whose unlock path wants a real window.
    }
  }
  const before = counts.oscillators;
  for (const name of Object.getOwnPropertyNames(proto)) {
    if (skip.has(name)) continue;
    const desc = Object.getOwnPropertyDescriptor(proto, name);
    if (typeof desc?.value !== 'function') continue;
    try {
      synth[name]();
    } catch {
      // A method that needs arguments this loop does not have cannot make a sound either; the ones
      // that matter take defaults. Swallowed on purpose so one picky signature cannot mask the count.
    }
  }
  return counts.oscillators - before;
}

test('every route with a sound control observes one device-wide mute', async () => {
  installStorage();
  const routes = routesWithSharedSynth();
  assert.ok(routes.length > 1, 'fewer than two routes build a synth — nothing is being compared');
  console.log(`  routes driven (derived from disk, never listed): ${routes.length} — ${routes.map((r) => r.route).join(', ')}`);

  const { counts, AudioContextCtor } = fakeAudio();
  const synths = [];
  for (const r of routes) synths.push({ ...r, synth: await makeSynth(r, AudioContextCtor) });

  // Positive control first: with nothing stored, every route reads sound ON (gh#165 ruling 3).
  for (const { route, synth } of synths) assert.equal(synth.enabled, true, `${route}: a fresh device must start audible`);

  // Route A mutes. Every OTHER route observes it — that is the whole ticket.
  const [a, ...others] = synths;
  a.synth.enabled = false;
  for (const { route, synth } of others) {
    assert.equal(synth.enabled, false, `${route}: still audible after ${a.route} muted the device`);
  }

  // The last route un-mutes, and the first observes THAT: the state travels both ways, and the
  // control is not a one-way switch.
  others.at(-1).synth.enabled = true;
  assert.equal(a.synth.enabled, true, `${a.route}: did not observe the un-mute from ${others.at(-1).route}`);

  // Muted means silent, not merely a flag: no route builds an oscillator while the device is muted.
  a.synth.enabled = false;
  for (const { route, synth } of synths) {
    assert.equal(playEverything(synth, counts), 0, `${route}: built an oscillator while the device was muted`);
  }

  // ...and the same loop DOES build oscillators when it is not muted, so the zero above is a real
  // silence rather than a dead harness.
  a.synth.enabled = true;
  for (const { route, synth } of synths) {
    assert.ok(playEverything(synth, counts) > 0, `${route}: built nothing even un-muted — the harness is not driving it`);
  }
});

// gh#227, added after an adversarial review of the batch that shipped this file. Everything above
// enumerates main.js, and one-bomb is the route where BOTH entry files import shell/audio: main.ts
// wires the no-WebGL fallback's sound switch. Reverting THAT block left the text gate green (its
// match is a union over both files) and left every test above green too, while a device without
// WebGL got a dead sound switch. So main.ts gets its own enumeration rather than riding main.js's.
// The set is derived the same way and for the same reason: membership is "this file imports the
// shared preference", which a revert cannot quietly change without also removing the import.
test('gh#227: every play-route main.ts that imports the shared mute actually reads and writes it', () => {
  const found = [];
  for (const entry of fs.readdirSync(PLAY_DIR, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    if (!entry.isDirectory()) continue;
    const main = path.join(PLAY_DIR, entry.name, 'main.ts');
    if (!fs.existsSync(main)) continue;
    const source = stripComments(fs.readFileSync(main, 'utf8'), JS);
    if (!/from\s+['"][^'"]*shell\/audio/.test(source)) continue;
    assert.match(
      source,
      /isMuted\(/,
      `${entry.name}: main.ts imports the shared mute but never reads it — its control paints from ` +
        'state of its own, so it can say "sound on" on a muted device.',
    );
    assert.match(
      source,
      /setMuted\(/,
      `${entry.name}: main.ts imports the shared mute but never writes it — its control is a switch ` +
        'that changes nothing the rest of the site observes.',
    );
    found.push(entry.name);
  }
  // A zero here is the dead-harness case, not a pass: it means no main.ts imports the module any
  // more, which is either a real removal that should be deliberate or this test scanning nothing.
  assert.ok(found.length > 0, 'no play-route main.ts imports shell/audio — this test measured nothing');
});
