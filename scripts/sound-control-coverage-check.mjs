#!/usr/bin/env node
// Gate: a play route that can make sound must ship a control that turns it off (gh#165).
//
// THE PREDICATE THIS REPLACES, and why it could never fail. gh#165's own definition of done says to
// classify a route "by whether its main script constructs an `AudioContext`". Taken literally that
// is a guard that cannot fail on the very tree it was written to red: `src/play/timebomb/main.ts`
// contains the string `AudioContext` in a COMMENT and nowhere else, and the real constructor is two
// relative imports away, in `src/shell/audio.ts`, reached through `src/games/timebomb.ts`. Under the
// literal reading the "produces sound, no control" count is 0 today, not the 1 the ticket asserts.
// Two independent corrections, both needed:
//   * COMMENT-STRIPPED source, so a route that only talks about audio is not classified as playing
//     it (scripts/strip-comments.mjs, the shared TypeScript-parser stripper — a hand-rolled regex
//     fails open on `'https://x'`, which is ADR-0019's recorded hole class);
//   * the route's whole STATIC IMPORT CLOSURE under src/, not just its entry file, so an engine or a
//     shared synth counts as the route's own sound. timebomb is the case that proves it matters.
//
// THE SET, and who owns each half:
//   * Routes: every directory under src/play, read from disk every run. No route array, so a route
//     nobody registered anywhere is CHECKED by default. `dice-loser` is excluded by the predicate
//     alone (its closure constructs nothing) — there is no skip list here, which is the form ADR-0009
//     names as the one that stops converging.
//   * Sound: the identifiers `AudioContext` and `webkitAudioContext`. THIS IS THE CEILING, and it is
//     deliberate: the ways a browser can make noise are BROWSER-owned, not repo-owned — `new Audio()`,
//     an `<audio>` element, SpeechSynthesis, a Vibration buzz — so enumerating them never converges
//     (ADR-0031). What this repo owns is which of them it actually uses, and today that is the Web
//     Audio constructor and its webkit alias, in every one of the routes that make sound. A route
//     that starts using `new Audio()` is INVISIBLE to this gate and would read as silent; widening
//     the identifier list is then a deliberate edit here, not a discovery. Each identifier claimed
//     has its own must-red leg in selftest().
//   * Control: a literal `<button>` on the route whose own tag text names audio, sound or mute,
//     matched CASE-INSENSITIVELY. Case matters in practice, not in theory: how-close-is-near spells
//     it `btnAudioToggle`, so a case-sensitive match drops it and the tickets' count of "nine" is
//     one short of what is really there.
//
// WHAT IT DOES NOT JUDGE: whether the control WORKS, whether it is reachable, whether it is named for
// a screen reader (that is scripts/play-icon-label-check.mjs and gh#211), and whether the mute it
// writes is site-wide or route-local (gh#227). Existence only.
//
//   node scripts/sound-control-coverage-check.mjs            -> classify every play route
//   node scripts/sound-control-coverage-check.mjs --selftest -> calibration on throwaway fixtures
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { stripComments, JS } from './strip-comments.mjs';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const SRC_DIR = path.join(repoRoot, 'src');
const PLAY_DIR = path.join(SRC_DIR, 'play');

// Both entry shapes ship: a route is either a lifted mockup bundle (main.js) or authored TypeScript
// (main.ts), and cannon-flag/freeze-tap/one-bomb carry BOTH. The union is taken so neither half of a
// two-file route can hide the other's audio.
const ENTRIES = ['main.ts', 'main.js'];
// Files a control may be declared in. markup.html is where every existing toggle lives; the scripts
// are included because a route may build its chrome in JS.
const CONTROL_FILES = ['markup.html', 'main.js', 'main.ts'];

const SOUND_IDENTIFIERS = ['AudioContext', 'webkitAudioContext'];
// Per identifier, so the report names WHICH one hit. `\b` makes the two genuinely distinct:
// `\bAudioContext\b` does not match inside `webkitAudioContext` (the plant-probe run proves it —
// the webkit fixture reports `webkitAudioContext` alone), which is why both are listed.
const identifiersIn = (text) => SOUND_IDENTIFIERS.filter((id) => new RegExp(`\\b${id}\\b`).test(text));

const CONTROL_RE = /<button\b[^>]*\b(?:[\w-]*(?:audio|sound|mute)[\w-]*)\b[^>]*>/i;
const HTML_COMMENT_RE = /<!--[\s\S]*?-->/g;

