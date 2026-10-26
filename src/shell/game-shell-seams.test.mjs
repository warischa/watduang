// node --test — no framework, no dependency. Source-text pins on the game shell's seams that outlived
// the setup panel: gh#273 retired PlayerSetup.astro and the tests that read its source went with it.
// What stays here reads only files that still exist — the game page, the layout, the leave-confirm
// island, the game modules — so none of it can go vacuously green on a deleted file.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import siamsi from '../games/siamsi.ts';
import { ARM_DELAY_MS } from '../games/_arm-gate.ts';
import { makeDocument, elementsWithPointerleave } from '../games/_fake-dom.mjs';

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

// gh#288 Phase 3b — the fortune game buttons' hover and press, owner pick A (2026-10-26). The values
// are the board's frame btn-a, copied; the transition mirrors .ui-press in web.css token for token.
// Fortune buttons never carry .ui-press (their rest shadow is translucent, not ink), so the page's
// own global block owns the motion, and nothing here may touch a disabled control: the arm gate
// renders a control disabled for its window, and a press on it must not move or underline it.
/** the parts of a selector list, split on commas outside parentheses */
function splitTopLevel(list) {
  const parts = [];
  let depth = 0;
  let from = 0;
  for (let i = 0; i < list.length; i += 1) {
    if (list[i] === '(') depth += 1;
    else if (list[i] === ')') depth -= 1;
    else if (list[i] === ',' && depth === 0) { parts.push(list.slice(from, i).trim()); from = i + 1; }
  }
  parts.push(list.slice(from).trim());
  return parts;
}

function flattenRules(css, media = null) {
  const out = [];
  let i = 0;
  while (i < css.length) {
    const open = css.indexOf('{', i);
    if (open === -1) break;
    const prelude = css.slice(i, open).trim();
    const close = matchBraceEnd(css, open);
    assert.ok(close !== -1, `unbalanced braces after: ${prelude}`);
    const inner = css.slice(open + 1, close);
    if (prelude.startsWith('@media')) out.push(...flattenRules(inner, prelude.replace(/^@media\s*/, '')));
    else {
      // each selector is its own rule, but keeps its whole list: a check scoped to state rules must
      // still see a non-state sibling that shares the declarations
      const list = splitTopLevel(prelude);
      for (const sel of list) out.push({ media, sel, list, body: inner.trim() });
    }
    i = close + 1;
  }
  return out;
}

