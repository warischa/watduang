#!/usr/bin/env node
// Gate (gh#264, ADR-0071 "Enforcement"): every party play route mounts the ONE shared player screen
// and writes no player key of its own. A rule held only in prose would not stop the next port: a
// mockup brings its own setup screen with it, and that screen keeps its own list.
//
// THE SET is enumerated at run time from the manifest -- every party game with a playRoute -- never
// typed here, so a route that lands tomorrow is in it the day its module declares the route. Each
// route lands in exactly one class, and a route in neither is RED:
//   converted -- its main file calls mountPlayerScreen({ ... }), its play.astro renders the shared
//                <PlayerScreen /> (the mount throws without it), and its own files touch no web
//                storage, spell no `watduang:` key, keep no roster-bridge.ts and import no roster
//                write. A route that does all of that but still keeps one private list is RED.
//   pending   -- named in PENDING below, the routes not yet converted during the gh#264 fan-out.
//                Reported on EVERY run, by name, so a green can never be read as "all converted".
//                The set only shrinks: a pending route that already mounts the screen is RED until
//                its entry is deleted, and an entry naming a route the manifest no longer has is RED.
// A route with no mount and no pending entry is a failure, never a skip.
//
// Also here, because it is the same promise from the other side (ADR-0071 ruling 7): every party
// game's declared maximum must sit at or under the shared ROSTER_CEILING, read from the shared
// screen's own module, so a game declaring more seats than the roster can hold reds the build.
//
// PARSED, NOT MATCHED (gh#264 REFUTE rounds 1 and 2). Each grammar goes to the parser that owns it:
//   - .ts / .js route files -> the TypeScript compiler API (installed for `astro check`). The mount
//     is a real CallExpression of `mountPlayerScreen` with an object argument; storage and roster
//     writes are real Identifier nodes; a private key is a real string-literal node. A comment or a
//     string is not a node of those kinds, so a commented-out call, a quoted fake call and prose
//     about storage are non-code by construction.
//   - play.astro -> the Astro compiler's own parse (@astrojs/compiler, the parser `astro build`
//     runs; reached through astro, not declared directly). <PlayerScreen /> must be a COMPONENT node
//     of the template, imported in the frontmatter (parsed by TypeScript) from the shared screen's
//     file. An HTML comment is a comment node, and "<!--" inside a script string is script text.
//   - markup.html -> no script runs from it; its HTML comments are blanked (both delimiters
//     explicit) and the private-key literal looked for in what is left.
// Two text-shaped versions of this gate failed: line-shape stripping read a commented mount and
// storage after a block comment as clean, and a comment blanker over a whole .astro file read two
// script strings holding "<!--" and "-->" as one comment erasing a real <PlayerScreen />.
//
// ponytail: each route's own top-level files (.ts/.js/.html, tests excluded). A call or identifier in
// dead code still counts (a parser sees syntax, not reachability), storage reached through an alias
// it does not name is invisible, and a sub-directory is not read -- the flat bound the other
// play-route gates carry.
//
//   node scripts/player-screen-mount-check.mjs             -> audit every party play route
//   node scripts/player-screen-mount-check.mjs --selftest  -> both-direction calibration on fixtures
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';
import { parse as parseAstro } from '@astrojs/compiler/sync';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Not yet converted (gh#264 fan-out). Delete an id in the same commit that converts its route. */
export const PENDING = new Set([
  'bangkok-drift',
  'cannon-flag',
  'croc-bite',
  'freeze-tap',
  'how-close-is-near',
  'one-bomb',
  'pinocchio-luck',
  'power-meter',
  'short-stick',
  'wire-snip-panic',
  'zero-trigger',
]);

/** An HTML comment blanked to spaces, newlines kept -- both delimiters are explicit, so this
 *  enumerates nothing a grammar has an opinion about. */
const blankHtmlComments = (text) => text.replace(/<!--[\s\S]*?-->/g, (c) => c.replace(/[^\n]/g, ' '));

/** Roster write paths a route must not reach itself -- the shared screen is the only writer. Named
 *  as identifiers, so an import or a call of any of them reds. applyRosterOps is the shared screen's
 *  own write; replaceRoster is the name it replaced, kept so a revert reds too. */
const ROSTER_WRITERS = new Set(['saveGroup', 'applyRosterOps', 'replaceRoster', 'migrateLegacyList', 'saveOnSetupComplete']);
const STORAGE = new Set(['localStorage', 'sessionStorage']);
const STRING_KINDS = new Set([
  ts.SyntaxKind.StringLiteral,
  ts.SyntaxKind.NoSubstitutionTemplateLiteral,
  ts.SyntaxKind.TemplateHead,
  ts.SyntaxKind.TemplateMiddle,
  ts.SyntaxKind.TemplateTail,
]);

/** Every node of a TS/JS source, by the TypeScript parser. */
function nodesOf(name, text) {
  const kind = name.endsWith('.ts') ? ts.ScriptKind.TS : ts.ScriptKind.JS;
  const sf = ts.createSourceFile(name, text, ts.ScriptTarget.Latest, true, kind);
  const out = [];
  (function walk(node) {
    out.push(node);
    ts.forEachChild(node, walk);
  })(sf);
  return out;
}

/** What one route file really does, read from its syntax tree (or, for markup, its comment-free text). */
export function readRouteFile(name, text) {
  if (name.endsWith('.html')) {
    const code = blankHtmlComments(text);
    return { mounts: 0, own: /['"`]watduang:/.test(code) ? ['spells a watduang: storage key of its own'] : [] };
  }
  const own = new Set();
  let mounts = 0;
  for (const node of nodesOf(name, text)) {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'mountPlayerScreen'
      && node.arguments.length > 0 && ts.isObjectLiteralExpression(node.arguments[0])) mounts += 1;
    if (ts.isIdentifier(node) && STORAGE.has(node.text)) own.add(`touches ${node.text} directly`);
    if (ts.isIdentifier(node) && ROSTER_WRITERS.has(node.text)) own.add(`imports or calls a roster write (${node.text}) -- the shared screen is the only writer`);
    if (STRING_KINDS.has(node.kind) && node.text.startsWith('watduang:')) own.add('spells a watduang: storage key of its own');
  }
  return { mounts, own: [...own] };
}

/** Does this play.astro render the shared screen? A COMPONENT node in the parsed template whose
 *  name is the frontmatter's default import from the shared screen's PlayerScreen.astro. */
export function rendersPlayerScreen(page) {
  let ast;
  try {
    ({ ast } = parseAstro(page ?? '', {}));
  } catch {
    return false; // unparsable is not rendered: fail closed
  }
  const front = (ast.children ?? []).find((n) => n.type === 'frontmatter');
  const names = new Set();
  if (front) {
    for (const node of nodesOf('frontmatter.ts', front.value)) {
      if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)
        && /(^|\/)_player-screen\/PlayerScreen\.astro$/.test(node.moduleSpecifier.text) && node.importClause?.name) {
        names.add(node.importClause.name.text);
      }
    }
  }
  let found = false;
  (function walk(n) {
    if (n.type === 'component' && names.has(n.name)) found = true;
    for (const c of n.children ?? []) walk(c);
  })(ast);
  return found;
}

