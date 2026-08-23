#!/usr/bin/env node
// Static regression tripwire for ADR-0015 (docs/adr/0015-a-leave-confirm-guards-the-links-we-cannot-move.md):
// the closed #leave-confirm dialog must stay inert, its clearance budget must stay within the half of
// the viewport the finger is not in, and pendingHref must clear on every dismissal path, not per-button.
// Since gh#55 it also covers ADR-0024 (docs/adr/0024-the-reflow-is-the-hazard-not-the-clearance.md):
// #clear-choice is the file's second <dialog>, and (e) pins the two properties that make it one — it
// stays out of flow (a <div> here is the reflow hazard itself), and it fails SAFE, the opposite of
// #leave-confirm's deliberate fail-OPEN, because the question it asks guards a destructive clear.
// This is a cheap source-text check, NOT the proof — scripts/leave-confirm-probe.mjs (build + serve +
// headless Chrome, reads real client rects, elementFromPoint, and actual taps) is what proves the
// invariant, and per ADR-0018 it never runs in CI. This script only catches the same four shipped
// defects being reintroduced into source before that heavier probe ever runs by hand.
//
// ponytail: raw source scan over exactly two files (src/styles/tokens.css, src/shell/PlayerSetup.astro).
// It cannot see that the closed dialog has zero client rects or refuses elementFromPoint — only the
// probe measures the rendered DOM. And a `display:` rule for #leave-confirm or a bare `dialog` arriving
// from any OTHER stylesheet reproduces the exact bug this scan exists to catch, invisibly to it.
//
// Every match here runs on comment-stripped text, in BOTH directions at once: a commented-out line
// can no longer SATISFY a "must be present" check (c, d), and a commented-out mention can no longer
// TRIP a "must not appear" check (a). The stripper is textual, so a `//` inside a string literal
// (none in either file today) would be read as a comment. The [open] gate flattens `:not(...)` before
// looking for `[open]`, so `#leave-confirm:not([open]) { display: block }` — which targets precisely
// the CLOSED dialog — now fails; that flattening is one non-nesting `[^)]*` pass, so a nested form
// like `:not(:is([open]))` is past what it can read. (a) grades each compound of a selector LIST
// separately (splitSelectorList below): reading the list as one string let one compound's `[open]`
// vouch for an ungated neighbour across the comma.
//
//   node scripts/leave-confirm-check.mjs             -> scan the two files, exit non-zero if any hit
//   node scripts/leave-confirm-check.mjs --selftest  -> both-direction calibration on temp fixtures

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const CSS_FILE = path.join(repoRoot, 'src/styles/tokens.css');
const ASTRO_FILE = path.join(repoRoot, 'src/shell/PlayerSetup.astro');

// ---------------------------------------------------------------------------
// Pure: text -> violations. No file IO here, so the selftest can feed it strings read back from a
// temp fixture, exactly the way main() feeds it text read from the two real files.
// ---------------------------------------------------------------------------
function parseCssRules(text) {
  const clean = text.replace(/\/\*[\s\S]*?\*\//g, ''); // strip comments first — this file's own header talks about display/dvh in prose
  const rules = [];
  const re = /([^{}]+)\{([^{}]*)\}/g;
  let m;
  while ((m = re.exec(clean))) rules.push({ selector: m[1].trim(), body: m[2] });
  return rules;
}

// #clear-choice joined this set in gh#55 (ADR-0024): it is a second <dialog> in the same file, and a
// display: rule that escapes its [open] gate paints it in flow on all 9 pages with a destructive
// confirm button live — the identical defect (a) was written for, one id over.
// Single source of truth for how many dialogs (a) actually polices — main()'s success line counts THIS
// array's length rather than printing a literal, so a dialog silently dropping out of it shows up in
// the printed number instead of the line lying about coverage it no longer has (adversarial review, Hole 2).
const GUARD_DIALOG_IDS = ['#leave-confirm', '#clear-choice'];
const targetsGuardDialog = (sel) =>
  GUARD_DIALOG_IDS.some((id) => new RegExp(`${id}\\b`).test(sel)) || /(^|[^\w-])dialog(?![\w-])/.test(sel);

// A selector LIST is N independent selectors sharing one body, and CSS applies the body to each of
// them separately — so (a) has to grade each one separately too. Reading the whole list as one string
// let `#leave-confirm[open], #clear-choice { display: flex }` pass: the `[open]` from the FIRST
// compound satisfied the gate for the SECOND, which is ungated and paints the closed dialog. That is
// the exact ADR-0015 defect, laundered through a comma. tokens.css already ships a real list
// (`#leave-confirm[open].at-bottom, #leave-confirm[open].at-top`), so splitting is the shape the file
// actually uses, not a hypothetical.
// Depth-aware: a comma inside :is(...) / :not(...) / :where(...) is an argument separator, not a list
// separator, and splitting there would invent compounds that do not exist.
// ponytail: paren depth only. A comma inside an attribute-value string (`[data-x=","]`) would still
// split — no such selector exists here, and the fail direction is an extra ungated-looking compound,
// i.e. red, i.e. a human looks. Upgrade path is a real selector parser, not a wider regex.
function splitSelectorList(sel) {
  const out = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < sel.length; i++) {
    if (sel[i] === '(') depth++;
    else if (sel[i] === ')') depth--;
    else if (sel[i] === ',' && depth === 0) {
      out.push(sel.slice(start, i));
      start = i + 1;
    }
  }
  out.push(sel.slice(start));
  return out.map((s) => s.trim()).filter(Boolean);
}

