#!/usr/bin/env node
// Gate (gh#272): every party play route declares what it does while the shared player screen holds
// rendering. A WebGL route that keeps drawing behind that screen starves the roster lock's grant on
// a slow device -- the migration at mount and every save waited seconds -- so the screen raises a
// render hold (player-screen.ts isRenderHeld / onRenderHold) and each route either obeys it or says,
// in writing, why it does not. Owner ruling 2026-10-17: adapters on the WebGL routes, and a
// declaration from every other route.
//
// THE DECLARATIONS have one home, src/play/_render-suspension.json, and two readers. This gate owns
// what syntax can prove about a set this repo owns:
//   - every party play route has an entry -- enumerated at run time exactly as
//     player-screen-mount-check.mjs enumerates them, every party game in the manifest with a
//     playRoute, never typed here -- and no entry names a route the manifest does not have;
//   - an entry is { suspends: 'adapter' } or { suspends: 'none', reason } with a reason of at least
//     three words, printed on every run because only a reviewer can judge it;
//   - every entry carries `extensions`, the WebGL extension names its route may request: an array of
//     non-empty strings, each already lowercase (the probe matches case-normalized names), no repeats.
//     `webgpu` and `workers`, when present, are booleans. What a route REALLY requests is the probe's
//     to measure; this gate owns only that the policy is well-formed;
//   - an 'adapter' route's own top-level files import `onRenderHold` from the shared screen's module
//     (the specifier, resolved against src/play/<id>/, is src/play/_player-screen/player-screen with
//     or without `.ts`; an alias is followed) and CALL it with an argument -- and a 'none' route's do
//     not, since a subscription it denies is a declaration that lies.
// WHETHER A ROUTE USES WEBGL IS NOT DECIDED HERE (gh#272 REFUTE round 1). A context can be asked for
// through any expression -- a constant, a parameter, a library -- so a syntax pattern for it never
// converges. scripts/webgl-pixels-probe.mjs decides it in the browser, on every party play route: it
// records each WebGL context the page creates and FAILS a route declared 'none' that made one, and it
// counts every draw call made while the page reads held. That is also what catches an 'adapter'
// whose subscription never runs (a call in dead code satisfies this gate, by its own ceiling below).
//
// PARSED, NOT MATCHED, for the reason player-screen-mount-check.mjs gives: a commented-out or quoted
// call is not a node of the kinds read here.
//
// ITS CEILING: a call in dead code still counts; a sub-directory is not read (the flat bound the other
// play-route gates carry); a reason is reviewer-owned.
//
//   node scripts/render-suspension-check.mjs             -> audit every party play route
//   node scripts/render-suspension-check.mjs --selftest  -> both-direction calibration on fixtures
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const DECLARATIONS_FILE = path.join(root, 'src/play/_render-suspension.json');

const SHARED_MODULE = 'src/play/_player-screen/player-screen';
const SUBSCRIBE = 'onRenderHold';

/** The declarations, keyed by route id. Read by this gate and by scripts/webgl-pixels-probe.mjs. */
export function loadDeclarations(file = DECLARATIONS_FILE) {
  const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (!parsed || typeof parsed.routes !== 'object' || parsed.routes === null) {
    throw new Error(`${path.relative(root, file)} has no "routes" object -- there are no declarations to read`);
  }
  return parsed.routes;
}

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

const isSharedModule = (id, spec) => {
  const at = path.posix.normalize(path.posix.join(`src/play/${id}`, spec));
  return at === SHARED_MODULE || at === `${SHARED_MODULE}.ts`;
};

/** Declarations that would give a route its OWN binding under the subscribe's local name. */
const declaredName = (node) =>
  (ts.isFunctionDeclaration(node) || ts.isFunctionExpression(node) || ts.isClassDeclaration(node)
    || ts.isVariableDeclaration(node) || ts.isParameter(node) || ts.isBindingElement(node))
  && node.name && ts.isIdentifier(node.name) ? node.name.text : null;