/** One route's class and failures. Pure over its inputs so the selftest can drive it on strings. */
export function auditRoute({ id, files, page, pending = PENDING }) {
  const failures = [];
  const read = Object.entries(files).map(([name, text]) => readRouteFile(name, text));
  const mounts = read.some((r) => r.mounts > 0);
  if (!mounts) {
    if (pending.has(id)) return { id, klass: 'pending', failures };
    failures.push(`${id}: mounts no shared player screen and is not in PENDING -- a party route with its own setup screen (ADR-0071)`);
    return { id, klass: 'unmounted', failures };
  }
  if (pending.has(id)) failures.push(`${id}: mounts the shared player screen but is still listed in PENDING -- delete the entry`);
  if (!rendersPlayerScreen(page)) failures.push(`${id}: mounts the shared player screen but its play.astro does not render <PlayerScreen /> -- the mount has no markup to clone`);
  if ('roster-bridge.ts' in files) failures.push(`${id}: still ships a roster-bridge.ts beside the shared screen`);
  for (const why of new Set(read.flatMap((r) => r.own))) failures.push(`${id}: ${why}`);
  return { id, klass: 'converted', failures };
}

function routeFiles(id) {
  const dir = path.join(root, 'src/play', id);
  if (!fs.existsSync(dir)) return null;
  const files = {};
  for (const name of fs.readdirSync(dir).sort()) {
    if (!/\.(ts|js|html)$/.test(name) || name.includes('.test.')) continue;
    files[name] = fs.readFileSync(path.join(dir, name), 'utf8');
  }
  return files;
}

