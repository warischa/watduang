#!/usr/bin/env node
// Static tripwire for docs/adr/0010-checkpoint-slot-stays-site-wide-until-a-second-writer-exists.md.
// ADR-0010 keeps ONE site-wide checkpoint slot, and its own "fact that would change this" names the
// exact trigger: a second checkpoint-writing game entering the manifest. At that moment the shared
// slot becomes a silent, unrecoverable data-loss bug — game B's save destroys game A's in-progress
// round, no undo, no message (gh#24). That trigger was enforced only by a prose comment in
// src/games/_template.ts; this script is the gate: siamsi.ts is the one allowed caller, closed, and
// growing the set needs an ADR, not a skip-list. The owner settled gh#24 on 2026-08-19 — one slot
// site-wide, permanently — so a red run here reopens a product question; it never orders a build.
//
//   node scripts/checkpoint-writer-check.mjs             -> scan src/games/*.ts against the real tree
//   node scripts/checkpoint-writer-check.mjs --selftest  -> both-direction calibration on temp fixtures

//
// ponytail: a source scan, and these are the things it provably does NOT see. Measured, not guessed:
//   - An aliased or destructured call. `const { saveCheckpoint } = gameCtx.session; saveCheckpoint(x)`
//     passes clean — verified by planting exactly that. The matcher needs the `.saveCheckpoint(`
//     property access. This is the likeliest real escape, so if a game ever destructures session
//     methods, this gate stops meaning anything and the trigger goes back to being prose.
//   - The indirect persist (gh#48). write() in src/shell/session.ts re-serialises the WHOLE record,
//     checkpoint field included, so every writer persists the checkpoint: setPlayers
//     (in src/pages/game/[id].astro's watduang:start handler) and markPlayed (all six games) each
//     write session.checkpoint back to storage. In five of those six files there is no
//     `.saveCheckpoint(` token to match on at all;
//     siamsi.ts is the exception and is the one file this scan already allows. Left unmatched on
//     purpose — those calls carry back the checkpoint their own closure loaded, which is the property
//     the chokepoint enforces, so matching them would turn six games red for a rule they keep
//     (ADR-0019's unearned-green inversion). What this costs: the gate counts saveCheckpoint call
//     sites, not games that can move the slot's contents.
//   - Anything outside the flat `src/games/*.ts` glob. A new checkpoint writer added in the shell
//     (as src/shell/PlayerSetup.astro already legitimately does) is invisible here by design, but so
//     would be a game that reaches the slot through a new shell helper.
//   - Whether one site-wide slot is still the right call. It only reports that ADR-0010's deferral
//     condition fired. The answer behind it is a product call (gh#24, 2026-08-19) that belongs to
//     the owner; nothing here re-derives it, and nothing here should be read as pre-approving a fix.
// Upgrade path when the first bullet stops being acceptable: the TypeScript AST, the way
// scripts/thai-comments.mjs resolves the same comment-vs-code question properly.

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));

const ALLOWED_FILE = 'src/games/siamsi.ts'; // the one game ADR-0010 already accounts for
const ADR_PATH = 'docs/adr/0010-checkpoint-slot-stays-site-wide-until-a-second-writer-exists.md';

// ---------------------------------------------------------------------------
// Pure: text -> text with comments removed. Same convention as
// scripts/stable-exit-markers-check.mjs — `//` and bare `/* */` count as comments only at the
// START of a line (leading whitespace allowed). A mid-line `//` or `/*` is far more often a URL,
// path or glob than a comment in this codebase, and a naive whole-line strip from a mid-line `//`
// has already shipped a fail-open bug in three other gates here; do not repeat it.
// ---------------------------------------------------------------------------
function stripComments(text) {
  return text
    .replace(/^[ \t]*\/\*[\s\S]*?\*\//gm, '') // block comments — LINE-START ONLY
    .replace(/^[ \t]*\/\/.*$/gm, ''); // line comments — LINE-START ONLY
}

// A live call is `saveCheckpoint(` reached through property access — `session.saveCheckpoint(` or
// `gameCtx?.session.saveCheckpoint(` — i.e. immediately preceded by a `.`. An interface/type member
// declaration (`saveCheckpoint(cp: Checkpoint | null): void;`, as in src/games/types.ts) is a bare
// identifier at the start of a member line, never preceded by a dot, so this does not match it.
const LIVE_CALL_RE = /\.\s*saveCheckpoint\s*\(/;

// ---------------------------------------------------------------------------
// Pure: {relPath, text}[] -> relPath[] of files (other than ALLOWED_FILE) with a live call.
// ---------------------------------------------------------------------------
function findSecondWriters(files) {
  const hits = [];
  for (const { relPath, text } of files) {
    if (relPath === ALLOWED_FILE) continue;
    if (LIVE_CALL_RE.test(stripComments(text))) hits.push(relPath);
  }
  return hits;
}

// Pure: {relPath}[] -> the reasons this scanned set cannot support the success sentence. Extracted
// so --selftest can calibrate the guard itself, not a re-implementation of it. No argv or env seam:
// nothing a caller could use to narrow or silence the scan.
function coverageGap(files) {
  const gaps = [];
  if (files.length === 0) gaps.push('src/games/*.ts matched zero files');
  if (!files.some((f) => f.relPath === ALLOWED_FILE)) gaps.push(`${ALLOWED_FILE} was not in the scanned set`);
  return gaps;
}

// ---------------------------------------------------------------------------
// IO: list src/games/*.ts (flat, non-recursive — that is the whole glob this gate is briefed
// against), relative to an arbitrary root so selftest can point this at a temp fixture tree.
// ---------------------------------------------------------------------------
function walkGamesFiles(root) {
  const dir = path.join(root, 'src/games');
  if (!fs.existsSync(dir)) return [];
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isFile() && entry.name.endsWith('.ts')) {
      const abs = path.join(dir, entry.name);
      out.push({ relPath: path.relative(root, abs).split(path.sep).join('/'), text: fs.readFileSync(abs, 'utf8') });
    }
  }
  return out;
}