/** Does this route file subscribe to the hold? Markup runs no script, so an .html file never does. */
export function subscribes(name, text, id = 'route') {
  if (name.endsWith('.html')) return false;
  const nodes = nodesOf(name, text);
  const bound = new Set();
  for (const node of nodes) {
    if (!ts.isImportDeclaration(node) || !ts.isStringLiteral(node.moduleSpecifier)) continue;
    if (!isSharedModule(id, node.moduleSpecifier.text)) continue;
    const named = node.importClause?.namedBindings;
    if (!named || !ts.isNamedImports(named)) continue;
    for (const el of named.elements) if ((el.propertyName ?? el.name).text === SUBSCRIBE) bound.add(el.name.text);
  }
  let calls = 0;
  let shadowed = false;
  for (const node of nodes) {
    const declared = declaredName(node);
    if (declared !== null && bound.has(declared)) shadowed = true;
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && bound.has(node.expression.text) && node.arguments.length > 0) calls += 1;
  }
  // A local binding under the imported name makes every call ambiguous: fail closed, as no subscription.
  return calls > 0 && !shadowed;
}

/** Why an entry's policy fields are malformed, or [] when they are well-formed. */
export function policyFieldFaults(id, declaration) {
  const out = [];
  const ext = declaration?.extensions;
  if (!Array.isArray(ext)) {
    out.push(`${id}: "extensions" must be an array of the WebGL extension names it may request ([] for none)`);
  } else {
    for (const name of ext) {
      if (typeof name !== 'string' || name.trim() === '') out.push(`${id}: "extensions" holds ${JSON.stringify(name)} -- each name must be a non-empty string`);
      else if (name !== name.trim().toLowerCase()) out.push(`${id}: "extensions" holds "${name}" -- store it case-normalized, as "${name.trim().toLowerCase()}"`);
    }
    const dupes = ext.filter((n, i) => ext.indexOf(n) !== i);
    if (dupes.length) out.push(`${id}: "extensions" repeats ${[...new Set(dupes)].join(', ')}`);
  }
  for (const flag of ['webgpu', 'workers']) {
    if (declaration && flag in declaration && typeof declaration[flag] !== 'boolean') out.push(`${id}: "${flag}" must be true or false when present`);
  }
  return out;
}

const words = (reason) => (typeof reason === 'string' ? reason.trim().split(/\s+/).filter(Boolean).length : 0);

/** One route's class and failures. Pure over its inputs so the selftest can drive it on strings. */
export function auditRoute({ id, files, declaration }) {
  const subscribed = Object.entries(files).some(([name, text]) => subscribes(name, text, id));
  const failures = [];
  const kind = declaration?.suspends;
  if (declaration === undefined) {
    failures.push(`${id}: has no entry in src/play/_render-suspension.json -- declare { "suspends": "adapter" } or { "suspends": "none", "reason": ... }`);
  } else if (kind === 'adapter') {
    if (!subscribed) failures.push(`${id}: declared an adapter, but no route file calls onRenderHold from the shared screen`);
  } else if (kind === 'none') {
    if (subscribed) failures.push(`${id}: declared "none", but its code subscribes to the render hold -- declare it an adapter`);
    if (words(declaration.reason) < 3) failures.push(`${id}: its "none" reason is missing or too short to be a reason -- say why it does not suspend`);
  } else {
    failures.push(`${id}: "suspends" is ${JSON.stringify(kind)} -- it must be "adapter" or "none"`);
  }
  if (declaration !== undefined) failures.push(...policyFieldFaults(id, declaration));
  return { id, klass: kind === 'adapter' || kind === 'none' ? kind : 'undeclared', failures };
}

/** Every route, plus the registry's own staleness. `routes` is [{ id, files }]. */
export function auditAll({ routes, declarations }) {
  const results = routes.map(({ id, files }) => auditRoute({ id, files, declaration: declarations[id] }));
  const failures = results.flatMap((r) => r.failures);
  for (const id of Object.keys(declarations).filter((k) => !routes.some((r) => r.id === k)).sort()) {
    failures.push(`${id}: GHOST entry in src/play/_render-suspension.json -- no party play route by that id; delete it`);
  }
  return { results, failures };
}