async function audit() {
  const { games } = await import(pathToFileURL(path.join(root, 'src/games/manifest.ts')).href);
  const { ROSTER_CEILING } = await import(pathToFileURL(path.join(root, 'src/play/_player-screen/player-screen.ts')).href);
  const party = games.filter((g) => g.category === 'party');
  const routed = party.filter((g) => g.playRoute);
  if (routed.length === 0) {
    console.error('player-screen-mount-check: the manifest yields no party play route -- an empty work set is a failure, not a pass');
    process.exit(1);
  }
  if (!Number.isInteger(ROSTER_CEILING) || ROSTER_CEILING < 2) {
    console.error(`player-screen-mount-check: ROSTER_CEILING read as ${String(ROSTER_CEILING)} -- the measurement did not happen`);
    process.exit(1);
  }
  const failures = [];
  const results = [];
  for (const g of party) {
    if (g.players[1] > ROSTER_CEILING) {
      failures.push(`${g.id}: declares a maximum of ${g.players[1]}, above the shared roster ceiling of ${ROSTER_CEILING} (ADR-0071 ruling 7)`);
    }
  }
  for (const g of routed) {
    const files = routeFiles(g.id);
    if (!files) {
      failures.push(`${g.id}: declares a play route but has no src/play/${g.id}/ to read`);
      continue;
    }
    const pagePath = path.join(root, 'src/pages/game', g.id, 'play.astro');
    const page = fs.existsSync(pagePath) ? fs.readFileSync(pagePath, 'utf8') : null;
    const r = auditRoute({ id: g.id, files, page });
    results.push(r);
    failures.push(...r.failures);
  }
  const ghosts = [...PENDING].filter((id) => !routed.some((g) => g.id === id)).sort();
  for (const id of ghosts) failures.push(`${id}: GHOST pending entry -- no party play route by that id; delete it`);

  const of = (k) => results.filter((r) => r.klass === k).map((r) => r.id).sort();
  console.log(`player-screen-mount-check: converted (${of('converted').length}): ${of('converted').join(', ') || 'none'}`);
  console.log(`player-screen-mount-check: PENDING, not yet on the shared screen (${of('pending').length}): ${of('pending').join(', ') || 'none'}`);
  if (failures.length) {
    for (const f of failures) console.error(`::error::${f}`);
    console.error(`\nADR-0071: every party play route mounts the one shared player screen and keeps no player list of its own. ${failures.length} failure(s).`);
    process.exit(1);
  }
  console.log(
    `player-screen-mount-check: ${routed.length} party play route(s) classified, every one converted or named PENDING; ` +
    `${party.length} party game(s) declare a maximum at or under the roster ceiling of ${ROSTER_CEILING}. ` +
    'NOT covered: that a converted route behaves -- its arm-reveal-paths, reset-names and setup-badge-icon tests run the screen.',
  );
}