function write(root, relPath, content) {
  const abs = path.join(root, relPath);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, content, 'utf8');
}

// ---------------------------------------------------------------------------
// Self-test: temp fixture tree under os.tmpdir(), never repo content. Both conditions
// calibrated both ways: a known-good tree passes, a known-bad tree fails on the planted defect.
// ---------------------------------------------------------------------------
function selftest() {
  const good = fs.mkdtempSync(path.join(os.tmpdir(), 'checkpoint-writer-good-'));
  const bad = fs.mkdtempSync(path.join(os.tmpdir(), 'checkpoint-writer-bad-'));
  try {
    // Known-good: siamsi.ts (the one allowed caller) calls it for real; _template.ts mentions it
    // only in prose comments (the real _template.ts idiom); types.ts carries the interface member
    // declaration, a bare identifier never preceded by a dot.
    write(good, 'src/games/siamsi.ts', [
      'function save(): void {',
      '  gameCtx?.session.saveCheckpoint(',
      '    toCheckpoint({ players, deck, holder, results, phase, drawn: drawnThisTurn }),',
      '  );',
      '}',
    ].join('\n'));
    write(good, 'src/games/_template.ts', [
      '  // ctx.session.checkpoint is ONE site-wide slot, shared by every game — not yours alone.',
      '  // saveCheckpoint() does not check ownership: calling it overwrites whatever another',
      '  // game left there, no warning. saveCheckpoint(null) / clear() empties it site-wide.',
      "  mount(stage: HTMLElement, ctx: GameContext) {",
      '    stage.textContent = String(ctx.session.players.length);',
      '  },',
    ].join('\n'));
    write(good, 'src/games/types.ts', ['interface Session {', '  saveCheckpoint(cp: Checkpoint | null): void;', '}'].join('\n'));

    const goodFiles = walkGamesFiles(good);
    assert.deepEqual(findSecondWriters(goodFiles), [], 'known-good fixture (siamsi call, template prose, types.ts declaration) must report zero second writers');
    console.log('PASS known-good fixture: siamsi.ts is the sole live caller; _template.ts prose and types.ts declaration are both ignored');

    // Known-bad: a second game, in this repo's real call idiom, actually calls it.
    write(bad, 'src/games/siamsi.ts', ['function save(): void {', '  gameCtx?.session.saveCheckpoint(x);', '}'].join('\n'));
    write(bad, 'src/games/timebomb.ts', ['function save(): void {', '  gameCtx?.session.saveCheckpoint(null);', '}'].join('\n'));

    const badFiles = walkGamesFiles(bad);
    const secondWriters = findSecondWriters(badFiles);
    assert.deepEqual(secondWriters, ['src/games/timebomb.ts'], 'known-bad fixture must flag exactly the planted second writer');
    console.log(`PASS known-bad fixture flags the planted second writer (${secondWriters[0]})`);

    // The one rule here is an ABSENCE, so an empty scanned set satisfies it for free. Measured, not
    // reasoned: moving src/games/ aside made the real script exit 0 while printing "siamsi.ts is the
    // sole live saveCheckpoint caller" — a claim about a file it had not read. Calibrated both ways,
    // and the known-good leg uses the same walk main() uses, so a guard that always fires fails here.
    assert.deepEqual(coverageGap(walkGamesFiles(good)), [], 'a real scanned set containing siamsi.ts must report no coverage gap');
    assert.deepEqual(coverageGap([]), ['src/games/*.ts matched zero files', `${ALLOWED_FILE} was not in the scanned set`], 'an empty scanned set must report both gaps');
    assert.deepEqual(
      coverageGap([{ relPath: 'src/games/timebomb.ts', text: '' }]),
      [`${ALLOWED_FILE} was not in the scanned set`],
      'a non-empty set that never read siamsi.ts must still report the gap the success sentence rests on',
    );
    console.log('PASS coverage guard calibrated both ways: a real set is clean; an empty set and a set missing siamsi.ts each report the gap that would otherwise print as a green');
  } finally {
    fs.rmSync(good, { recursive: true, force: true });
    fs.rmSync(bad, { recursive: true, force: true });
  }

  // The failure text is calibrated too, because it is the whole payload of a red run. The owner
  // closed gh#24 on 2026-08-19: one checkpoint slot site-wide is the settled answer, so the design
  // this gate used to order built is declined, not pending. Asserted as an ABSENCE — the old
  // wording is a closed, repo-owned set frozen in git history, so negating it converges and fails
  // safe. No positive assertion on the new wording: a grep for a phrase written in the same change
  // proves nothing. The one positive below is derived from the ADR_PATH constant, not retyped.
  const message = failureMessage(['src/games/timebomb.ts']);
  const DECLINED_ORDER_RE = /per-game keying|Build .*ADR-0010.*Decision|specced/i;
  // Known-bad leg FIRST. Without it the absence assertion below is one-way: a typo in the pattern
  // (`keyng`) would match nothing, the absence would hold vacuously, and the selftest would still
  // print PASS — this repo's "a guard that cannot fail" class. The fixture is the exact wording this
  // gate shipped with until 2026-08-19, frozen here so the pattern is calibrated against a real
  // known-bad input rather than against itself.
  const SHIPPED_UNTIL_2026_08_19 =
    "Build per-game keying as designed in ADR-0010's Decision section " +
    '(specced there, ~50 lines across 7 files) before shipping this game.';
  assert.match(
    SHIPPED_UNTIL_2026_08_19,
    DECLINED_ORDER_RE,
    'the declined-order pattern must still match the wording it was written to catch',
  );
  assert.doesNotMatch(
    message,
    DECLINED_ORDER_RE,
    'failure message must not order the per-game design the owner declined (gh#24, 2026-08-19)',
  );
  assert.ok(message.includes(ADR_PATH), 'failure message must name the ADR by path so a red run is traceable');
  console.log('PASS failure message names the ADR and carries none of the declined design order');
}

