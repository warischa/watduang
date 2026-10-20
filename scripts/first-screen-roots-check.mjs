#!/usr/bin/env node
// Gate (gh#269 box 2, the static half): every party play route declares, element by element, what its
// first screen is made of, so the shared hold can keep the route's gameplay out of sight until the
// shared player screen hands over.
//
// THE HOLD it serves lives in PlayerScreen.astro: `html:not([data-render-hold="free"])
// [data-first-screen-root="gameplay"]` is hidden. The attribute on <html> is the shared controller's
// render hold (RENDER_HOLD_ATTR in player-screen.ts): absent before any script runs, `held` while the
// screen migrates, opens, is open or saves, `free` once it has handed over. So a gameplay root is
// hidden from first paint, shown at handover, and hidden again on every reopen -- with no route code.
// What this gate owns is the other half: that every element of the first screen is classified, so
// nothing the route paints escapes the hold by being forgotten.
//
// THE SET. Routes: every manifest game with a `playRoute`, imported at run time, never listed here.
// Elements, per route: the FRONTIER of its markup.html -- the top-level elements, and the children of
// every element declared `container`, recursively. Each frontier element has exactly one role:
//   gameplay  -- held by the shared CSS until handover. The default for anything the game owns.
//   ps-mount  -- the element the route hands to mountPlayerScreen as its root (exactly one). It may
//                sit on the frontier or inside a pre-open root, never inside a gameplay root, or the
//                hold would hide the player screen itself.
//   pre-open  -- shown before the screen opens and put away (or held, by class) by the route's own
//                tested script: one-bomb's menu, croc-bite's setup screen (owner ruling 2026-10-20),
//                and the intro screens of the routes whose screen opens after their intro.
//   chrome    -- must stay usable while the screen is open: the header, the dialogs it opens, live
//                regions, a renderer-failure notice.
//   container -- a wrapper that holds the mount and its siblings; never held, its children are the
//                next level of the frontier. Bare text directly inside one is RED (it belongs to no root).
// Why a hierarchy and not a flat list of top-level children: on every route the mount sits two to four
// levels deep inside one wrapper, so a flat top-level partition cannot hold the gameplay beside it.
//
// THE DECLARATION is the route's own game entry (`firstScreenRoots`, GameModule in types.ts), required
// by the type whenever `playRoute` is set, so `tsc` reds a route that never answered. Keyed `#id`, or
// `tag.class.class` for an element with no id. The markup carries the CSS hook ONLY where the hold
// applies -- data-first-screen-root="gameplay" -- so the entry is the one source for every other role
// and a lifted tag the mockup-divergence registry records stays byte-identical. RED, each:
//   - a frontier element the entry does not declare (fail closed: a new element is held or classified);
//   - a declared gameplay root whose markup lost the attribute (the hold can no longer see it);
//   - the attribute on an element not declared gameplay, on any other value, or below the frontier;
//   - a declared key with no frontier element, or with two;
//   - the ps-mount inside a gameplay root, or off the frontier outside a pre-open root;
//   - no gameplay root at all.
//
// NOT HERE, on purpose: which element a route actually mounts into. This gate reads markup.html only, so
// it proves where the DECLARED ps-mount sits in markup, never that the route's script hands that element
// to mountPlayerScreen. Any static reading of the route script enumerates a parser-owned set (a dead
// lookup beside a real one on a gameplay element passes it), so none is attempted. The check that does
// prove it is scripts/player-screen-face-probe.mjs (hold pass), which reads the actual mounted `.ps` root
// in a browser.
//
// NOT HERE, on purpose (owner DoD amendment 2026-10-20): grading CSS that could override the hold.
// Selector, specificity and cascade belong to the parser and the browser; the browser lane reads the
// held roots' computed visibility instead. Stated ceiling: a root with display:contents plus a child
// that overrides visibility is not covered; nor is content a script inserts outside every root, nor
// whether a role was judged right -- that a chrome dialog is really reachable while the screen is open
// is the route author's call, recorded in the entry.
//
// Parser: markup.html -> parse5 (the HTML parser astro itself depends on; reached through astro, not
// declared directly).
//
//   node scripts/first-screen-roots-check.mjs             -> audit every party play route
//   node scripts/first-screen-roots-check.mjs --selftest  -> both-direction calibration on fixtures
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseFragment } from 'parse5';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FIXTURES = path.join(root, 'scripts/fixtures/first-screen-roots');

