// The hole scripts/arm-gate-coverage-check.mjs cannot see, pinned here for timebomb.
//
// That gate asks ONE question of a play route: does it import armAllButtons and call it at least
// once? timebomb does, once for #tb-setup — and the gate would stay green even if that single call
// were deleted, because it counts calls per DIRECTORY, not per reveal. The real rule (ADR-0017) is
// per reveal: the second contact of a double-tap must not land on a control the first contact just
// put under the finger.
//
// timebomb is unlike the other ten routes: it has no game logic of its own. main.ts renders exactly
// one screen (#tb-setup, the player baseline) and then hands off to the SHIPPED ENGINE
// (src/games/timebomb.ts) via game.mount(). Every screen inside #tb-stage is drawn by that engine,
// which arms its own stage once at mount time (games/timebomb.ts:156, `armAllButtons(stage)`) and is
// already covered by src/games/timebomb.test.mjs. Re-deriving that coverage here would just be a
// second, driftable copy of a test that already exists — so this file pins what is actually THIS
// file's job: the screen-swap main.ts performs, the controls it renders, and (since gh#177) the
// confirm dialog it opens over them.
//
// begin() is one-way: it hides #tb-setup and shows #tb-stage, and there is no control anywhere in
// this route that reverses it (scout-confirmed, and re-confirmed here — see the "one-way" test
// below). gh#177 did NOT change that: its reset control lives inside #tb-setup, so it goes away with
// the setup screen instead of reaching back into it, and the way back mid-round stays the shared
// "แก้ผู้เล่น" pill's reload (src/shell/PlayExit.astro), which is not this file's code at all.
// One-wayness has no effect on how this file tests, though: like every arm-reveal-paths test in this
// repo, this one matches source TEXT, not a running DOM, so it does not need to click through
// begin() at all — it reads each reveal and its arming call as adjacent lines of source, the same
// way for a one-way transition as for a repeatable one.
//
// ponytail: matched on source text, not on a parsed AST. Two stated ceilings, same as the other ten:
// (1) an inline reveal is recorded under its whole receiver expression, so a receiver renamed later
//     still surfaces as unexpected and still fails — it does not slip through, it just reads worse;
// (2) this proves the CALL SITE exists next to the reveal, never that the 400ms window really
//     disables anything in a browser. Only scripts/arm-gate-probe.mjs proves that, and this test
//     claims nothing about it.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

// No compiled main.js exists for this route (unlike freeze-tap/cannon-flag, timebomb ships main.ts
// straight from src/play — see astro.config for the play-route build). Reading the .ts source is
// fine here: the regexes below match plain text, not parsed JS, so TypeScript syntax is inert to them.
const MAIN = path.join(import.meta.dirname, 'main.ts');
// Whole-line comments are dropped: main.ts documents its own reveal seams in prose (see above), and
// a checker cannot tell use from mention. Only full-line comments go — a trailing `//` inside a
// string would take real code with it, and nothing here needs that.
const source = fs
  .readFileSync(MAIN, 'utf8')
  .split('\n')
  .filter((line) => !line.trimStart().startsWith('//'))
  .join('\n');

