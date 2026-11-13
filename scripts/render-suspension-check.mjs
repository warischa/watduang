#!/usr/bin/env node
// Gate (gh#272): every party and company-party play route declares what it does while the render hold
// is up. A WebGL route that keeps drawing behind that screen starves the roster lock's grant on
// a slow device -- the migration at mount and every save waited seconds -- so the screen raises a
// render hold (player-screen.ts isRenderHeld / onRenderHold) and each route either obeys it or says,
// in writing, why it does not. Owner ruling 2026-10-17: adapters on the WebGL routes, and a
// declaration from every other route.
//
// THE DECLARATIONS have one home, src/play/_render-suspension.json, and two readers. This gate owns
// what syntax can prove about a set this repo owns:
//   - every play route of a category in RENDER_CATEGORIES has an entry -- enumerated at run time from
//     the manifest, every such game with a playRoute, never typed here -- and no entry names a route the
//     manifest does not have. gh#305 widened the set from party alone to company-party too: the
//     prize-draw reveal and the three prize games' own pages draw WebGL through one shared host
//     (src/play/_prize-reveal/game-host.ts), which follows the same hold (src/play/_render-hold.ts);
//   - an entry is { suspends: 'adapter' } or { suspends: 'none', reason } with a reason of at least
//     three words, printed on every run because only a reviewer can judge it;
//   - every entry carries `extensions`, the WebGL extension names its route may request: an array of
//     non-empty strings, each already lowercase (the probe matches case-normalized names), no repeats.
//     `webgpu` and `workers`, when present, are booleans. What a route REALLY requests is the probe's
//     to measure; this gate owns only that the policy is well-formed;
//   - an 'adapter' route's code imports `onRenderHold` from a hold module (HOLD_MODULES: the shared
//     screen's src/play/_player-screen/player-screen, or src/play/_render-hold it re-exports, with or
//     without `.ts`; a renamed import binding is followed) and CALLS it directly with an argument -- and
//     a 'none' route's code
//     does not, since a subscription it denies is a declaration that lies. "The route's code" is its own
//     top-level files plus every file under src/ they reach by a RUNTIME relative import, transitively
//     (gh#305: the prize routes subscribe inside the shared host, never in their own directory); a
//     type-only import, or a binding never used outside a type position, is not followed, and the hold
//     modules themselves are not entered. A call counts only when its callee IS the hold module's own
//     export, by symbol (see "the subscription proof" below) -- never a property call, and never because a
//     method happens to be named onRenderHold.
// AUTHORITATIVE FOR WIRING, NOT FOR EXECUTION. A green here proves the adapter's code is wired to the real
// hold export through imports that run; it does not prove the call runs, stays subscribed, belongs to the
// renderer on screen, or that the listener actually stops drawing. scripts/webgl-pixels-probe.mjs owns all
// of that, in the browser, against the hold module's own diagnostics.
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
// ITS CEILING: a direct call in dead code, or one unsubscribed at once, still counts (whether the call
// RUNS and STAYS is the browser probe's); an import whose specifier is not a string literal is not
// followed; a reason is reviewer-owned.
//
//   node scripts/render-suspension-check.mjs             -> audit every party and company-party play route
//   node scripts/render-suspension-check.mjs --selftest  -> both-direction calibration on fixtures
import fs from 'node:fs';
import { nonPartyPlayRoutes, outOfScopeLine, refutedOutOfScope } from './non-party-play-routes.mjs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const DECLARATIONS_FILE = path.join(root, 'src/play/_render-suspension.json');

/** The modules that own the hold: an import of SUBSCRIBE from one of these is a subscription. */
export const HOLD_MODULES = ['src/play/_player-screen/player-screen', 'src/play/_render-hold'];
const SUBSCRIBE = 'onRenderHold';
/** The categories whose play routes this gate and scripts/webgl-pixels-probe.mjs enumerate (gh#305). */
export const RENDER_CATEGORIES = ['party', 'company-party'];

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

const stripExt = (rel) => rel.replace(/\.(ts|js)$/, '');
const isHoldModule = (rel) => HOLD_MODULES.includes(stripExt(rel));
/** The repo-relative path a relative specifier names from the file at `fromRel`. */
const resolveSpec = (fromRel, spec) => path.posix.normalize(path.posix.join(path.posix.dirname(fromRel), spec));

