#!/usr/bin/env node
// gh#121 — a game module cannot start a live round without announcing it.
//
// The harm: the shell's leave-confirm (src/shell/LeaveConfirm.astro, ADR-0015) asks before a
// mid-round navigation. An ADR-0040 solo page ([1, 1]) renders no setup panel, so the only carrier is
// the game module's own announcement. Miss it and the guard fails OPEN: a player mid-round taps a
// link, loses the round, no confirm, and nothing goes red. That is the shape gh#106 fixed once
// already, from the other direction.
//
// And the OTHER half of "announce": a round that starts must be announced to the PLAYER too, on the
// surface they are looking at. On a play route that means a live region — the round changes under a
// screen-reader user with nothing spoken otherwise. Rule (g) below owns that, per route DIRECTORY.
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
// The rules, and why each one is not redundant:
//   (a) startsRound must be a boolean. Types are erased when node runs manifest.ts, so a module
//       written in JS, or reached through `any`, can still arrive without it.
//   (b) DELETED (gh#170). It required a non-solo page to declare true, on the premise that "the page
//       renders #player-setup, and the panel starts a round by construction". That premise is dead:
//       every non-solo game in the manifest now ships a `playRoute`, and a PLAY ROUTE RENDERS NO
//       #player-setup at all — the setup panel is a shell-only mounting pattern
//       (see src/shell/PlayExit.astro's header for why the shell and the route are separate layers).
//       So the rule rested on a panel that is not on the page it was judging: it could only ever pass,
//       and it made this gate LOOK like it covered the party category while measuring nothing there.
//       Rule (g) replaces it with a property of the route itself.
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
//   (g) gh#170 — a play-route DIRECTORY whose module declares startsRound: true must contain a live
//       region (aria-live, or role="status"/role="alert") that ships EMPTY and carries an id, and one
//       of that directory's own scripts must resolve that id. Deliberately a PROPERTY OF THE ROUTE,
//       not a mechanism: mandating a shared helper (the shape rule (c) uses for src/games) lets a
//       route import the helper and still announce nothing, and no play route uses _round-start.ts —
//       they are separate documents, not shell-mounted modules. The set is "route directories whose
//       manifest entry declares startsRound: true", which the manifest owns and this repo authors, so
//       it converges: a twelfth port joins it the day its module declares a playRoute.
//       Why EMPTY and why the id: a live region shipping fixed prose is a static message, not an
//       announcement channel — measured 2026-08-31, src/play/how-close-is-near/main.js builds a
//       role="alert" banner with its text baked in, which announces a rejected input and never a
//       round. An empty region plus a script that resolves it is the observable shape every route
//       that DOES announce already has (dice-loser #dl-live, timebomb #tb-live, short-stick
//       #stick-live, power-meter #sr-announcer, pinocchio-luck #announcer).
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
//   - Rule (g) proves the CHANNEL exists and that the route's own code resolves it. It does NOT
//     prove the write happens on the round-start path: a route could resolve #live and only ever
//     write "หมดเวลา" to it. Proving the path needs the route executed, which is a probe's job
//     (src/play/<id>/*-probe.mjs), not a source scan's. What (g) does close is the shape that
//     actually shipped — no live region in the directory at all, on 6 of 11 routes (measured
//     2026-08-31).
//   - Rule (b)'s deletion leaves a residue: a play route that declares startsRound: FALSE is now
//     checked by nothing here — (g) keys off the declaration being true. That is the same
//     declaration-lie hole rule (d) discloses for solo pages, and it has the same seam: the field is
//     where a human is asked.
//   - Anything outside the manifest. A module not in `games` builds no page, so it carries no risk
//     here; _template.ts is likewise unscanned, and its own comment is what carries the rule to the
//     next game.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
// ONE classifier for the whole repo's gates, not a second copy (ADR-0046 owns the design; that file
// owns the code). Importing it is side-effect-free: js-motion-guard-check.mjs runs its main() behind
// an isEntryPoint() guard, pinned by a spawn leg in its own selftest.
import { matchesInCode } from './js-motion-guard-check.mjs';

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

