#!/usr/bin/env node
// Static regression tripwire standing in for scripts/roster-lock-two-tab-race.mjs (backs the
// roster/checkpoint work and ADR-0010, docs/adr/0018-...) — see that harness's own header
// (its "Needs BOTH a fixed and an unfixed build" paragraph): it needs BOTH a fixed and an unfixed
// build to prove anything, and CI has no
// unfixed-build arm, so wiring it into CI would produce a number that means nothing. This script
// checks the structural property the fix rests on instead: the re-read sits INSIDE the lock's
// critical section, the critical section stays synchronous, and roster.ts stays the sole writer
// of the roster key. The structure scan covers EVERY caller of the shared withLock
// (src/shell/lock.ts), not just roster.ts — src/tools/name-list.ts runs the same pattern on its
// per-tool keys.
//
// ponytail: this is a raw source-text scan (brace/regex matching), not a real parser. It cannot
// distinguish a locked run from the no-lock fallback branch (the early-return guard inside
// src/shell/lock.ts's withLock()), which still loses a concurrent add on plain http, on
// Safari < 15.4, or on an opaque origin (sandboxed iframe, file://) — those all fall through
// to running `fn()` unlocked. The committed unit tests
// all exercise that fallback branch (src/shell/roster.test.mjs asserts the Node runner has no
// navigator.locks); the only committed coverage of the LOCKED path is a mocked navigator.locks at
// the test named "#data-loss the re-read is inside the critical section — a write landing before the
// grant is not clobbered". Real two-tab behaviour remains proven only by the manual harness
// (scripts/roster-lock-two-tab-race.mjs), run by hand against a real build.
//
// The sole-writer scan reads the key as a literal in any of the three JS quote characters, backticks
// included. It still cannot see a key that is never written literally — assembled by concatenation,
// or a template with an interpolation (`watduang:${ns}`) — and it reads comments as code, so a
// commented-out mention outside the allow-list fails the gate and a human decides.
//
// The prize-draw event record (gh#304, moved to IndexedDB by gh#313) has the same sole-writer rule, with a
// different guard. Its one writer is src/prize-event/store.ts: `put` is a compare-and-set, one read/write
// IndexedDB transaction that reads the stored text and writes only when it still equals what the caller
// last saw, so no writer can land between another's read and write (IndexedDB serialises read/write
// transactions on one store). The migration's one-time copy is the only other write and is the same shape,
// guarded on "nothing stored yet". The INVARIANT: exactly one code path writes the event record, and it
// writes under that compare inside one transaction. Condition 4 reads it as five parts:
//   (a) store.ts holds exactly two readwrite transactions, `put` and `migrate`, each holding one store
//       mutation, reached only after a get of the record and an `if (...) { ... return }` whose condition
//       is the version compare (`!== expected`, in put and in migrate);
//   (b) every transaction goes through the one `run` helper, which resolves a write only on `oncomplete`;
//   (c) no other src/** file names IndexedDB, an object store, a transaction or the database name — the
//       closed allow-list is the fake and the store's own test, never a growable skip-list;
//   (d) the pre-gh#313 localStorage key is written by nobody but the seal (gh#313 REFUTE r2): no `setItem` or
//       `removeItem` on it anywhere under src/** except exactly one `setItem(STORAGE_KEY, SEALED)` in
//       store.ts's migrate, inside its `await lock(async () => ...)` callback (the old code's Web Lock), after
//       every awaited readwrite copy there has handled its abort (`=== null) return`); store.ts holds no
//       removeItem, and SEALED is a text the old decoder refuses (`{"v":0...`);
//   (e) the key is declared once, in event.ts, and named by import everywhere else.
// DISCLOSED CEILING: a key or a database handle passed on through a variable or a parameter, or reached by
// a computed property (`win['indexedDB']`), is not seen; scripts/** (browser probes that seed a fixture
// event) is outside the scan, as it is for the roster key; and store.ts is scanned with its comments
// blanked, so a writer hidden after a string holding a double slash on the same line would not be seen.
// The scan is a text scan, so a refactor of store.ts that changes these shapes fails closed and a human
// decides.
//
//   node scripts/roster-lock-structure-check.mjs             -> scan every src/** importer of the shared
//                                                              withLock, plus src/** for key ownership and
//                                                              the event store's single writer
//   node scripts/roster-lock-structure-check.mjs --selftest  -> both-direction calibration on temp fixtures

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const srcDir = path.join(repoRoot, 'src');

// The lock-structure scan set is DERIVED, not listed: every file under src/** that imports the shared
// withLock from src/shell/lock.ts. Deriving it off the IMPORT (not off the call shape) is deliberate —
// a file whose call sites stopped matching findWithLockSpans must stay in the set so the gate can fail
// on it, instead of quietly dropping out and reading green. main() fails if the set is empty, and if any
// file in it yields zero recognised call sites.
const LOCK_IMPORT_RE = /from\s*(['"])(?:[^'"]*\/)?lock\.ts\1/;

// Closed allow-list — no growable skip-list. A new writer of the roster key anywhere else fails
// the gate and a human decides; this script never grows the exemption on its own.
const ALLOWED_KEY_MENTION_PATHS = new Set(['src/shell/roster.ts', 'src/shell/roster.test.mjs']);

// ---------------------------------------------------------------------------
// Pure: text -> brace-match table. No IO here, so selftest can feed it fixture strings directly.
// Simple stack matcher — this file has no braces inside string/comment content, so it doesn't
// need to skip those; a fixture that did would defeat the whole scan the same way it defeats
// no-nav-in-stage-check.mjs's text scan.
// ---------------------------------------------------------------------------
function matchBraces(text) {
  const stack = [];
  const matchFor = new Map(); // openIdx -> closeIdx
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '{') stack.push(i);
    else if (text[i] === '}') {
      const open = stack.pop();
      if (open !== undefined) matchFor.set(open, i);
    }
  }
  return matchFor;
}