// ---------------------------------------------------------------------------
// Pure: relPath[] -> the exact text the gate prints when it fails. Extracted only so --selftest can
// calibrate the WORDING as well as the detection — this text is the entire product of a red run.
// A string getter, nothing else: no argv flag, no exit seam, nothing a caller could use to silence
// the scan.
// ---------------------------------------------------------------------------
function failureMessage(secondWriters) {
  return [
    ...secondWriters.map((relPath) => `${relPath}: calls saveCheckpoint — a second game now writes a checkpoint`),
    '',
    `${ADR_PATH}'s trigger condition has fired: a second checkpoint-writing game now exists, ` +
      "and the one shared slot will silently destroy the other game's in-progress round — no undo, " +
      'no message.',
    '',
    'This is not a work order. The site owner answered gh#24 on 2026-08-19: one checkpoint slot for ' +
      'the whole site is enough, and the alternative design in that ADR was DECLINED, not ' +
      'postponed — implementing it now would overturn a settled product call. Reopen gh#24 with the ' +
      'owner and get an answer before this game ships.',
  ].join('\n');
}

// ---------------------------------------------------------------------------
async function main() {
  if (process.argv.includes('--selftest')) return selftest();

  const files = walkGamesFiles(repoRoot);
  // ADR-0019: the only rule here is an ABSENCE ("no second writer"), which an empty scanned set
  // satisfies for free. Measured by moving src/games/ aside: exit 0, printing "siamsi.ts is the sole
  // live saveCheckpoint caller" over a set that contained no siamsi.ts and no files at all. The green
  // names siamsi.ts, so siamsi.ts has to have been read for it to be a claim rather than a sentence.
  const missing = coverageGap(files);
  if (missing.length) {
    console.error(
      `checkpoint-writer-check: ${missing.join(' and ')} — this gate's only rule is an absence, and an ` +
        'empty or incomplete set satisfies it vacuously (docs/adr/0019). Nothing was checked.',
    );
    process.exit(1);
  }

  const secondWriters = findSecondWriters(files);

  if (secondWriters.length > 0) {
    console.error(failureMessage(secondWriters));
    process.exit(1);
  }
  // The success sentence has to stay true after siamsi went solo (ADR-0040) and stopped writing a
  // checkpoint at all: ALLOWED_FILE names who is PERMITTED to call, which is what the ADR fixes, and
  // whether it actually does is read off the file rather than asserted. A gate printing a claim its
  // own scan no longer supports is worse than no gate.
  const allowed = files.find((f) => f.relPath === ALLOWED_FILE); // coverageGap above proved it is here
  const allowedCalls = LIVE_CALL_RE.test(stripComments(allowed.text));
  console.log(
    `checkpoint-writer-check: no second checkpoint writer across ${files.length} file(s) in src/games/*.ts — ` +
      `${ALLOWED_FILE} is the only file permitted to call saveCheckpoint and ` +
      (allowedCalls
        ? 'is the sole live caller'
        : 'makes no live call, so no game in src/games/*.ts writes a checkpoint'),
  );
}

await main();