/** The party play routes, as player-screen-mount-check.mjs derives them. */
export async function partyPlayRoutes() {
  const { games } = await import(pathToFileURL(path.join(root, 'src/games/manifest.ts')).href);
  return games.filter((g) => g.category === 'party' && g.playRoute);
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
  const routed = await partyPlayRoutes();
  if (routed.length === 0) {
    console.error('render-suspension-check: the manifest yields no party play route -- an empty work set is a failure, not a pass');
    process.exit(1);
  }
  const declarations = loadDeclarations();
  const routes = [];
  const missing = [];
  for (const g of routed) {
    const files = routeFiles(g.id);
    if (files) routes.push({ id: g.id, files });
    else missing.push(`${g.id}: declares a play route but has no src/play/${g.id}/ to read`);
  }
  const { results, failures } = auditAll({ routes, declarations });
  failures.unshift(...missing);

  const of = (k) => results.filter((r) => r.klass === k).map((r) => r.id).sort();
  console.log(`render-suspension-check: adapters (${of('adapter').length}): ${of('adapter').join(', ') || 'none'}`);
  console.log(`render-suspension-check: no-suspend, by reviewed reason (${of('none').length}):`);
  for (const id of of('none')) console.log(`  ${id} -- ${declarations[id].reason}`);
  if (failures.length) {
    for (const f of failures) console.error(`::error::${f}`);
    console.error(`\ngh#272: every party play route follows the player screen's render hold or declares why not. ${failures.length} failure(s).`);
    process.exit(1);
  }
  console.log(
    `render-suspension-check: ${routes.length} party play route(s) declared, every adapter subscribes. ` +
    'NOT covered: which routes use WebGL, and whether anything draws while held -- scripts/webgl-pixels-probe.mjs decides both in the browser.',
  );
}