/** A [1, 1] game: one person, one answer, no roster (ADR-0040). Solo-ness is derived from the
 *  manifest rather than re-declared, so the two cannot drift. Rules (c) and (d) are scoped to these
 *  because they are about the shell-mounted src/games module. This function no longer stands for
 *  "renders no #player-setup": deleted rule (b) leaned on that reading, and it is false for the
 *  non-solo games, which are all play routes and render no such panel either. */
function isSolo(players) {
  return Array.isArray(players) && players[0] === 1 && players[1] === 1;
}

// --- rule (g): the play-route region -----------------------------------------------------------
const PLAY_EXTS = new Set(['.js', '.ts', '.html']);
const PLAY_ROUTE_RE = /^\/game\/([^/]+)\/play\/?$/;

/** The route id a manifest entry declares, or undefined. */
export const playRouteId = (game) => PLAY_ROUTE_RE.exec(game?.playRoute ?? '')?.[1];

// An EMPTY live-region element with an id: an opening tag carrying aria-live (or role="status" /
// role="alert"), then its own closing tag with nothing but whitespace between. Matched against the
// file RAW, in .html and in .js alike — several routes build their markup inside a template literal,
// so a strip-then-match pipeline would have to parse JS to find markup that is plain text here.
// Raw is safe in THIS direction for the same reason it is not for a guard: a match here is what the
// rule REQUIRES, and the only way raw over-reads is a live region sitting in a comment — which reds
// nothing and is caught the moment its id is looked for in a script (the second half of the rule).
const LIVE_REGION_RE = /<(\w+)\b([^>]*?(?:aria-live|role\s*=\s*["'](?:status|alert)["'])[^>]*?)>\s*<\/\1>/gi;
const ID_ATTR_RE = /\bid\s*=\s*["']([^"']+)["']/i;

/** [{id, startsRound, files:[{name,text}]}] for every manifest game declaring a playRoute, plus the
 *  ids whose directory is missing. `root` is the override the selftest points at a fixture tree —
 *  the same shape walkGamesFiles/listPlayFiles use in the other gates, so no env knob exists that
 *  could narrow a real run. A declared route with no directory is REPORTED, never skipped. */
export function readPlayRoutes(root, games) {
  const routes = [];
  const missingDirs = [];
  for (const game of games ?? []) {
    const id = playRouteId(game);
    if (!id) continue;
    const dir = path.join(root, 'src/play', id);
    if (!fs.existsSync(dir)) {
      missingDirs.push(id);
      continue;
    }
    const files = fs
      .readdirSync(dir)
      .sort()
      .filter((name) => PLAY_EXTS.has(path.extname(name)) && !name.includes('.test.'))
      .map((name) => ({ name, text: fs.readFileSync(path.join(dir, name), 'utf8') }));
    routes.push({ id, startsRound: game?.startsRound, files });
  }
  return { routes, missingDirs };
}

/** Does `text` RESOLVE the live region `id` — in code, not in prose?
 *
 *  This is the second half of rule (g) and it is a SAFETY property, not a hazard, so the raw match it
 *  used to be failed OPEN: a comment merely mentioning the id satisfied the rule, and the route
 *  shipped a live region nothing writes to — the exact state the rule's own message describes. A
 *  route worker hit this live on src/play/zero-trigger/ (gh#170): the must-red leg passed when it had
 *  to fail. Same defect class as the motion guard's, same fix, and deliberately the SAME classifier:
 *  matchesInCode/classifySource are imported from scripts/js-motion-guard-check.mjs rather than
 *  re-written here. ADR-0046 records that design (classify every character as code / string /
 *  comment, count a match only where it BEGINS in code) and records why blanking string contents was
 *  rejected — the thing being looked for has a string literal as its argument, so blanking would
 *  delete every genuine match along with the fake ones. That applies verbatim here: the id lives
 *  inside `getElementById('dl-live')`.
 *
 *  So the match must START on a code character and may then run into the string: an identifier, `)`,
 *  `]` or `=`, optional `(`, then the quote and the id (with an optional `#` for a selector). Every
 *  shape the clean routes really use is covered — `$('dl-live')`, `document.getElementById('tb-live')`,
 *  `document.querySelector('#announcer')`, `const LIVE_ID = 'stick-live'`.
 *
 *  ponytail: DISCLOSED CEILING — an id assembled at runtime (`$(`#${slot}-live`)`) is not seen, and
 *  neither is a resolution imported from another module. Both are the aliasing ceiling this file
 *  already discloses for announceRoundStarted; the upgrade path is the same (the AST), and it is not
 *  worth building until a route writes one of those shapes. */
function resolvesLiveRegion(id, text) {
  const escaped = id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return matchesInCode(new RegExp(`[\\w$)\\]=]\\s*\\(?\\s*['"]#?${escaped}\\b`), text);
}

/** Pure: [{name, text}] -> the ids of every empty live region declared anywhere in the directory. */
function emptyLiveRegionIds(files) {
  const ids = [];
  for (const { text } of files) {
    for (const m of (text ?? '').matchAll(LIVE_REGION_RE)) {
      const id = ID_ATTR_RE.exec(m[2])?.[1];
      if (id) ids.push(id);
    }
  }
  return [...new Set(ids)].sort();
}

/**
 * modules: [{ id, players, startsRound, source }] — source is the module's own file text.
 * listenerSource: the text of the shell island that listens.
 * Returns an array of violation strings; empty means clean.
 */
export function analyze(modules, listenerSource, playRoutes = []) {
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

    // (b) is deleted — see the header. A non-solo module is judged by rule (g), on its route.

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

  // (g) — one violation per route directory, named by directory so it is attributable without a
  // line number. Only routes declaring startsRound: true are judged; see the header for the residue.
  for (const route of playRoutes) {
    if (route.startsRound !== true) continue;
    const dir = `src/play/${route.id}/`;
    const files = route.files ?? [];
    if (files.length === 0) {
      violations.push(
        `${dir}: game "${route.id}" declares a playRoute and startsRound = true, but that directory ` +
          'holds no readable .html/.js/.ts file — a route whose source cannot be read must not pass ' +
          'this rule by scanning nothing (docs/adr/0019).',
      );
      continue;
    }
    const liveIds = emptyLiveRegionIds(files);
    if (liveIds.length === 0) {
      violations.push(
        `${dir}: game "${route.id}" declares startsRound = true but the route directory contains no ` +
          'empty live region — no element carrying aria-live (or role="status"/role="alert") that ' +
          'ships empty for a script to write into. A round starts on this surface and nothing on it ' +
          'is spoken: a screen-reader user is told neither whose turn it is nor that a new round ' +
          'began (gh#170). A live region shipping fixed prose does not count — that is a static ' +
          'message, not an announcement channel.',
      );
      continue;
    }
    const scripts = files.filter((f) => f.name.endsWith('.js') || f.name.endsWith('.ts'));
    const written = liveIds.filter((id) => scripts.some((f) => resolvesLiveRegion(id, f.text ?? '')));
    if (written.length === 0) {
      violations.push(
        `${dir}: game "${route.id}" declares an empty live region (${liveIds.join(', ')}) but no ` +
          "script in its own directory resolves it by id — the region is markup nothing writes to, " +
          'so the round starts silently anyway (gh#170).',
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

  // --- (b) is DELETED (gh#170), and its removal is pinned here rather than left as prose: a non-solo
  // module declaring startsRound = false must no longer be a violation ON ITS OWN, because the
  // #player-setup panel the old rule reasoned from is not on the page it was judging. What replaces
  // it is rule (g), whose fixtures are further down. Restore rule (b) and this assertion goes red.
  const partyFalse = goodSet();
  partyFalse[2].startsRound = false;
  assert.deepEqual(analyze(partyFalse, goodListener), [], '(b) deleted: a non-solo module declaring startsRound = false is judged by rule (g) on its route, not by a panel premise');
  console.log('PASS (b) deleted: the #player-setup premise is gone — a non-solo module is no longer judged by a panel its page never renders');

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

  // --- (g) known-good/known-bad, gh#170. Fixtures are route DIRECTORIES, the unit the rule judges.
  // Every shape here is lifted from the real tree: the compliant one is dice-loser's
  // (`<p id="dl-live" … role="status" aria-live="polite"></p>` + `$('dl-live')` in main.ts), and the
  // "static message" one is how-close-is-near's rejectionBanner — a role="alert" built inside a
  // template literal in main.js with its text baked in, which announces a rejected input and never a
  // round. Drop the emptiness requirement and that route goes green while nothing announces.
  const route = (id, startsRound, files) => ({ id, startsRound, files });
  const goodRoute = () =>
    route('dice-loser', true, [
      { name: 'markup.html', text: '<section>\n  <p id="dl-live" class="dl-visually-hidden" role="status" aria-live="polite"></p>\n</section>' },
      { name: 'main.ts', text: "const liveEl = $('dl-live');\nliveEl.textContent = `ตาของ ${name}`;" },
    ]);
  assert.deepEqual(analyze(goodSet(), goodListener, [goodRoute()]), [], '(g) a route with an empty live region its own script resolves must be clean');
  console.log('PASS (g) known-good: a play route declaring startsRound = true with an empty aria-live region its main.ts resolves reports zero violations');

  const gCases = [
    ['no live region at all (freeze-tap\'s real shape)', [
      { name: 'markup.html', text: '<section><div id="board"></div></section>' },
      { name: 'main.js', text: "document.getElementById('board').textContent = 'x';" },
    ], /contains no empty live region/],
    ['a live region shipping fixed prose (how-close-is-near\'s rejectionBanner)', [
      { name: 'main.js', text: 'root.innerHTML = `<div id="rejectionBanner" role="alert">เลขนี้ใช้ไม่ได้</div>`;' },
    ], /contains no empty live region/],
    ['an empty live region no script in the directory resolves', [
      { name: 'markup.html', text: '<p id="dl-live" role="status" aria-live="polite"></p>' },
      { name: 'main.js', text: "document.getElementById('board').textContent = 'x';" },
    ], /no script in its own directory resolves it by id/],
    ['a route directory with no readable source file', [], /holds no readable/],
    // --- USE vs MENTION, the fail-open leg. Each of the three below satisfied rule (g) under the raw
    // match this file shipped first, and a route worker hit it live on src/play/zero-trigger/: the
    // must-red leg passed when it had to fail. The markup is identical and correct in all three; the
    // only mention of the id is prose or data, so the region is markup nothing writes to.
    ['the id mentioned only in a // line comment', [
      { name: 'markup.html', text: '<p id="dl-live" role="status" aria-live="polite"></p>' },
      { name: 'main.js', text: "start();  // TODO: announce the round through $('dl-live')\nstage.textContent = 'x';" },
    ], /no script in its own directory resolves it by id/],
    ['the id mentioned only in a /* */ block comment', [
      { name: 'markup.html', text: '<p id="dl-live" role="status" aria-live="polite"></p>' },
      { name: 'main.js', text: "/*\n * The live region is document.getElementById('dl-live') — wire it up next.\n */\nstage.textContent = 'x';" },
    ], /no script in its own directory resolves it by id/],
    ['the id present only inside a string that resolves nothing', [
      { name: 'markup.html', text: '<p id="dl-live" role="status" aria-live="polite"></p>' },
      { name: 'main.js', text: "const HELP = \"see getElementById('dl-live') in the porting notes\";\nstage.textContent = HELP;" },
    ], /no script in its own directory resolves it by id/],
  ];
  for (const [label, files, expected] of gCases) {
    const out = analyze(goodSet(), goodListener, [route('freeze-tap', true, files)]);
    assert.equal(out.length, 1, `(g) ${label}: expected exactly one violation, got ${out.length}`);
    assert.match(out[0], expected, `(g) ${label}: the message must say what is missing`);
    assert.ok(out[0].includes('src/play/freeze-tap/'), `(g) ${label}: the violation must name the route directory`);
  }
  console.log('PASS (g) known-bad: no live region, a live region with baked-in prose, an unresolved empty region, an unreadable directory, and an id mentioned only in a //-comment, a /* */ block or a string are each flagged and named');

  // --- and the OTHER direction of that same fix, which is the leg that must never be sacrificed to
  // it: a REAL resolution is written `getElementById('dl-live')` — the id IS a string argument. Any
  // "fix" that blanks string contents to kill the mention cases above would delete every one of these
  // and red all five clean routes. ADR-0046 rejected exactly that, for exactly this reason; the match
  // must merely BEGIN in code. Each shape below is one the real tree uses.
  for (const [label, script] of [
    ["$('id') — dice-loser's shape", "const liveEl = $('dl-live');"],
    ["document.getElementById('id') — timebomb's and short-stick's shape", "const liveEl = document.getElementById('dl-live');"],
    ["document.querySelector('#id') — pinocchio-luck's shape", "const el = document.querySelector('#dl-live');"],
    ['a wrapped call a formatter split across lines', 'const el = document.getElementById(\n  "dl-live",\n);'],
    ['the id held in a constant first', "const LIVE_ID = 'dl-live';\nconst el = document.getElementById(LIVE_ID);"],
    ['a real resolution with the id also mentioned in a trailing comment', "const el = $('dl-live'); // the round-start live region"],
  ]) {
    assert.deepEqual(
      analyze(goodSet(), goodListener, [
        route('dice-loser', true, [
          { name: 'markup.html', text: '<p id="dl-live" role="status" aria-live="polite"></p>' },
          { name: 'main.js', text: script },
        ]),
      ]),
      [],
      `(g) ${label}: a genuine resolution must stay clean — the id lives inside a string argument, so blanking strings would break this`,
    );
  }
  console.log("PASS (g) use-vs-mention, other direction: $('id'), getElementById('id'), querySelector('#id'), a wrapped call, an id held in a constant, and a real call beside a trailing comment all still count as resolutions");

  // (g) other direction, twice over: a route that declares startsRound = false is out of the rule's
  // set (disclosed residue in the header), and a live region declared inside a template literal in a
  // script counts — several routes build their markup that way, so requiring .html would miss them.
  assert.deepEqual(analyze(goodSet(), goodListener, [route('quiet', false, [])]), [], '(g) a route declaring startsRound = false is not judged by this rule');
  assert.deepEqual(
    analyze(goodSet(), goodListener, [
      route('js-markup', true, [
        { name: 'main.js', text: 'root.innerHTML = `<div id="announcer" class="sr-only" aria-live="polite" aria-atomic="true"></div>`;\nannouncer = document.querySelector("#announcer");' },
      ]),
    ]),
    [],
    '(g) a live region built inside a template literal, resolved by a #id selector, must count',
  );
  console.log('PASS (g) other direction: a startsRound = false route is out of scope, and a live region built in a template literal and resolved by #id is clean');

  // (g) set derivation, against a fixture tree: the ids come from the manifest's playRoute field, a
  // declared route with no directory is REPORTED, and probes/tests inside a route never join the set.
  const routeFix = fs.mkdtempSync(path.join(os.tmpdir(), 'round-start-play-'));
  try {
    fs.mkdirSync(path.join(routeFix, 'src/play/a-route'), { recursive: true });
    for (const [name, text] of [['markup.html', '<p id="a-live" aria-live="polite"></p>'], ['main.js', "$('a-live')"], ['style.css', '.x{}'], ['live.test.mjs', 'x'], ['canvas-pixels-probe.mjs', 'x']]) {
      fs.writeFileSync(path.join(routeFix, 'src/play/a-route', name), text);
    }
    const derived = readPlayRoutes(routeFix, [
      { id: 'a-route', playRoute: '/game/a-route/play/', startsRound: true },
      { id: 'gone', playRoute: '/game/gone/play/', startsRound: true },
      { id: 'landing-only', startsRound: false },
    ]);
    assert.deepEqual(derived.missingDirs, ['gone'], 'a manifest route with no directory must be reported, never silently dropped');
    assert.deepEqual(derived.routes.map((r) => r.id), ['a-route'], 'only manifest games declaring a playRoute join the set');
    assert.deepEqual(
      derived.routes[0].files.map((f) => f.name),
      ['main.js', 'markup.html'],
      'the scanned set is .html/.js/.ts directly in the route directory — no .css, no *.test.*, no *-probe.mjs',
    );
    assert.deepEqual(analyze(goodSet(), goodListener, derived.routes), [], 'the derived fixture route must pass rule (g) end to end');
    console.log(`PASS (g) set derivation: ids from playRoute, a missing directory reported (${derived.missingDirs.join(', ')}), and .css/*.test.*/*-probe.mjs kept out of the scanned files`);
  } finally {
    fs.rmSync(routeFix, { recursive: true, force: true });
  }

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

  // gh#170, rule (g). Zero routes, or a declared route with no directory, means the region was not
  // scanned — that must red, not read as clean (docs/adr/0019).
  const { routes, missingDirs } = readPlayRoutes(repoRoot, games);
  if (routes.length === 0 || missingDirs.length > 0) {
    console.error(
      `::error::round-start-announce-check: the play-route region scanned ${routes.length} director(ies)` +
        (missingDirs.length ? ` and the manifest declares playRoute games with no src/play/<id>/ directory: ${missingDirs.join(', ')}` : '') +
        ' — rule (g) would pass vacuously (docs/adr/0019).',
    );
    process.exit(1);
  }

  const violations = analyze(modules, listenerSource, routes);
  if (violations.length > 0) {
    for (const v of violations) console.error(`::error::${v}`);
    console.error(
      `\ngh#121 / gh#170: ${violations.length} violation(s). A shell-mounted page that starts a live ` +
        `round must announce it through ${PRIMITIVE_FILE}, or the leave-confirm (ADR-0015) fails open ` +
        'and a mid-round tap on a link loses the round with no confirm; and a play route that starts ' +
        'a round must own an empty live region its own script writes into, or the round starts ' +
        'silently for anyone not looking at the screen.',
    );
    process.exit(1);
  }

  // Every number here traces to an expression over the real manifest — not a length of the target
  // list. The two counts are named separately because they are checked by DIFFERENT rules, and a
  // green that lumped them would imply coverage rule (b) never earns.
  const solo = modules.filter((m) => isSolo(m.players));
  const announcing = solo.filter((m) => m.startsRound === true).map((m) => m.id);
  const roundless = solo.filter((m) => m.startsRound === false).map((m) => m.id);
  // Rule (g)'s counts come from the route list rule (g) actually iterated, filtered by the same
  // `startsRound === true` predicate the rule uses — never routes.length, which would claim coverage
  // of routes the rule skipped.
  const checkedRoutes = routes.filter((r) => r.startsRound === true).map((r) => r.id);
  console.log(
    `round-start-announce-check: ${modules.length} manifest module(s) declare startsRound; ` +
      `${announcing.length} panel-less page(s) start a round and announce it ` +
      `[${announcing.join(', ') || 'none'}]; ${roundless.length} declare no round and stay silent ` +
      `[${roundless.join(', ') || 'none'}]; ${checkedRoutes.length} of ${routes.length} play-route ` +
      'director(ies) declare startsRound = true and each holds an empty live region a script in the ' +
      `same directory resolves [${checkedRoutes.join(', ') || 'none'}] — presence of the channel, NOT ` +
      'proof it is written on the round-start path (see the ceiling in the header); ' +
      `${LISTENER_FILE} listens on the shared constant`,
  );
}

await main();