/** Declarations that would give a route its OWN binding under the subscribe's local name. */
const declaredName = (node) =>
  (ts.isFunctionDeclaration(node) || ts.isFunctionExpression(node) || ts.isClassDeclaration(node)
    || ts.isVariableDeclaration(node) || ts.isParameter(node) || ts.isBindingElement(node))
  && node.name && ts.isIdentifier(node.name) ? node.name.text : null;

// ---- the subscription proof (gh#305, REFUTE rounds 1 and 2) ----------------------------------------
// By SYMBOL, from the TypeScript checker over the one file (no lib, nothing resolved -- every name it
// needs is declared in the file):
//   - a binding of the hold export is an import specifier of SUBSCRIBE from a hold module, in a runtime
//     import (neither `import type` nor `{ type x }`);
//   - a subscription is a DIRECT call whose callee resolves to that binding, with an argument. Nothing else
//     counts: not a method that happens to share the name, and not a property call on an object that holds
//     the export. Round 2 deleted the proof that credited such an object (an environment injected into
//     the host): JavaScript can replace a property by aliasing, assigning, defining or spreading it, and a
//     gate that enumerates those mutation forms never converges. The host now imports the hold directly;
//   - a module is followed only through a RUNTIME import: a side-effect import, a binding used outside
//     every type position, a re-export that is not type-only, or a literal dynamic import.
// Fail closed: a local declaration under the bound name voids the file's direct calls.

const analysisCache = new Map();

/** The one-file program the checker answers from. */
function checkerFor(rel, text) {
  const kind = rel.endsWith('.ts') ? ts.ScriptKind.TS : ts.ScriptKind.JS;
  const sf = ts.createSourceFile(rel, text, ts.ScriptTarget.Latest, true, kind);
  const host = {
    getSourceFile: (f) => (f === rel ? sf : undefined),
    fileExists: (f) => f === rel,
    readFile: (f) => (f === rel ? text : undefined),
    getDefaultLibFileName: () => 'lib.d.ts',
    writeFile() {},
    getCurrentDirectory: () => '',
    getCanonicalFileName: (f) => f,
    useCaseSensitiveFileNames: () => true,
    getNewLine: () => '\n',
    getDirectories: () => [],
    directoryExists: () => true,
  };
  const program = ts.createProgram({
    rootNames: [rel],
    options: { noLib: true, noResolve: true, allowJs: true, target: ts.ScriptTarget.Latest, module: ts.ModuleKind.ESNext },
    host,
  });
  return { sf, checker: program.getTypeChecker() };
}

const unwrap = (node) => {
  let n = node;
  while (n && (ts.isParenthesizedExpression(n) || ts.isAsExpression(n) || ts.isSatisfiesExpression?.(n) || ts.isNonNullExpression(n))) n = n.expression;
  return n;
};
const inTypePosition = (node) => {
  for (let n = node.parent; n; n = n.parent) if (ts.isTypeNode(n) || ts.isTypeAliasDeclaration(n) || ts.isInterfaceDeclaration(n)) return true;
  return false;
};