function selftest() {
  const page = "---\nimport Base from '../../../layouts/Base.astro';\nimport PlayerScreen from '../../../play/_player-screen/PlayerScreen.astro';\n---\n<Base>\n  <PlayerScreen />\n</Base>\n";
  const converted = { 'main.ts': "import { mountPlayerScreen } from '../_player-screen/player-screen.ts';\nmountPlayerScreen({ root, range: game.players });" };

  // The green: a converted route that keeps nothing of its own.
  assert.deepEqual(auditRoute({ id: 'a', files: converted, page, pending: new Set() }).failures, [], 'POSITIVE CONTROL: a clean converted route passes');
  // Prose about storage is not storage.
  const commented = { 'main.ts': `${converted['main.ts']}\n// the old sessionStorage flag and 'watduang:x' lived here` };
  assert.deepEqual(auditRoute({ id: 'a', files: commented, page, pending: new Set() }).failures, [], 'a comment must not read as storage');
  console.log('PASS converted: a clean mount passes, and a comment about storage is not storage');

  // MUST-RED: no mount and no pending entry.
  const own = { 'main.js': "renderMascotsList(); localStorage.setItem('watduang:x', '[]');" };
  assert.match(auditRoute({ id: 'b', files: own, page: '', pending: new Set() }).failures[0], /mounts no shared player screen and is not in PENDING/);
  // Pending holds it, by name.
  const held = auditRoute({ id: 'b', files: own, page: '', pending: new Set(['b']) });
  assert.equal(held.klass, 'pending');
  assert.deepEqual(held.failures, []);
  console.log('PASS unmounted: a route with no mount reds unless PENDING names it');

  // MUST-RED: each way a converted route keeps a list of its own.
  for (const [extra, re] of [
    ["localStorage.getItem('k');", /localStorage/],
    ["sessionStorage.removeItem('k');", /sessionStorage/],
    ["const K = 'watduang:timebomb-players';", /watduang: storage key/],
    ["import { saveGroup } from '../../shell/roster';", /roster write/],
    // gh#264 REFUTE round 2: the shared screen's own write path, imported and called by a route.
    ["import { applyRosterOps } from '../../shell/roster.ts';\nvoid applyRosterOps([{ op: 'remove', name: 'A' }], 20);", /roster write \(applyRosterOps\)/],
  ]) {
    const files = { 'main.ts': `${converted['main.ts']}\n${extra}` };
    assert.match(auditRoute({ id: 'a', files, page, pending: new Set() }).failures.join('\n'), re, `must red on: ${extra}`);
  }
  assert.match(auditRoute({ id: 'a', files: { ...converted, 'roster-bridge.ts': '' }, page, pending: new Set() }).failures.join('\n'), /roster-bridge/);
  assert.match(auditRoute({ id: 'a', files: converted, page: '<Base />', pending: new Set() }).failures.join('\n'), /does not render <PlayerScreen \/>/);
  console.log('PASS own list: storage, a key literal, a roster write, a leftover bridge and a missing component each red');

  // MUST-RED: the pending set only shrinks.
  assert.match(auditRoute({ id: 'a', files: converted, page, pending: new Set(['a']) }).failures[0], /still listed in PENDING/);
  console.log('PASS shrink-only: a converted route still named PENDING reds');

  // The parser, on the shapes that would let a real call hide behind a string: code after a quote stays.
  assert.deepEqual(readRouteFile('main.js', "const u = 'http://x'; localStorage.clear();").own, ['touches localStorage directly'], 'a // inside a string must not hide the code after it');
  assert.deepEqual(readRouteFile('main.ts', "const g = 'src/**/*.ts'; localStorage.clear();").own, ['touches localStorage directly'], 'a glob string must not open a block comment');
  console.log('PASS parser: a // or a glob inside a string hides nothing after it');

  // MUST-RED, gh#264 REFUTE finding 7 (PARTIAL in round 2): a QUOTED mount call is a string, not a call.
  const quoted = { 'main.ts': "const helpText = 'mountPlayerScreen({ root, range: game.players })';" };
  assert.equal(auditRoute({ id: 'a', files: quoted, page, pending: new Set() }).klass, 'unmounted', 'a quoted fake mount is no mount');
  const templated = { 'main.js': 'const t = `mountPlayerScreen({ root })`;' };
  assert.equal(auditRoute({ id: 'a', files: templated, page, pending: new Set() }).klass, 'unmounted', 'a template-literal fake mount is no mount');
  console.log('PASS quoted mount: a mount call inside a string or a template literal is no mount');

  // gh#264 REFUTE round 2: "<!--" and "-->" inside two separate script strings are script text, not
  // one HTML comment -- a real <PlayerScreen /> between them is rendered (the false red, now green).
  const scripted = page.replace('<PlayerScreen />', '<script>const opener = "<!--";</script>\n<PlayerScreen />\n<script>const closer = "-->";</script>');
  assert.deepEqual(auditRoute({ id: 'a', files: converted, page: scripted, pending: new Set() }).failures, [], 'comment delimiters inside script strings must not erase a real component');
  // And the component must be THE shared one: a same-named component imported from elsewhere is not.
  const impostor = page.replace("'../../../play/_player-screen/PlayerScreen.astro'", "'./PlayerScreen.astro'");
  assert.match(auditRoute({ id: 'a', files: converted, page: impostor, pending: new Set() }).failures.join('\n'), /does not render <PlayerScreen \/>/, 'a PlayerScreen imported from another file is not the shared screen');
  console.log('PASS astro parse: script-string comment delimiters erase nothing; a component from another file is not the shared screen');

  // MUST-RED, gh#264 REFUTE finding 7: the three shapes the line-shape stripper read as converted.
  const commentedMount = { 'main.ts': "import { mountPlayerScreen } from '../_player-screen/player-screen.ts';\n/*\n  const screen = mountPlayerScreen({ root, range: game.players });\n  screen.open();\n*/" };
  assert.equal(auditRoute({ id: 'a', files: commentedMount, page, pending: new Set() }).klass, 'unmounted', 'a mount inside a block comment is no mount');
  const commentedPage = page.replace('<PlayerScreen />', '<!-- <PlayerScreen /> -->');
  assert.match(auditRoute({ id: 'a', files: converted, page: commentedPage, pending: new Set() }).failures.join('\n'), /does not render <PlayerScreen \/>/, 'a component inside an HTML comment is not rendered');
  const afterBlock = { 'main.ts': `${converted['main.ts']}\n/* keep legacy copy */ localStorage.setItem('watduang:timebomb-players', '[]');` };
  assert.match(auditRoute({ id: 'a', files: afterBlock, page, pending: new Set() }).failures.join('\n'), /localStorage/, 'live storage after an inline block comment is live');
  console.log('PASS comment-shaped holes: a commented mount, a commented component and storage after a block comment each red');
  console.log('player-screen-mount-check --selftest: all legs passed');
}

if (process.argv.includes('--selftest')) selftest();
else await audit();
