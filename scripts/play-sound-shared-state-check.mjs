#!/usr/bin/env node
// Gate: a play route's sound control writes the SITE-WIDE muted state, never a key of its own (gh#227).
//
// WHAT WENT WRONG WITHOUT IT. gh#165 gave the site one stored preference — MUTED_KEY in
// src/shell/audio.ts, read by isMuted() and written by setMuted() — and wired exactly one route to
// it. Every other route kept a boolean that lived and died inside its own module, and two of them
// persisted that boolean under a key of their own, so muting from one screen left the next screen
// showing "sound on" and playing it. Nothing could go red: the sound-control-coverage gate asks only
// whether a control EXISTS, and says so in its own output.
//
// THE SET, and why it converges. Every directory under src/play, read from disk on every run. No
// route array anywhere in this file: a route nobody registered is CHECKED by default, which is the
// failure class gh#221 and gh#223 recorded (a hand list leaves the route it forgot untested behind a
// green). The routes are then partitioned into exactly two buckets — has a sound control, has none —
// and the run asserts the two sum to the unfiltered directory count, so a route cannot fall out of
// both. That assertion is printed, not merely made.
//
// CONTROL, matched the same way the coverage gate matches it: a literal <button> whose tag text
// names audio, sound or mute, CASE-INSENSITIVELY, in markup.html or the route's entry scripts. Case
// is not theoretical here — how-close-is-near spells its control btnAudioToggle, and a
// case-sensitive match silently drops that route into the wrong bucket.
//
// TWO RULES for a route in the control bucket:
//   RULE 1 — its entry scripts reference BOTH isMuted and setMuted, and import them from the shell
//     audio module. Reading alone would leave a control that reflects the state and cannot change it;
//     writing alone leaves one that changes a state it never shows.
//   RULE 2 — no storage call in the route spells a sound-ish key of its own. Matched at the CALL, not
//     at every string literal: an id like audioToggleBtn and a Thai aria-label are not storage keys,
//     and a gate that redded on them would be untrue nine times before it was true once. The shared
//     key is spelled in src/shell/audio.ts and is the one key allowed to appear.
//
// THE CEILING, and it is real: this is source text, not behaviour. It proves a route READS AND WRITES
// the shared state; it cannot prove the control's label matches that state on mount, and no gate in
// this repo does. That is what each route's own tests and a browser are for. Storage reached through
// a name this file does not recognise as storage (a wrapper called `prefs.get`) is likewise invisible
// — the recognised shapes are localStorage member calls and helper functions whose own name contains
// "localstorage", which is what this repo actually uses today.
//
// MIGRATION IS DELIBERATELY ABSENT. A device that had one route muted under an old per-route key
// comes back with sound on and the player re-mutes in one tap; ADR-0064 records why a preference
// whose wrong value costs one tap needs neither a migration nor a collision guard.
//
//   node scripts/play-sound-shared-state-check.mjs            -> classify every play route
//   node scripts/play-sound-shared-state-check.mjs --selftest -> calibration on throwaway fixtures
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { stripComments, JS } from './strip-comments.mjs';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const PLAY_DIR = path.join(repoRoot, 'src', 'play');
const AUDIO_MODULE = path.join(repoRoot, 'src', 'shell', 'audio.ts');

// Both entry shapes ship, and three routes carry both, so the union is read: neither half of a
// two-file route can hide the other's wiring.
const SCRIPTS = ['main.js', 'main.ts'];
const CONTROL_FILES = ['markup.html', 'main.js', 'main.ts'];