/** { subscribes, runtimeSpecs } for one file. */
function analyze(rel, text) {
  const key = `${rel}\0${text}`;
  if (analysisCache.has(key)) return analysisCache.get(key);
  const { sf, checker } = checkerFor(rel, text);
  const nodes = [];
  (function walk(node) {
    nodes.push(node);
    ts.forEachChild(node, walk);
  })(sf);
  const sym = (node) => checker.getSymbolAtLocation(node);

  // Runtime uses of each imported binding: identifier references outside every type position.
  const importNames = new Set();
  for (const node of nodes) {
    if (ts.isImportSpecifier(node) || ts.isImportClause(node) || ts.isNamespaceImport(node)) if (node.name) importNames.add(node.name);
  }
  const runtimeUses = new Map();
  for (const node of nodes) {
    if (!ts.isIdentifier(node) || importNames.has(node) || inTypePosition(node)) continue;
    if (node.parent && ts.isImportSpecifier(node.parent)) continue;
    const s = ts.isShorthandPropertyAssignment(node.parent) && node.parent.name === node ? checker.getShorthandAssignmentValueSymbol(node.parent) : sym(node);
    if (s) runtimeUses.set(s, (runtimeUses.get(s) ?? 0) + 1);
  }
  const used = (nameNode) => {
    const s = sym(nameNode);
    return !!s && (runtimeUses.get(s) ?? 0) > 0;
  };

  const runtimeSpecs = [];
  const holdSymbols = new Set();
  const holdNames = new Set();
  for (const node of nodes) {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      const spec = node.moduleSpecifier.text;
      const clause = node.importClause;
      if (clause?.isTypeOnly) continue;
      const named = clause?.namedBindings;
      if (isHoldModule(resolveSpec(rel, spec)) && named && ts.isNamedImports(named)) {
        for (const el of named.elements) {
          if (el.isTypeOnly || (el.propertyName ?? el.name).text !== SUBSCRIBE) continue;
          const s = sym(el.name);
          if (s) holdSymbols.add(s);
          holdNames.add(el.name.text);
        }
      }
      let runtime = !clause;
      if (clause?.name && used(clause.name)) runtime = true;
      if (named && ts.isNamespaceImport(named) && used(named.name)) runtime = true;
      if (named && ts.isNamedImports(named)) for (const el of named.elements) if (!el.isTypeOnly && used(el.name)) runtime = true;
      if (runtime) runtimeSpecs.push(spec);
    } else if (ts.isExportDeclaration(node) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
      if (node.isTypeOnly) continue;
      const clause = node.exportClause;
      if (clause && ts.isNamedExports(clause) && clause.elements.length > 0 && clause.elements.every((el) => el.isTypeOnly)) continue;
      runtimeSpecs.push(node.moduleSpecifier.text);
    } else if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword && node.arguments[0] && ts.isStringLiteral(node.arguments[0])) {
      runtimeSpecs.push(node.arguments[0].text);
    }
  }
  const relativeSpecs = runtimeSpecs.filter((spec) => /^\.{1,2}\//.test(spec));

  const isHold = (node) => {
    if (!node || !ts.isIdentifier(node)) return false;
    const s = ts.isShorthandPropertyAssignment(node.parent) && node.parent.name === node ? checker.getShorthandAssignmentValueSymbol(node.parent) : sym(node);
    return !!s && holdSymbols.has(s);
  };
  // A local declaration under a bound name makes direct calls ambiguous: fail closed.
  const shadowed = nodes.some((node) => {
    const name = declaredName(node);
    return name !== null && holdNames.has(name) && !holdSymbols.has(sym(node.name));
  });

  let subscribes = false;
  if (holdSymbols.size > 0) {
    for (const node of nodes) {
      if (!ts.isCallExpression(node) || node.arguments.length === 0) continue;
      if (!shadowed && isHold(unwrap(node.expression))) {
        subscribes = true;
        break;
      }
    }
  }
  const out = { subscribes, runtimeSpecs: relativeSpecs };
  analysisCache.set(key, out);
  return out;
}

/** Does the file at repo-relative `rel` subscribe to the hold? Markup runs no script, so an .html file
 *  never does. */
export function subscribesAt(rel, text) {
  if (rel.endsWith('.html')) return false;
  return analyze(rel, text).subscribes;
}

/** Does this route file subscribe to the hold? `name` is a file directly under src/play/<id>/. */
export function subscribes(name, text, id = 'route') {
  return subscribesAt(`src/play/${id}/${name}`, text);
}

/** Relative specifiers a file loads at run time (see analyze). */
function relativeImports(rel, text) {
  return analyze(rel, text).runtimeSpecs;
}

const readRepoFile = (rel) => {
  const abs = path.join(root, rel);
  return fs.existsSync(abs) && fs.statSync(abs).isFile() ? fs.readFileSync(abs, 'utf8') : null;
};

/**
 * The route's code: its own files (repo-relative path -> text) plus every .ts/.js file under src/ they
 * reach by relative import, transitively. A hold module is not entered (importing it is what is judged),
 * and neither is a test file. `read(rel)` returns a file's text or null; injectable for the selftest.
 */