function selftest() {
  const adapter = "import { onRenderHold } from '../_player-screen/player-screen.ts';\nonRenderHold((held) => pause(held));";
  const plain = 'draw();';
  const A = { suspends: 'adapter', extensions: ['angle_instanced_arrays'] };
  const N = { suspends: 'none', reason: 'draws with Canvas2D only', extensions: [] };

  // POSITIVE CONTROLS: a subscribing adapter, a reasoned "none", an aliased subscribe.
  assert.deepEqual(auditRoute({ id: 'a', files: { 'main.ts': adapter }, declaration: A }).failures, [], 'POSITIVE CONTROL: a declared adapter that subscribes');
  assert.deepEqual(auditRoute({ id: 'b', files: { 'main.js': plain }, declaration: N }).failures, [], 'POSITIVE CONTROL: a declared none with a reason');
  for (const spec of ['../_player-screen/player-screen', '../_player-screen/player-screen.ts']) {
    const aliased = `import { onRenderHold as follow } from '${spec}';\nfollow(apply);`;
    assert.deepEqual(auditRoute({ id: 'a', files: { 'main.js': aliased }, declaration: A }).failures, [], `an aliased subscribe from ${spec}`);
  }
  console.log('PASS positive controls: a subscribing adapter, a reasoned none and an aliased subscribe pass');

  // MUST-RED: each way a declaration fails.
  assert.match(auditRoute({ id: 'd', files: { 'main.js': plain }, declaration: undefined }).failures.join('\n'), /has no entry/);
  assert.match(auditRoute({ id: 'd', files: { 'main.js': plain }, declaration: { suspends: 'sometimes' } }).failures.join('\n'), /must be "adapter" or "none"/);
  assert.match(auditRoute({ id: 'd', files: { 'main.js': plain }, declaration: {} }).failures.join('\n'), /must be "adapter" or "none"/);
  assert.match(auditRoute({ id: 'a', files: { 'main.js': plain }, declaration: A }).failures.join('\n'), /declared an adapter, but no route file calls onRenderHold/);
  assert.match(auditRoute({ id: 'a', files: { 'main.ts': adapter }, declaration: N }).failures.join('\n'), /declared "none", but its code subscribes/);
  for (const reason of ['', '   ', 'tbd', 'n/a here', undefined, 42]) {
    assert.match(auditRoute({ id: 'b', files: { 'main.js': plain }, declaration: { suspends: 'none', reason } }).failures.join('\n'), /reason is missing or too short/, `must red on reason ${JSON.stringify(reason)}`);
  }
  console.log('PASS declaration: none, an unknown kind, an adapter that never subscribes, a none that does, and an empty reason each red');

  // MUST-RED: the policy fields' domain (gh#272 REFUTE round 2).
  const withPolicy = (extra) => auditRoute({ id: 'a', files: { 'main.ts': adapter }, declaration: { suspends: 'adapter', ...extra } }).failures.join('\n');
  assert.equal(withPolicy({ extensions: [], webgpu: false, workers: false }), '', 'POSITIVE CONTROL: an empty list and explicit false flags');
  for (const [what, extra, re] of [
    ['no list', {}, /"extensions" must be an array/],
    ['a string, not a list', { extensions: 'angle_instanced_arrays' }, /"extensions" must be an array/],
    ['an empty name', { extensions: [''] }, /each name must be a non-empty string/],
    ['a blank name', { extensions: ['  '] }, /each name must be a non-empty string/],
    ['a number', { extensions: [7] }, /each name must be a non-empty string/],
    ['mixed case', { extensions: ['ANGLE_instanced_arrays'] }, /store it case-normalized, as "angle_instanced_arrays"/],
    ['padded', { extensions: [' oes_texture_float '] }, /store it case-normalized/],
    ['a repeat', { extensions: ['oes_texture_float', 'oes_texture_float'] }, /repeats oes_texture_float/],
    ['webgpu not a boolean', { extensions: [], webgpu: 'yes' }, /"webgpu" must be true or false/],
    ['workers not a boolean', { extensions: [], workers: 1 }, /"workers" must be true or false/],
  ]) {
    assert.match(withPolicy(extra), re, `must red on ${what}`);
  }
  console.log('PASS policy fields: a missing or non-list extensions, an empty, blank, non-string, mixed-case, padded or repeated name, and a non-boolean webgpu or workers each red');

  // MUST-RED: the non-code shapes are not a subscription.
  for (const [what, src] of [
    ['a commented call', "import { onRenderHold } from '../_player-screen/player-screen.ts';\n// onRenderHold((h) => pause(h));"],
    ['a quoted call', "const doc = 'onRenderHold((h) => pause(h))';"],
    ['an import never called', "import { onRenderHold } from '../_player-screen/player-screen.ts';\nconst f = onRenderHold;"],
    ['a call with no listener', "import { onRenderHold } from '../_player-screen/player-screen.ts';\nonRenderHold();"],
    ['a look-alike module', "import { onRenderHold } from '../_player-screen-copy/player-screen.ts';\nonRenderHold(apply);"],
    ['a local namesake', 'function onRenderHold(fn) { fn(false); }\nonRenderHold(apply);'],
    ['a local shadowing the import', "import { onRenderHold } from '../_player-screen/player-screen.ts';\nonRenderHold(apply);\nfunction later() { const onRenderHold = (f) => f; onRenderHold(apply); }"],
  ]) {
    assert.match(auditRoute({ id: 'f', files: { 'main.js': src }, declaration: A }).failures.join('\n'), /no route file calls onRenderHold/, `${what} is no subscription`);
  }
  console.log('PASS parser: a commented, quoted, uncalled, empty, look-alike or shadowed subscribe is no subscription');

  // MUST-RED: a ghost entry; and the shipped registry parses with a routes object.
  const routes = [{ id: 'a', files: { 'main.ts': adapter } }];
  assert.deepEqual(auditAll({ routes, declarations: { a: A } }).failures, [], 'POSITIVE CONTROL: the whole-set audit on a clean set');
  assert.match(auditAll({ routes, declarations: { a: A, gone: N } }).failures.join('\n'), /GHOST entry/);
  assert.match(auditAll({ routes, declarations: {} }).failures.join('\n'), /a: has no entry/);
  assert.equal(typeof loadDeclarations(), 'object', 'the shipped registry has no routes object');
  console.log('PASS set: a ghost entry and an undeclared route each red; the shipped registry reads');
  console.log('render-suspension-check --selftest: all legs passed');
}

// Importable by scripts/webgl-pixels-probe.mjs for loadDeclarations and partyPlayRoutes: importing
// this file must not run the audit.
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  if (process.argv.includes('--selftest')) selftest();
  else await audit();
}