// Astro/JSX brace comments first, then block, then line — same order (and same reason) as
// scripts/stable-exit-markers-check.mjs's: nothing left inside a multi-line form may be re-read as a
// line comment. Each comment is replaced by spaces rather than deleted, so offsets and line numbers
// are unchanged and a match's position still points at the real source line.
const blank = (m) => m.replace(/[^\n]/g, ' ');
function stripComments(text) {
  return text
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, blank)
    .replace(/\/\*[\s\S]*?\*\//g, blank)
    .replace(/\/\/[^\n]*/g, blank);
}

// A selector is gated on [open] only if `[open]` survives flattening every `:not(...)` group away.
// `#leave-confirm:not([open])` contains the string `[open]` while targeting the exact opposite set —
// the closed dialog, which is the bug ADR-0015 exists to prevent.
const gatedOnOpen = (sel) => /\[open\]/.test(sel.replace(/:not\([^)]*\)/g, ' '));

// (a) + (b): src/styles/tokens.css
// `checked`, when passed, is an out-param main() uses to size the success line — pushed to only as each
// condition actually runs, never a hardcoded count (adversarial review, Hole 2). selftest never passes
// it, so every existing assertion on the return value (violations only) is untouched.
function checkTokensCss(text, checked) {
  const violations = [];
  const rules = parseCssRules(text);

  // (a) a rule targeting #leave-confirm (or a bare `dialog`) that sets display: must be gated on
  // [open], or it beats the UA's `dialog:not([open]) { display: none }` and the closed dialog paints.
  checked?.push('a');
  for (const { selector, body } of rules) {
    if (!/\bdisplay\s*:/.test(body)) continue;
    for (const one of splitSelectorList(selector)) {
      if (targetsGuardDialog(one) && !gatedOnOpen(one)) {
        violations.push(`(a) selector "${one}" sets display: without [open] gating — closed <dialog> becomes hit-testable`);
      }
    }
  }

  // (b) the open-gated block's max-block-size is the clearance budget: 0.45H + 16 < 0.5H only holds
  // at <= 45dvh. Missing entirely is as broken as too large — the invariant would be unenforced.
  checked?.push('b');
  const base = rules.find((r) => r.selector === '#leave-confirm[open]');
  if (!base) {
    violations.push('(b) no #leave-confirm[open] rule found to check max-block-size against');
  } else {
    const m = base.body.match(/max-block-size\s*:\s*([\d.]+)dvh/);
    if (!m) {
      violations.push('(b) #leave-confirm[open] has no max-block-size — the half-viewport clearance invariant is unenforced');
    } else if (Number(m[1]) > 45) {
      violations.push(`(b) #leave-confirm[open] max-block-size is ${m[1]}dvh, must stay <= 45dvh (0.45H + 16 < 0.5H)`);
    }
  }

  return violations;
}

