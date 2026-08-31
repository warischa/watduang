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
//   node scripts/checkpoint-writer-check.mjs             -> scan src/games/*.ts + src/play/** against the real tree
//   node scripts/checkpoint-writer-check.mjs --selftest  -> both-direction calibration on temp fixtures
//
// gh#170 — THE SCAN REACHES src/play/** NOW, and used not to. Every party game moved to a play route
// (ADR-0050 ruling 2), so for as long as this gate globbed src/games/*.ts alone, a second real
// checkpoint writer could land in a mockup and ship green: the trigger ADR-0010 defers on would have
// fired with nothing to report it. That is the whole of what this retarget buys.
//
// NO COMMENT STRIPPING, DELIBERATELY. This file used to run every candidate through stripComments()
// first. ADR-0055 / gh#167: a stripComments pass desynchronised on a quote-bearing regex literal and
// the gate that used it FAILED OPEN — and 7 files under src/play carry exactly such a literal, so
// importing that hazard here is importing a silent green. The scan is RAW, by extension. The cost is
// the opposite, safe direction: a comment that quotes one of the matched shapes is reported as if it
// were code. Measured on the real tree — 60 files, and the only two matches are a real interface
// declaration and a real stub, so the cost is currently zero. The one place stripComments was load-
// bearing was src/games/_template.ts, whose prose reads "...no warning. saveCheckpoint(null)..." and
// matched the OLD call pattern through the sentence's full stop and space; tightening that pattern to
// require the dot to touch the identifier (see LIVE_CALL_RE) removes the need for the stripper rather
// than trading one fail-open for another.

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
//   - Anything outside `src/games/*.ts` (flat) and `src/play/**` (recursive, .ts/.js/.mjs). A new
//     checkpoint writer added in the shell (as src/shell/PlayerSetup.astro already legitimately does)
//     is invisible here by design, but so would be a game that reaches the slot through a new shell
//     helper. `.astro` files are NOT scanned in either tree.
//   - A writer that never spells the identifier: `session['saveCheckpoint'](x)`, or a method reached
//     through a computed key. Same class as the destructuring escape above, same upgrade path.
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

