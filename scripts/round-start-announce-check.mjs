#!/usr/bin/env node
// gh#121 — a game module cannot start a live round without announcing it.
//
// The harm: the shell's leave-confirm (src/shell/LeaveConfirm.astro, ADR-0015) asks before a
// mid-round navigation. A party page hands it the fact structurally — #player-setup exists and its
// `hidden` flips when the round starts. An ADR-0040 solo page ([1, 1]) renders no panel, so the only
// carrier is the game module's own announcement. Miss it and the guard fails OPEN: a player mid-round
// taps a link, loses the round, no confirm, and nothing goes red. That is the shape gh#106 fixed once
// already, from the other direction.
//
// What makes this gate decidable at all: "does this module start a round" is NOT sniffed out of the
// source. Every GameModule declares `startsRound` (src/games/types.ts), a required field, so `tsc`
// reds on a new module that never answered — the hazardous set is owned by the module author, and
// this script only enforces the consequence of the answer. A checker that had to infer round-ness
// from source would be guessing at a set nobody owns, and would converge on nothing.
//
//   node scripts/round-start-announce-check.mjs             -> scan the real manifest + src/games/
//   node scripts/round-start-announce-check.mjs --selftest  -> both-direction calibration, in memory
//
// The five rules, and why each one is not redundant:
//   (a) startsRound must be a boolean. Types are erased when node runs manifest.ts, so a module
//       written in JS, or reached through `any`, can still arrive without it.
//   (b) a non-solo page must declare true — the setup panel starts a round there by construction, so
//       `false` on a party page is a false declaration, and it is the value that would silence rule
//       (c) forever if that page later dropped its panel. Without (b), `true` on the three party
//       pages would be a field value nothing checks.
//   (c) a solo page declaring true must import announceRoundStarted from _round-start.ts AND call it.
//   (d) a solo page declaring false must NOT call it, and must write no mid-round checkpoint — a
//       game with state worth resuming after a refresh has state worth confirming before a
//       navigation. This is the one rule that can catch a WRONG declaration rather than a missing
//       call, and it is the realistic mistake: a new solo page copies daily-fortune's `false`.
//   (e) no game module may dispatch the event name as a literal. That is the bypass leg: a literal
//       re-typed in a module passes any "the string is present" grep while being exactly one typo
//       away from a silent, permanent loss of the guard. The name has one definition, and both sides
//       import it, so a mismatch is a `tsc` error.
//   (f) the listener side must import the same constant. Cutting the chain at the shell end is the
//       same failure with the same silence.
//
// ponytail: a source scan, and these are the things it provably does NOT see. Measured against the
// real tree, not guessed:
//   - A module that declares `startsRound: true`, calls announceRoundStarted, and calls it on the
//     WRONG path — after the round ends, or only on the fresh-start path while the resume path stays
//     quiet. The gate proves the call exists in the file; siamsi's two per-module unit tests
//     (src/games/siamsi.test.mjs) are what prove the timing, and a new solo game needs its own.
//   - A solo page that declares `false`, truly starts a round, and keeps no checkpoint. Rule (d)'s
//     proxy is checkpoint-writing; a round held only in memory is invisible to it. This is the
//     residual hole and it is a declaration lie, not an omission — the field is the seam where a
//     human is asked, and no static check can tell whether the answer was honest.
//   - An aliased call (`const a = announceRoundStarted; a()`) or an aliased dispatch. Same known
//     ceiling as scripts/checkpoint-writer-check.mjs, same upgrade path if it ever stops being
//     acceptable: the TypeScript AST, the way scripts/thai-comments.mjs resolves code-vs-comment
//     properly.
//   - Anything outside the manifest. A module not in `games` builds no page, so it carries no risk
//     here; _template.ts is likewise unscanned, and its own comment is what carries the rule to the
//     next game.

import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const PRIMITIVE_FILE = 'src/games/_round-start.ts';
const LISTENER_FILE = 'src/shell/LeaveConfirm.astro';
const EVENT_NAME = 'watduang:round-started';

