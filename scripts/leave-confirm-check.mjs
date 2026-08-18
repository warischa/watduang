#!/usr/bin/env node
// Static regression tripwire for ADR-0015 (docs/adr/0015-a-leave-confirm-guards-the-links-we-cannot-move.md):
// the closed #leave-confirm dialog must stay inert, its clearance budget must stay within the half of
// the viewport the finger is not in, and pendingHref must clear on every dismissal path, not per-button.
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
// like `:not(:is([open]))` is past what it can read.
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

const targetsLeaveConfirmOrDialog = (sel) =>
  /#leave-confirm\b/.test(sel) || /(^|[^\w-])dialog(?![\w-])/.test(sel);

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
function checkTokensCss(text) {
  const violations = [];
  const rules = parseCssRules(text);

  // (a) a rule targeting #leave-confirm (or a bare `dialog`) that sets display: must be gated on
  // [open], or it beats the UA's `dialog:not([open]) { display: none }` and the closed dialog paints.
  for (const { selector, body } of rules) {
    if (targetsLeaveConfirmOrDialog(selector) && /\bdisplay\s*:/.test(body) && !gatedOnOpen(selector)) {
      violations.push(`(a) selector "${selector}" sets display: without [open] gating — closed <dialog> becomes hit-testable`);
    }
  }

  // (b) the open-gated block's max-block-size is the clearance budget: 0.45H + 16 < 0.5H only holds
  // at <= 45dvh. Missing entirely is as broken as too large — the invariant would be unenforced.
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

// (c) + (d): src/shell/PlayerSetup.astro
function checkPlayerSetupAstro(rawText) {
  const violations = [];
  // (c) and (d) all assert something MUST be present, so they must never see a comment: this file
  // documents its own guards in prose right above them, and an old line left commented out while the
  // live one is weakened is exactly the bypass this strip closes.
  const text = stripComments(rawText);

  // (c) pendingHref must clear on the dialog's own `close` event (fires for every dismissal path),
  // not per-button — clearing per-button was the shipped defect: a later #leave-go press could still
  // navigate on a pendingHref left over from an answer already given the other way.
  const closeMatch = text.match(/addEventListener\(\s*(['"])close\1\s*,\s*\(\)\s*=>\s*\{([^}]*)\}\s*\)/);
  if (!closeMatch) {
    violations.push("(c) no dialog 'close' event listener found — pendingHref must be cleared there, not per-button");
  } else if (!/pendingHref\s*=\s*null/.test(closeMatch[2])) {
    violations.push("(c) the dialog's 'close' event listener no longer clears pendingHref = null");
  }

  // (d) a modified or non-primary click is the round-PRESERVING gesture (opens a sibling game in a new
  // tab) and must pass through untouched, or the guard turns the safe action into the destructive one.
  if (!/e\.metaKey\s*\|\|\s*e\.ctrlKey\s*\|\|\s*e\.shiftKey\s*\|\|\s*e\.altKey\s*\|\|\s*e\.button\s*!==\s*0/.test(text)) {
    violations.push('(d) modified/non-primary click passthrough (metaKey/ctrlKey/shiftKey/altKey/button check) is missing');
  }
  // (d) GameLayout's stable /games/ link must stay excluded, or the guard intercepts the one link that
  // never moves and does not need asking about.
  if (!text.includes("a[href]:not([data-stable-exit])")) {
    violations.push("(d) the a[href]:not([data-stable-exit]) selector is missing — the stable exit link must stay excluded");
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

  // -- (c)/(d): PlayerSetup.astro -------------------------------------------
  const astroGood = [
    "  if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;",
    "  const link = (e.target as Element).closest?.('a[href]:not([data-stable-exit])') as HTMLAnchorElement | null;",
    "  leaveDlg.addEventListener('close', () => { pendingHref = null; });",
    "  leaveStayBtn.addEventListener('click', () => leaveDlg.close());",
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
  ].join('\n');
  withTempFixture('PlayerSetup.astro', astroGoodWithComments, (text) => {
    assert.deepEqual(checkPlayerSetupAstro(text), [], 'live guards next to prose comments must still report zero violations');
  });
  console.log('PASS comment bypass, calibration: live guards documented by comments above them still report clean');
}

// ---------------------------------------------------------------------------
async function main() {
  if (process.argv.includes('--selftest')) return selftest();

  let anyFail = false;

  const cssViolations = checkTokensCss(fs.readFileSync(CSS_FILE, 'utf8'));
  for (const v of cssViolations) {
    console.error(`src/styles/tokens.css · ${v}`);
    anyFail = true;
  }

  const astroViolations = checkPlayerSetupAstro(fs.readFileSync(ASTRO_FILE, 'utf8'));
  for (const v of astroViolations) {
    console.error(`src/shell/PlayerSetup.astro · ${v}`);
    anyFail = true;
  }

  if (anyFail) {
    console.error('\nADR-0015: the leave-confirm dialog must stay inert while closed and clear pendingHref on every dismissal (docs/adr/0015-a-leave-confirm-guards-the-links-we-cannot-move.md).');
    process.exit(1);
  }
  console.log('leave-confirm-check: tokens.css + PlayerSetup.astro clean');
}

await main();