export const ATTR = 'data-first-screen-root';
export const HELD = 'gameplay';
export const ROLES = new Set([HELD, 'ps-mount', 'pre-open', 'chrome', 'container']);

const attrsOf = (el) => Object.fromEntries(el.attrs.map((a) => [a.name, a.value]));
/** A template's children live in its content fragment, not in childNodes. */
const contentOf = (el) => (el.tagName === 'template' ? el.content : el);
const elementsOf = (node) => (contentOf(node).childNodes ?? []).filter((c) => c.tagName);

/** The key an element is declared under: `#id`, or `tag.class.class` when it has no id. */
export function keyOf(el) {
  const a = attrsOf(el);
  if (a.id) return `#${a.id}`;
  const classes = (a.class ?? '').trim();
  return classes ? `${el.tagName}.${classes.split(/\s+/).join('.')}` : el.tagName;
}

/** One route's failures. Pure over its inputs, so the selftest drives it on fixture strings.
 *  `declared` is the entry's firstScreenRoots. */
export function auditRoute({ id, markup, declared }) {
  const failures = [];
  const fail = (why) => failures.push(`${id}: ${why}`);
  if (!declared || typeof declared !== 'object' || Array.isArray(declared)) {
    fail('declares a playRoute but no firstScreenRoots in its game entry');
    return failures;
  }
  for (const [key, role] of Object.entries(declared)) {
    if (!ROLES.has(role)) fail(`declares ${key} as '${role}', which is not a role (${[...ROLES].join(' | ')})`);
  }
  const declaredMounts = Object.keys(declared).filter((k) => declared[k] === 'ps-mount');
  if (declaredMounts.length !== 1) fail(`declares ${declaredMounts.length} player-screen mounts (ps-mount); exactly one is required`);

  const frag = parseFragment(markup);
  const frontier = new Map(); // element -> role, for every element the walk reached
  const seen = new Map(); // key -> how many frontier elements carry it
  (function walk(parent, where) {
    for (const node of contentOf(parent).childNodes ?? []) {
      if (node.nodeName === '#text' && node.value.trim()) {
        fail(`bare text "${node.value.trim().slice(0, 30)}" sits ${where}, outside every declared root`);
        continue;
      }
      if (!node.tagName) continue;
      const key = keyOf(node);
      seen.set(key, (seen.get(key) ?? 0) + 1);
      const role = declared[key];
      const mark = attrsOf(node)[ATTR];
      if (mark !== undefined && mark !== HELD) fail(`${key} carries ${ATTR}="${mark}": markup marks only ${HELD} roots, every other role lives in the game entry`);
      if (role === undefined) {
        fail(`${key} ${where} is an UNDECLARED first-screen element: declare its role in the game entry's firstScreenRoots${mark === HELD ? '' : ` (and mark it ${ATTR}="${HELD}" if it is gameplay)`}`);
        continue;
      }
      frontier.set(node, role);
      if (role === HELD && mark !== HELD) fail(`${key} is declared ${HELD} but markup.html does not mark it ${ATTR}="${HELD}": the hold cannot see it`);
      if (role !== HELD && mark === HELD) fail(`${key} is marked ${HELD} in markup.html but declared ${role} in the game entry`);
      if (role === 'container') walk(node, `inside container ${key}`);
    }
  })(frag, 'at the top level');

  // Everything below the frontier: stray marks, and the mount wherever it sits.
  const mountKey = declaredMounts.length === 1 ? declaredMounts[0] : null;
  const mounts = [];
  (function scan(parent, chain) {
    for (const el of elementsOf(parent)) {
      if (mountKey && keyOf(el) === mountKey) mounts.push({ el, chain });
      if (!frontier.has(el) && attrsOf(el)[ATTR] !== undefined && chain.some((a) => frontier.has(a) && frontier.get(a) !== 'container')) {
        const holder = [...chain].reverse().find((a) => frontier.has(a));
        fail(`${keyOf(el)} carries ${ATTR} but is nested inside ${keyOf(holder)}: only frontier elements are declared`);
      }
      scan(el, [...chain, el]);
    }
  })(frag, []);

  if (mountKey) {
    if (mounts.length !== 1) fail(`the declared ps-mount ${mountKey} matches ${mounts.length} elements in markup.html; exactly one is required`);
    for (const { el, chain } of mounts) {
      const gameplay = chain.find((a) => frontier.get(a) === HELD || attrsOf(a)[ATTR] === HELD);
      if (gameplay) fail(`the player-screen mount ${mountKey} sits inside gameplay root ${keyOf(gameplay)}: the hold would hide the player screen itself`);
      else if (!frontier.has(el)) {
        const holder = [...chain].reverse().find((a) => frontier.has(a));
        if (!holder || frontier.get(holder) !== 'pre-open') fail(`the player-screen mount ${mountKey} is off the frontier and not inside a pre-open root`);
      }
    }
  }

  for (const [key, role] of Object.entries(declared)) {
    if (key === mountKey) continue; // counted above, where it may sit inside a pre-open root
    const n = seen.get(key) ?? 0;
    if (n === 0) fail(`the game entry declares ${key} as ${role}, but markup.html has no frontier element ${key}`);
    else if (n > 1) fail(`${n} frontier elements are keyed ${key}: give each an id so the declaration names exactly one`);
  }
  if (!Object.values(declared).includes(HELD)) fail(`declares no ${HELD} root, so the hold holds nothing`);
  return failures;
}