// ---------------------------------------------------------------------------
// Pure: text -> text with comments removed. Same convention as scripts/checkpoint-writer-check.mjs —
// `//` and bare `/* */` count as comments only at the START of a line. A mid-line strip has already
// shipped a fail-open bug in three other gates in this repo; do not repeat it. The direction that
// matters here is that a commented-out announcement must not satisfy rule (c), and the header prose
// above (which names both the function and the event) must not satisfy anything at all.
// ---------------------------------------------------------------------------
function stripComments(text) {
  return text
    .replace(/^[ \t]*\/\*[\s\S]*?\*\//gm, '') // block comments — LINE-START ONLY
    .replace(/^[ \t]*\/\/.*$/gm, ''); // line comments — LINE-START ONLY
}

const IMPORT_RE = /import\s*\{[^}]*\bannounceRoundStarted\b[^}]*\}\s*from\s*['"]\.\/_round-start(?:\.ts)?['"]/;
const CALL_RE = /\bannounceRoundStarted\s*\(/;

// gh#121 gate-bypass fix: `stripComments` only removes LINE-START comments (by design — see the block
// above), so `realCall(); // announceRoundStarted()` survives it and still matches CALL_RE against the
// whole line. Scoped to the CALL check only, not to `stripComments` itself: widening stripComments to
// eat mid-line text is the exact mistake its own comment warns against (a mid-line strip already shipped
// a fail-open bug in three other gates here), and rules (a)/(b)/(d)/(e)/(f) never asked for that risk.
// Per line, only the text before the first `//` counts as code for THIS check.
function hasRealCall(source) {
  return stripComments(source)
    .split('\n')
    .some((line) => {
      const slashIdx = line.indexOf('//');
      const codePart = slashIdx === -1 ? line : line.slice(0, slashIdx);
      return CALL_RE.test(codePart);
    });
}
// A checkpoint write whose argument is not `null` — that is a MID-ROUND save. `saveCheckpoint(null)`
// is the opposite (a round ending, clearing the slot) and must not count. Whitespace class includes
// newlines on purpose: siamsi wraps its real call across two lines, and a single-line pattern would
// have missed the only true positive in the tree.
const MIDROUND_SAVE_RE = /\.saveCheckpoint\(\s*(?!null\s*\))\S/;
const EVENT_LITERAL_RE = new RegExp(`['"\`]${EVENT_NAME}['"\`]`);

/** A [1, 1] page renders no #player-setup — the exact condition src/layouts/GameLayout.astro uses to
 *  decide whether to render the panel. Solo-ness is derived from the manifest here rather than
 *  re-declared, so the two cannot drift: the day that layout condition changes, this does too. */
function isSolo(players) {
  return Array.isArray(players) && players[0] === 1 && players[1] === 1;
}

/**
 * modules: [{ id, players, startsRound, source }] — source is the module's own file text.
 * listenerSource: the text of the shell island that listens.
 * Returns an array of violation strings; empty means clean.
 */
export function analyze(modules, listenerSource) {
  const violations = [];
  // ADR-0019: every rule below is per-module, so an empty set satisfies all of them vacuously and the
  // success line would report OK having checked nothing. An empty manifest is not a clean manifest.
  if (!Array.isArray(modules) || modules.length === 0) {
    return [
      'src/games/manifest.ts: the scanned set is empty — with zero modules every rule in this gate ' +
        'passes vacuously and a round-starting page could ship unannounced while this reports OK ' +
        '(docs/adr/0019).',
    ];
  }

  for (const mod of modules) {
    const where = `src/games/${mod.id}.ts`;
    const code = stripComments(mod.source ?? '');
    const announces = hasRealCall(mod.source ?? '');
    const solo = isSolo(mod.players);

    // (a)
    if (typeof mod.startsRound !== 'boolean') {
      violations.push(
        `${where}: game "${mod.id}" declares startsRound = ${JSON.stringify(mod.startsRound)} — it ` +
          'must be a boolean. Every GameModule answers whether playing it puts the page into a live ' +
          'round; that declaration is what this gate enforces, and without it nothing here can run.',
      );
      continue; // every rule below reads the declaration — reporting them too would be noise
    }

    // (b)
    if (!solo && mod.startsRound !== true) {
      violations.push(
        `${where}: game "${mod.id}" declares players [${mod.players}] and startsRound = false — a ` +
          'page that renders #player-setup starts a round by construction (the panel does it), so ' +
          'false is a false declaration here.',
      );
    }

    // (c)
    if (solo && mod.startsRound === true) {
      if (!IMPORT_RE.test(code)) {
        violations.push(
          `${where}: game "${mod.id}" declares startsRound = true on a [1, 1] page but does not ` +
            `import announceRoundStarted from './_round-start.ts' — that page renders no ` +
            '#player-setup, so the shell has no bit to read and the leave-confirm never arms: a ' +
            'player mid-round taps a link and loses the round with no confirm (gh#121).',
        );
      }
      if (!announces) {
        violations.push(
          `${where}: game "${mod.id}" declares startsRound = true on a [1, 1] page but never calls ` +
            'announceRoundStarted() — call it at every entry into a live round, a fresh start and a ' +
            'resumed checkpoint both, or the leave-confirm stays silent for the life of the page ' +
            '(gh#121).',
        );
      }
    }

    // (d)
    if (solo && mod.startsRound === false) {
      if (announces) {
        violations.push(
          `${where}: game "${mod.id}" declares startsRound = false but calls announceRoundStarted() ` +
            '— one of the two is wrong. Announcing arms the leave-confirm, so a reader who has ' +
            'touched nothing would be asked about a round that does not exist (the defect gh#106 ' +
            'removed).',
        );
      }
      if (MIDROUND_SAVE_RE.test(code)) {
        violations.push(
          `${where}: game "${mod.id}" declares startsRound = false but writes a mid-round checkpoint ` +
            '— state worth resuming after a refresh is state worth confirming before a navigation. ' +
            'Either the declaration is wrong (make it true and announce), or the write is.',
        );
      }
    }

    // (e)
    if (EVENT_LITERAL_RE.test(code)) {
      violations.push(
        `${where}: game "${mod.id}" spells the event name "${EVENT_NAME}" as a literal — import ` +
          `ROUND_STARTED_EVENT (or call announceRoundStarted) from './_round-start.ts' instead. A ` +
          'retyped literal is one typo away from a guard that is silently gone, and a typo in a ' +
          'literal is invisible to every test on both sides.',
      );
    }
  }

  // (f)
  const listener = stripComments(listenerSource ?? '');
  const importsConstant =
    /import\s*\{[^}]*\bROUND_STARTED_EVENT\b[^}]*\}\s*from\s*['"][^'"]*_round-start(?:\.ts)?['"]/.test(listener);
  const listensOnConstant = /addEventListener\(\s*ROUND_STARTED_EVENT\b/.test(listener);
  if (!importsConstant || !listensOnConstant) {
    violations.push(
      `${LISTENER_FILE}: the leave-confirm must import ROUND_STARTED_EVENT from ${PRIMITIVE_FILE} and ` +
        'listen on it (addEventListener(ROUND_STARTED_EVENT, ...)) — ' +
        `${!importsConstant ? 'the import is missing' : 'the import is there but nothing listens on it'}` +
        '. Every solo game announcing correctly still loses the guard if this end is cut, and a ' +
        'literal here can drift from the one the games dispatch without either side going red.',
    );
  }

  return violations;
}

// ---------------------------------------------------------------------------
// Self-test: in-memory fixtures only, calibrated in BOTH directions — one known-bad per rule, and a
// known-good that would catch a selftest which always fails. Fixture sources mimic how a real module
// is written (a full import block, a real call site) rather than a bare token, because a token-shaped
// fixture can pass a matcher the real file would fail.
// ---------------------------------------------------------------------------
function selftest() {
  const goodListener = [
    '<script>',
    "  import { ROUND_STARTED_EVENT } from '../games/_round-start';",
    '  let roundStarted = false;',
    '  document.addEventListener(ROUND_STARTED_EVENT, () => { roundStarted = true; });',
    '</script>',
  ].join('\n');

  const soloAnnouncing = () => ({
    id: 'solo-announcing',
    players: [1, 1],
    startsRound: true,
    source: [
      "import { armAllButtons } from './_arm-gate.ts';",
      "import { announceRoundStarted } from './_round-start.ts';",
      'function startRound(): void {',
      "  phase = 'turn';",
      '  announceRoundStarted();',
      '  gameCtx?.session.saveCheckpoint(toCheckpoint(state));',
      '}',
    ].join('\n'),
  });
  const soloQuiet = () => ({
    id: 'solo-quiet',
    players: [1, 1],
    startsRound: false,
    source: [
      "import { armAllButtons } from './_arm-gate.ts';",
      'function renderAnswer(): void {',
      '  stage.replaceChildren(answerEl);',
      '}',
    ].join('\n'),
  });
  const partyGame = () => ({
    id: 'party-game',
    players: [2, 10],
    startsRound: true,
    source: "import { armAllButtons } from './_arm-gate.ts';\n",
  });
  const goodSet = () => [soloAnnouncing(), soloQuiet(), partyGame()];

  // --- known-good: guards against a selftest that always fails. ---
  assert.deepEqual(analyze(goodSet(), goodListener), [], 'the three shipped shapes must report zero violations');
  console.log('PASS known-good: an announcing solo page, a round-less solo page and a party page report zero violations');

  // --- (a) known-bad: the declaration is missing entirely (a JS module, or one reached through any).
  const noField = goodSet();
  delete noField[0].startsRound;
  const aOut = analyze(noField, goodListener);
  assert.equal(aOut.length, 1, `(a) expected exactly one violation, got ${aOut.length}`);
  assert.match(aOut[0], /solo-announcing.*startsRound = undefined.*must be a boolean/s, '(a) must name the module and the field');
  console.log('PASS (a) known-bad: a module with no startsRound declaration is flagged and named');

  // --- (b) known-bad: a party page declaring it starts no round.
  const partyFalse = goodSet();
  partyFalse[2].startsRound = false;
  const bOut = analyze(partyFalse, goodListener);
  assert.equal(bOut.length, 1, `(b) expected exactly one violation, got ${bOut.length}`);
  assert.match(bOut[0], /party-game.*starts a round by construction/s, '(b) must name the party module');
  console.log('PASS (b) known-bad: a party page declaring startsRound = false is flagged and named');

  // --- (c) known-bad: THE FAILURE THIS GATE EXISTS FOR — a solo page that starts a round and never
  // announces it. Written the way the mistake really happens: the module is complete and correct
  // apart from the import and the one call.
  const forgot = goodSet();
  forgot[0].source = forgot[0].source
    .replace("import { announceRoundStarted } from './_round-start.ts';\n", '')
    .replace('  announceRoundStarted();\n', '');
  const cOut = analyze(forgot, goodListener);
  assert.equal(cOut.length, 2, `(c) expected the import and the call violation, got ${cOut.length}`);
  assert.ok(cOut.every((v) => v.includes('solo-announcing')), '(c) every violation must name the offending module');
  assert.match(cOut.join('\n'), /never calls announceRoundStarted\(\)/, '(c) must say the call is missing');
  console.log('PASS (c) known-bad: a solo page that starts a round without announcing is flagged and named');

  // --- (c) same file, comment-only announcement: a commented-out call must not satisfy the rule, or
  // this gate is one `//` away from green while the guard is gone.
  const commentedOut = goodSet();
  commentedOut[0].source = commentedOut[0].source.replace('  announceRoundStarted();', '  // announceRoundStarted();');
  const cCommentOut = analyze(commentedOut, goodListener);
  assert.equal(cCommentOut.length, 1, `(c) commented-out call: expected one violation, got ${cCommentOut.length}`);
  assert.match(cCommentOut[0], /solo-announcing.*never calls announceRoundStarted/s, '(c) a commented-out call must still count as missing');
  console.log('PASS (c) known-bad: a commented-out announcement does not satisfy the rule');

  // --- (c) same file, MID-LINE trailing comment: the real call is deleted but a later statement
  // carries `// announceRoundStarted()` as a trailing comment (not line-start). This is the gh#121
  // gate-bypass a review found — CALL_RE ran against text where only LINE-START comments were
  // stripped, so a mid-line mention kept the rule green while the guard was gone. The import stays in
  // place on purpose: that is what makes this the live bypass and not just another (a)-shaped miss.
  const midLineCommentBypass = goodSet();
  midLineCommentBypass[0].source = midLineCommentBypass[0].source
    .replace('  announceRoundStarted();\n', '')
    .replace(
      '  gameCtx?.session.saveCheckpoint(toCheckpoint(state));',
      '  gameCtx?.session.saveCheckpoint(toCheckpoint(state)); // announceRoundStarted()',
    );
  const midLineOut = analyze(midLineCommentBypass, goodListener);
  assert.equal(midLineOut.length, 1, `(c) mid-line comment bypass: expected one violation, got ${midLineOut.length}`);
  assert.match(
    midLineOut[0],
    /solo-announcing.*never calls announceRoundStarted/s,
    '(c) a mid-line trailing comment must not satisfy the call rule',
  );
  console.log('PASS (c) known-bad: a real call deleted but only mentioned in a same-line trailing comment does not satisfy the rule (gh#121 mid-line-comment bypass)');

  // --- (d) known-bad: the realistic wrong declaration — a solo page copies the round-less `false`
  // while keeping a mid-round checkpoint. Nothing is missing from the source; the ANSWER is wrong.
  const lying = goodSet();
  lying[1].startsRound = false;
  lying[1].source += '\ngameCtx?.session.saveCheckpoint(toCheckpoint(state));\n';
  const dOut = analyze(lying, goodListener);
  assert.equal(dOut.length, 1, `(d) expected exactly one violation, got ${dOut.length}`);
  assert.match(dOut[0], /solo-quiet.*writes a mid-round checkpoint/s, '(d) must name the module');
  console.log('PASS (d) known-bad: a solo page declaring startsRound = false while saving a mid-round checkpoint is flagged and named');

  // --- (d) calibration the other way: saveCheckpoint(null) is a round ENDING, not a mid-round save.
  // Without this leg rule (d) would red every game that clears the slot, which is the correct thing
  // for a round-less page to do.
  const clears = goodSet();
  clears[1].source += '\ngameCtx?.session.saveCheckpoint(null);\n';
  assert.deepEqual(analyze(clears, goodListener), [], '(d) saveCheckpoint(null) must not count as a mid-round save');
  console.log('PASS (d) known-good: saveCheckpoint(null) — a round ending — is not read as a mid-round save');

  // --- (d) known-bad, second half: announcing while declaring false re-creates gh#106's over-arm.
  const overArm = goodSet();
  overArm[1].source = overArm[1].source.replace(
    'function renderAnswer',
    "import { announceRoundStarted } from './_round-start.ts';\nfunction renderAnswer",
  ) + '\nannounceRoundStarted();\n';
  const overArmOut = analyze(overArm, goodListener);
  assert.equal(overArmOut.length, 1, `(d) over-arm: expected one violation, got ${overArmOut.length}`);
  assert.match(overArmOut[0], /solo-quiet.*declares startsRound = false but calls announceRoundStarted/s, '(d) must name the module');
  console.log('PASS (d) known-bad: a round-less page that announces anyway is flagged and named');

  // --- (e) known-bad: the bypass. The module dispatches the event itself, so a "the string is
  // present" grep would be satisfied while the shared constant is bypassed.
  const bypass = goodSet();
  bypass[0].source = bypass[0].source.replace(
    '  announceRoundStarted();',
    `  document.dispatchEvent(new CustomEvent('${EVENT_NAME}'));`,
  );
  const eOut = analyze(bypass, goodListener);
  assert.ok(eOut.some((v) => v.includes('spells the event name')), '(e) a literal dispatch must be flagged');
  assert.ok(eOut.every((v) => v.includes('solo-announcing')), '(e) every violation must name the offending module');
  console.log('PASS (e) known-bad: a module dispatching the event name as a literal is flagged and named');

  // --- (f) known-bad, both halves: the listener end of the chain.
  const noImport = analyze(goodSet(), goodListener.replace("  import { ROUND_STARTED_EVENT } from '../games/_round-start';\n", ''));
  assert.equal(noImport.length, 1, `(f) expected one violation, got ${noImport.length}`);
  assert.match(noImport[0], /LeaveConfirm\.astro.*the import is missing/s, '(f) must name the listener file');
  const literalListener = goodListener.replace('addEventListener(ROUND_STARTED_EVENT', `addEventListener('${EVENT_NAME}'`);
  const fOut = analyze(goodSet(), literalListener);
  assert.equal(fOut.length, 1, `(f) expected one violation, got ${fOut.length}`);
  assert.match(fOut[0], /nothing listens on it/, '(f) an imported-but-unused constant must still fail');
  console.log('PASS (f) known-bad: a listener that does not listen on the shared constant is flagged');

  // --- empty set: the vacuous-green guard.
  const emptyOut = analyze([], goodListener);
  assert.equal(emptyOut.length, 1, 'an empty scanned set must be a violation, not a clean run');
  assert.match(emptyOut[0], /passes vacuously/, 'the empty-set violation must say why');
  console.log('PASS ADR-0019: an empty scanned set is a violation, not a vacuous green');

  console.log('round-start-announce-check --selftest: all rules calibrated in both directions');
}

async function main() {
  if (process.argv.includes('--selftest')) {
    selftest();
    return;
  }

  const { games } = await import(new URL('../src/games/manifest.ts', import.meta.url).href);
  const modules = games.map((g) => {
    const file = path.join(repoRoot, 'src/games', `${g?.id}.ts`);
    return {
      id: g?.id,
      players: g?.players,
      startsRound: g?.startsRound,
      // A missing file is validate-games.mjs's rule, not this one — read as empty and let the
      // announcement rules report against it rather than crashing on a half-added game.
      source: fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '',
    };
  });
  const listenerSource = fs.readFileSync(path.join(repoRoot, LISTENER_FILE), 'utf8');

  const violations = analyze(modules, listenerSource);
  if (violations.length > 0) {
    for (const v of violations) console.error(`::error::${v}`);
    console.error(
      `\ngh#121: ${violations.length} violation(s). A page that starts a live round must announce it ` +
        `through ${PRIMITIVE_FILE}, or the leave-confirm (ADR-0015) fails open and a mid-round tap on ` +
        'a link loses the round with no confirm.',
    );
    process.exit(1);
  }

  // Every number here traces to an expression over the real manifest — not a length of the target
  // list. The two counts are named separately because they are checked by DIFFERENT rules, and a
  // green that lumped them would imply coverage rule (b) never earns.
  const solo = modules.filter((m) => isSolo(m.players));
  const announcing = solo.filter((m) => m.startsRound === true).map((m) => m.id);
  const roundless = solo.filter((m) => m.startsRound === false).map((m) => m.id);
  console.log(
    `round-start-announce-check: ${modules.length} manifest module(s) declare startsRound; ` +
      `${announcing.length} panel-less page(s) start a round and announce it ` +
      `[${announcing.join(', ') || 'none'}]; ${roundless.length} declare no round and stay silent ` +
      `[${roundless.join(', ') || 'none'}]; ${modules.length - solo.length} party page(s) carry the ` +
      `bit on #player-setup; ${LISTENER_FILE} listens on the shared constant`,
  );
}

await main();