const read = (p) => fs.readFileSync(p, 'utf8');
const scriptKindFor = (p) => (p.endsWith('.ts') ? undefined : JS);

/** Comment-free source for any file this gate reads. HTML gets its own comment form — markup.html
 *  documents its own controls in prose, and this file's own header proves why that matters. */
function stripFor(file, text) {
  if (file.endsWith('.html')) return text.replace(HTML_COMMENT_RE, '');
  const kind = scriptKindFor(file);
  return kind === undefined ? stripComments(text) : stripComments(text, kind);
}

const SPEC_RE = /(?:^|[^\w$])(?:import|export)\b[^'"`;]*?from\s*['"]([^'"]+)['"]|(?:^|[^\w$])import\s*\(?\s*['"]([^'"]+)['"]/g;

/** Resolve one relative specifier against the importing file, extension-optional. Bare specifiers
 *  (npm packages) resolve to null on purpose: a dependency's sound is not this repo's to gate, and
 *  no play route imports one today. */
function resolveSpec(fromFile, spec, root) {
  if (!spec.startsWith('.')) return null;
  const base = path.resolve(path.dirname(fromFile), spec);
  const candidates = [base, `${base}.ts`, `${base}.js`, `${base}.mjs`, path.join(base, 'index.ts')];
  for (const c of candidates) {
    if (fs.existsSync(c) && fs.statSync(c).isFile() && path.resolve(c).startsWith(path.resolve(root))) return c;
  }
  return null;
}

/** Every file reachable from `entries` by static relative imports, entries included. */
function importClosure(entries, root) {
  const seen = new Set();
  const queue = [...entries];
  while (queue.length) {
    const file = queue.shift();
    const key = path.resolve(file);
    if (seen.has(key)) continue;
    seen.add(key);
    const stripped = stripFor(file, read(file));
    for (const m of stripped.matchAll(SPEC_RE)) {
      const spec = m[1] ?? m[2];
      const next = spec && resolveSpec(file, spec, root);
      if (next) queue.push(next);
    }
  }
  return [...seen];
}

/** Classify one directory of route folders. Takes the directory (and the import root) so --selftest
 *  can point it at a throwaway fixture instead of src/play. */
function auditPlayDir(playDir, root) {
  const rows = [];
  for (const entry of fs.readdirSync(playDir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    if (!entry.isDirectory()) continue;
    const dir = path.join(playDir, entry.name);
    const entries = ENTRIES.map((n) => path.join(dir, n)).filter((p) => fs.existsSync(p));
    const closure = importClosure(entries, root);

    const hits = new Set();
    let soundAt = null;
    for (const file of closure) {
      const found = identifiersIn(stripFor(file, read(file)));
      if (found.length === 0) continue;
      found.forEach((id) => hits.add(id));
      soundAt ??= path.relative(root, file);
    }

    let controlAt = null;
    for (const name of CONTROL_FILES) {
      const p = path.join(dir, name);
      if (!fs.existsSync(p)) continue;
      if (CONTROL_RE.test(stripFor(p, read(p)))) {
        controlAt = name;
        break;
      }
    }
    rows.push({
      route: entry.name,
      entries: entries.length,
      closure: closure.length,
      sound: hits.size > 0,
      via: [...hits].join('+') || '—',
      soundAt,
      control: controlAt,
    });
  }
  const violations = rows.filter((r) => r.sound && r.control === null);
  return { rows, violations };
}

function selftest() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sound-control-'));
  const plant = (name, files) => {
    const d = path.join(dir, name);
    fs.mkdirSync(d, { recursive: true });
    for (const [f, body] of Object.entries(files)) fs.writeFileSync(path.join(d, f), body, 'utf8');
  };
  const run = () => auditPlayDir(dir, dir);
  const routeOf = (name) => run().rows.find((r) => r.route === name);

  // MUST-RED, identifier 1 of 2. A route that constructs an AudioContext with no control anywhere.
  plant('plain-audio', { 'main.js': 'const ctx = new AudioContext();\n', 'markup.html': '<button id="go">เริ่ม</button>' });
  assert.equal(run().violations.length, 1, 'a route with an AudioContext and no control must red');
  assert.equal(run().violations[0].route, 'plain-audio');

  // MUST-RED, identifier 2 of 2. Claimed in the header, so it gets its own leg: seven routes reach
  // the constructor through `window.AudioContext || window.webkitAudioContext`, and a predicate
  // matching only a bare `new AudioContext` would miss every one of them.
  plant('webkit-audio', { 'main.js': 'const C = window.webkitAudioContext;\n' });
  assert.equal(run().violations.length, 2, 'the webkit alias must count as sound');
  assert.deepEqual(routeOf('webkit-audio').via, 'webkitAudioContext');

  // THE DEAD PREDICATE, pinned. gh#165's literal wording classifies by the string in the main script;
  // this is timebomb's real pre-fix shape — the word in a comment, the constructor two imports away.
  // Leg A: comment only, no import -> silent, so no violation is invented.
  plant('talks-about-audio', { 'main.ts': "// this route once used an AudioContext\nexport const x = 1;\n" });
  assert.equal(routeOf('talks-about-audio').sound, false, 'a comment mentioning AudioContext is not sound');

  // Leg B: the constructor lives in a module the entry imports, and the entry itself never names it.
  // A predicate reading only the entry file scores this route silent and the gate can never fail.
  fs.mkdirSync(path.join(dir, '_shared'), { recursive: true });
  fs.writeFileSync(path.join(dir, '_shared', 'synth.ts'), 'export const make = () => new AudioContext();\n', 'utf8');
  plant('imports-its-synth', { 'main.ts': "import { make } from '../_shared/synth.ts';\nmake();\n" });
  const viaImport = routeOf('imports-its-synth');
  assert.equal(viaImport.sound, true, 'the import closure is not walked — the ticket’s own predicate would pass here');
  assert.equal(run().violations.length, 3, 'a route whose sound comes from an imported module must red too');

  // MUST-GREEN, and the case-sensitivity leg together: how-close-is-near's real spelling.
  plant('has-control', {
    'main.js': 'const C = window.AudioContext || window.webkitAudioContext;\n',
    'markup.html': '<button id="btnAudioToggle" aria-label="เสียง">🔊</button>',
  });
  assert.equal(routeOf('has-control').sound, true, 'setup: the fixture must be in the sound set');
  assert.equal(routeOf('has-control').control, 'markup.html', 'a camelCase id must match — the gate is case-insensitive');
  assert.equal(run().violations.length, 3, 'a route with a control must not be a violation');

  // THE SILENT ROUTE, dice-loser's shape: no audio identifier anywhere, no control, and NOT a
  // violation — excluded by the predicate, never by a list. Without this leg a gate that classified
  // every route as silent would pass every must-green above.
  plant('no-sound-at-all', { 'main.js': 'document.title = "x";\n', 'markup.html': '<button id="go">เริ่ม</button>' });
  const silent = routeOf('no-sound-at-all');
  assert.equal(silent.sound, false, 'a route with no audio identifier must classify silent');
  assert.equal(silent.control, null, 'setup: the silent fixture must genuinely have no control');
  assert.equal(run().violations.length, 3, 'a silent route with no control is not a violation');

  fs.rmSync(dir, { recursive: true, force: true });
  console.log(
    'sound-control-coverage-check --selftest: 7 legs pass (3 must-red incl. one per claimed identifier, ' +
      '2 must-green, 1 dead-predicate pin with both its halves, 1 silent-route boundary)',
  );
}

if (process.argv.includes('--selftest')) {
  selftest();
} else {
  const { rows, violations } = auditPlayDir(PLAY_DIR, SRC_DIR);
  for (const r of rows) {
    const mark = r.sound ? (r.control ? 'ok  ' : 'RED ') : '--  ';
    console.log(
      `  ${mark} ${r.route.padEnd(20)} sound=${String(r.sound).padEnd(5)} via=${r.via.padEnd(28)} ` +
        `control=${r.control ?? 'none'} (${r.entries} entr(y|ies), ${r.closure} file(s) in closure)`,
    );
  }
  for (const v of violations) {
    console.error(`::error::src/play/${v.route}: makes sound (${v.via} in ${v.soundAt}) and declares no sound control`);
  }
  console.log(
    `sound-control-coverage-check: ${rows.length} route(s), ${rows.filter((r) => r.sound).length} producing sound, ` +
      `${violations.length} with no control`,
  );
  console.log(
    `  NOT SEEN: sound made through anything other than ${SOUND_IDENTIFIERS.join(' / ')} — new Audio(), an <audio> ` +
      'element and SpeechSynthesis are all browser-owned and unenumerable, so this gate bounds itself to the ' +
      'identifiers this repo actually uses. A route adopting one of the others reads as silent here.',
  );
  console.log(
    '  NOT JUDGED: whether the control works, is reachable, is named for a screen reader ' +
      '(play-icon-label-check / gh#211), or writes a site-wide vs route-local mute (gh#227).',
  );
  if (violations.length) process.exit(1);
}