export function routeCode(id, files, read = readRepoFile) {
  const out = new Map();
  const queue = Object.entries(files).map(([name, text]) => [`src/play/${id}/${name}`, text]);
  while (queue.length) {
    const [rel, text] = queue.shift();
    if (out.has(rel)) continue;
    out.set(rel, text);
    if (!/\.(ts|js)$/.test(rel)) continue;
    for (const spec of relativeImports(rel, text)) {
      const base = resolveSpec(rel, spec);
      if (!base.startsWith('src/') || isHoldModule(base)) continue;
      for (const candidate of /\.(ts|js)$/.test(base) ? [base] : [`${base}.ts`, `${base}.js`]) {
        if (candidate.includes('.test.') || out.has(candidate)) continue;
        const next = read(candidate);
        if (next !== null) {
          queue.push([candidate, next]);
          break;
        }
      }
    }
  }
  return out;
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
export function auditRoute({ id, files, declaration, read = () => null }) {
  const subscribed = [...routeCode(id, files, read)].some(([rel, text]) => subscribesAt(rel, text));
  const failures = [];
  const kind = declaration?.suspends;
  if (declaration === undefined) {
    failures.push(`${id}: has no entry in src/play/_render-suspension.json -- declare { "suspends": "adapter" } or { "suspends": "none", "reason": ... }`);
  } else if (kind === 'adapter') {
    if (!subscribed) failures.push(`${id}: declared an adapter, but no route file calls onRenderHold from a hold module`);
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
export function auditAll({ routes, declarations, read }) {
  const results = routes.map(({ id, files }) => auditRoute({ id, files, declaration: declarations[id], read }));
  const failures = results.flatMap((r) => r.failures);
  for (const id of Object.keys(declarations).filter((k) => !routes.some((r) => r.id === k)).sort()) {
    failures.push(`${id}: GHOST entry in src/play/_render-suspension.json -- no ${RENDER_CATEGORIES.join(' or ')} play route by that id; delete it`);
  }
  return { results, failures };
}

/** The play routes this gate covers: every game of a RENDER_CATEGORIES category with a playRoute. */
export const renderPlayRoutesOf = (games) => games.filter((g) => RENDER_CATEGORIES.includes(g.category) && g.playRoute);

/** renderPlayRoutesOf over the real manifest. Read by scripts/webgl-pixels-probe.mjs too. */
export async function renderPlayRoutes() {
  const { games } = await import(pathToFileURL(path.join(root, 'src/games/manifest.ts')).href);
  return renderPlayRoutesOf(games);
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
  const routed = await renderPlayRoutes();
  if (routed.length === 0) {
    console.error('render-suspension-check: the manifest yields no play route to audit -- an empty work set is a failure, not a pass');
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
  const { results, failures } = auditAll({ routes, declarations, read: readRepoFile });
  failures.unshift(...missing);
  // gh#304: the routes this gate does not scan, named and re-proved (no shared screen, so no hold). Since
  // gh#305 company-party is scanned, so only a route outside RENDER_CATEGORIES is left out.
  const outside = (await nonPartyPlayRoutes(root)).filter((r) => !RENDER_CATEGORIES.includes(r.category));
  failures.push(...refutedOutOfScope(outside, 'render-suspension-check'));

  const of = (k) => results.filter((r) => r.klass === k).map((r) => r.id).sort();
  console.log(`render-suspension-check: adapters (${of('adapter').length}): ${of('adapter').join(', ') || 'none'}`);
  console.log(`render-suspension-check: no-suspend, by reviewed reason (${of('none').length}):`);
  for (const id of of('none')) console.log(`  ${id} -- ${declarations[id].reason}`);
  if (failures.length) {
    for (const f of failures) console.error(`::error::${f}`);
    console.error(`\ngh#272: every ${RENDER_CATEGORIES.join(' and ')} play route follows the render hold or declares why not. ${failures.length} failure(s).`);
    process.exit(1);
  }
  console.log(outOfScopeLine(outside, 'render-suspension-check'));
  console.log(
    `render-suspension-check: ${routes.length} ${RENDER_CATEGORIES.join(' + ')} play route(s) declared, every adapter subscribes. ` +
    'Proves WIRING, not execution. NOT covered: which routes use WebGL, whether a subscription runs and stays, and whether anything draws while held -- scripts/webgl-pixels-probe.mjs decides those in the browser.',
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

  // gh#305 -- THE SET: company-party play routes are enumerated beside the party ones; the rest are not.
  const fixtureGames = [
    { id: 'p', category: 'party', playRoute: '/game/p/play/' },
    { id: 'c', category: 'company-party', playRoute: '/game/c/play/' },
    { id: 'f', category: 'fortune', playRoute: '/game/f/play/' },
    { id: 'n', category: 'party' },
  ];
  assert.deepEqual(renderPlayRoutesOf(fixtureGames).map((g) => g.id), ['p', 'c'], 'MUST-RED: a company-party play route left out of the audited set');
  console.log('PASS set: party and company-party play routes are audited; a fortune route and a route-less game are not');

  // gh#305 -- THE ROUTE'S CODE: a subscription in shared code the route imports counts, transitively.
  const HOST = "import { onRenderHold } from '../_render-hold.ts';\nexport function start() { onRenderHold((h) => pause(h)); }";
  const INJECTED = "import { isRenderHeld, onRenderHold } from '../_render-hold.ts';\nconst env = { holds: { isRenderHeld, onRenderHold } };\nexport function start() { env.holds.onRenderHold(sync); }";
  const shared = (files) => (rel) => files[rel] ?? null;
  const viaHost = { 'main.ts': "import { boot } from '../_shared/boot.ts';\nboot();" };
  const boot = "export { start as boot } from './host';";
  for (const [what, host] of [['a direct call', HOST]]) {
    const read = shared({ 'src/play/_shared/boot.ts': boot, 'src/play/_shared/host.ts': host });
    assert.deepEqual(auditRoute({ id: 'r', files: viaHost, declaration: A, read }).failures, [], `POSITIVE CONTROL: an adapter subscribing two imports away, by ${what}`);
    assert.match(auditRoute({ id: 'r', files: viaHost, declaration: N, read }).failures.join('\n'), /declared "none", but its code subscribes/, `MUST-RED: a none route whose shared code subscribes by ${what}`);
  }
  for (const [what, host] of [
    ['the chain cut (the host never read)', null],
    ['the injected binding with no member call', "import { onRenderHold } from '../_render-hold.ts';\nexport const env = { holds: { onRenderHold } };"],
    ['a member call with nothing imported', 'export function start() { env.holds.onRenderHold(sync); }'],
    ['a member call with no listener', "import { onRenderHold } from '../_render-hold.ts';\nconst env = { holds: { onRenderHold } };\nenv.holds.onRenderHold();"],
    ['a look-alike hold module', "import { onRenderHold } from '../_render-hold-copy.ts';\nonRenderHold(apply);"],
  ]) {
    const read = shared({ 'src/play/_shared/boot.ts': boot, ...(host === null ? {} : { 'src/play/_shared/host.ts': host }) });
    assert.match(auditRoute({ id: 'r', files: viaHost, declaration: A, read }).failures.join('\n'), /no route file calls onRenderHold/, `MUST-RED: ${what} is no subscription`);
  }
  // REFUTE round 2 (gh#305) -- only a DIRECT call of the hold export counts. A call through an object that
  // holds it is a property call, and a property can be replaced by any of the forms JavaScript has for
  // mutation (an alias, Object.assign, defineProperty, a spread copy, a rebinding): enumerating those
  // never converges, so none of them is credited, however the object was built.
  const REAL_SHAPE = "import { isRenderHeld, onRenderHold } from '../_render-hold.ts';\nexport function browserEnv() { return { holds: { isRenderHeld, onRenderHold } }; }\nexport function start(options, env = browserEnv()) { const offs = []; offs.push(env.holds.onRenderHold(sync)); }";
  const ALIASED_MUTATION = "import { isRenderHeld, onRenderHold } from '../_render-hold.ts';\nconst env = { holds: { isRenderHeld, onRenderHold } };\nconst a = env.holds;\na.onRenderHold = () => () => {};\nexport function start() { env.holds.onRenderHold(sync); }";
  for (const [what, host] of [
    ['an injected binding and its member call', INJECTED],
    ['the export injected into a default environment and called through it', REAL_SHAPE],
    ['the REFUTE counter-example: an alias of the environment whose property is replaced by a no-op', ALIASED_MUTATION],
    ['a property call on an Object.assign copy', "import { onRenderHold } from '../_render-hold.ts';\nconst env = Object.assign({}, { onRenderHold });\nenv.onRenderHold(sync);"],
    ['a property call on a frozen holder', "import { onRenderHold } from '../_render-hold.ts';\nconst env = Object.freeze({ onRenderHold });\nenv.onRenderHold(sync);"],
  ]) {
    const read = shared({ 'src/play/_shared/boot.ts': boot, 'src/play/_shared/host.ts': host });
    assert.match(auditRoute({ id: 'r', files: viaHost, declaration: A, read }).failures.join('\n'), /no route file calls onRenderHold/, `MUST-RED: ${what} is no subscription`);
  }
  console.log('PASS REFUTE r2: a property call never counts -- injected, defaulted, aliased-and-replaced, assigned or frozen');
  for (const [what, host] of [
    ['an unused binding beside an unrelated no-op member call', "import { onRenderHold } from '../_render-hold.ts';\nconst unused = { onRenderHold };\nexport function start() { other.onRenderHold(() => {}); }"],
    ['an imported binding never used, and a member call on something else', "import { onRenderHold } from '../_render-hold.ts';\nexport function start() { noop.onRenderHold(() => {}); }"],
    ['the same property path on another object', "import { onRenderHold } from '../_render-hold.ts';\nconst env = { holds: { onRenderHold } };\nconst other = { holds: { onRenderHold: () => () => {} } };\nexport function start() { other.holds.onRenderHold(sync); }"],
    ['a parameter with no default shadowing the environment', "import { onRenderHold } from '../_render-hold.ts';\nconst env = { holds: { onRenderHold } };\nexport function start(env) { env.holds.onRenderHold(sync); }"],
    ['a default environment from a function that does not return the export', "import { onRenderHold } from '../_render-hold.ts';\nconst keep = { onRenderHold };\nfunction fakeEnv() { return { holds: { onRenderHold: () => () => {} } }; }\nexport function start(env = fakeEnv()) { env.holds.onRenderHold(sync); }"],
    ['a type-only import of the hold export', "import type { onRenderHold } from '../_render-hold.ts';\nonRenderHold(apply);"],
  ]) {
    const read = shared({ 'src/play/_shared/boot.ts': boot, 'src/play/_shared/host.ts': host });
    assert.match(auditRoute({ id: 'r', files: viaHost, declaration: A, read }).failures.join('\n'), /no route file calls onRenderHold/, `MUST-RED: ${what} is no subscription`);
  }
  for (const [what, main] of [
    ['a type-only import of the shared host', "import type { Host } from '../_shared/host.ts';\nexport const h: Host | null = null;"],
    ['a type-only binding of the shared host', "import { type Host } from '../_shared/host.ts';\nexport const h: Host | null = null;"],
    ['an unused value import of the shared host', "import { start } from '../_shared/host.ts';\nexport const x = 1;"],
    ['a binding used only in a type position', "import { start } from '../_shared/host.ts';\nexport type S = typeof start;"],
    ['a type-only binding referenced as a value', "import { type start } from '../_shared/host.ts';\nstart();"],
    ['a type-only import referenced as a value', "import type { start } from '../_shared/host.ts';\nstart();"],
  ]) {
    const read = shared({ 'src/play/_shared/host.ts': HOST });
    assert.match(auditRoute({ id: 'r', files: { 'main.ts': main }, declaration: A, read }).failures.join('\n'), /no route file calls onRenderHold/, `MUST-RED: ${what} reaches no subscription at run time`);
  }
  for (const [what, main] of [
    ['a used value import', "import { start } from '../_shared/host.ts';\nstart();"],
    ['a side-effect import', "import '../_shared/host.ts';"],
    ['a literal dynamic import', "export const load = () => import('../_shared/host.ts');"],
  ]) {
    const read = shared({ 'src/play/_shared/host.ts': HOST });
    assert.deepEqual(auditRoute({ id: 'r', files: { 'main.ts': main }, declaration: A, read }).failures, [], `POSITIVE CONTROL: ${what} is followed`);
  }
  console.log('PASS REFUTE r1: only the hold export counts, called directly; unused, type-only and type-position imports are not followed');

  // The hold module itself is never entered: its own internals are not the route's subscription.
  const intoHold = { 'main.ts': "import '../_render-hold.ts';" };
  assert.match(auditRoute({ id: 'r', files: intoHold, declaration: A, read: shared({ 'src/play/_render-hold.ts': 'onRenderHold(x);' }) }).failures.join('\n'), /no route file calls onRenderHold/);
  console.log('PASS route code: a direct subscription two imports away counts, and reds a none route; a cut chain, a handed-on binding never called, an unimported member call, an empty call, a look-alike module and the hold module itself do not');

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