const CONTROL_RE = /<button\b[^>]*\b(?:[\w-]*(?:audio|sound|mute)[\w-]*)\b[^>]*>/i;
const HTML_COMMENT_RE = /<!--[\s\S]*?-->/g;
// A storage call, in the two shapes this repo writes: a localStorage member call, and a helper whose
// own identifier says localStorage (pinocchio-luck shipped `localStorageSafe(key, value)`).
const STORAGE_CALL_RE = /(?:localStorage\s*\.\s*(?:get|set|remove)Item|[\w$]*[lL]ocal[sS]torage[\w$]*)\s*\(\s*(['"])([^'"]*)\1/g;
const SOUNDISH_KEY_RE = /sound|mute|audio/i;
const IMPORT_AUDIO_RE = /from\s*['"][^'"]*shell\/audio(?:\.ts)?['"]/;

const read = (p) => fs.readFileSync(p, 'utf8');

/** Comment-free source for any file this gate reads. A route documents its own mute wiring in prose,
 *  and a checker cannot tell use from mention. */
function stripFor(file, text) {
  if (file.endsWith('.html')) return text.replace(HTML_COMMENT_RE, '');
  return file.endsWith('.ts') ? stripComments(text) : stripComments(text, JS);
}

/** The one storage key a sound-ish name is allowed to be: whatever src/shell/audio.ts spells. Read
 *  from that file rather than repeated here, so the two cannot drift apart. */
function sharedKey(audioModule) {
  const m = /MUTED_KEY\s*=\s*['"]([^'"]+)['"]/.exec(read(audioModule));
  assert.ok(m, `MUTED_KEY is not spelled in ${path.basename(audioModule)} — this gate has no allowed key`);
  return m[1];
}

/** Classify one directory of route folders. Takes the directory and the allowed key so --selftest can
 *  point it at a throwaway fixture instead of src/play. */
function audit(playDir, allowedKey) {
  const rows = [];
  let total = 0;
  for (const entry of fs.readdirSync(playDir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    if (!entry.isDirectory()) continue;
    total += 1;
    const dir = path.join(playDir, entry.name);

    let controlAt = null;
    for (const name of CONTROL_FILES) {
      const p = path.join(dir, name);
      if (fs.existsSync(p) && CONTROL_RE.test(stripFor(p, read(p)))) {
        controlAt = name;
        break;
      }
    }

    const scripts = SCRIPTS.map((n) => path.join(dir, n)).filter((p) => fs.existsSync(p));
    const source = scripts.map((p) => stripFor(p, read(p))).join('\n');
    const localKeys = [...source.matchAll(STORAGE_CALL_RE)]
      .map((m) => m[2])
      .filter((k) => SOUNDISH_KEY_RE.test(k) && k !== allowedKey);

    rows.push({
      route: entry.name,
      control: controlAt,
      reads: /\bisMuted\b/.test(source),
      writes: /\bsetMuted\b/.test(source),
      imports: IMPORT_AUDIO_RE.test(source),
      localKeys: [...new Set(localKeys)],
    });
  }

  const withControl = rows.filter((r) => r.control !== null);
  const withoutControl = rows.filter((r) => r.control === null);
  const violations = withControl
    .map((r) => {
      const why = [];
      if (!r.imports) why.push('does not import the shell audio module');
      if (!r.reads) why.push('never reads isMuted()');
      if (!r.writes) why.push('never writes setMuted()');
      for (const k of r.localKeys) why.push(`persists its own sound key '${k}'`);
      return { ...r, why };
    })
    .filter((r) => r.why.length > 0);

  return { rows, total, withControl, withoutControl, violations };
}

function selftest() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sound-shared-'));
  const KEY = 'watduang:muted';
  const plant = (name, files) => {
    const d = path.join(dir, name);
    fs.mkdirSync(d, { recursive: true });
    for (const [f, body] of Object.entries(files)) fs.writeFileSync(path.join(d, f), body, 'utf8');
  };
  const run = () => audit(dir, KEY);
  const routeOf = (name) => run().rows.find((r) => r.route === name);
  const violated = (name) => run().violations.find((v) => v.route === name);

  const WIRED = `import { isMuted, setMuted } from '../../shell/audio.ts';\nconst on = !isMuted();\nsetMuted(true);\n`;

  // MUST-GREEN. The shape every rewired route lands on: a control, both halves of the shared state,
  // no key of its own.
  plant('shared', { 'main.js': WIRED, 'markup.html': '<button id="btnAudioToggle">🔊</button>' });
  assert.equal(routeOf('shared').control, 'markup.html', 'a camelCase id must match — the gate is case-insensitive');
  assert.equal(violated('shared'), undefined, 'a route on the shared state must not be a violation');

  // MUST-RED 1: the pre-gh#227 shape. A control, a module-local boolean, no shared state at all.
  plant('local-only', {
    'main.js': "class S { constructor() { this.enabled = true; } }\n",
    'markup.html': '<button id="soundToggleBtn">🔊</button>',
  });
  assert.ok(violated('local-only'), 'a control that never touches the shared state must red');

  // MUST-RED 2: the persisted per-route key, WITH the shared import kept. This leg exists so the key
  // rule is proved to fire on its own — a mutant that also dropped the import would red on rule 1 and
  // say nothing about rule 2.
  plant('own-key', {
    'main.js': `${WIRED}localStorage.getItem('powermeter_audio');\n`,
    'markup.html': '<button id="btn-sound-toggle">🔊</button>',
  });
  const ownKey = violated('own-key');
  assert.ok(ownKey, 'a persisted per-route sound key must red even when the shared state is also read');
  assert.deepEqual(ownKey.localKeys, ['powermeter_audio'], 'the report must name the key it found');

  // MUST-RED 3: the same key through the helper shape pinocchio-luck shipped, not a member call.
  plant('helper-key', {
    'main.js': `${WIRED}localStorageSafe('pinocchio-sound', 'off');\n`,
    'markup.html': '<button id="soundBtn">♪</button>',
  });
  assert.deepEqual(violated('helper-key')?.localKeys, ['pinocchio-sound'], 'a localStorage helper call must count');

  // MUST-GREEN, and the boundary that keeps the gate honest: a route with NO control is not required
  // to import anything, and is not a violation. Without this leg a gate that classified every route
  // as control-less would pass every must-green above while proving nothing.
  plant('no-control', { 'main.js': "localStorage.getItem('dice-loser-players');\n", 'markup.html': '<button id="go">เริ่ม</button>' });
  assert.equal(routeOf('no-control').control, null, 'setup: the fixture must genuinely have no control');
  assert.equal(violated('no-control'), undefined, 'a route with no sound control is not a violation');

  // ...and the same route WITH a control added is: "no control" and "control reading local state"
  // are distinguished by the control, not by the storage call.
  plant('no-control-but-a-button', {
    'main.js': "localStorage.getItem('freeze_tap_players');\n",
    'markup.html': '<button id="btn-mute">🔊</button>',
  });
  assert.ok(violated('no-control-but-a-button'), 'adding a control to an unwired route must red it');

  // The partition itself: every planted route lands in exactly one bucket.
  const { total, withControl, withoutControl } = run();
  assert.equal(withControl.length + withoutControl.length, total, 'the two buckets must sum to the route count');

  // A route that reads the state but cannot change it is still broken, and gets its own leg: the
  // control would reflect a mute it can never lift.
  plant('read-only', { 'main.js': "import { isMuted } from '../../shell/audio.ts';\nconst on = !isMuted();\n", 'markup.html': '<button id="soundBtn">🔊</button>' });
  assert.ok(violated('read-only')?.why.some((w) => w.includes('setMuted')), 'a read-only control must red on the write rule');

  fs.rmSync(dir, { recursive: true, force: true });
  console.log(
    'play-sound-shared-state-check --selftest: 9 legs pass (4 must-red incl. one per storage shape and ' +
      'one read-only, 3 must-green incl. the no-control boundary, 1 partition sum, 1 case-insensitive control)',
  );
}

if (process.argv.includes('--selftest')) {
  selftest();
} else {
  const key = sharedKey(AUDIO_MODULE);
  const { rows, total, withControl, withoutControl, violations } = audit(PLAY_DIR, key);
  for (const r of rows) {
    const mark = r.control === null ? '--  ' : violations.some((v) => v.route === r.route) ? 'RED ' : 'ok  ';
    console.log(
      `  ${mark} ${r.route.padEnd(20)} control=${String(r.control ?? 'none').padEnd(12)} ` +
        `isMuted=${String(r.reads).padEnd(5)} setMuted=${String(r.writes).padEnd(5)} own-key=${r.localKeys.join(',') || '—'}`,
    );
  }
  for (const v of violations) {
    console.error(`::error::src/play/${v.route}: sound control in ${v.control} — ${v.why.join('; ')}`);
  }
  console.log(
    `play-sound-shared-state-check: ${withControl.length} route(s) with a sound control + ` +
      `${withoutControl.length} without = ${withControl.length + withoutControl.length} of ${total} route(s) on disk`,
  );
  assert.equal(withControl.length + withoutControl.length, total, 'the two buckets do not sum to the route count');
  console.log(`  allowed key, read from src/shell/audio.ts: ${key}`);
  console.log(
    '  NOT JUDGED: whether a control\'s label matches the state on mount, whether it is reachable, or ' +
      'whether storage reached through an unrecognised wrapper spells a key of its own.',
  );
  if (violations.length) process.exit(1);
}