async function audit() {
  const { games } = await import(pathToFileURL(path.join(root, 'src/games/manifest.ts')).href);
  const routed = games.filter((g) => g.playRoute);
  const failures = [];
  if (routed.length === 0) {
    console.error('first-screen-roots-check: the manifest yields no play route -- an empty work set is a failure, not a pass');
    process.exit(1);
  }
  for (const g of games.filter((x) => !x.playRoute && x.firstScreenRoots !== undefined)) {
    failures.push(`${g.id}: declares firstScreenRoots but has no playRoute -- nothing renders those roots`);
  }
  const counts = [];
  for (const g of routed) {
    const markupPath = path.join(root, 'src/play', g.id, 'markup.html');
    if (!fs.existsSync(markupPath)) {
      failures.push(`${g.id}: declares a play route but has no src/play/${g.id}/markup.html to read`);
      continue;
    }
    const markup = fs.readFileSync(markupPath, 'utf8');
    failures.push(...auditRoute({ id: g.id, markup, declared: g.firstScreenRoots }));
    const roles = Object.values(g.firstScreenRoots ?? {});
    counts.push(`${g.id} ${roles.filter((r) => r === HELD).length}/${roles.length}`);
  }
  if (failures.length) {
    for (const f of failures) console.error(`::error::${f}`);
    console.error(`\ngh#269: every first-screen element of a play route is declared, and the player-screen mount is never inside a held gameplay root. ${failures.length} failure(s).`);
    process.exit(1);
  }
  console.log(`first-screen-roots-check: ${routed.length} play route(s), every frontier element declared (gameplay/declared): ${counts.join(', ')}.`);
  console.log('first-screen-roots-check: NOT covered -- that a held root is really hidden in a browser (the browser lane reads computed visibility), a display:contents root with a child override, content a script inserts outside every root, and whether each role was judged right.');
}