// Finds every `withLock(() => { ... })` / `withLock(KEY, () => { ... })` callback in the text (both
// with an optional `async`), returning each callback's brace span plus the span of its immediate
// enclosing block (the function that makes the withLock(...) call — e.g. add()). Condition 2 checks
// inside the callback span; condition 1 checks the gap between the enclosing span and the callback span.
//
// The optional leading `<identifier>,` is the lock NAME argument the shared src/shell/lock.ts takes.
// Both shapes stay matched because the one-argument form is still what a fixture, a mock or a future
// caller may write; what the regex still REQUIRES is the literal `withLock(` and a zero-parameter arrow
// with a block body, so it cannot drift onto unrelated code — the optional part is a single identifier
// and a comma, nothing more.
function findWithLockSpans(text, matchFor) {
  const spans = [];
  const re = /withLock\(\s*(?:[A-Za-z_$][\w$]*\s*,\s*)?(?:async\s*)?\(\s*\)\s*=>\s*\{/g;
  let m;
  while ((m = re.exec(text))) {
    const openBrace = m.index + m[0].length - 1;
    const closeBrace = matchFor.get(openBrace);
    if (closeBrace === undefined) continue; // unbalanced fixture — nothing to pair against

    // Immediate enclosing block = the brace pair with the largest open index that still strictly
    // contains this callback span (the tightest ancestor, i.e. the function making the call).
    let enclosing = null;
    for (const [open, close] of matchFor) {
      if (open < m.index && close > closeBrace) {
        if (!enclosing || open > enclosing.open) enclosing = { open, close };
      }
    }
    spans.push({ callbackStart: openBrace, callbackEnd: closeBrace, enclosing });
  }
  return spans;
}

const within = (idx, start, end) => idx > start && idx < end;

// ---------------------------------------------------------------------------
// Condition 1 + 2: given roster.ts-shaped text, find (a) write(KEY calls or mutation-path
// read(KEY) calls sitting outside their withLock callback, and (b) await inside a withLock
// callback.
// ---------------------------------------------------------------------------
function checkLockStructure(text) {
  const violations = [];
  const matchFor = matchBraces(text);
  const lockSpans = findWithLockSpans(text, matchFor);
  const lineOf = (idx) => text.slice(0, idx).split('\n').length;

  const inAnyCallback = (idx) => lockSpans.some((s) => within(idx, s.callbackStart, s.callbackEnd));
  const inAnyEnclosing = (idx) =>
    lockSpans.some((s) => s.enclosing && within(idx, s.enclosing.open, s.enclosing.close));

  // Condition 1a: write(KEY, ...) outside every withLock callback, anywhere in the file. `key` (the
  // per-tool storage key name-list.ts is handed) counts as the same thing. The `function` lookbehind on
  // both this and the read regex below is what keeps a DECLARATION (`function write(key, list)`) out of
  // the call set — the colon in the TS annotation does that too, but only in TS, and the selftest
  // fixtures are plain JS. Without it the good fixture flagged its own helper declaration.
  // DISCLOSED CEILING: only the write() helper is matched, not a bare localStorage.setItem(key, ...).
  // Matching setItem too would flag roster.ts's own write() helper, which sits outside every callback
  // by design. Condition 1b below is what covers the regression that actually shipped (gh#132): the
  // re-read hoisted out of the critical section.
  const writeRe = /(?<!function\s+)\bwrite\(\s*(?:KEY|key)\s*,/g;
  let wm;
  while ((wm = writeRe.exec(text))) {
    if (!inAnyCallback(wm.index)) {
      violations.push({
        line: lineOf(wm.index),
        rule: 'write(KEY outside withLock callback',
        snippet: text.split('\n')[lineOf(wm.index) - 1].trim(),
      });
    }
  }

  // Condition 1b: read(KEY) that sits in the same function that makes the withLock call (a
  // mutation path), but outside that call's callback — the hoisted-re-read regression. A
  // read(KEY) outside that enclosing function entirely (loadGroup, the initial capture in
  // loadRoster) is a plain load, not a mutation path, and is not in scope.
  const readRe = /(?<!function\s+)\bread\(\s*(?:KEY|key)\s*\)/g;
  let rm;
  while ((rm = readRe.exec(text))) {
    if (inAnyCallback(rm.index)) continue; // inside the critical section — fine
    if (inAnyEnclosing(rm.index)) {
      violations.push({
        line: lineOf(rm.index),
        rule: 'mutation-path read(KEY) outside withLock callback',
        snippet: text.split('\n')[lineOf(rm.index) - 1].trim(),
      });
    }
  }

  // Condition 2: await inside a withLock callback reopens the gap the lock closes.
  const awaitRe = /\bawait\b/g;
  let am;
  while ((am = awaitRe.exec(text))) {
    if (inAnyCallback(am.index)) {
      violations.push({
        line: lineOf(am.index),
        rule: 'await inside withLock callback',
        snippet: text.split('\n')[lineOf(am.index) - 1].trim(),
      });
    }
  }

  return violations;
}

// ---------------------------------------------------------------------------
// Condition 3: the roster key string, anywhere under src/** outside the closed allow-list.
// ---------------------------------------------------------------------------
function checkKeyOwnership(files) {
  const violations = [];
  const keyRe = /(['"`])watduang:roster\1/g; // backtick included: a template literal is a write like any other
  for (const { relPath, text } of files) {
    if (ALLOWED_KEY_MENTION_PATHS.has(relPath)) continue;
    let km;
    while ((km = keyRe.exec(text))) {
      const line = text.slice(0, km.index).split('\n').length;
      violations.push({
        file: relPath,
        line,
        rule: "'watduang:roster' written outside the allowed roster.ts / roster.test.mjs",
        snippet: text.split('\n')[line - 1].trim(),
      });
    }
  }
  return violations;
}

// ---------------------------------------------------------------------------
// Condition 4: the prize-draw event record has one writer, store.ts's compare-and-set `put` (plus the
// migration's guarded copy), and the old localStorage key has none.
// ---------------------------------------------------------------------------
const EVENT_STORE_OWNER = 'src/prize-event/store.ts';
const EVENT_KEY_DECLARER = 'src/prize-event/event.ts';
const EVENT_KEY_LITERAL_BARE = String.raw`['"` + '`' + String.raw`]watduang:prize-draw:event['"` + '`' + String.raw`]`;
const EVENT_KEY_LITERAL_RE = new RegExp(String.raw`(['"` + '`' + String.raw`])watduang:prize-draw:event\1`, 'g');
const EVENT_DB_NAME_RE = /['"`]watduang-prize-draw['"`]/g;
// Raw IndexedDB reach: the factory, an object store, a transaction. A quoted word is not a use.
const RAW_IDB_RE = /(?<![\w$'"`])indexedDB(?![\w$'"`])|\.objectStore\(|\bcreateObjectStore\(|\.transaction\(/g;
// Closed allow-list, like the roster key's: the in-memory IndexedDB fake and the store's own test.
const RAW_IDB_ALLOWED_PATHS = new Set(['src/prize-event/fake-idb.mjs', 'src/prize-event/store.test.mjs']);
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const lineAt = (text, idx) => text.slice(0, idx).split('\n').length;
const blankComments = (text) => text.replace(/\/\/[^\n]*|\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, ' '));

/** The names a file can reach the event key by: its imports of STORAGE_KEY from event.ts, under any alias or
 *  namespace, plus STORAGE_KEY itself in event.ts, where it is declared. */
function eventKeyNames(relPath, text) {
  const names = relPath === EVENT_KEY_DECLARER ? ['STORAGE_KEY'] : [];
  const fromEvent = String.raw`\s*from\s*(['"])(?:[^'"]*\/)?event(?:\.ts)?\2`;
  for (const m of text.matchAll(new RegExp(String.raw`import\s*(?:type\s+)?\{([^}]*)\}` + fromEvent, 'g'))) {
    for (const spec of m[1].split(',')) {
      const s = spec.trim().match(/^STORAGE_KEY(?:\s+as\s+([A-Za-z_$][\w$]*))?$/);
      if (s) names.push(s[1] ?? 'STORAGE_KEY');
    }
  }
  for (const m of text.matchAll(new RegExp(String.raw`import\s*\*\s*as\s+([A-Za-z_$][\w$]*)` + fromEvent, 'g'))) {
    names.push(`${m[1]}.STORAGE_KEY`);
  }
  return names;
}

/** store.ts alone: the shapes that make its writes atomic. Takes the comment-blanked text. */
function checkStoreOwner(text) {
  const out = [];
  const matchFor = matchBraces(text);
  const add = (idx, rule) =>
    out.push({ file: EVENT_STORE_OWNER, line: idx === null ? 0 : lineAt(text, idx), rule, snippet: idx === null ? '' : text.split('\n')[lineAt(text, idx) - 1].trim() });
  const span = (re) => {
    const m = re.exec(text);
    if (!m) return null;
    const open = m.index + m[0].length - 1;
    const close = matchFor.get(open);
    return close === undefined ? null : { open, close };
  };
  const putSpan = span(/async put\(expected,\s*next\)\s*\{/);
  const migrateSpan = span(/async function migrate\([\s\S]*?\)\s*:\s*Promise<void>\s*\{/);
  const runSpan = span(/function run<T>\([\s\S]*?\)\s*:\s*Promise<T \| null>\s*\{/);
  for (const [span_, what] of [[putSpan, 'the put method'], [migrateSpan, 'the migrate function'], [runSpan, 'the run transaction helper']]) {
    if (!span_) add(null, `${what} not found: the sole-writer scan went blind`);
  }
  if (!putSpan || !migrateSpan || !runSpan) return out;

  // (d) the old key's one write is migrate's seal, inside the old code's lock, after any copy's abort is
  // handled; nothing removes it.
  for (const m of text.matchAll(/\.removeItem\(/g)) add(m.index, 'store.ts calls removeItem: the old key is sealed, never removed');
  if (!/export const SEALED = '\{"v":0[,}]/.test(text)) add(null, 'SEALED is not a text the old decoder refuses ({"v":0...)');
  const sets = [...text.matchAll(/\.setItem\(/g)].map((m) => m.index);
  if (sets.length !== 1) add(sets[1] ?? null, `store.ts holds ${sets.length} setItem calls; the one allowed is migrate's seal`);
  const lockCb = (() => {
    const m = /await\s+lock\(\s*async\s*\(\s*\)\s*(?::[^=]*)?=>\s*\{/.exec(text.slice(migrateSpan.open, migrateSpan.close));
    if (!m) return null;
    const open = migrateSpan.open + m.index + m[0].length - 1;
    const close = matchFor.get(open);
    return close === undefined ? null : { open, close };
  })();
  for (const idx of sets) {
    if (!within(idx, migrateSpan.open, migrateSpan.close)) {
      add(idx, 'a setItem in store.ts outside migrate');
      continue;
    }
    if (!lockCb || !within(idx, lockCb.open, lockCb.close)) {
      add(idx, 'the seal is written outside migrate\'s lock callback: an old-code writer could land between the read and the seal');
      continue;
    }
    if (!/\.setItem\(\s*STORAGE_KEY\s*,\s*SEALED\s*\)/.test(text.slice(idx, idx + 60))) add(idx, 'migrate writes the old key with something other than SEALED');
    const body = text.slice(lockCb.open, idx);
    for (const c of body.matchAll(/await\s+run<[^>]*>\(\s*db\s*,\s*(['"])readwrite\1/g)) {
      if (!/===\s*null\)\s*return/.test(body.slice(c.index))) add(idx, 'the old key sealed before the copy transaction is awaited and its abort handled (null check)');
    }
  }

  // (b) one transaction helper, resolving a write only once the transaction committed.
  const txCalls = [...text.matchAll(/\.transaction\(/g)].map((m) => m.index);
  if (txCalls.length !== 1 || !within(txCalls[0], runSpan.open, runSpan.close)) {
    add(txCalls[0] ?? null, `store.ts holds ${txCalls.length} .transaction( calls; the one allowed is inside run`);
  }
  if (!/\.oncomplete\s*=\s*\(\)\s*=>\s*resolve\(/.test(text.slice(runSpan.open, runSpan.close))) {
    add(null, 'run no longer resolves on oncomplete: a write could be reported before it committed');
  }
  for (const m of text.matchAll(/\brun<[^>]*>\(\s*db\s*,\s*(?!\s|['"](?:readonly|readwrite)['"])/g)) {
    add(m.index, 'a run(...) call whose mode is not a readonly/readwrite literal: the writers cannot be counted');
  }

  // (a) the readwrite transactions are exactly put's and migrate's, each one compare-and-set.
  const rwCalls = [...text.matchAll(/\brun<[^>]*>\(\s*db\s*,\s*(['"])readwrite\1\s*,[^{]*\{/g)];
  const rwLiterals = [...text.matchAll(/['"]readwrite['"]/g)].length;
  if (rwLiterals !== rwCalls.length) add(null, `store.ts names 'readwrite' ${rwLiterals} times but ${rwCalls.length} run(db, 'readwrite', ...) calls were recognised`);
  const writers = [
    { name: 'put', span: putSpan, guard: /!==\s*expected\b|\bexpected\s*!==/, says: '!== expected' },
    { name: 'migrate', span: migrateSpan, guard: /!==\s*expected\b|\bexpected\s*!==/, says: '!== expected' },
  ];
  const cbSpans = [];
  for (const m of rwCalls) {
    const open = m.index + m[0].length - 1;
    const close = matchFor.get(open);
    const owner = writers.find((w) => within(m.index, w.span.open, w.span.close));
    if (!owner || close === undefined) {
      add(m.index, 'a readwrite transaction outside put and migrate: a new writer of the event record');
      continue;
    }
    cbSpans.push({ open, close });
    owner.rw = (owner.rw ?? 0) + 1;
    const cb = text.slice(open, close);
    const getAt = cb.search(/\.get\(/);
    const putAt = cb.search(/\.put\(/);
    if (putAt < 0 || getAt < 0 || getAt > putAt) {
      add(m.index, `${owner.name}: the readwrite transaction does not read the record before it writes`);
      continue;
    }
    // An `if (cond) { ... return ... }` between the read and the write, found by real brace matching on the
    // whole text: the version compare that makes the write conditional.
    const guarded = [...text.slice(open + getAt, open + putAt).matchAll(/if\s*\(([^)]*)\)\s*\{/g)].some((g) => {
      const bodyOpen = open + getAt + g.index + g[0].length - 1;
      const bodyClose = matchFor.get(bodyOpen);
      return owner.guard.test(g[1]) && bodyClose !== undefined && bodyClose < open + putAt && /\breturn\b/.test(text.slice(bodyOpen, bodyClose));
    });
    if (!guarded) add(m.index + putAt, `${owner.name}: the write is not guarded by a version compare (${owner.says}) that returns before it`);
    if ([...cb.matchAll(/\.put\(/g)].length !== 1) add(m.index, `${owner.name}: the readwrite transaction holds more than one put`);
  }
  for (const w of writers) {
    if ((w.rw ?? 0) !== 1) add(null, `${w.name} holds ${w.rw ?? 0} readwrite transactions; the one writer is exactly one`);
  }
  // Every store mutation sits inside one of those callbacks (a Set's add/delete on `listeners` is not one).
  for (const m of text.matchAll(/(?<!\blisteners)\.(?:put|add|delete|clear)\(/g)) {
    if (!cbSpans.some((c) => within(m.index, c.open, c.close))) add(m.index, 'an object-store mutation outside the guarded readwrite transactions');
  }
  return out;
}

function checkEventKeyWriter(files) {
  const violations = [];
  const push = (relPath, text, idx, rule) =>
    violations.push({ file: relPath, line: lineAt(text, idx), rule, snippet: text.split('\n')[lineAt(text, idx) - 1].trim() });
  let owner = null;
  for (const { relPath, text } of files) {
    if (relPath === EVENT_STORE_OWNER) owner = text;
    // (e) the key literal lives in event.ts alone.
    if (relPath !== EVENT_KEY_DECLARER) {
      for (const m of text.matchAll(EVENT_KEY_LITERAL_RE)) push(relPath, text, m.index, `the event key written as a literal outside ${EVENT_KEY_DECLARER}`);
    }
    // (d) no setItem or removeItem on the old key anywhere; store.ts's one seal is checked by its own scan.
    const keyForms = [...eventKeyNames(relPath, text).map(escapeRe), EVENT_KEY_LITERAL_BARE];
    const verbs = relPath === EVENT_STORE_OWNER ? 'removeItem' : 'setItem|removeItem';
    const callRe = new RegExp(String.raw`\.(?:${verbs})\(\s*(?:${keyForms.join('|')})(?![\w$])`, 'g');
    for (const m of text.matchAll(callRe)) push(relPath, text, m.index, `the old event key (localStorage) touched outside store.ts's migrate: ${m[0].includes('removeItem') ? 'removeItem' : 'setItem'}`);
    // (c) raw IndexedDB only in store.ts and the closed allow-list.
    if (relPath !== EVENT_STORE_OWNER && !RAW_IDB_ALLOWED_PATHS.has(relPath)) {
      for (const m of text.matchAll(RAW_IDB_RE)) push(relPath, text, m.index, `raw IndexedDB access outside ${EVENT_STORE_OWNER}: a second writer of the event record must go through store.put`);
      for (const m of text.matchAll(EVENT_DB_NAME_RE)) push(relPath, text, m.index, `the event database named outside ${EVENT_STORE_OWNER}`);
    }
  }
  if (owner === null) {
    violations.push({ file: EVENT_STORE_OWNER, line: 0, rule: 'the event store owner is missing: the sole-writer scan checked nothing', snippet: '' });
    return violations;
  }
  violations.push(...checkStoreOwner(blankComments(owner)));
  return violations;
}

// ---------------------------------------------------------------------------
// Self-test: temp fixtures under os.tmpdir(), never repo content — never touches src/, dist/, or
// the working tree. Calibrated both ways per condition: a clean fixture passes, each planted
// violation is flagged. EVERY lock-structure fixture runs TWICE, once per call shape: the
// two-argument `withLock(KEY, () => { ... })` that src/shell/roster.ts and src/tools/name-list.ts
// ship today, and the one-argument `withLock(() => { ... })` the regex still accepts. A fixture set
// carrying only one shape would prove nothing about the other, which is exactly how widening the
// call-site regex could have left the gate matching nothing and reporting green.
// ---------------------------------------------------------------------------
const CALL_SHAPES = [
  { label: 'withLock(fn)', open: 'withLock(', openAsync: 'withLock(async ' },
  { label: 'withLock(NAME, fn)', open: 'withLock(KEY, ', openAsync: 'withLock(KEY, async ' },
];

function selftest() {
  // A single-argument callback is NOT a lock callback — the widened regex must not start matching it,
  // or a `withLock(name, (grant) => {...})` body would be scanned as if it were the critical section.
  const shapeProbe = "await withLock(KEY, (grant) => {\n  write(KEY, []);\n});";
  assert.equal(
    findWithLockSpans(shapeProbe, matchBraces(shapeProbe)).length,
    0,
    'a callback that takes a parameter must not be recognised as a withLock critical section'
  );
  console.log('PASS regex calibration: a non-zero-argument arrow callback is not matched');

  for (const shape of CALL_SHAPES) {
    // --- Conditions 1 + 2, known-good: the real shape roster.ts ships today. ---
    const goodLockText = [
      "function read(key) { return []; }",
      "function write(key, list) {}",
      "const KEY = 'watduang:roster';",
      "export function loadGroup() {",
      "  const names = read(KEY);", // plain load, not a mutation path — must not be flagged
      "  return names;",
      "}",
      "export function loadRoster() {",
      "  let list = read(KEY);", // initial capture, outside add() — must not be flagged
      "  return {",
      "    async add(name) {",
      `      await ${shape.open}() => {`,
      "        list = [...list, ...read(KEY).filter((n) => !list.includes(n))];",
      "        write(KEY, list);",
      "      });",
      "    },",
      "  };",
      "}",
    ].join('\n');
    assert.deepEqual(checkLockStructure(goodLockText), [], `real roster.ts shape must report zero violations [${shape.label}]`);
    console.log(`PASS known-good fixture [${shape.label}]: read/write(KEY) inside the callback, sync callback, zero violations`);

    // --- Condition 1a known-bad: write(KEY outside any withLock callback. ---
    const badWriteOutside = [
      "async function add(name) {",
      "  write(KEY, [name]);", // no lock at all
      `  await ${shape.open}() => {`,
      "    read(KEY);",
      "  });",
      "}",
    ].join('\n');
    const v1a = checkLockStructure(badWriteOutside);
    assert.ok(
      v1a.some((v) => v.rule === 'write(KEY outside withLock callback' && v.line === 2),
      `write(KEY outside every withLock callback must be flagged [${shape.label}]`
    );
    console.log(`PASS known-bad fixture (1a) [${shape.label}]: write(KEY outside withLock callback is flagged`);

    // --- Condition 1b known-bad: the exact hoist regression — read(KEY) moved just before the
    // withLock call, still inside add(), but outside the callback.
    const badHoistedRead = [
      "async function add(name) {",
      "  const stale = read(KEY);", // hoisted out of the critical section
      `  await ${shape.open}() => {`,
      "    write(KEY, [...stale, name]);",
      "  });",
      "}",
    ].join('\n');
    const v1b = checkLockStructure(badHoistedRead);
    assert.ok(
      v1b.some((v) => v.rule === 'mutation-path read(KEY) outside withLock callback' && v.line === 2),
      `read(KEY) hoisted out of the critical section, inside the mutating function, must be flagged [${shape.label}]`
    );
    console.log(`PASS known-bad fixture (1b) [${shape.label}]: hoisted mutation-path read(KEY) is flagged`);

    // --- Condition 1b known-bad, the tools spelling: the same hoist written with the lowercase
    // per-tool `key` src/tools/name-list.ts is handed, which the KEY-only regexes never saw. ---
    const badHoistedToolRead = [
      "export function saveToolNames(key, names) {",
      "  const seen = read(key);", // hoisted out of the critical section
      `  return ${shape.open}() => {`,
      "    localStorage.setItem(key, JSON.stringify([...seen, ...names]));",
      "  });",
      "}",
    ].join('\n');
    const v1bTool = checkLockStructure(badHoistedToolRead);
    assert.ok(
      v1bTool.some((v) => v.rule === 'mutation-path read(KEY) outside withLock callback' && v.line === 2),
      `a hoisted read(key) on the per-tool key must be flagged too [${shape.label}]`
    );
    console.log(`PASS known-bad fixture (1b, per-tool key) [${shape.label}]: hoisted read(key) is flagged`);

    // --- Condition 2 known-bad: an await inside the withLock callback. ---
    const badAwaitInCallback = [
      "async function add(name) {",
      `  await ${shape.openAsync}() => {`,
      "    const list = await Promise.resolve(read(KEY));",
      "    write(KEY, [...list, name]);",
      "  });",
      "}",
    ].join('\n');
    const v2 = checkLockStructure(badAwaitInCallback);
    assert.ok(
      v2.some((v) => v.rule === 'await inside withLock callback' && v.line === 3),
      `an await inside the withLock callback must be flagged [${shape.label}]`
    );
    console.log(`PASS known-bad fixture (2) [${shape.label}]: await inside withLock callback is flagged`);
  }

  // --- Condition 3, known-good: the two allowed files carry the key, nothing else does. ---
  const goodFiles = [
    { relPath: 'src/shell/roster.ts', text: "const KEY = 'watduang:roster';" },
    { relPath: 'src/shell/roster.test.mjs', text: "const KEY = 'watduang:roster';" },
    { relPath: 'src/games/love-match.ts', text: "const label = 'จับคู่';" },
  ];
  assert.deepEqual(checkKeyOwnership(goodFiles), [], 'allowed files must not be flagged, and clean files carry no violations');
  console.log('PASS known-good fixture (3): roster.ts + roster.test.mjs mentions are allowed, no other file writes the key');

  // --- Condition 3, known-bad: a second writer of the key elsewhere under src/**. ---
  const badFiles = [
    ...goodFiles,
    { relPath: 'src/shell/checkpoint.ts', text: "localStorage.setItem('watduang:roster', '[]');" },
  ];
  const v3 = checkKeyOwnership(badFiles);
  assert.ok(
    v3.some((v) => v.file === 'src/shell/checkpoint.ts' && v.rule.includes('allowed')),
    'a second writer of the roster key outside the allow-list must be flagged'
  );
  console.log('PASS known-bad fixture (3): a second writer of the roster key outside roster.ts is flagged');

  // --- Condition 3, known-bad: the same second writer using a backtick template literal. Matching
  // only '...' and "..." let this shape past the check entirely. ---
  const badTemplateLiteral = [
    ...goodFiles,
    { relPath: 'src/shell/checkpoint.ts', text: 'localStorage.setItem(`watduang:roster`, `[]`);' },
  ];
  const v3tpl = checkKeyOwnership(badTemplateLiteral);
  assert.ok(
    v3tpl.some((v) => v.file === 'src/shell/checkpoint.ts' && v.rule.includes('allowed')),
    'a second writer using a backtick template literal must be flagged too'
  );
  console.log('PASS known-bad fixture (3, template literal): a backtick `watduang:roster` writer is flagged');

  // --- Condition 3, calibration the other way: widening to backticks must not start flagging a
  // different key, or an allowed file that happens to use a template literal. ---
  const goodTemplateLiteral = [
    { relPath: 'src/shell/roster.ts', text: 'const KEY = `watduang:roster`;' },
    { relPath: 'src/shell/checkpoint.ts', text: 'const CK = `watduang:checkpoint`;' },
  ];
  assert.deepEqual(checkKeyOwnership(goodTemplateLiteral), [], 'a template literal in an allowed file, and a different key elsewhere, must both stay clean');
  console.log('PASS known-good fixture (3, template literal): allowed-file backtick key and a different key elsewhere stay clean');

  // --- Condition 4, known-good: the shipped shape. store.ts holds one compare-and-set put and migrate's one
  // guarded copy; every other file reaches the record through the store and the key by import. ---
  const storeGood = [
    "import { STORAGE_KEY, decodeEvent, encodeEvent } from './event.ts';",
    "export const SEALED = '{\"v\":0,\"movedTo\":\"indexeddb\"}';",
    '// store.put(expected, next) is documented here and must not read as a call',
    'function run<T>(db: IDBDatabase, mode: IDBTransactionMode, body: (store: IDBObjectStore, done: (outcome: T) => void) => void): Promise<T | null> {',
    '  return new Promise((resolve) => {',
    '    let outcome: T | null = null;',
    '    const tx = db.transaction(DB.store, mode);',
    '    tx.oncomplete = () => resolve(outcome);',
    '    tx.onabort = () => resolve(null);',
    '    body(tx.objectStore(DB.store), (o) => (outcome = o));',
    '  });',
    '}',
    'export async function openEventStore(env: StoreEnv): Promise<EventStore | null> {',
    '  const db = await openDb(env.indexedDB);',
    '  await migrate(db, env, notify);',
    '  return {',
    '    load: () => run<Snapshot>(db, \'readonly\', (store, done) => { store.get(DB.key); }),',
    '    async put(expected, next) {',
    '      const raw = encodeEvent(next);',
    "      const r = await run<PutResult>(db, 'readwrite', (store, done) => {",
    '        const req = store.get(DB.key);',
    '        req.onsuccess = () => {',
    '          const now = snapshot(req.result);',
    '          if (now.raw !== expected) {',
    "            done({ ok: false, reason: 'stale', now });",
    '            return;',
    '          }',
    '          store.put(raw, DB.key);',
    '          done({ ok: true, raw });',
    '        };',
    '      });',
    '      return r;',
    '    },',
    '    subscribe(listener) { listeners.add(listener); return () => void listeners.delete(listener); },',
    '  };',
    '}',
    'async function migrate(db: IDBDatabase, env: StoreEnv, lock: Lock, take: string | null, report: (m: Moved) => void): Promise<void> {',
    '  const held = await lock(async (): Promise<Moved> => {',
    '    const legacy = env.localStorage?.getItem(STORAGE_KEY) ?? null;',
    '    const expected: unknown = undefined;',
    "    const copied = await run<string>(db, 'readwrite', (store, done) => {",
    '      const req = store.get(DB.key);',
    '      req.onsuccess = () => {',
    '        if (req.result !== expected) {',
    "          done('diverged');",
    '          return;',
    '        }',
    '        store.put(legacy, DB.key);',
    "        done('written');",
    '      };',
    '    });',
    "    if (copied === null) return 'refused';",
    '    env.localStorage?.setItem(STORAGE_KEY, SEALED);',
    "    return 'open';",
    '  });',
    "  report(held.held ? held.value : 'refused');",
    '}',
  ].join('\n');
  const eventGood = [
    { relPath: 'src/prize-event/store.ts', text: storeGood },
    { relPath: 'src/prize-event/event.ts', text: "export const STORAGE_KEY = 'watduang:prize-draw:event';" },
    { relPath: 'src/play/prize-draw/stage.ts', text: "import { openEventStore } from '../../prize-event/store.ts';\nconst store = await openEventStore(window);\nawait db.put(token, next);" },
    { relPath: 'src/prize-event/store.test.mjs', text: "const req = tab.indexedDB.open(DB.name, 1);\nw.objectStore(DB.store).put('x', DB.key);" },
    { relPath: 'src/pages/tool/number.ts', text: "import { STORAGE_KEY } from './number-store.ts';\nlocalStorage.setItem(STORAGE_KEY, '1');" },
    { relPath: 'src/games/love-match.test.mjs', text: "for (const banned of ['localStorage', 'indexedDB']) {}" },
  ];
  assert.deepEqual(checkEventKeyWriter(eventGood), [], 'the shipped one-writer shape must report zero violations');
  console.log('PASS known-good fixture (4): one guarded put and one guarded migrate copy in store.ts; the rest reach the record through it');

  // --- Condition 4, known-bad: each way a second writer, or an unguarded writer, can be written. ---
  const swap = (from, to) => {
    assert.ok(storeGood.includes(from), `fixture drifted: ${from}`);
    return storeGood.replace(from, to);
  };
  const plants = {
    'a direct IndexedDB put in another module': ['src/prize-event/setup-page.ts', "const req = win.indexedDB.open('x', 1);\nreq.result.transaction('event', 'readwrite').objectStore('event').put(raw, 'current');"],
    'the event database opened by name elsewhere': ['src/play/prize-draw/stage.ts', "factory.open('watduang-prize-draw', 1);"],
    'a setItem of the old key through the import': ['src/play/prize-draw/stage.ts', "import { STORAGE_KEY } from '../../prize-event/event.ts';\nstorage.setItem(STORAGE_KEY, encodeEvent(next));"],
    'an aliased import': ['src/prize-event/setup-page.ts', "import { createEvent, STORAGE_KEY as EV } from './event.ts';\nwin.localStorage.setItem( EV, raw);"],
    'a namespace import': ['src/prize-event/setup-page.ts', "import * as E from './event';\nwin.localStorage.setItem(E.STORAGE_KEY, raw);"],
    'the key as a literal': ['src/play/prize-draw/stage.ts', "storage.setItem(`watduang:prize-draw:event`, raw);"],
    'a removeItem of the old key outside the store': ['src/play/prize-draw/stage.ts', "import { STORAGE_KEY } from '../../prize-event/event.ts';\nstorage.removeItem(STORAGE_KEY);"],
    'a setItem in event.ts': ['src/prize-event/event.ts', "export const STORAGE_KEY = 'watduang:prize-draw:event';\nexport function save(s, r) { s.setItem(STORAGE_KEY, r); }"],
    'a second setItem in store.ts': ['src/prize-event/store.ts', storeGood + "\nexport function reseal(env) { env.localStorage.setItem(STORAGE_KEY, SEALED); }"],
    'a removeItem in store.ts': ['src/prize-event/store.ts', swap("    return 'open';", "    env.localStorage?.removeItem(STORAGE_KEY);\n    return 'open';")],
    'the seal written outside the lock': ['src/prize-event/store.ts', swap("    env.localStorage?.setItem(STORAGE_KEY, SEALED);\n    return 'open';\n  });", "    return 'open';\n  });\n  env.localStorage?.setItem(STORAGE_KEY, SEALED);")],
    'the old key written with something other than the seal': ['src/prize-event/store.ts', swap('setItem(STORAGE_KEY, SEALED)', 'setItem(STORAGE_KEY, encodeEvent(next))')],
    'a seal the old decoder would read as an event': ['src/prize-event/store.ts', swap('\'{"v":0,', '\'{"v":1,')],
    'an unguarded seal written in another module': ['src/prize-event/setup-page.ts', "import { STORAGE_KEY } from './event.ts';\nimport { SEALED } from './store.ts';\nwin.localStorage.setItem(STORAGE_KEY, SEALED);"],
    'put with the version compare removed': ['src/prize-event/store.ts', swap('          if (now.raw !== expected) {', '          if (false) {')],
    'put with the compare against something else': ['src/prize-event/store.ts', swap('now.raw !== expected', 'now.raw !== now.raw')],
    'put with the compare block gone': [
      'src/prize-event/store.ts',
      swap("          if (now.raw !== expected) {\n            done({ ok: false, reason: 'stale', now });\n            return;\n          }\n", ''),
    ],
    'put writing before it reads': ['src/prize-event/store.ts', swap('        const req = store.get(DB.key);\n        req.onsuccess = () => {\n          const now', '        store.put(raw, DB.key);\n        const req = store.get(DB.key);\n        req.onsuccess = () => {\n          const now')],
    'migrate copying without its compare': ['src/prize-event/store.ts', swap('req.result !== expected', 'req.result === 7')],
    'a third readwrite transaction': ['src/prize-event/store.ts', storeGood + "\nexport function wipe(db) { return run<boolean>(db, 'readwrite', (store, done) => { store.clear(); done(true); }); }"],
    'a store mutation outside the transactions': ['src/prize-event/store.ts', swap("  return {\n    load", "  cache.clear();\n  return {\n    load")],
    'the old key sealed before the copy abort is handled': ['src/prize-event/store.ts', swap("    if (copied === null) return 'refused';\n", '')],
    'run resolving before commit': ['src/prize-event/store.ts', swap('tx.oncomplete = () => resolve(outcome);', 'tx.oncomplete = () => {};')],
    'a run call with a variable mode': ['src/prize-event/store.ts', swap("run<Snapshot>(db, 'readonly',", 'run<Snapshot>(db, mode,')],
  };
  for (const [what, [relPath, text]] of Object.entries(plants)) {
    const files = [...eventGood.filter((f) => f.relPath !== relPath), { relPath, text }];
    const v = checkEventKeyWriter(files);
    assert.ok(v.some((x) => x.file === relPath), `${what} must be flagged in ${relPath}`);
    console.log(`PASS known-bad fixture (4): ${what} is flagged`);
  }
  // A scan that loses the owner, or reads it blind, must say so rather than read green.
  assert.ok(checkEventKeyWriter(eventGood.slice(1)).some((x) => x.rule.includes('missing')), 'a missing owner must fail');
  for (const [what, text] of [['an empty store.ts', ''], ['a renamed put', storeGood.replace('async put(', 'async putRenamed(')], ['a renamed migrate', storeGood.replace('async function migrate(', 'async function migrated(')]]) {
    const files = [{ relPath: 'src/prize-event/store.ts', text }, ...eventGood.slice(1)];
    assert.ok(checkEventKeyWriter(files).some((x) => x.rule.includes('blind')), `${what} must fail as blind`);
  }
  console.log('PASS blind-scan fixtures (4): a missing owner, an empty store.ts and a renamed put or migrate all fail');

  // Fixtures live under a temp dir purely to satisfy "hermetic" — the checks above run on
  // in-memory strings and touch no disk at all, but write one throwaway file to prove the
  // hermeticity claim, then remove it.
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'roster-lock-structure-check-'));
  try {
    fs.writeFileSync(path.join(tmp, 'probe.txt'), 'selftest ran');
    assert.ok(fs.existsSync(path.join(tmp, 'probe.txt')));
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

// ---------------------------------------------------------------------------
function walkSrcFiles(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { recursive: true })) {
    const abs = path.join(dir, entry);
    if (!fs.statSync(abs).isFile()) continue;
    out.push({ relPath: path.relative(repoRoot, abs).split(path.sep).join('/'), abs });
  }
  return out;
}

async function main() {
  if (process.argv.includes('--selftest')) return selftest();

  let anyFail = false;

  const files = walkSrcFiles(srcDir).map(({ relPath, abs }) => ({ relPath, text: fs.readFileSync(abs, 'utf8') }));

  // Scan set: every src file that imports the shared withLock. Derived, so a third caller is guarded
  // the day it is written — nobody has to remember this list.
  const lockCallers = files.filter((f) => LOCK_IMPORT_RE.test(f.text));
  if (lockCallers.length === 0) {
    console.error(
      'roster-lock-structure-check: no file under src/** imports src/shell/lock.ts — the scan set is ' +
        'empty, so this gate checked nothing. Either the lock module moved or the import shape changed.'
    );
    process.exit(1);
  }
  for (const { relPath, text } of lockCallers) {
    // A file that imports withLock but shows no recognised `withLock(... () => {` call site means the
    // call-site regex has gone blind, not that the file is clean. That reads as green otherwise, which
    // is the one failure this gate cannot afford.
    if (findWithLockSpans(text, matchBraces(text)).length === 0) {
      console.error(
        `${relPath} · imports withLock but no withLock(... () => { ... }) call site was recognised — ` +
          'the call-site regex in findWithLockSpans no longer matches this file'
      );
      anyFail = true;
    }
    for (const v of checkLockStructure(text)) {
      console.error(`${relPath}:${v.line} · ${v.rule} · ${v.snippet}`);
      anyFail = true;
    }
  }
  for (const v of checkKeyOwnership(files)) {
    console.error(`${v.file}:${v.line} · ${v.rule} · ${v.snippet}`);
    anyFail = true;
  }
  for (const v of checkEventKeyWriter(files)) {
    console.error(`${v.file}:${v.line} · ${v.rule} · ${v.snippet}`);
    anyFail = true;
  }

  if (anyFail) {
    console.error(
      '\nADR-0010 roster/checkpoint lock: the re-read must sit inside the withLock critical section, ' +
        'the critical section must stay synchronous, and roster.ts must stay the sole writer of the roster key. ' +
        'gh#313: the prize-draw event record has one writer, the compare-and-set put in src/prize-event/store.ts, ' +
        'and the old localStorage key has none.'
    );
    process.exit(1);
  }
  const eventFiles = files.filter((f) => f.relPath !== EVENT_STORE_OWNER && eventKeyNames(f.relPath, f.text).length).length;
  console.log(
    `roster-lock-structure-check: lock structure clean in ${lockCallers.length} withLock caller(s) ` +
      `(${lockCallers.map((f) => f.relPath).join(', ')}); roster-key ownership clean; event record: one guarded put ` +
      `and one guarded migrate copy and seal in ${EVENT_STORE_OWNER}, no IndexedDB access elsewhere, no setItem or removeItem ` +
      `on the old key in the ${eventFiles} other file(s) naming it`
  );
}

await main();