// The two ways this file makes something visible: unhiding an element, and putting a <dialog> in the
// top layer. main.ts has no classList('active') toggle and no style.display write of its own.
// `.hidden = true` (a HIDE) does not match; only the reveal direction does. showModal() is matched
// rather than `.open = true` because a modal is the only dialog shape on this route — a non-modal
// `.open` write would surface as an unexpected receiver and fail, which is the intended outcome.
const REVEAL_RE = /([\w.'"()\-]+?)\.(?:hidden\s*=\s*false|showModal\(\))/g;

// receiver -> why it is or is not armed here. Every entry is a decision, not an observation.
const EXPECTED = new Map([
  [
    'stageEl',
    'begin(): the one screen-swap this file performs. Deliberately NOT armed by main.ts — the ' +
      'engine it mounts into stageEl (src/games/timebomb.ts) arms the whole stage itself at mount ' +
      'time via armAllButtons(stage), covered by src/games/timebomb.test.mjs. Arming it again here ' +
      'would be a second, driftable copy of that gate, not a fix for a gap.',
  ],
  [
    'resetDialogEl',
    'gh#177 reset confirm: two buttons revealed in the top layer directly over the trigger that was ' +
      'just pressed, which is the sharpest ghost-tap shape there is. ARMED, immediately after ' +
      'showModal() — asserted by name below rather than left to this set, because the confirm is ' +
      'destructive (it replaces every typed name) and a silent loss of its gate must be loud.',
  ],
]);

// Reveals whose arming call must name the receiver in this file's own source. Kept as a set so a
// second dialog added later has somewhere to be recorded.
const MUST_BE_ARMED = new Set(['resetDialogEl']);

test('every reveal receiver in timebomb/main.ts is a known one', () => {
  const found = [...source.matchAll(REVEAL_RE)].map((m) => m[1]);
  assert.ok(found.length > 0, 'the reveal pattern matched nothing — this test would pass vacuously');
  const unknown = [...new Set(found)].filter((r) => !EXPECTED.has(r)).sort();
  assert.deepEqual(
    unknown,
    [],
    `new reveal path(s) ${unknown.join(', ')}: decide whether each one puts a <button> under the ` +
      'finger, arm the revealed element if it does, and add it to EXPECTED with the reason. The ' +
      'arm-gate CI check will not tell you — it is already green.',
  );
  const stale = [...EXPECTED.keys()].filter((r) => !found.includes(r)).sort();
  assert.deepEqual(stale, [], `EXPECTED names reveal receivers that no longer exist: ${stale.join(', ')}`);
});

// stageEl is the one JS-written reveal in this file and it is deliberately unarmed here — pin the
// absence, the same way EXPECTED records the decision above. A stray armAllButtons(stageEl call
// would be a silent SECOND gate racing the engine's own.
test('the play stage is not armed a second time by this file', () => {
  assert.doesNotMatch(
    source,
    /armAllButtons\(\s*stageEl\b/,
    'stageEl now has its own armAllButtons call — the engine already arms the whole stage at mount ' +
      '(games/timebomb.ts:156); update the EXPECTED entry above instead of double-arming it here.',
  );
});

// #tb-setup ships visible in markup.html (no `hidden` attribute), so it is never caught by
// REVEAL_RE — there is no JS write that reveals it. It still needs arming: a double-tap aimed at
// the game card that navigated here must not land on #tb-begin on arrival. That is the "first paint
// is a transition too" case the other ten routes' tests also pin.
// Anchored to the `if (setupEl && beginEl)` block rather than to a bare armAllButtons(setupEl match:
// since gh#177 there are TWO such calls, and the other one is inside the reset confirm's handler. A
// bare match would go green on the handler alone, i.e. it would stop seeing the case it is named for.
test('the setup screen is armed at first paint, not just at a reveal', () => {
  assert.match(
    source,
    /if \(setupEl && beginEl\) \{[\s\S]*?armAllButtons\(setupEl/,
    'setupEl is visible from load with no reveal write of its own, so it needs an unconditional ' +
      'armAllButtons call — the ghost-tap-on-arrival case main.ts documents just above this call.',
  );
});

test('each armed reveal receiver has an arming call naming it', () => {
  for (const receiver of MUST_BE_ARMED) {
    assert.match(
      source,
      new RegExp(`armAllButtons\\(\\s*${receiver}\\b`),
      `${receiver} is revealed with no armAllButtons call naming it — the controls it reveals land ` +
        'under the finger that revealed them.',
    );
  }
});

// gh#177. Accepting the confirm closes the dialog, which puts the ENTIRE setup screen back under a
// finger still resting on the confirm's coordinates, and the gate installed at first paint fired and
// removed itself long ago. #tb-begin is right there: a ghost tap on it starts the round. This is the
// same failure adversarial review found in the short-stick original (gh#174), where the second
// contact landed on a rebuilt remove button and deleted a player.
test('accepting the reset confirm re-arms the setup screen it uncovers', () => {
  const handler = source.match(
    /resetConfirmEl\.addEventListener\('click',[\s\S]*?\n {2}\}\);/,
  );
  assert.ok(handler, 'the reset confirm handler is no longer recognisable — this test measures nothing');
  assert.match(
    handler[0],
    /armAllButtons\(setupEl/,
    'the confirm handler closes the dialog without re-arming #tb-setup: the second contact of a ' +
      'double-tap on the confirm lands live on #tb-begin and starts the round.',
  );
});

// The scout's claim that begin() is one-way, re-checked here rather than trusted: no control in
// this file's source sets #tb-setup's `.hidden` back to false or #tb-stage's back to true.
test('begin() really is one-way — no control reverses the screen swap', () => {
  assert.doesNotMatch(source, /setupEl\.hidden\s*=\s*false/, 'a control now un-hides #tb-setup');
  assert.doesNotMatch(source, /stageEl\.hidden\s*=\s*true/, 'a control now re-hides #tb-stage');
});