// A live call is `saveCheckpoint(` reached through property access — `session.saveCheckpoint(` or
// `gameCtx?.session.saveCheckpoint(`. THE DOT MUST TOUCH THE IDENTIFIER. The previous pattern allowed
// whitespace after the dot (`\.\s*saveCheckpoint`), which is not a real call idiom any formatter in
// this repo produces, but IS what an English sentence looks like: src/games/_template.ts's prose
// "...no warning. saveCheckpoint(null) / clear()..." matched it, and only the comment stripper hid
// that. Tightening here is what lets the stripper go. A multi-line chain still matches, because
// prettier puts the dot on the continuation line touching the member (`session\n  .saveCheckpoint(`).
const LIVE_CALL_RE = /\.saveCheckpoint\s*\(/;

// A DEFINITION of saveCheckpoint rather than a call to one: the identifier NOT preceded by a dot or
// an identifier character, followed by a parameter list, an optional return-type annotation, and then
// the shape that says which kind it is. This is the escape the src/games-only glob could never see and
// that src/play makes reachable — a mockup can implement its own session object rather than call the
// shell's, and such an implementation has no dot anywhere near it.
//   `;` -> a TYPE MEMBER (src/games/types.ts's `saveCheckpoint(cp: Checkpoint | null): void;`).
//          Declares a contract, writes nothing, never a writer.
//   `{` -> an IMPLEMENTATION. It is a writer unless its body is provably empty.
const DEFINITION_RE = /(^|[^.\w$])saveCheckpoint\s*\([^)]*\)\s*(?::\s*[^;{]+?)?\s*([;{])/;
// An EMPTY body, and only an empty body: a brace pair containing nothing but whitespace. This is the
// one form where "does not write" is soundly decidable without a parser — there is no nesting to
// track and no statement to interpret. ANYTHING inside the braces, including a comment, falls through
// to being treated as a writer. That asymmetry is the point (see classify()).
const EMPTY_BODY_RE = /(^|[^.\w$])saveCheckpoint\s*\([^)]*\)\s*(?::\s*[^;{]+?)?\s*\{\s*\}/;

/**
 * Pure: one file's text -> what kind of saveCheckpoint site it holds, if any.
 *
 * gh#170 — HOW THE src/play/timebomb/main.ts STUB IS HANDLED, and why this is not looking away.
 * That file holds `saveCheckpoint(): void {}` — an implementation of the session interface whose body
 * is empty, i.e. a no-op that cannot move the shared slot's contents. Treating it as a writer would
 * red the tree today over a method that provably does nothing, and a gate that is red on a clean tree
 * gets suppressed. So it is classified `stub` and NAMED in the success line, never silently dropped.
 * The distinction is sound in exactly one direction, which is the safe one: an empty brace pair is
 * unambiguous, and the moment anyone puts a single statement — or even a comment — inside it, it stops
 * matching EMPTY_BODY_RE and is reported as a writer. The failure mode is over-reporting, which a
 * reader can dismiss; it is never a body that grew and stayed green.
 */
export function classify(text) {
  if (LIVE_CALL_RE.test(text)) return 'call';
  const def = DEFINITION_RE.exec(text);
  if (!def) return null;
  if (def[2] === ';') return 'type-member';
  return EMPTY_BODY_RE.test(text) ? 'stub' : 'implementation';
}

// ---------------------------------------------------------------------------
// Pure: {relPath, text}[] -> {relPath, kind}[] of files (other than ALLOWED_FILE) that write.
// A `call` and a non-empty `implementation` both write; a `type-member` and a `stub` do not.
// ---------------------------------------------------------------------------
function findSecondWriters(files) {
  const hits = [];
  for (const { relPath, text } of files) {
    if (relPath === ALLOWED_FILE) continue;
    const kind = classify(text);
    if (kind === 'call' || kind === 'implementation') hits.push({ relPath, kind });
  }
  return hits;
}

/** Pure: the non-writing definition sites, so a green names what it saw rather than what it assumed. */
function findStubs(files) {
  return files.filter((f) => classify(f.text) === 'stub').map((f) => f.relPath);
}

// Pure: {relPath}[] -> the reasons this scanned set cannot support the success sentence. Extracted
// so --selftest can calibrate the guard itself, not a re-implementation of it. No argv or env seam:
// nothing a caller could use to narrow or silence the scan.
function coverageGap(files) {
  const gaps = [];
  if (files.length === 0) gaps.push('src/games/*.ts and src/play/** matched zero files');
  if (!files.some((f) => f.relPath === ALLOWED_FILE)) gaps.push(`${ALLOWED_FILE} was not in the scanned set`);
  // gh#170 — src/play/** gets its own vacuity check. Without it, a walk that silently stopped
  // recursing (a renamed directory, a bad join) would go on printing a green sentence whose scope now
  // claims src/play, over a set that contained none of it. Every party game lives there, so this is
  // the larger half of the scanned tree, not an appendix.
  if (!files.some((f) => f.relPath.startsWith(`${PLAY_DIR}/`))) gaps.push(`${PLAY_DIR}/** was not in the scanned set`);
  return gaps;
}

// ---------------------------------------------------------------------------
// IO: the scanned set, relative to an arbitrary root so selftest can point this at a temp fixture
// tree. Two globs with different shapes, because the two trees have different shapes:
//   src/games/*.ts   — FLAT. One module per game, no subdirectories; unchanged from gh#24.
//   src/play/**      — RECURSIVE, .ts/.js/.mjs. A lifted mockup is a directory of mixed-extension
//                      modules (main.js beside roster-bridge.ts beside a .test.mjs), so an
//                      extension allow-list is the filter, not a filename convention. Tests are IN,
//                      deliberately: excluding them would create a name a real writer could hide
//                      behind, and a hit in a test is a loud false positive, which is the safe way
//                      round. .html and .css are out — neither can call a method.
// ---------------------------------------------------------------------------
const GAMES_DIR = 'src/games';
const PLAY_DIR = 'src/play';
const PLAY_EXT_RE = /\.(ts|js|mjs)$/;

function readInto(out, root, abs) {
  out.push({ relPath: path.relative(root, abs).split(path.sep).join('/'), text: fs.readFileSync(abs, 'utf8') });
}

function walkSourceFiles(root) {
  const out = [];
  const gamesDir = path.join(root, GAMES_DIR);
  if (fs.existsSync(gamesDir)) {
    for (const entry of fs.readdirSync(gamesDir, { withFileTypes: true })) {
      if (entry.isFile() && entry.name.endsWith('.ts')) readInto(out, root, path.join(gamesDir, entry.name));
    }
  }
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const abs = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(abs);
      else if (entry.isFile() && PLAY_EXT_RE.test(entry.name)) readInto(out, root, abs);
    }
  };
  const playDir = path.join(root, PLAY_DIR);
  if (fs.existsSync(playDir)) walk(playDir);
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
    // gh#170 — the play tree, in the two shapes it really holds today. The stub is the exact line
    // the session-object member in src/play/timebomb/main.ts. The regex literal is the gh#167 hazard: it
    // carries an unbalanced quote, which is what desynchronised a stripComments pass and made a gate
    // fail open. This scan is raw, so it must be indifferent to it — and a fixture that did not
    // contain one would not be testing that.
    write(good, 'src/play/timebomb/main.ts', [
      'const session = {',
      '  saveCheckpoint(): void {},',
      '};',
      "const APOSTROPHE_RE = /don't|it's/g;",
      'export default session;',
    ].join('\n'));
    write(good, 'src/play/wire-snip-panic/roster-bridge.ts', ['export const names = ["a", "b"];'].join('\n'));

    const goodFiles = walkSourceFiles(good);
    assert.deepEqual(findSecondWriters(goodFiles), [], 'known-good fixture (siamsi call, template prose, types.ts declaration, empty play stub) must report zero second writers');
    assert.deepEqual(findStubs(goodFiles), ['src/play/timebomb/main.ts'], 'the empty-bodied play stub must be classified as a stub and named, not silently dropped');
    assert.equal(classify('const APOSTROPHE_RE = /don\'t|it\'s/g;'), null, 'a quote-bearing regex literal must not perturb a raw scan (ADR-0055 / gh#167)');
    console.log('PASS known-good fixture: siamsi.ts is the sole live caller; _template.ts prose, types.ts declaration and the empty play stub are all correctly not-writers');

    // Known-bad: three DIFFERENT escapes, each of which shipped green before this retarget.
    write(bad, 'src/games/siamsi.ts', ['function save(): void {', '  gameCtx?.session.saveCheckpoint(x);', '}'].join('\n'));
    write(bad, 'src/games/timebomb.ts', ['function save(): void {', '  gameCtx?.session.saveCheckpoint(null);', '}'].join('\n'));
    // A real call, but under src/play — invisible to the old src/games-only glob.
    write(bad, 'src/play/dice-loser/main.js', ['function save() {', '  ctx.session.saveCheckpoint(state);', '}'].join('\n'));
    // A mockup implementing its OWN session method with a real body. There is no dot anywhere near
    // it, so no call-shaped pattern can see it; only the definition classifier can.
    write(bad, 'src/play/cursed-number/main.js', [
      'const session = {',
      '  saveCheckpoint(cp) {',
      '    localStorage.setItem("watduang:checkpoint", JSON.stringify(cp));',
      '  },',
      '};',
    ].join('\n'));

    const badFiles = walkSourceFiles(bad);
    const secondWriters = findSecondWriters(badFiles);
    assert.deepEqual(
      secondWriters.map((w) => `${w.relPath}:${w.kind}`).sort(),
      ['src/games/timebomb.ts:call', 'src/play/cursed-number/main.js:implementation', 'src/play/dice-loser/main.js:call'],
      'known-bad fixture must flag the planted second writer in src/games AND both play-route escapes, each with its kind',
    );
    console.log(`PASS known-bad fixture flags all ${secondWriters.length} planted writers: ${secondWriters.map((w) => `${w.relPath} (${w.kind})`).join(', ')}`);

    // The stub distinction is the one place this gate is lenient, so it is calibrated in the
    // direction that matters: a body that grows ANY content stops being a stub. Comment included —
    // this scan cannot read a comment as inert, and must not pretend otherwise.
    assert.equal(classify('  saveCheckpoint(): void {},'), 'stub', 'an empty brace pair is a stub');
    assert.equal(classify('  saveCheckpoint(): void { /* todo */ },'), 'implementation', 'a body holding only a comment must be reported as a writer, not assumed inert');
    assert.equal(classify('  saveCheckpoint(cp) { this.slot = cp; },'), 'implementation', 'a body with a statement is a writer');
    assert.equal(classify('  saveCheckpoint(cp: Checkpoint | null): void;'), 'type-member', 'an interface member declares a contract and writes nothing');
    assert.equal(classify('// no warning. saveCheckpoint(null) / clear() empties it site-wide,'), null, 'prose whose sentence puts a full stop before the identifier is not a call');
    console.log('PASS stub classifier calibrated both ways: only a provably empty body is exempt; a comment-only body is reported as a writer');

    // The one rule here is an ABSENCE, so an empty scanned set satisfies it for free. Measured, not
    // reasoned: moving src/games/ aside made the real script exit 0 while printing "siamsi.ts is the
    // sole live saveCheckpoint caller" — a claim about a file it had not read. Calibrated both ways,
    // and the known-good leg uses the same walk main() uses, so a guard that always fires fails here.
    assert.deepEqual(coverageGap(walkSourceFiles(good)), [], 'a real scanned set containing siamsi.ts must report no coverage gap');
    assert.deepEqual(
      coverageGap([]),
      ['src/games/*.ts and src/play/** matched zero files', `${ALLOWED_FILE} was not in the scanned set`, `${PLAY_DIR}/** was not in the scanned set`],
      'an empty scanned set must report every gap',
    );
    assert.deepEqual(
      coverageGap([{ relPath: 'src/games/timebomb.ts', text: '' }]),
      [`${ALLOWED_FILE} was not in the scanned set`, `${PLAY_DIR}/** was not in the scanned set`],
      'a non-empty set that never read siamsi.ts must still report the gap the success sentence rests on',
    );
    // gh#170 — the new half of the scope gets its own leg. A set that read all of src/games and none
    // of src/play is exactly what a silently-broken recursion produces, and it is the shape that used
    // to BE this gate, so it must not read as covered.
    assert.deepEqual(
      coverageGap([{ relPath: ALLOWED_FILE, text: '' }]),
      [`${PLAY_DIR}/** was not in the scanned set`],
      'a src/games-only set must report the src/play gap — that set is the pre-gh#170 gate, and it is not coverage',
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
  const describe = ({ relPath, kind }) =>
    kind === 'call'
      ? `${relPath}: calls saveCheckpoint — a second game now writes a checkpoint`
      : `${relPath}: defines saveCheckpoint with a non-empty body — a second game now writes a checkpoint. ` +
        'If that body in fact writes nothing, this gate cannot tell: it treats every implementation as a ' +
        'writer unless the brace pair is provably empty, and reports rather than guesses.';
  return [
    ...secondWriters.map(describe),
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

  const files = walkSourceFiles(repoRoot);
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
  const allowedCalls = LIVE_CALL_RE.test(allowed.text);
  const playCount = files.filter((f) => f.relPath.startsWith(`${PLAY_DIR}/`)).length;
  // Every number here comes from the same expression that produced the set it describes, and the
  // stubs are NAMED: a definition site this gate decided not to count is the one thing a reader has
  // to be able to re-check by hand, because it is the only place the scan chose leniency.
  const stubs = findStubs(files);
  console.log(
    `checkpoint-writer-check: no second checkpoint writer across ${files.length} file(s) ` +
      `(${files.length - playCount} in ${GAMES_DIR}/*.ts, ${playCount} in ${PLAY_DIR}/**) — ` +
      `${ALLOWED_FILE} is the only file permitted to call saveCheckpoint and ` +
      (allowedCalls ? 'is the sole live caller' : 'makes no live call, so no scanned file writes a checkpoint') +
      (stubs.length
        ? `. NOT COUNTED AS WRITERS, by name: ${stubs.join(', ')} — each defines saveCheckpoint with a provably ` +
          'empty body. Put anything at all between those braces and this gate reports it as a writer.'
        : ''),
  );
}

await main();