// (c) + (d) + (e): src/shell/PlayerSetup.astro. `checked` is the same optional out-param as
// checkTokensCss's — see its comment.
function checkPlayerSetupAstro(rawText, checked) {
  const violations = [];
  // (c) and (d) all assert something MUST be present, so they must never see a comment: this file
  // documents its own guards in prose right above them, and an old line left commented out while the
  // live one is weakened is exactly the bypass this strip closes.
  const text = stripComments(rawText);

  // (c) pendingHref must clear on the dialog's own `close` event (fires for every dismissal path),
  // not per-button — clearing per-button was the shipped defect: a later #leave-go press could still
  // navigate on a pendingHref left over from an answer already given the other way.
  // Bound to leaveDlg by name since gh#55: the file now holds a SECOND <dialog> with its own `close`
  // listener. The old pattern matched on the event name alone, so it graded whichever `close` listener
  // came FIRST in source, whatever element it belonged to — measured: against today's order it reads
  // clearChoiceEl's body, finds no pendingHref, and reports leave-confirm's guard broken while the
  // guard is right there and correct. Flip the source order and the same regex grades leave-confirm by
  // clear-choice's listener instead, which checks nothing. Either way the verdict tracks line order
  // rather than the element under test. Narrowing to the element is the converging fix (ADR-0020 rule 3);
  // the known-good fixture below is what pins it, and it fails against the un-narrowed pattern.
  checked?.push('c');
  const closeMatch = text.match(/leaveDlg\.addEventListener\(\s*(['"])close\1\s*,\s*\(\)\s*=>\s*\{([^}]*)\}\s*\)/);
  if (!closeMatch) {
    violations.push("(c) no dialog 'close' event listener found — pendingHref must be cleared there, not per-button");
  } else if (!/pendingHref\s*=\s*null/.test(closeMatch[2])) {
    violations.push("(c) the dialog's 'close' event listener no longer clears pendingHref = null");
  }

  // (d) a modified or non-primary click is the round-PRESERVING gesture (opens a sibling game in a new
  // tab) and must pass through untouched, or the guard turns the safe action into the destructive one.
  checked?.push('d');
  if (!/e\.metaKey\s*\|\|\s*e\.ctrlKey\s*\|\|\s*e\.shiftKey\s*\|\|\s*e\.altKey\s*\|\|\s*e\.button\s*!==\s*0/.test(text)) {
    violations.push('(d) modified/non-primary click passthrough (metaKey/ctrlKey/shiftKey/altKey/button check) is missing');
  }
  // (d) GameLayout's stable /games/ link must stay excluded, or the guard intercepts the one link that
  // never moves and does not need asking about.
  if (!text.includes("a[href]:not([data-stable-exit])")) {
    violations.push("(d) the a[href]:not([data-stable-exit]) selector is missing — the stable exit link must stay excluded");
  }

  // (e) gh#55 / ADR-0024: #clear-choice is the same <dialog> shape as #leave-confirm with the OPPOSITE
  // fallback, and both halves are load-bearing.
  checked?.push('e');
  //   the element type is the fix — as a <div> in flow, [hidden]{display:none} on dismissal reflowed
  //   every control below it upward, which is how a stage control arrives under a descending finger;
  //   the fallback fails SAFE — the question drops `hidden` unconditionally and only the RAISING is
  //   capability-gated, because a browser with no showModal must still be asked before a destructive
  //   clear. leave-confirm's fail-OPEN early return (line ~419) copied here is a silent data-loss path.
  if (!/<dialog id="clear-choice"/.test(text)) {
    violations.push('(e) #clear-choice is not a <dialog> — in normal flow, dismissing it reflows the stage under the finger (ADR-0024)');
  }
  const askShown = text.indexOf('clearChoiceEl.hidden = false');
  // Hole 1 (adversarial review, S2026-08-21): a bare `indexOf('clearChoiceEl.showModal')` is satisfied
  // by the CAPABILITY TEST alone (`typeof clearChoiceEl.showModal === 'function'`) even if the real
  // showModal() call is deleted or swapped for setAttribute('open', '') — the exact reflow hazard
  // ADR-0024 exists to catch, and all five conditions would stay green while it shipped. Require the
  // actual invocation, parens and all, not a mention of the identifier.
  const showModalCall = text.match(/clearChoiceEl\.showModal\s*\(\s*\)/);
  const askRaised = showModalCall ? showModalCall.index : -1;
  if (askShown < 0) {
    violations.push('(e) the clear question no longer drops hidden unconditionally — a browser without showModal could not be asked at all');
  }
  if (askRaised < 0) {
    violations.push('(e) #clear-choice is never raised with a real showModal() call — a bare mention of showModal (e.g. inside the capability test) is not enough');
  } else if (askShown >= 0 && askRaised < askShown) {
    violations.push('(e) showModal runs before hidden drops — showModal on a display:none box raises nothing');
  }
  // Fail-OPEN detector: covers three shapes — `typeof X !== 'function') return`, its Yoda-order twin
  // (`'function' !== typeof X) return`), and the bare falsy check `!clearChoiceEl.showModal) return`.
  // It provably does NOT catch the capability hoisted into an intermediate variable first
  // (`const ok = typeof clearChoiceEl.showModal === 'function'; if (!ok) return;`), a comparison against
  // `'undefined'` / `== null`, or a `return` several lines below the condition rather than on the same
  // `if (...)`. Only scripts/leave-confirm-probe.mjs proves the rendered behavior; this stays a
  // source-text tripwire, not the proof.
  const failOpenPatterns = [
    /clearChoiceEl\.showModal\s*!==\s*(['"])function\1\s*\)\s*\{?\s*return/,
    /(['"])function\1\s*!==\s*typeof\s*clearChoiceEl\.showModal\s*\)\s*\{?\s*return/,
    /!\s*clearChoiceEl\.showModal\s*\)\s*\{?\s*return/,
  ];
  if (failOpenPatterns.some((re) => re.test(text))) {
    violations.push('(e) #clear-choice must never fail OPEN on a showModal capability test — that path clears the group and discards the rounds without asking');
  }
  // (e) dropping `hidden` is NOT enough on its own, and this one was measured, not reasoned: a UA that
  // styles <dialog> at all ships `dialog:not([open]) { display: none }`, which survives showModal being
  // missing. With showModal deleted the question read hidden=false with ZERO client rects and focus on
  // <body> — Clear group became a control that visibly did nothing. Only setting [open] by hand renders
  // it, so that line is the fallback, not a nicety.
  if (!/clearChoiceEl\.setAttribute\(\s*(['"])open\1/.test(text)) {
    violations.push("(e) the no-showModal branch never sets [open] — dialog:not([open]){display:none} keeps the question at zero client rects, so the player is never asked");
  }

  return violations;
}

// ---------------------------------------------------------------------------
// Self-test: fixtures live under a temp dir (os.tmpdir()), read back through the same fs.readFileSync
// path main() uses, then the temp dir is removed. Nothing under src/, dist/, or the repo tree is ever
// touched. Calibrated both ways per condition — a clean fixture must pass, and each planted defect,
// shaped like the real idiom in tokens.css / PlayerSetup.astro, must be flagged.
// ---------------------------------------------------------------------------
function withTempFixture(name, content, run) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'leave-confirm-check-'));
  const file = path.join(dir, name);
  try {
    fs.writeFileSync(file, content);
    return run(fs.readFileSync(file, 'utf8'));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

function selftest() {
  // -- (a)/(b): tokens.css --------------------------------------------------
  const cssGood = [
    '#leave-confirm[open] {',
    '  max-block-size: 45dvh;',
    '  overflow: auto;',
    '  display: flex;',
    '}',
    '#leave-confirm[open].at-bottom {',
    '  position: fixed;',
    '  inset-block-end: var(--space-md);',
    '}',
  ].join('\n');
  withTempFixture('tokens.css', cssGood, (text) => {
    assert.deepEqual(checkTokensCss(text), [], 'clean tokens.css fixture must report zero violations');
  });
  console.log('PASS (a)+(b) known-good tokens.css fixture: display gated on [open], max-block-size 45dvh — clean');

  // (a) known-bad: display escapes the [open] gate — the exact shipped defect (unconditional display:flex
  // on the bare #leave-confirm id beat the UA's dialog:not([open]){display:none}).
  const cssBadOpenGate = [
    '#leave-confirm {',
    '  display: flex;',
    '}',
    '#leave-confirm[open] {',
    '  max-block-size: 45dvh;',
    '  overflow: auto;',
    '}',
  ].join('\n');
  withTempFixture('tokens.css', cssBadOpenGate, (text) => {
    const v = checkTokensCss(text);
    assert.ok(v.some((x) => x.startsWith('(a)')), '(a) must flag display: outside an [open]-gated selector');
  });
  console.log('PASS (a) known-bad fixture (display on bare #leave-confirm) is flagged');

  // (a) known-bad: a SELECTOR LIST where one compound is gated and the other is not. Reading the list
  // as one string let the first compound's `[open]` vouch for the second — the ADR-0015 defect
  // laundered through a comma, green on every condition. Both orders, so the fix cannot be "grade the
  // last one"; and the ungated compound must be the one NAMED in the message, not the whole list.
  for (const [label, sel, culprit] of [
    ['gated first', '#leave-confirm[open], #clear-choice', '#clear-choice'],
    ['gated last', '#clear-choice, #leave-confirm[open]', '#clear-choice'],
    ['bare dialog smuggled in', '#leave-confirm[open], dialog', 'dialog'],
    ['newline-separated list, the shape tokens.css ships', '#leave-confirm[open].at-bottom,\n#leave-confirm:not([open])', '#leave-confirm:not([open])'],
  ]) {
    const cssBadList = [`${sel} {`, '  display: flex;', '}', '#leave-confirm[open] {', '  max-block-size: 45dvh;', '}'].join('\n');
    withTempFixture('tokens.css', cssBadList, (text) => {
      const v = checkTokensCss(text);
      const hit = v.find((x) => x.startsWith('(a)'));
      assert.ok(hit, `(a) must flag the ungated compound in "${sel}" (${label})`);
      assert.ok(hit.includes(`"${culprit}"`), `(a) must name the ungated compound ${culprit}, not the whole list — got: ${hit}`);
    });
    console.log(`PASS (a) known-bad fixture (selector list, ${label}): the ungated compound ${culprit} is flagged, not vouched for by its neighbour`);
  }

  // (a) calibration the other way: tokens.css's REAL list — every compound genuinely [open]-gated —
  // must stay clean, or the split traded a fail-open for a fail-closed on the shipped file.
  const cssGoodList = [
    '#leave-confirm[open].at-bottom,',
    '#leave-confirm[open].at-top {',
    '  display: flex;',
    '}',
    '#leave-confirm[open] {',
    '  max-block-size: 45dvh;',
    '}',
  ].join('\n');
  withTempFixture('tokens.css', cssGoodList, (text) => {
    assert.deepEqual(checkTokensCss(text), [], '(a) a list whose every compound is [open]-gated must stay clean');
  });
  console.log('PASS (a) known-good fixture (the real #leave-confirm[open].at-bottom, .at-top list) still passes after the split');

  // (a) and a comma INSIDE :is()/:not() is an argument separator, not a list separator — splitting
  // there would invent a compound like `.at-top` that no rule targets.
  const cssGoodNotList = ['#leave-confirm[open]:not(.at-top, .at-bottom) {', '  display: flex;', '}', '#leave-confirm[open] {', '  max-block-size: 45dvh;', '}'].join('\n');
  withTempFixture('tokens.css', cssGoodNotList, (text) => {
    assert.deepEqual(checkTokensCss(text), [], '(a) a comma inside :not(...) must not be read as a selector-list separator');
  });
  console.log('PASS (a) known-good fixture (#leave-confirm[open]:not(.at-top, .at-bottom)): a comma inside :not() is an argument separator, not a list split');

  // (a) known-bad: a bare `dialog` element selector with display:, same hazard for any future <dialog>.
  const cssBadBareDialog = ['dialog {', '  display: flex;', '}'].join('\n');
  withTempFixture('tokens.css', cssBadBareDialog, (text) => {
    const v = checkTokensCss(text);
    assert.ok(v.some((x) => x.startsWith('(a)')), '(a) must flag display: on a bare `dialog` selector');
  });
  console.log('PASS (a) known-bad fixture (display on bare `dialog`) is flagged');

  // (a) known-bad: `:not([open])` targets precisely the CLOSED dialog — the exact bug ADR-0015
  // guards — while the substring "[open]" is present. Both spacings, since :not( [open] ) is legal CSS.
  for (const sel of ['#leave-confirm:not([open])', '#leave-confirm:not( [open] )']) {
    const cssBadNotOpen = [`${sel} {`, '  display: block;', '}', '#leave-confirm[open] {', '  max-block-size: 45dvh;', '}'].join('\n');
    withTempFixture('tokens.css', cssBadNotOpen, (text) => {
      const v = checkTokensCss(text);
      assert.ok(v.some((x) => x.startsWith('(a)')), `(a) must flag "${sel}" — it paints the closed dialog`);
    });
    console.log(`PASS (a) known-bad fixture (${sel} sets display) is flagged`);
  }

  // (a) calibration the other way: a genuine [open] gate keeps passing even when the selector also
  // carries an unrelated :not(...), so the fix above rejects the bypass and not the real idiom.
  const cssGoodOpenPlusNot = [
    '#leave-confirm[open]:not(.at-top) {',
    '  display: flex;',
    '  max-block-size: 45dvh;',
    '}',
    '#leave-confirm[open] {',
    '  max-block-size: 45dvh;',
    '}',
  ].join('\n');
  withTempFixture('tokens.css', cssGoodOpenPlusNot, (text) => {
    assert.deepEqual(checkTokensCss(text), [], '(a) must still accept #leave-confirm[open]:not(.at-top)');
  });
  console.log('PASS (a) known-good fixture (#leave-confirm[open]:not(.at-top) sets display) still passes');

  // (a) negative direction: a commented-out bad rule must NOT trip the check. This is the mirror of
  // the (c)/(d) cases below — comments neither satisfy a positive check nor trip a negative one.
  const cssCommentedBadRule = [
    '/* was: #leave-confirm { display: flex; } — removed, it painted the closed dialog */',
    '#leave-confirm[open] {',
    '  max-block-size: 45dvh;',
    '  display: flex;',
    '}',
  ].join('\n');
  withTempFixture('tokens.css', cssCommentedBadRule, (text) => {
    assert.deepEqual(checkTokensCss(text), [], '(a) must not be tripped by a commented-out rule');
  });
  console.log('PASS (a) negative direction: a commented-out #leave-confirm display rule does not trip the check');

  // (b) known-bad: max-block-size widened past the 45dvh ceiling the 0.45H + 16 < 0.5H proof rests on.
  const cssBadTooTall = [
    '#leave-confirm[open] {',
    '  max-block-size: 60dvh;',
    '  display: flex;',
    '}',
  ].join('\n');
  withTempFixture('tokens.css', cssBadTooTall, (text) => {
    const v = checkTokensCss(text);
    assert.ok(v.some((x) => x.startsWith('(b)')), '(b) must flag max-block-size > 45dvh');
  });
  console.log('PASS (b) known-bad fixture (max-block-size: 60dvh) is flagged');

  // -- (c)/(d)/(e): PlayerSetup.astro ---------------------------------------
  // (e)'s satisfied lines, shared by every fixture that must read clean: the four checks are
  // independent, so a fixture written for (c) or (d) would otherwise fail on (e) for unrelated reasons.
  const clearChoiceGood = [
    '<dialog id="clear-choice" hidden>',
    "  clearChoiceEl.hidden = false;",
    "  if (typeof clearChoiceEl.showModal === 'function') clearChoiceEl.showModal();",
    "  else clearChoiceEl.setAttribute('open', '');",
  ].join('\n');
  const astroGood = [
    "  if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;",
    "  const link = (e.target as Element).closest?.('a[href]:not([data-stable-exit])') as HTMLAnchorElement | null;",
    "  clearChoiceEl.addEventListener('close', () => { clearChoiceEl.hidden = true; });",
    "  leaveDlg.addEventListener('close', () => { pendingHref = null; });",
    "  leaveStayBtn.addEventListener('click', () => leaveDlg.close());",
    clearChoiceGood,
  ].join('\n');
  withTempFixture('PlayerSetup.astro', astroGood, (text) => {
    assert.deepEqual(checkPlayerSetupAstro(text), [], 'clean PlayerSetup.astro fixture must report zero violations');
  });
  console.log('PASS (c)+(d) known-good PlayerSetup.astro fixture: close clears pendingHref, both guards present — clean');

  // (c) known-bad: pendingHref cleared per-button instead of on close — the shipped defect, where a
  // later #leave-go press could still navigate on an answer already given the other way.
  const astroBadPerButton = [
    "  leaveStayBtn.addEventListener('click', () => { pendingHref = null; leaveDlg.close(); });",
    "  leaveGoBtn.addEventListener('click', () => { pendingHref = null; leaveDlg.close(); });",
  ].join('\n');
  withTempFixture('PlayerSetup.astro', astroBadPerButton, (text) => {
    const v = checkPlayerSetupAstro(text);
    assert.ok(v.some((x) => x.startsWith('(c)')), '(c) must flag a missing close-clears-pendingHref listener');
  });
  console.log('PASS (c) known-bad fixture (pendingHref cleared per-button, no close listener) is flagged');

  // (d) known-bad: modified-click passthrough guard removed — a cmd/ctrl/shift/middle click on a
  // sibling game would then be intercepted and answered with location.href, killing the new-tab intent.
  const astroBadNoPassthrough = [
    "  const link = (e.target as Element).closest?.('a[href]:not([data-stable-exit])') as HTMLAnchorElement | null;",
  ].join('\n');
  withTempFixture('PlayerSetup.astro', astroBadNoPassthrough, (text) => {
    const v = checkPlayerSetupAstro(text);
    assert.ok(v.some((x) => x.startsWith('(d)') && x.includes('passthrough')), '(d) must flag a missing modified-click passthrough guard');
  });
  console.log('PASS (d) known-bad fixture (no modified-click passthrough) is flagged');

  // (d) known-bad: the stable-exit exclusion widened away, so the GameLayout /games/ link that never
  // moves gets intercepted and asked about too.
  const astroBadNoStableExit = [
    "  if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;",
    "  const link = (e.target as Element).closest?.('a[href]') as HTMLAnchorElement | null;",
  ].join('\n');
  withTempFixture('PlayerSetup.astro', astroBadNoStableExit, (text) => {
    const v = checkPlayerSetupAstro(text);
    assert.ok(v.some((x) => x.startsWith('(d)') && x.includes('stable-exit')), '(d) must flag a missing data-stable-exit exclusion');
  });
  console.log('PASS (d) known-bad fixture (a[href] without :not([data-stable-exit])) is flagged');

  // -- comment bypass: a positive-presence check must not be satisfied by a COMMENT ---------------
  // Every one of these keeps the required text in the file, but only inside a comment, while the
  // live line is the weakened one. Before comments were stripped, all three read as clean.
  const astroCommentedOut = [
    "  // if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;",
    "  /* was: closest?.('a[href]:not([data-stable-exit])') */",
    "  const link = (e.target as Element).closest?.('a[href]') as HTMLAnchorElement | null;",
    "  {/* leaveDlg.addEventListener('close', () => { pendingHref = null; }); */}",
    "  leaveStayBtn.addEventListener('click', () => { pendingHref = null; leaveDlg.close(); });",
  ].join('\n');
  withTempFixture('PlayerSetup.astro', astroCommentedOut, (text) => {
    const v = checkPlayerSetupAstro(text);
    assert.ok(v.some((x) => x.startsWith('(c)')), '(c) must not be satisfied by a commented-out close listener');
    assert.ok(v.some((x) => x.startsWith('(d)') && x.includes('passthrough')), '(d) passthrough must not be satisfied by a commented-out guard');
    assert.ok(v.some((x) => x.startsWith('(d)') && x.includes('stable-exit')), '(d) stable-exit must not be satisfied by a commented-out selector');
  });
  console.log('PASS comment bypass: commented-out close listener / passthrough guard / stable-exit selector satisfy nothing');

  // Calibration the other way: the same prose comments alongside LIVE lines must still read clean —
  // stripping comments must not break the real file, which documents each guard right above it.
  const astroGoodWithComments = [
    "  // A modified or non-primary click is the round-PRESERVING gesture: e.metaKey || e.ctrlKey.",
    "  if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;",
    "  {/* Only data-stable-exit (GameLayout's /games/ link) opts out of a[href]:not([data-stable-exit]). */}",
    "  const link = (e.target as Element).closest?.('a[href]:not([data-stable-exit])') as HTMLAnchorElement | null;",
    "  /* pendingHref = null must live on close, not per-button. */",
    "  leaveDlg.addEventListener('close', () => { pendingHref = null; });",
    clearChoiceGood,
  ].join('\n');
  withTempFixture('PlayerSetup.astro', astroGoodWithComments, (text) => {
    assert.deepEqual(checkPlayerSetupAstro(text), [], 'live guards next to prose comments must still report zero violations');
  });
  console.log('PASS comment bypass, calibration: live guards documented by comments above them still report clean');

  // -- (c) new surface, gh#55: a SECOND dialog's close listener must not stand in for leaveDlg's -----
  // Narrowing (c) to leaveDlg could have introduced a blind spot — a file with no leaveDlg close
  // listener at all, only another dialog's. It does not: the miss is still caught. The other half of
  // this pair is astroGood above, which carries both listeners in the real file's order (clear-choice
  // first) and reads clean only because of the narrowing — it fails against the un-narrowed pattern.
  const astroBadOtherDialogsClose = [
    "  if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;",
    "  const link = (e.target as Element).closest?.('a[href]:not([data-stable-exit])') as HTMLAnchorElement | null;",
    "  clearChoiceEl.addEventListener('close', () => { clearChoiceEl.hidden = true; });",
    "  leaveStayBtn.addEventListener('click', () => { pendingHref = null; leaveDlg.close(); });",
    clearChoiceGood,
  ].join('\n');
  withTempFixture('PlayerSetup.astro', astroBadOtherDialogsClose, (text) => {
    const v = checkPlayerSetupAstro(text);
    assert.ok(v.some((x) => x.startsWith('(c)')), "(c) another dialog's close listener must not satisfy leave-confirm's");
  });
  console.log("PASS (c) known-bad fixture (a second dialog's close listener standing in for leaveDlg's) is flagged");

  // -- (e): #clear-choice is a non-reflowing dialog that fails SAFE (gh#55, ADR-0024) ----------------
  // (e) known-bad: reverted to a <div>. In flow, dismissing it reflows every control below it upward —
  // the whole hazard ADR-0024 removed, back verbatim.
  const astroBadClearChoiceDiv = [
    astroGood.replace('<dialog id="clear-choice" hidden>', '<div id="clear-choice" hidden>'),
  ].join('\n');
  withTempFixture('PlayerSetup.astro', astroBadClearChoiceDiv, (text) => {
    const v = checkPlayerSetupAstro(text);
    assert.ok(v.some((x) => x.startsWith('(e)') && x.includes('not a <dialog>')), '(e) must flag #clear-choice reverted to a div');
  });
  console.log('PASS (e) known-bad fixture (#clear-choice back to a <div>) is flagged');

  // (e) known-bad: leave-confirm's fail-OPEN early return copied onto the clear path. leave-confirm may
  // do this — eating a navigation click it cannot ask about is worse than letting it through. Here the
  // same line skips the only question in front of a destructive clear.
  const astroBadClearChoiceFailsOpen = [
    astroGood,
    "  if (typeof clearChoiceEl.showModal !== 'function') return;",
  ].join('\n');
  withTempFixture('PlayerSetup.astro', astroBadClearChoiceFailsOpen, (text) => {
    const v = checkPlayerSetupAstro(text);
    assert.ok(v.some((x) => x.startsWith('(e)') && x.includes('fail OPEN')), '(e) must flag a fail-OPEN early return on the clear path');
  });
  console.log('PASS (e) known-bad fixture (fail-OPEN early return on #clear-choice) is flagged');

  // (e) known-bad: the braced form of the same early return, since `) return;` is not the only spelling.
  const astroBadClearChoiceFailsOpenBraced = [
    astroGood,
    "  if (typeof clearChoiceEl.showModal !== 'function') { return; }",
  ].join('\n');
  withTempFixture('PlayerSetup.astro', astroBadClearChoiceFailsOpenBraced, (text) => {
    const v = checkPlayerSetupAstro(text);
    assert.ok(v.some((x) => x.startsWith('(e)') && x.includes('fail OPEN')), '(e) must flag the braced fail-OPEN early return too');
  });
  console.log('PASS (e) known-bad fixture (braced fail-OPEN early return) is flagged');

  // (e) known-bad, Hole 1 widening: Yoda-order comparison — `'function' !== typeof X`. Named in the
  // adversarial review as one of the two spellings the old single regex let slip past.
  const astroBadClearChoiceFailsOpenYoda = [
    astroGood,
    "  if ('function' !== typeof clearChoiceEl.showModal) return;",
  ].join('\n');
  withTempFixture('PlayerSetup.astro', astroBadClearChoiceFailsOpenYoda, (text) => {
    const v = checkPlayerSetupAstro(text);
    assert.ok(v.some((x) => x.startsWith('(e)') && x.includes('fail OPEN')), '(e) must flag the Yoda-order fail-OPEN comparison');
  });
  console.log('PASS (e) known-bad fixture (Yoda-order fail-OPEN comparison) is flagged');

  // (e) known-bad, Hole 1 widening: bare falsy check — `!clearChoiceEl.showModal`. The second spelling
  // named in the review.
  const astroBadClearChoiceFailsOpenBang = [
    astroGood,
    "  if (!clearChoiceEl.showModal) return;",
  ].join('\n');
  withTempFixture('PlayerSetup.astro', astroBadClearChoiceFailsOpenBang, (text) => {
    const v = checkPlayerSetupAstro(text);
    assert.ok(v.some((x) => x.startsWith('(e)') && x.includes('fail OPEN')), '(e) must flag the bare `!clearChoiceEl.showModal` fail-OPEN check');
  });
  console.log('PASS (e) known-bad fixture (bare `!clearChoiceEl.showModal` fail-OPEN check) is flagged');

  // (e) known-bad, Hole 1: the real showModal() call gutted and replaced with setAttribute('open', ''),
  // while the capability test survives untouched. Before the fix, `indexOf('clearChoiceEl.showModal')`
  // still found the identifier inside the surviving `typeof ... === 'function'` test, so this fixture
  // read clean with all five conditions green while the reflow hazard shipped (adversarial review).
  const clearChoiceCallGutted = clearChoiceGood.replace(
    "clearChoiceEl.showModal();",
    "clearChoiceEl.setAttribute('open', '');"
  );
  const astroBadClearChoiceCallGutted = astroGood.replace(clearChoiceGood, clearChoiceCallGutted);
  assert.notEqual(astroBadClearChoiceCallGutted, astroGood, 'fixture setup: the replace must actually apply');
  withTempFixture('PlayerSetup.astro', astroBadClearChoiceCallGutted, (text) => {
    const v = checkPlayerSetupAstro(text);
    assert.ok(v.some((x) => x.startsWith('(e)') && x.includes('never raised')), '(e) must flag showModal() gutted while the capability test survives');
  });
  console.log('PASS (e) known-bad fixture (showModal() call gutted, capability test intact) is flagged — Hole 1');

  // (e) known-bad: the unconditional `hidden` drop gone, so the fallback browser is never asked — the
  // question would exist and stay display:none, and the clear would run on a press nobody answered.
  const astroBadClearChoiceNoFallback = astroGood.replace('  clearChoiceEl.hidden = false;\n', '');
  withTempFixture('PlayerSetup.astro', astroBadClearChoiceNoFallback, (text) => {
    const v = checkPlayerSetupAstro(text);
    assert.ok(v.some((x) => x.startsWith('(e)') && x.includes('unconditionally')), '(e) must flag the missing no-showModal fallback');
  });
  console.log('PASS (e) known-bad fixture (no unconditional hidden drop — fallback cannot ask) is flagged');

  // (e) known-bad: raised before it is rendered. showModal() on a display:none box raises nothing, so
  // the modern browser shows no question at all while every other check here still reads green.
  const astroBadClearChoiceOrder = [
    '<dialog id="clear-choice" hidden>',
    "  if (typeof clearChoiceEl.showModal === 'function') clearChoiceEl.showModal();",
    "  clearChoiceEl.hidden = false;",
    "  if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;",
    "  const link = (e.target as Element).closest?.('a[href]:not([data-stable-exit])') as HTMLAnchorElement | null;",
    "  leaveDlg.addEventListener('close', () => { pendingHref = null; });",
  ].join('\n');
  withTempFixture('PlayerSetup.astro', astroBadClearChoiceOrder, (text) => {
    const v = checkPlayerSetupAstro(text);
    assert.ok(v.some((x) => x.startsWith('(e)') && x.includes('before hidden drops')), '(e) must flag showModal running before hidden drops');
  });
  console.log('PASS (e) known-bad fixture (showModal before the hidden drop) is flagged');

  // (e) known-bad: showModal capability-gated correctly, but with no else branch — the shape this
  // shipped as until the fail-safe path was actually driven with showModal deleted. Every other check
  // here reads green on it, and the player is never asked.
  const astroBadClearChoiceNoOpenFallback = astroGood.replace("  else clearChoiceEl.setAttribute('open', '');\n", '')
    .replace("\n  else clearChoiceEl.setAttribute('open', '');", '');
  withTempFixture('PlayerSetup.astro', astroBadClearChoiceNoOpenFallback, (text) => {
    const v = checkPlayerSetupAstro(text);
    assert.ok(v.some((x) => x.startsWith('(e)') && x.includes('never sets [open]')), '(e) must flag a no-showModal branch that only drops hidden');
  });
  console.log('PASS (e) known-bad fixture (fallback drops hidden but never sets [open]) is flagged');

  // (e) negative direction: the same lines inside comments satisfy nothing — a <dialog> quoted in prose
  // above a live <div> is exactly how this file documents its own guards.
  const astroClearChoiceCommentedOut = [
    "  if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;",
    "  const link = (e.target as Element).closest?.('a[href]:not([data-stable-exit])') as HTMLAnchorElement | null;",
    "  leaveDlg.addEventListener('close', () => { pendingHref = null; });",
    '  {/* was: <dialog id="clear-choice" hidden> — reverted, it broke the layout */}',
    '  <div id="clear-choice" hidden>',
    "  // clearChoiceEl.hidden = false;",
    "  /* if (typeof clearChoiceEl.showModal === 'function') clearChoiceEl.showModal(); */",
  ].join('\n');
  withTempFixture('PlayerSetup.astro', astroClearChoiceCommentedOut, (text) => {
    const v = checkPlayerSetupAstro(text);
    assert.ok(v.some((x) => x.includes('not a <dialog>')), '(e) a commented-out <dialog> must not satisfy the element-type check');
    assert.ok(v.some((x) => x.includes('unconditionally')), '(e) a commented-out hidden drop must not satisfy the fallback check');
    assert.ok(v.some((x) => x.includes('never raised')), '(e) a commented-out showModal must not satisfy the raise check');
  });
  console.log('PASS (e) negative direction: commented-out <dialog> / hidden drop / showModal satisfy nothing');

  // -- (a): the new dialog joins the display-gating set ---------------------------------------------
  const cssBadClearChoice = ['#clear-choice {', '  display: flex;', '}', '#leave-confirm[open] {', '  max-block-size: 45dvh;', '}'].join('\n');
  withTempFixture('tokens.css', cssBadClearChoice, (text) => {
    const v = checkTokensCss(text);
    assert.ok(v.some((x) => x.startsWith('(a)')), '(a) must flag an ungated display: rule on #clear-choice too');
  });
  console.log('PASS (a) known-bad fixture (display on bare #clear-choice) is flagged');
}

// ---------------------------------------------------------------------------
async function main() {
  if (process.argv.includes('--selftest')) return selftest();

  let anyFail = false;
  // Hole 2 (adversarial review, S2026-08-21): the success line below used to print literal "2 dialogs"
  // / "5 conditions" — constants, not a measurement. `checked` is filled only as each condition below
  // actually runs, so a dialog or condition silently dropping out of the checked set shows up as a
  // smaller printed number instead of a line that keeps claiming full coverage.
  const checked = [];

  const cssViolations = checkTokensCss(fs.readFileSync(CSS_FILE, 'utf8'), checked);
  for (const v of cssViolations) {
    console.error(`src/styles/tokens.css · ${v}`);
    anyFail = true;
  }

  const astroViolations = checkPlayerSetupAstro(fs.readFileSync(ASTRO_FILE, 'utf8'), checked);
  for (const v of astroViolations) {
    console.error(`src/shell/PlayerSetup.astro · ${v}`);
    anyFail = true;
  }

  if (anyFail) {
    console.error('\nADR-0015: the leave-confirm dialog must stay inert while closed and clear pendingHref on every dismissal (docs/adr/0015-a-leave-confirm-guards-the-links-we-cannot-move.md).');
    console.error('ADR-0024: #clear-choice must stay a non-reflowing <dialog> and must still ask when showModal is unavailable (docs/adr/0024-the-reflow-is-the-hazard-not-the-clearance.md).');
    process.exit(1);
  }
  console.log(
    `leave-confirm-check: tokens.css + PlayerSetup.astro clean — ${GUARD_DIALOG_IDS.length} dialogs (${GUARD_DIALOG_IDS.join(', ')}), ${checked.length} conditions (${checked.join(', ')})`
  );
}

await main();
