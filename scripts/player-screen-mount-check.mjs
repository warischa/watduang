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
// ponytail: a text scan of each route's own top-level files (.ts/.js/.html, tests excluded), with
// whole-line and trailing comments dropped before it looks. It cannot see storage reached through
// an alias it does not spell, and it cannot see a sub-directory -- the same flat bound the other
// play-route gates carry.
//
//   node scripts/player-screen-mount-check.mjs             -> audit every party play route
//   node scripts/player-screen-mount-check.mjs --selftest  -> both-direction calibration on fixtures
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Not yet converted (gh#264 fan-out). Delete an id in the same commit that converts its route. */
export const PENDING = new Set([
  'bangkok-drift',
  'cannon-flag',
  'croc-bite',
  'dice-loser',
  'freeze-tap',
  'how-close-is-near',
  'one-bomb',
  'pinocchio-luck',
  'power-meter',
  'short-stick',
  'wire-snip-panic',
  'zero-trigger',
]);

/** Code with comments dropped, so prose about storage is not storage. Whole-line comments always
 *  go; a trailing `//` goes only when no quote opened earlier on the line; HTML comments go whole. */
export function codeOf(text) {
  return text
    .replace(/<!--[\s\S]*?-->/g, '')
    .split('\n')
    .filter((line) => {
      const t = line.trimStart();
      return !t.startsWith('//') && !t.startsWith('/*') && !t.startsWith('*');
    })
    .map((line) => {
      const i = line.indexOf('//');
      return i > 0 && !/['"`]/.test(line.slice(0, i)) ? line.slice(0, i) : line;
    })
    .join('\n');
}

/** Ways a route keeps a player list of its own. Each is a reason a converted route still reds. */
const OWN_LIST = [
  { re: /\blocalStorage\b/, why: 'touches localStorage directly' },
  { re: /\bsessionStorage\b/, why: 'touches sessionStorage directly' },
  { re: /['"`]watduang:/, why: 'spells a watduang: storage key of its own' },
  { re: /\b(?:saveGroup|replaceRoster|migrateLegacyList|saveOnSetupComplete)\b/, why: 'imports a roster write -- the shared screen is the only writer' },
];

const MOUNT = /\bmountPlayerScreen\(\s*\{/;
const COMPONENT = /import\s+PlayerScreen\s+from\s+['"][^'"]*_player-screen\/PlayerScreen\.astro['"][\s\S]*<PlayerScreen\s*\/>/;

/** One route's class and failures. Pure over its inputs so the selftest can drive it on strings. */
export function auditRoute({ id, files, page, pending = PENDING }) {
  const failures = [];
  const code = codeOf(Object.values(files).join('\n'));
  const mounts = MOUNT.test(code);
  if (!mounts) {
    if (pending.has(id)) return { id, klass: 'pending', failures };
    failures.push(`${id}: mounts no shared player screen and is not in PENDING -- a party route with its own setup screen (ADR-0071)`);
    return { id, klass: 'unmounted', failures };
  }
  if (pending.has(id)) failures.push(`${id}: mounts the shared player screen but is still listed in PENDING -- delete the entry`);
  if (!COMPONENT.test(page ?? '')) failures.push(`${id}: mounts the shared player screen but its play.astro does not render <PlayerScreen /> -- the mount has no markup to clone`);
  if ('roster-bridge.ts' in files) failures.push(`${id}: still ships a roster-bridge.ts beside the shared screen`);
  for (const { re, why } of OWN_LIST) if (re.test(code)) failures.push(`${id}: ${why}`);
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
  const page = "import PlayerScreen from '../../../play/_player-screen/PlayerScreen.astro';\n<Base>\n  <PlayerScreen />\n</Base>";
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

  // The stripper itself, on the shape that would let a real call hide: code after a quote stays.
  assert.match(codeOf("const u = 'http://x'; localStorage.clear();"), /localStorage/, 'a // inside a string must not drop the code after it');
  console.log('PASS stripper: a // inside a string keeps the code after it');
  console.log('player-screen-mount-check --selftest: all legs passed');
}

if (process.argv.includes('--selftest')) selftest();
else await audit();
