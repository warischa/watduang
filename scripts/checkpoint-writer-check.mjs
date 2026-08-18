#!/usr/bin/env node
// Static tripwire for docs/adr/0010-checkpoint-slot-stays-site-wide-until-a-second-writer-exists.md.
// ADR-0010 deliberately keeps ONE site-wide checkpoint slot instead of per-game keying, and its own
// "fact that would change this" names the exact trigger: a second checkpoint-writing game entering
// the manifest. At that moment the shared slot becomes a silent, unrecoverable data-loss bug — game
// B's save destroys game A's in-progress round, no undo, no message (gh#24). Today that trigger is
// enforced only by a prose comment in src/games/_template.ts. This script replaces the prose with a
// gate: siamsi.ts is the one allowed caller, closed, and growing the set needs an ADR, not a skip-list.
//
//   node scripts/checkpoint-writer-check.mjs             -> scan src/games/*.ts against the real tree
//   node scripts/checkpoint-writer-check.mjs --selftest  -> both-direction calibration on temp fixtures

//
// ponytail: a source scan, and these are the things it provably does NOT see. Measured, not guessed:
//   - An aliased or destructured call. `const { saveCheckpoint } = gameCtx.session; saveCheckpoint(x)`
//     passes clean — verified by planting exactly that. The matcher needs the `.saveCheckpoint(`
//     property access. This is the likeliest real escape, so if a game ever destructures session
//     methods, this gate stops meaning anything and the trigger goes back to being prose.
//   - Anything outside the flat `src/games/*.ts` glob. A new checkpoint writer added in the shell
//     (as src/shell/PlayerSetup.astro already legitimately does) is invisible here by design, but so
//     would be a game that reaches the slot through a new shell helper.
//   - Whether per-game keying is CORRECT. It only reports that ADR-0010's deferral condition fired.
//     The design it points at is still just a design; nothing here validates it.
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
  } finally {
    fs.rmSync(good, { recursive: true, force: true });
    fs.rmSync(bad, { recursive: true, force: true });
  }
}

// ---------------------------------------------------------------------------
async function main() {
  if (process.argv.includes('--selftest')) return selftest();

  const files = walkGamesFiles(repoRoot);
  const secondWriters = findSecondWriters(files);

  if (secondWriters.length > 0) {
    for (const relPath of secondWriters) {
      console.error(`${relPath}: calls saveCheckpoint — a second game now writes a checkpoint`);
    }
    console.error(
      `\n${ADR_PATH}'s deferral condition has fired: its decision was to keep ONE site-wide ` +
        'checkpoint slot only until a second checkpoint-writing game existed. That game now exists. ' +
        "One site-wide slot will silently destroy the other game's in-progress round — no undo, no " +
        "message (gh#24). Build per-game keying as designed in ADR-0010's " +
        'Decision section ' +
        '(specced there, ~50 lines across 7 files) before shipping this game.',
    );
    process.exit(1);
  }
  console.log(`checkpoint-writer-check: ${ALLOWED_FILE} is the sole live saveCheckpoint caller in src/games/*.ts`);
}

await main();
