// node --test — no framework, no dependency. Source-text pins on the game shell's seams that outlived
// the setup panel: gh#273 retired PlayerSetup.astro and the tests that read its source went with it.
// What stays here reads only files that still exist — the game page, the layout, the leave-confirm
// island, the game modules — so none of it can go vacuously green on a deleted file.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';

const gamePage = readFileSync(new URL('../pages/game/[id].astro', import.meta.url), 'utf8');
const gameLayout = readFileSync(new URL('../layouts/GameLayout.astro', import.meta.url), 'utf8');
const leaveConfirm = readFileSync(new URL('./LeaveConfirm.astro', import.meta.url), 'utf8');

/** index of the `}` that closes the `{` at `open`, depth-counted from `open` — unit-tested directly
 *  against synthetic input further down this file.
 *  ponytail: handles /* *\/ and // comments and '  "  ` string literals with \ escapes; does not
 *  handle regex literals or template-literal ${} nesting — this is a test helper, not a JS parser. */
function matchBraceEnd(text, open) {
  let depth = 0;
  let inLineComment = false;
  let inBlockComment = false;
  let inString = null;
  for (let i = open; i < text.length; i += 1) {
    const c = text[i];
    if (inLineComment) { if (c === '\n') inLineComment = false; continue; }
    if (inBlockComment) { if (c === '*' && text[i + 1] === '/') { inBlockComment = false; i += 1; } continue; }
    if (inString) {
      if (c === '\\') { i += 1; continue; }
      if (c === inString) inString = null;
      continue;
    }
    if (c === '/' && text[i + 1] === '/') { inLineComment = true; i += 1; continue; }
    if (c === '/' && text[i + 1] === '*') { inBlockComment = true; i += 1; continue; }
    if (c === '"' || c === "'" || c === '`') { inString = c; continue; }
    if (c === '{') depth += 1;
    else if (c === '}') {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return -1;
}

// Neither known-broken case (a `}` inside a /* */ comment, a stray brace inside a string literal) is
// guaranteed to exist in the real sources read below — so this pins the algorithm directly against
// synthetic input where both are present.
test('matchBraceEnd ignores braces inside /* */ comments and string literals', () => {
  const withComment = "function f() {\n  /* a } inside a comment */\n  return 1;\n}";
  const withString = "function g() {\n  const s = '}';\n  return 2;\n}";
  for (const text of [withComment, withString]) {
    const open = text.indexOf('{');
    const close = matchBraceEnd(text, open);
    assert.equal(close, text.lastIndexOf('}'), `must land on the real closing brace, not a stray one: ${text}`);
  }
});

// #39 / gh#106 — the leave-confirm is its own island, mounted by GameLayout unconditionally. Riding on
// the setup panel meant inheriting its render condition, and ADR-0040's [1, 1] pages render no panel,
// so siamsi, daily-fortune and love-match once shipped with no leave-confirm anywhere. And it installs
// exactly one document click listener of its own: a second one is a game page swallowing its own
// post-start taps.
test('gh#106 LeaveConfirm owns the dialog, GameLayout mounts it with no render condition, one click listener', () => {
  assert.match(leaveConfirm, /<dialog id="leave-confirm" data-game-id=\{gameId\}>/, 'LeaveConfirm.astro owns the dialog and reads its own gameId');
  assert.match(gameLayout, /^\s*<LeaveConfirm gameId=\{game\.id\} \/>\s*$/m, 'GameLayout must mount it with no render condition — a condition is what excluded the [1, 1] pages');
  assert.equal(
    [...leaveConfirm.matchAll(/document\.addEventListener\('click'/g)].length,
    1,
    'positive control: the leave-confirm island installs exactly one document click listener of its own',
  );
});

// gh#96 / ADR-0040 — a page declaring [1, 1] has no round to start, so it mounts its module itself.
// That mount must be direct: a fake start event carries a fake one-person roster, which routes a non-"เกม"
// through the round machinery (setPlayers, planStart, the roster pill) ADR-0040 removed it from.
test('gh#96 a solo page mounts its module directly — never through the start event or a round write', () => {
  // No whole-file comment strip here: the import-meta glob strings in this file contain "/*", which a
  // textual block-comment stripper pairs with the CSS block's real "*/" far below and blanks half the
  // script. matchBraceEnd is comment-aware, so the branch extraction below needs no stripper at all,
  // and the branch's own comments carry none of the tokens the negative assertions hunt for.
  const code = gamePage;
  assert.match(
    code,
    /const isSolo = stage\.dataset\.players === '1,1'/,
    'no branch reads the declared range off the stage — every page would mount, or none would',
  );
  const soloAt = code.indexOf('if (isSolo)');
  assert.ok(soloAt >= 0, 'the solo mount branch is gone — the page has no path that does not wait for the panel');
  const open = code.indexOf('{', soloAt);
  const close = matchBraceEnd(code, open);
  assert.ok(close > open, 'positive control: the solo branch parses');
  const branch = code.slice(open + 1, close);
  assert.match(branch, /game\.mount\(stage,/, 'the solo branch must call the module mount itself');
  assert.doesNotMatch(branch, /watduang:start/, 'the solo path must not dispatch the start event — that is the panel\'s exit, and the panel does not exist here');
  assert.doesNotMatch(branch, /setPlayers/, 'the solo path must not write a round roster — ADR-0040 took the round machinery off the ดูดวง หมวด');
  // This page never dispatches "watduang:start" itself, so exactly zero dispatch sites may exist here
  // (the solo branch must not add one).
  assert.equal(
    code.split("dispatchEvent(new CustomEvent('watduang:start'").length - 1,
    0,
    'this page dispatches the start event — the dispatch belongs to the panel alone, and a dispatch here would synthesize starts the panel never produced',
  );
});

// gh#140 box 6 — identity stays in the shell, so a new game inherits it for free. The check is that no
// game module knows the cast exists: MASCOTS is imported by the shell and by the play routes, and by
// nothing under src/games.
test('gh#140 no game module imports the mascot cast', () => {
  const dir = new URL('../games/', import.meta.url);
  const offenders = readdirSync(dir)
    .filter((f) => f.endsWith('.ts') || f.endsWith('.mjs'))
    .filter((f) => /_mascots|MASCOTS/.test(readFileSync(new URL(f, dir), 'utf8')));
  assert.deepEqual(offenders, [], 'a game module reached for the cast; identity stays in the shell');
});

// gh#288 Phase 3 — the top bar's link hover is --color-muted plus a 2px underline, instant.
// --color-primary stays in this file only as the play CTA's fill fallback, never as a hover colour.
test('gh#288 the game top bar link hover is muted ink plus a 2px underline', () => {
  const css = gameLayout.slice(gameLayout.indexOf('<style>')).replace(/\/\*[\s\S]*?\*\//g, '');
  const hover = css.match(/\.game-topbar a:hover\s*\{([^}]*)\}/);
  assert.ok(hover, 'positive control: GameLayout still declares .game-topbar a:hover');
  assert.match(hover[1], /color:\s*var\(--color-muted\)/);
  assert.match(hover[1], /text-decoration:\s*underline/);
  assert.match(hover[1], /text-decoration-thickness:\s*2px/);
  assert.match(hover[1], /text-underline-offset:\s*3px/);
  assert.doesNotMatch(hover[1], /--color-primary|transition/);
  const hoverRules = [...css.matchAll(/([^{}]*:hover[^{}]*)\{([^}]*)\}/g)];
  for (const [, sel, body] of hoverRules) {
    assert.doesNotMatch(body, /--color-primary/, `--color-primary is no longer a hover colour: ${sel.trim()}`);
  }
});