function selftest() {
  const read = (name) => fs.readFileSync(path.join(FIXTURES, name), 'utf8');
  const good = read('good.html');
  const declared = { '#app': 'container', header: 'chrome', '#players': 'ps-mount', '#board': 'gameplay', '#live': 'chrome', '#rules': 'chrome' };
  const run = (markup, extra = {}) => auditRoute({ id: 'fx', markup, declared, ...extra }).join('\n');

  // POSITIVE CONTROLS: the mount on the frontier, and the mount inside a pre-open root (one-bomb's shape).
  assert.equal(run(good), '', 'POSITIVE CONTROL: a fully declared route passes');
  const preOpenDecl = { '#app': 'container', '#menu': 'pre-open', '#players': 'ps-mount', '#board': 'gameplay' };
  assert.equal(run(read('good-pre-open.html'), { declared: preOpenDecl }), '', 'POSITIVE CONTROL: a mount inside a pre-open root passes');
  console.log('PASS positive: a declared route and a mount framed by a pre-open root both pass');

  // MUST-RED 1: a declared gameplay root whose attribute was stripped.
  assert.match(run(read('stripped.html')), /#board is declared gameplay but markup.html does not mark it/);
  console.log('PASS stripped: a gameplay root with its attribute removed reds');

  // MUST-RED 2: an undeclared top-level element.
  assert.match(run(read('undeclared.html')), /div at the top level is an UNDECLARED first-screen element/);
  console.log('PASS undeclared: a new top-level element nobody classified reds');

  // MUST-RED 3: the mount nested inside a gameplay root.
  assert.match(run(read('nested-mount.html')), /mount #players sits inside gameplay root #board/);
  console.log('PASS containment: a player-screen mount inside a gameplay root reds');

  // MUST-RED: the other ways the partition can leak.
  assert.match(run(read('text-at-frontier.html')), /bare text "Loose text" sits inside container #app/);
  assert.match(run(read('off-frontier.html')), /#inner carries data-first-screen-root but is nested inside #board/);
  assert.match(run(good, { declared: { ...declared, '#board': 'chrome' } }), /#board is marked gameplay in markup.html but declared chrome/);
  assert.match(run(good.replace('<p id="live"', '<p data-first-screen-root="chrome" id="live"')), /#live carries data-first-screen-root="chrome": markup marks only gameplay/);
  const { '#rules': _gone, ...lessDecl } = declared;
  assert.match(run(good, { declared: lessDecl }), /#rules at the top level is an UNDECLARED/);
  assert.match(run(good, { declared: { ...declared, '#ghost': 'gameplay' } }), /declares #ghost as gameplay, but markup.html has no frontier element/);
  assert.match(run(good, { declared: { ...declared, '#board': 'hidden' } }), /'hidden', which is not a role/);
  assert.match(run(good, { declared: undefined }), /no firstScreenRoots/);
  assert.match(run(good.replace(' data-first-screen-root="gameplay"', ''), { declared: { ...declared, '#board': 'chrome' } }), /declares no gameplay root/);
  assert.match(run(good.replace('<p id="live"', '<header></header><p id="live"')), /2 frontier elements are keyed header/);
  console.log('PASS partition: bare text, a nested mark, a role mismatch, a non-gameplay mark, an undeclared element, a ghost declaration, a bad role, no declaration, no gameplay and a duplicate key each red');

  // The mount: where it sits in markup.
  assert.match(run(good, { declared: { ...declared, '#app': 'chrome' } }), /mount #players is off the frontier and not inside a pre-open root/);
  assert.match(run(good, { declared: { ...declared, '#live': 'ps-mount' } }), /declares 2 player-screen mounts/);
  console.log('PASS mount: off the frontier outside pre-open, two declared mounts red');
  console.log('first-screen-roots-check --selftest: all legs passed');
}

if (process.argv.includes('--selftest')) selftest();
else await audit();