const gamePageCss = gamePage
  .slice(gamePage.indexOf('<style is:global>') + '<style is:global>'.length, gamePage.lastIndexOf('</style>'))
  .replace(/\/\*[\s\S]*?\*\//g, '');
const gamePageRules = flattenRules(gamePageCss);
/** declarations of the one rule with this selector under this media prelude (null = top level) */
function declsOf(sel, media = null) {
  const hits = gamePageRules.filter((r) => r.sel === sel && r.media === media);
  assert.equal(hits.length, 1, `exactly one rule for "${sel}" under ${media ?? 'no media'}, found ${hits.length}`);
  return hits[0].body.split(';').map((d) => d.trim().replace(/\s+/g, ' ')).filter(Boolean);
}
const RM = '(prefers-reduced-motion: reduce)';
const HOVER = '(hover: hover)';
const RM_HOVER = '(prefers-reduced-motion: reduce) and (hover: hover)';
const PRIMARY = '.game-btn-primary';
const SECONDARY = '.game-btn-secondary';
const NOT_OFF = ':not(:disabled)';

test('gh#288 fortune button motion: the global block parses into rules (positive control)', () => {
  assert.ok(gamePageRules.some((r) => r.sel === '.game-btn-primary' && r.media === null), 'primary rest rule found');
  assert.ok(gamePageRules.some((r) => r.sel === '.game-btn-secondary:disabled'), 'secondary disabled rule found');
});

test('gh#288 fortune buttons: primary hover and press carry the board values', () => {
  assert.deepEqual(declsOf(`${PRIMARY}:hover${NOT_OFF}`, HOVER), [
    'transform: translate(-2px, -2px)',
    'box-shadow: 7px 7px 0 rgba(20, 20, 43, 0.3)',
  ]);
  assert.deepEqual(declsOf(`${PRIMARY}:active${NOT_OFF}`), [
    'transform: translate(5px, 5px)',
    'box-shadow: none',
  ]);
});

test('gh#288 fortune buttons: secondary hover underlines, press drops 2px with no underline', () => {
  assert.deepEqual(declsOf(`${SECONDARY}:hover${NOT_OFF}`, HOVER), [
    'text-decoration: underline',
    'text-decoration-thickness: 2px',
    'text-underline-offset: 3px',
  ]);
  assert.deepEqual(declsOf(`${SECONDARY}:active${NOT_OFF}`), [
    'transform: translate(0, 2px)',
    'text-decoration: none',
  ]);
});

test('gh#288 fortune buttons: reduced motion never transforms; primary keeps shadow-only, secondary press underlines', () => {
  assert.deepEqual(declsOf(`${PRIMARY}:hover${NOT_OFF}`, RM_HOVER), [
    'transform: none',
    'box-shadow: 7px 7px 0 rgba(20, 20, 43, 0.3)',
  ]);
  assert.deepEqual(declsOf(`${PRIMARY}:active${NOT_OFF}`, RM), ['transform: none', 'box-shadow: none']);
  assert.deepEqual(declsOf(`${SECONDARY}:active${NOT_OFF}`, RM), [
    'transform: none',
    'text-decoration: underline',
    'text-decoration-thickness: 2px',
    'text-underline-offset: 3px',
  ]);
});

test('gh#288 fortune buttons: transition mirrors .ui-press tokens, reduced form is shadow-only', () => {
  const norm = (a) => a.join(';');
  assert.equal(
    norm(declsOf('.game-btn')).includes('transition: transform var(--motion-ui) var(--ease-out), box-shadow var(--motion-ui) var(--ease-out)'),
    true,
    'normal transition on .game-btn',
  );
  assert.deepEqual(declsOf('.game-btn', RM), ['transition: box-shadow var(--motion-rm-quick) var(--ease-rm)']);
});

test('gh#288 fortune buttons: no hover or press rule can reach a disabled control', () => {
  // a selector listed beside a state selector carries the same declarations, so it is checked too
  const states = gamePageRules.filter((r) => r.list.some((s) => /:(hover|active)\b/.test(s)));
  assert.ok(states.length >= 7, `positive control: hover/press rules exist, found ${states.length}`);
  for (const r of states) {
    assert.ok(r.sel.endsWith(NOT_OFF), `state rule must exclude disabled controls: ${r.sel}`);
  }
  for (const r of states.filter((x) => x.media === null || x.media === HOVER)) {
    // the held registration pairs the bare .game-btn with .game-btn-held on purpose, to out-rank every variant
    const sel = r.sel.replace(/\.game-btn(?=\.game-btn-held(?![-\w]))/, '');
    assert.doesNotMatch(sel, /\.game-btn(?![-\w])/, `state rules name a variant, never the bare .game-btn: ${r.sel}`);
  }
  for (const r of states.filter((x) => x.media === HOVER || x.media === RM_HOVER)) {
    assert.match(r.sel, /:hover/, `hover media holds only hover rules: ${r.sel}`);
  }
});

test('gh#288 fortune buttons: a state rule is declared after its normal-motion twin so reduced motion and press win by order', () => {
  const idx = (sel, media) => gamePageRules.findIndex((r) => r.sel === sel && r.media === media);
  for (const v of [PRIMARY, SECONDARY]) {
    const hover = idx(`${v}:hover${NOT_OFF}`, HOVER);
    const hoverRm = idx(`${v}:hover${NOT_OFF}`, RM_HOVER); // primary only: the secondary hover has no transform to cancel
    const active = idx(`${v}:active${NOT_OFF}`, null);
    const activeRm = idx(`${v}:active${NOT_OFF}`, RM);
    assert.ok(hover !== -1, `${v}: hover rule found`);
    if (v === PRIMARY) assert.ok(hoverRm > hover, `${v}: reduced hover after hover`);
    assert.ok(active > Math.max(hover, hoverRm), `${v}: press after every hover, so a pressed hovered button shows the press`);
    assert.ok(activeRm > active, `${v}: reduced press after press`);
  }
});

// gh#288 REFUTE — a HELD control (its hold stops on pointerleave, no pointer capture) must never
// move under a stationary pointer, so no hover or press rule may give it a transform. A held
// control registers itself with the generic `game-btn-held` class, whatever variant it wears.
/** final `transform` of an enabled element carrying `classes`, in the given state and mode; the
 *  cascade is importance, then specificity (classes + state pseudo-classes + a :not(:disabled)),
 *  then source order. It models no cascade layers, so the page CSS must declare none. */
function finalTransform(classes, { hover, active, reduced }) {
  let best = null;
  gamePageRules.forEach((r, order) => {
    if (r.media === HOVER && !hover) return;
    if (r.media === RM && !reduced) return;
    if (r.media === RM_HOVER && !(reduced && hover)) return;
    if (/(?<!:not\()\s*:disabled/.test(r.sel.replace(':not(:disabled)', ''))) return;
    const bare = r.sel.replace(':not(:disabled)', '');
    const cls = [...bare.matchAll(/\.[\w-]+/g)].map((m) => m[0].slice(1));
    if (!cls.every((c) => classes.includes(c))) return;
    const states = [...bare.matchAll(/:(hover|active)\b/g)].map((m) => m[1]);
    if (states.includes('hover') && !hover) return;
    if (states.includes('active') && !active) return;
    // inside one block the last important transform wins, else the last normal one
    const decls = [...r.body.matchAll(/(?:^|;)\s*transform:\s*([^;]+)/g)].map((d) => ({
      important: /!\s*important\s*$/.test(d[1].trim()),
      value: d[1].replace(/!\s*important\s*$/, '').trim(),
    }));
    if (!decls.length) return;
    const own = decls.filter((d) => d.important).at(-1) ?? decls.at(-1);
    const { important, value } = own;
    const spec = cls.length + states.length + (r.sel.includes(':not(:disabled)') ? 1 : 0);
    // cascade: an important declaration beats any normal one, then specificity, then source order
    let wins = true;
    if (best) {
      if (important !== best.important) wins = important;
      else if (spec !== best.spec) wins = spec > best.spec;
      else wins = order > best.order;
    }
    if (wins) best = { important, spec, order, value };
  });
  return best ? best.value : 'none';
}

/** class lists of the held controls siamsi really renders: every element with a live pointerleave
 *  listener on the hold screen, read off the mounted tree rather than named here */
function renderedHeldClassLists(t) {
  const fakeDocument = makeDocument();
  globalThis.document = fakeDocument;
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval'] });
  const stage = fakeDocument.createElement('div');
  siamsi.mount(stage, {
    roster: { names: () => [], add() {} },
    session: { players: [], setPlayers() {}, played: [], markPlayed() {}, checkpoint: null, saveCheckpoint() {}, clear() {} },
  });
  t.mock.timers.tick(ARM_DELAY_MS + 1);
  stage.querySelector('#ss-intent-done').click();
  const lists = elementsWithPointerleave(stage).map((e) => e.className.split(/\s+/).filter(Boolean));
  siamsi.dispose();
  return lists;
}

test('gh#288 held controls: the game page CSS declares no @layer, which the cascade model cannot represent', () => {
  assert.doesNotMatch(gamePageCss, /@layer\b/, 'a cascade layer would void finalTransform\'s verdict');
});

test('gh#288 held controls: no hover or press state, in either motion mode, gives them a transform', (t) => {
  assert.equal(
    finalTransform(['game-btn', 'game-btn-primary'], { hover: true, active: true, reduced: false }),
    'translate(5px, 5px)',
    'positive control: a tapped primary button does move when pressed',
  );
  assert.equal(
    finalTransform(['game-btn', 'game-btn-primary'], { hover: true, active: false, reduced: false }),
    'translate(-2px, -2px)',
    'positive control: a hovered primary button does lift',
  );
  const real = renderedHeldClassLists(t);
  assert.ok(real.length > 0, 'positive control: the mounted hold screen renders a held control');
  const sets = [
    ...['game-btn-primary', 'game-btn-secondary'].map((variant) => ['game-btn', variant, 'game-btn-held']),
    ...real,
  ];
  for (const classes of sets) {
    for (const reduced of [false, true]) {
      for (const [hover, active] of [[true, false], [false, true], [true, true]]) {
        assert.equal(
          finalTransform(classes, { hover, active, reduced }),
          'none',
          `held .${classes.join('.')} must not transform (hover ${hover}, active ${active}, reduced ${reduced})`,
        );
      }
    }
  }
});

// A game that binds pointerleave on a control must register it as held. The scan is a tripwire on
// the substring, so any quote style or binding API trips it; the runtime check in each game's own
// test is what proves the registration on the live element.
test('gh#288 held controls: every game file that mentions pointerleave also registers game-btn-held', () => {
  const dir = new URL('../games/', import.meta.url);
  const scanned = readdirSync(dir)
    .filter((n) => n.endsWith('.ts'))
    .map((n) => [n, readFileSync(new URL(n, dir), 'utf8')])
    .filter(([, src]) => src.includes('pointerleave'));
  assert.ok(scanned.length > 0, 'positive control: some game binds pointerleave');
  assert.ok(scanned.some(([n]) => n === 'siamsi.ts'), `positive control: siamsi.ts is in the set, got ${scanned.map(([n]) => n)}`);
  for (const [n, src] of scanned) {
    assert.ok(src.includes('game-btn-held'), `${n} binds pointerleave but never registers game-btn-held`);
  }
});
