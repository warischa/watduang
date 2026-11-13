#!/usr/bin/env node
// Decides whether a branch push must run the browser lanes (gh#270).
//
// The rule is a project-owned INERT-PATH allowlist, never a derivation of "files the lanes execute":
// parsing shell and JS for that set does not converge (a deleted probe path vanished instead of
// failing closed, a ternary dynamic import waived both branches, a regex literal hid an import).
// A path is inert only if it matches INERT below; the lanes are skipped only when the diff is
// non-empty and EVERY path is inert. Anything else, deletions included, runs them. An empty diff
// changed nothing, so it skips.
//
// Why design/ is inert: the canvas never reaches dist/ and nothing the build or the lanes load reads
// it (astro.config.mjs does not, and src/ mentions it only in comments plus unit tests, which the
// workflow runs on every push regardless).
//
// A SECOND QUESTION, for main only: has a push run already measured these exact bytes? A batch is
// pushed to its branch first and then to main at the SAME commit, so main used to pay the whole
// browser lane twice for one tree (5 such pairs in the 15 runs before 2026-11-12). `--verified`
// answers it from GitHub's own records, and only ever answers "skip" when ALL of these hold:
// Which units count is read from ci.yml AT THIS SHA: the probe-gated STEPS of the one-job layout, or,
// when a `probe-verdict` job exists, the probe JOBS of the matrix layout (ADR-0078) -- every
// `probes (...)` lane, `webgl` and `probe-verdict`.
//   - a completed `push` run of this workflow at this SHA (never a pull_request run: that one tests
//     a merge commit, not this SHA) concluded success, and in its latest attempt every probe unit
//     concluded success -- the step set is derived from ci.yml, never pinned;
//   - a live digest artifact names the SAME dist/ digest this run built: in the step layout
//     `dist-digest-<hex>-a<attempt>` from that latest attempt; in the job layout `dist-digest-<hex>-full`
//     from any attempt of that run, which only a green FULL verdict publishes, and no narrowed lane ran
//     in that latest attempt (PER-ROUTE NARROWING below). Same SHA is not enough:
//     the probes must measure the bytes Deploy uploads, and main rebuilds dist/;
//   - NO run at this SHA -- this run's own earlier attempts included -- has a probe unit that
//     failed or timed out in ANY attempt. A red is a signal; a later green on a re-run does
//     not erase it, so main measures again;
//   - no other run at this SHA is still running: it may yet go red on the same bytes.
// Anything it cannot read or enumerate throws, and the workflow treats a throw as "run".
//
//   node scripts/probe-scope.mjs --changed <file>   one path per line -> `run=...` + a reason line
//   node scripts/probe-scope.mjs --changed-z <file> --ref <ref> [--decision-out <file>]
//        `git diff --name-status -z` output -> the decision file (`run=`, `scope=full|routes:<id>`) plus a
//        printed copy and a JSON-escaped reason, for the log only
//   node scripts/probe-scope.mjs --emit <file> --ref <ref>   the decision file, validated -> the two
//        lines the workflow publishes; anything unreadable -> run=true scope=full
//   node scripts/probe-scope.mjs --legs              the leg registry (NARROW_PLAN's labels)
//   node scripts/probe-scope.mjs --narrow-plan <id>  one `<mode> <label>` line per ci-probes.sh leg
//   node scripts/probe-scope.mjs --inert            prints the inert patterns
//   node scripts/probe-scope.mjs --dist-digest <dir>  sha256 over every file's relative path + sha256
//   node scripts/probe-scope.mjs --verified --sha <sha> --digest <hex> [--exclude-run <id>] [--decision-out <file>]
//   node scripts/probe-scope.mjs --selftest
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

// A .md under src/ or public/ is NOT inert: Astro builds src/pages/**.md into a page, and a static
// page outranks a dynamic route at the same URL, so one Markdown file can replace a page the probes load.
const INERT = [/^docs\//, /^(?!(?:src|public)\/).*\.md$/, /^\.claude\//, /^design\//];

// A file name may hold a control character, a line feed included (REFUTE r1 of the narrowing). Such a
// path is never inert and never route-owned: it always counts as a change, and always runs full.
const CONTROL = /[\u0000-\u001f\u007f]/;
const isInert = (p) => !CONTROL.test(p) && !p.split('/').includes('..') && INERT.some((re) => re.test(p));

function decide(paths) {
  if (paths.length === 0) return { run: false, reason: 'empty diff: nothing changed' };
  const first = paths.find((p) => !isInert(p));
  if (first === undefined) return { run: false, reason: `all ${paths.length} changed paths are inert` };
  return { run: true, reason: `first non-inert path: ${first}` };
}

// --- PER-ROUTE NARROWING: branch iteration only, never the deploy verdict (owner ruling 2026-11-12,
// ADR-0078 amendment 2026-11-13). A run that would otherwise run the probes answers `scope=routes:<id>`
// only when EVERY non-inert path of the diff sits under ONE route's own directory; anything else is
// `scope=full`. THE ALLOWLIST is one rule partitioned by manifest id: `src/play/<id>/**`, where <id> is a
// manifest game with a playRoute. Each path has at most one owner (its first segment under src/play/),
// so the partition cannot overlap. Everything else defaults to FULL: `src/play/_*` and loose files under
// src/play/, src/prize-event/, src/prize-draw/, src/games/ (the manifest included), src/pages/ (the
// route's own play.astro included), layouts, styles, scripts, workflows, package and lock files, and
// any path never seen before. A diff touching two ids is full. `src/play/<id>/` names an ITERATION
// OWNER, not every output it can affect, which is exactly why a narrowed run never verifies anything:
// it publishes no attestation, never deploys, and refs/heads/main never receives the narrow answer.
const MAIN_REF = 'refs/heads/main';
const ROUTE_ID = /^[a-z0-9][a-z0-9-]*$/;
const ROUTE_OWNED = /^src\/play\/([^/]+)\/./;

function ownerOf(p, ids) {
  if (CONTROL.test(p) || p.split('/').includes('..')) return null;
  const m = p.match(ROUTE_OWNED);
  return m && ROUTE_ID.test(m[1]) && ids.includes(m[1]) ? m[1] : null;
}

function decideScope(paths, { ref, ids } = {}) {
  const base = decide(paths);
  const full = (why) => ({ ...base, scope: 'full', reason: `${base.reason}; full: ${why}` });
  if (!base.run) return { ...base, scope: 'full' };
  if (typeof ref !== 'string' || ref === '') return full('no ref given');
  if (ref === MAIN_REF) return full('main never narrows');
  if (!Array.isArray(ids) || ids.length === 0) return full('no manifest play route ids');
  const owners = new Set();
  for (const p of paths.filter((x) => !isInert(x))) {
    const id = ownerOf(p, ids);
    if (id === null) return full(`shared or unknown path ${p}`);
    owners.add(id);
  }
  if (owners.size !== 1) return full(`${owners.size} route ids: ${[...owners].sort().join(', ')}`);
  const [id] = owners;
  return { run: true, scope: `routes:${id}`, reason: `every non-inert path sits under src/play/${id}/ (iteration only, never a deploy verdict)` };
}

// Diagnostics only: the reason can quote a file name, so it is printed JSON-escaped and is never parsed.
const formatScope = ({ run, scope, reason }) => `run=${run}\nscope=${scope}\nreason: ${JSON.stringify(reason)}`;

// THE PUBLISHED DECISION travels on its own channel, never on stdout: the resolver writes this file
// (--decision-out) and the workflow's emit publishes only what parseDecision (--emit) accepts. Exactly
// two lines, `run=` then `scope=`, from a closed vocabulary, so no file name and no reason line can set
// an output. Anything else -- no file, an extra line, a narrow scope on main or with no ref -- reads as
// run=true scope=full.
const DECISION = /^run=(true|false)\nscope=(full|routes:[a-z0-9][a-z0-9-]*)\n$/;
function parseDecision(text, { ref } = {}) {
  const m = typeof text === 'string' ? text.match(DECISION) : null;
  if (!m) return { run: true, scope: 'full' };
  const run = m[1] === 'true';
  const narrowOk = run && typeof ref === 'string' && ref !== '' && ref !== MAIN_REF;
  return { run, scope: narrowOk ? m[2] : 'full' };
}
function formatDecision({ run, scope = 'full' }) {
  const text = `run=${run === false ? 'false' : 'true'}\nscope=${scope}\n`;
  if (!DECISION.test(text)) throw new Error(`refusing to write an unreadable decision: ${JSON.stringify(text)}`);
  return text;
}

// `git diff --name-status -z`: a status token, then one path, or two for a rename (R) or copy (C), each
// NUL-terminated and never quoted. BOTH endpoints of a rename count, so moving a file across a route
// boundary touches two owners. An unknown status or a missing path throws -- the workflow runs full.
function parseNameStatusZ(text) {
  const t = text.split('\0');
  if (t.length && t[t.length - 1] === '') t.pop();
  const out = [];
  for (let i = 0; i < t.length;) {
    const st = t[i++];
    const n = /^[RC]\d*$/.test(st) ? 2 : /^[ADMTU]$/.test(st) ? 1 : 0;
    if (n === 0) throw new Error(`unknown name-status status ${JSON.stringify(st)}`);
    for (let k = 0; k < n; k++) {
      if (i >= t.length || t[i] === '') throw new Error(`status ${st} is missing a path`);
      out.push(t[i++]);
    }
  }
  return out;
}

// THE LEG REGISTRY, and the narrowed-run plan: every leg scripts/ci-probes.sh may run, keyed by its label,
// with what a `routes:<id>` run does with it. ci-probes.sh refuses to start when its lanes can call a leg
// this does not name (--legs), and the selftest executes those lanes (ciProbeLegs) and reds unless both
// sets are equal, so no leg can run unclassified. Modes: `narrow` runs the leg with ROUTES_ONLY=<id>; `full` runs
// it unchanged; `skip` does not run it. `only` names a subject set: a route outside it skips, because
// the leg never loads that route. WHY A SKIP IS SOUND: src/play/<id>/ is imported only by its own page,
// src/pages/game/<id>/play.astro (URL /game/<id>/play/), and no route directory imports another; a
// skipped leg visits no /game/*/play/ URL and reads nothing under src/play/ (checked 2026-11-13).
// The `webgl` job is not a ci-probes.sh leg: a narrowed run runs it full, on its own runner.
const NARROW_PLAN = {
  'play-exit': { mode: 'narrow', why: 'walks every manifest play route; takes ROUTES_ONLY' },
  'play-exit-guard': { mode: 'narrow', why: 'walks every manifest play route; takes ROUTES_ONLY' },
  'narrow-overflow': { mode: 'skip', why: 'walks /tool/ pages only' },
  'narrow-overflow-control': { mode: 'skip', why: 'walks /tool/ pages only' },
  'ad-reflow': { mode: 'skip', why: 'walks /tool/ name-entry pages only' },
  'ad-reflow-control': { mode: 'skip', why: 'walks /tool/ name-entry pages only' },
  'strip-chip-visibility': { mode: 'full', only: 'strip', why: 'its routes are the strip-counter callers, which it reads from src/play/*/main.*; has no ROUTES_ONLY' },
  'strip-chip-visibility-control': { mode: 'full', only: 'strip', why: 'as strip-chip-visibility' },
  'play-top-band': { mode: 'narrow', why: 'walks every manifest play route; takes ROUTES_ONLY' },
  'play-top-band-control': { mode: 'narrow', why: 'walks every manifest play route; takes ROUTES_ONLY' },
  'no-nav-in-stage': { mode: 'skip', why: 'walks /game/<id>/ landings of games with no playRoute' },
  'no-nav-in-stage-control': { mode: 'skip', why: 'walks /game/<id>/ landings of games with no playRoute' },
  'leave-confirm': { mode: 'skip', why: 'walks /game/<id>/ landings of games with no playRoute' },
  'leave-confirm-control': { mode: 'skip', why: 'walks /game/<id>/ landings of games with no playRoute' },
  'category-pop': { mode: 'skip', why: 'walks the category pages only' },
  'canvas-ink': { mode: 'narrow', only: 'canvas2d', why: 'walks the canvas2d play routes; takes ROUTES_ONLY' },
  'canvas-ink-control': { mode: 'narrow', only: 'canvas2d', why: 'walks the canvas2d play routes; takes ROUTES_ONLY' },
  'wheel-pointer-name': { mode: 'skip', why: 'walks /tool/wheel/ only' },
  'home-page-normal': { mode: 'skip', why: 'walks / only' },
  'home-page-reduced': { mode: 'skip', why: 'walks / only' },
  'live-region-floor': { mode: 'full', why: 'derives its pages from dist/, so a play route can join; has no ROUTES_ONLY' },
  'live-region-floor-control': { mode: 'full', why: 'derives its pages from dist/; has no ROUTES_ONLY' },
  'control-floor': { mode: 'full', why: 'walks every game, play routes included; has no ROUTES_ONLY' },
  'control-floor-control': { mode: 'full', why: 'walks every game, play routes included; has no ROUTES_ONLY' },
  'no-webgl-first-screen': { mode: 'narrow', why: 'walks every manifest play route; takes ROUTES_ONLY' },
  'player-screen-face': { mode: 'narrow', only: 'party', why: 'walks the party play routes; takes ROUTES_ONLY' },
  'play-screen-fit-#': { mode: 'skip', why: 'the full run\'s sharded fit leg, one per shard; the narrowed run walks the unsharded pair' },
  'play-screen-fit-control-#': { mode: 'skip', why: 'the full run\'s sharded fit control, one per shard; as play-screen-fit-#' },
  'play-screen-fit': { mode: 'narrow', why: 'the unsharded fit walk; ROUTES_ONLY replaces FIT_SHARD' },
  'play-screen-fit-control': { mode: 'narrow', why: 'the unsharded fit walk; ROUTES_ONLY replaces FIT_SHARD' },
};

// Pure: `sets` holds the manifest play-route ids and each subject set named by an `only`.
function narrowPlan(id, sets) {
  if (!ROUTE_ID.test(String(id)) || !sets.ids.includes(id)) throw new Error(`${id} is not a manifest play route`);
  return Object.entries(NARROW_PLAN).map(([label, { mode, only, why }]) => {
    if (only && !Array.isArray(sets[only])) throw new Error(`no subject set ${only}`);
    return only && !sets[only].includes(id) ? { label, mode: 'skip', why: `${id} is outside its ${only} set` } : { label, mode, why };
  });
}

// A shard's label ends in its index; the registry names the family once, as `<label>-#`.
const legFamily = (label) => {
  const fam = String(label).replace(/-\d+$/, '-#');
  return fam !== label && Object.hasOwn(NARROW_PLAN, fam) ? fam : label;
};

// Every leg ci-probes.sh can run, read by EXECUTING it: its list mode calls every lane, the sharded fit
// pair and the narrowed pair with probe()/standalone() replaced by a recorder, prints `LEG <label>` and
// exits LIST_EXIT, never 0, so a stray PROBE_LIST_LEGS can never pass for a measured run. No spelling of
// a leg can hide from this, which a regex over the file could not promise (REFUTE r1).
const LIST_EXIT = 3;
function ciProbeLegs() {
  const dir = mkdtempSync(join(tmpdir(), 'probe-legs-'));
  try {
    const env = { PATH: process.env.PATH ?? '', HOME: process.env.HOME ?? '', PROBE_LIST_LEGS: '1', PROBE_OUT_DIR: dir };
    const r = spawnSync('bash', ['scripts/ci-probes.sh'], { cwd: fileURLToPath(new URL('..', import.meta.url)), env, encoding: 'utf8', timeout: 60_000 });
    if (r.status !== LIST_EXIT) throw new Error(`ci-probes.sh list mode exited ${r.status}, not ${LIST_EXIT}: ${r.stderr}${r.stdout}`);
    const legs = r.stdout.split('\n').filter((l) => l.startsWith('LEG ')).map((l) => l.slice(4));
    if (legs.length === 0) throw new Error('ci-probes.sh list mode named no leg');
    return legs;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

async function manifestGames() {
  const { games } = await import(new URL('../src/games/manifest.ts', import.meta.url).href);
  if (!Array.isArray(games) || games.length === 0) throw new Error('the manifest exports no games');
  return games;
}
const playRouteIds = (games) => games.filter((g) => g.playRoute).map((g) => g.id).sort();

// Each subject set from the expression its own leg uses, never retyped. The strip set is the leg's
// own listed ids plus any route whose main module mounts the counter, so a route gaining or losing the
// counter still runs the leg whose stale-list check catches it.
async function narrowSets() {
  delete process.env.ROUTES_ONLY;
  const games = await manifestGames();
  const ids = playRouteIds(games);
  const { canvas2dRouteIds } = await import('./canvas-ink-probe.mjs');
  const { partyPlayRoutes } = await import('./player-screen-face-probe.mjs');
  const stripSrc = readFileSync(new URL('./strip-chip-visibility-probe.mjs', import.meta.url), 'utf8');
  const mountsCounter = (id) => ['main.js', 'main.ts'].some((n) => {
    const f = new URL(`../src/play/${id}/${n}`, import.meta.url);
    return existsSync(f) && readFileSync(f, 'utf8').includes('mountStripOverflowCounter');
  });
  const strip = ids.filter((id) => stripSrc.includes(`id: '${id}'`) || mountsCounter(id));
  return { ids, party: partyPlayRoutes(games), canvas2d: canvas2dRouteIds(games), strip };
}

// Lines are taken verbatim, never trimmed: git keeps a trailing space in a file name, and trimming
// `src/example.md ` would turn a non-inert path into an inert one. Only empty lines are dropped.
const parse = (text) => text.split('\n').filter((l) => l.length > 0);

// The exact `if:` that gates the browser lane. A step whose condition merely CONTAINS it (the
// `failure() && ...` upload) is not a measurement and is not in the set.
const PROBE_GATE = "steps.probe-scope.outputs.run == 'true'";
const WORKFLOW_PATH = '.github/workflows/ci.yml';
// Suffixed with the attempt, so the match binds the digest to the attempt that measured it. On a
// real re-run (run 43150614193, 2026-11-12) `-a2` published green and `-a1` was no longer listed.
const DIGEST_ARTIFACT = (hex, attempt) => `dist-digest-${hex}-a${attempt}`;
// The job layout (the probe matrix, ADR-0078): the digest is the identity, so the name carries no attempt.
// A partial re-run keeps the earlier attempts' artifacts and copies the jobs it did not re-run into the
// new attempt (observed 2026-11-12, run 43165835700), so binding the name to an attempt would orphan a
// verdict that was never re-run.
// Since the narrowing amendment the name also states the scope the probes covered: only a FULL run
// publishes, and the consumer matches the `-full` name alone, so an unmarked or narrowed name never verifies.
const JOB_DIGEST_ARTIFACT = (hex) => `dist-digest-${hex}-full`;
// The probe jobs of the job layout, by the names GitHub gives them: the matrix lanes, WebGL, the verdict.
const PROBE_VERDICT_JOB = 'probe-verdict';
const WEBGL_JOB = 'webgl';
// The narrowed lane: a red there is still a red on these bytes, and a run that ran it is never full.
const PROBES_NARROWED_JOB = 'probes-narrowed';
const isProbeJob = (name) => name === PROBE_VERDICT_JOB || name === WEBGL_JOB || name === PROBES_NARROWED_JOB || /^probes \(/.test(String(name));
// ci.yml at the SHA decides the layout: a `probe-verdict` job means the job graph, else the one-job steps.
const layoutOf = (yamlText) => (/^  probe-verdict:\s*$/m.test(yamlText) ? 'jobs' : 'steps');

// Conditions that name the gate but gate no measurement: the failure-time upload and the digest
// publish. A CLOSED set: any other condition mentioning probe-scope throws (REFUTE r2 F4), so a
// reworded, quoted, wrapped or compound gate can never silently drop a step from the gated set.
const NOT_MEASUREMENTS = new Set([
  `failure() && ${PROBE_GATE}`,
  `success() && ${PROBE_GATE} && steps.probe-scope.outputs.dist_digest != ''`,
]);

// YAML spellings of one condition: trailing comment, quoted scalar, `${{ }}` wrapper.
function normalizeIf(value) {
  let s = value.replace(/\s+#.*$/, '').trim();
  s = s.replace(/^(['"])(.*)\1$/, '$2').trim();
  const wrapped = s.match(/^\$\{\{\s*([\s\S]*?)\s*\}\}$/);
  return (wrapped ? wrapped[1] : s).replace(/\s+/g, ' ').trim();
}

// Step names in ci.yml whose condition is exactly PROBE_GATE. Keys are read per step at the steps
// list's own indentation, in any order (`- if:` first included), and a folded or literal multi-line
// `if:` is joined first. A gated step with no name cannot be found in the API's step list, so it
// throws rather than shrinking the set.
function gatedSteps(yamlText) {
  const lines = yamlText.split('\n');
  const indentOf = (l) => l.match(/^\s*/)[0].length;
  const steps = [];
  let afterStepsKey = false;
  let itemIndent = -1;
  let keyIndent = -1;
  let cur = null;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^\s*steps:\s*$/.test(line)) { afterStepsKey = true; continue; }
    let k = null;
    let raw = null;
    const item = line.match(/^(\s*)(-\s+)([A-Za-z_][\w-]*):\s*(.*)$/);
    if (item && ((itemIndent === -1 && afterStepsKey) || item[1].length === itemIndent)) {
      itemIndent = item[1].length;
      keyIndent = item[1].length + item[2].length;
      cur = { name: null, ifs: [] };
      steps.push(cur);
      [k, raw] = [item[3], item[4]];
    } else if (cur && indentOf(line) === keyIndent) {
      const kv = line.match(/^\s*([A-Za-z_][\w-]*):\s*(.*)$/);
      if (kv) [k, raw] = [kv[1], kv[2]];
    }
    if (!k) continue;
    if (k === 'name') cur.name = raw.replace(/\s+#.*$/, '').trim().replace(/^(['"])(.*)\1$/, '$2');
    if (k === 'if') {
      let value = raw;
      if (/^[>|][-+]?$/.test(value.trim()) || value.trim() === '') {
        const parts = [];
        for (let j = i + 1; j < lines.length && (lines[j].trim() === '' || indentOf(lines[j]) > keyIndent); j++) parts.push(lines[j].trim());
        value = parts.join(' ');
      }
      cur.ifs.push(normalizeIf(value));
    }
  }
  const out = [];
  for (const s of steps) {
    for (const cond of s.ifs) {
      if (cond === PROBE_GATE) {
        if (!s.name) throw new Error('a probe-gated step has no name: the API cannot be matched against it');
        out.push(s.name);
      } else if (cond.includes('probe-scope') && !NOT_MEASUREMENTS.has(cond)) {
        throw new Error(`a condition on probe-scope is neither the gate nor a known non-measurement: ${cond}`);
      }
    }
  }
  return out;
}

function distDigest(dir) {
  const files = [];
  const walk = (d) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.isFile()) files.push(p);
      else throw new Error(`not a regular file in ${dir}: ${p}`);
    }
  };
  walk(dir);
  if (files.length === 0) throw new Error(`${dir} holds no files`);
  const rels = files.map((f) => relative(dir, f)).sort();
  const h = createHash('sha256');
  for (const r of rels) h.update(`${r}\0${createHash('sha256').update(readFileSync(join(dir, r))).digest('hex')}\n`);
  return h.digest('hex');
}

const RED = new Set(['failure', 'timed_out']);

// Pure: every input is data already fetched. `jobsByRun[id]` holds ALL attempts' jobs; a run whose
// jobs are missing is unreadable, and an unreadable run at this SHA could be hiding a red.
// The red scan covers THIS run too (its earlier attempts): a re-run keeps its run id, so excluding
// it there would let attempt 2 of a main run whose attempt 1 went red deploy unmeasured.
function decideVerified({ sha, digest, runs, jobsByRun, artifactsByRun, gated, excludeRunId, layout = 'steps' }) {
  const run = (reason) => ({ run: true, reason });
  if (layout !== 'steps' && layout !== 'jobs') return run(`unknown workflow layout ${layout}`);
  if (layout === 'steps' && (!Array.isArray(gated) || gated.length === 0)) return run('no probe-gated step found in ci.yml at this SHA');
  if (!/^[0-9a-f]{64}$/.test(String(digest))) return run(`no usable dist digest (${digest})`);
  const allAtSha = runs.filter((r) => r.head_sha === sha && r.path === WORKFLOW_PATH);
  const isSelf = (r) => String(r.id) === String(excludeRunId);
  for (const r of allAtSha) {
    const jobs = jobsByRun[r.id];
    if (!Array.isArray(jobs)) return run(`jobs of run ${r.id} were not read`);
    for (const j of jobs) {
      // Job layout: a probe job that failed or timed out, in ANY attempt, is the red.
      if (layout === 'jobs') {
        if (isProbeJob(j.name) && RED.has(j.conclusion)) return run(`run ${r.id} attempt ${j.run_attempt}: job "${j.name}" ${j.conclusion} at this SHA`);
        continue;
      }
      // A finished job that lists no steps is unreadable (REFUTE r2 F3); only this run's own job,
      // still in flight, may not have them yet.
      if (!Array.isArray(j.steps)) {
        if (j.status === 'completed') return run(`run ${r.id} attempt ${j.run_attempt}: a finished job lists no steps`);
        continue;
      }
      // A job that failed or timed out while a gated step was neither green nor skipped is a red on
      // that step, whatever the step itself reports (a job timeout marks the step cancelled).
      const jobRed = RED.has(j.conclusion);
      for (const s of j.steps) {
        if (!gated.includes(s.name)) continue;
        if (RED.has(s.conclusion) || (jobRed && s.conclusion !== 'success' && s.conclusion !== 'skipped')) {
          return run(`run ${r.id} attempt ${j.run_attempt}: "${s.name}" ${s.conclusion} (job ${j.conclusion}) at this SHA`);
        }
      }
    }
  }
  const atSha = allAtSha.filter((r) => !isSelf(r));
  if (atSha.length === 0) return run('no other run of this workflow at this SHA');
  // A sibling still running may yet go red on these bytes; wait for nothing, measure instead.
  const live = atSha.find((r) => r.status !== 'completed');
  if (live) return run(`run ${live.id} at this SHA is still ${live.status}`);
  const misses = [];
  for (const r of atSha) {
    const why = (m) => misses.push(`run ${r.id}: ${m}`);
    if (r.event !== 'push') { why(`event ${r.event}`); continue; }
    if (r.status !== 'completed' || r.conclusion !== 'success') { why(`${r.status}/${r.conclusion}`); continue; }
    if (!r.repository?.full_name || r.head_repository?.full_name !== r.repository.full_name) { why('head repository differs'); continue; }
    const latest = jobsByRun[r.id].filter((j) => j.run_attempt === r.run_attempt);
    if (layout === 'jobs') {
      const lanes = latest.filter((j) => /^probes \(/.test(String(j.name)));
      const verdict = latest.find((j) => j.name === PROBE_VERDICT_JOB);
      const webgl = latest.find((j) => j.name === WEBGL_JOB);
      const narrowed = latest.find((j) => j.name === PROBES_NARROWED_JOB && j.conclusion !== 'skipped');
      if (narrowed) { why(`${PROBES_NARROWED_JOB} ${narrowed.conclusion}: a narrowed run is never a full verdict`); continue; }
      if (!verdict || verdict.conclusion !== 'success') { why(`${PROBE_VERDICT_JOB} ${verdict?.conclusion ?? 'absent'}`); continue; }
      if (!webgl || webgl.conclusion !== 'success') { why(`${WEBGL_JOB} ${webgl?.conclusion ?? 'absent'}`); continue; }
      if (lanes.length === 0 || lanes.some((j) => j.conclusion !== 'success')) { why(`probe lanes not all success (${lanes.length} listed)`); continue; }
      const jarts = artifactsByRun[r.id];
      if (!Array.isArray(jarts)) { why('artifacts not read'); continue; }
      if (!jarts.some((a) => a.name === JOB_DIGEST_ARTIFACT(digest) && a.expired === false)) { why('no live FULL attestation for this dist digest'); continue; }
      return { run: false, reason: `run ${r.id} (${r.head_branch}, attempt ${r.run_attempt}) passed ${PROBE_VERDICT_JOB}, ${WEBGL_JOB} and ${lanes.length} probe lane(s) on dist digest ${digest}` };
    }
    const steps = latest.flatMap((j) => j.steps ?? []);
    const notGreen = gated.filter((g) => !steps.some((s) => s.name === g && s.conclusion === 'success'));
    if (notGreen.length) { why(`not success: ${notGreen.join(' | ')}`); continue; }
    const arts = artifactsByRun[r.id];
    if (!Array.isArray(arts)) { why('artifacts not read'); continue; }
    if (!arts.some((a) => a.name === DIGEST_ARTIFACT(digest, r.run_attempt) && a.expired === false)) { why('no live artifact for this dist digest from its latest attempt'); continue; }
    return { run: false, reason: `run ${r.id} (${r.head_branch}, attempt ${r.run_attempt}) passed every probe-gated step on dist digest ${digest}` };
  }
  return run(`no run at this SHA measured this dist: ${misses.join('; ')}`);
}

// Network half: `gh api` with the workflow's own token. Any short page, missing field or failed call
// throws -- the caller's fail-safe branch then runs the probes.
function fetchVerified({ sha, repo }) {
  // A hung call throws at the timeout instead of burning the job.
  const gh = (path) => JSON.parse(execFileSync('gh', ['api', path], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, timeout: 60_000 }));
  const runsPage = gh(`repos/${repo}/actions/workflows/ci.yml/runs?head_sha=${sha}&per_page=100`);
  if (!Array.isArray(runsPage.workflow_runs) || runsPage.total_count !== runsPage.workflow_runs.length) {
    throw new Error(`runs at ${sha}: listed ${runsPage.workflow_runs?.length} of ${runsPage.total_count}`);
  }
  const jobsByRun = {};
  const artifactsByRun = {};
  for (const r of runsPage.workflow_runs) {
    const jp = gh(`repos/${repo}/actions/runs/${r.id}/jobs?filter=all&per_page=100`);
    if (!Array.isArray(jp.jobs) || jp.total_count !== jp.jobs.length) throw new Error(`jobs of run ${r.id}: listed ${jp.jobs?.length} of ${jp.total_count}`);
    jobsByRun[r.id] = jp.jobs;
    const ap = gh(`repos/${repo}/actions/runs/${r.id}/artifacts?per_page=100`);
    if (!Array.isArray(ap.artifacts) || ap.total_count !== ap.artifacts.length) throw new Error(`artifacts of run ${r.id}: listed ${ap.artifacts?.length} of ${ap.total_count}`);
    artifactsByRun[r.id] = ap.artifacts;
  }
  const yaml = execFileSync('git', ['show', `${sha}:${WORKFLOW_PATH}`], { encoding: 'utf8' });
  const layout = layoutOf(yaml);
  return { runs: runsPage.workflow_runs, jobsByRun, artifactsByRun, layout, gated: layout === 'steps' ? gatedSteps(yaml) : [] };
}

function verifiedSelftest() {
  const SHA = 'a'.repeat(40);
  const D = 'b'.repeat(64);
  const G = ['Give the runner a Thai face (gh#287)', 'Browser probes against the deployed artifact (gh#122)'];
  const green = (attempt = 1) => ({ run_attempt: attempt, steps: G.map((name) => ({ name, conclusion: 'success' })) });
  const repo = { full_name: 'o/r' };
  const base = () => ({
    sha: SHA, digest: D, gated: [...G], excludeRunId: 9,
    runs: [
      { id: 9, head_sha: SHA, path: WORKFLOW_PATH, event: 'push', head_branch: 'main', status: 'in_progress', conclusion: null, run_attempt: 1, repository: repo, head_repository: repo },
      { id: 1, head_sha: SHA, path: WORKFLOW_PATH, event: 'push', head_branch: 'batch/x', status: 'completed', conclusion: 'success', run_attempt: 1, repository: repo, head_repository: repo },
    ],
    jobsByRun: { 9: [], 1: [green()] },
    artifactsByRun: { 9: [], 1: [{ name: DIGEST_ARTIFACT(D, 1), expired: false }] },
  });
  const v = (mut) => { const x = base(); mut(x); return decideVerified(x).run; };
  assert.equal(v(() => {}), false, 'positive control: a same-SHA push run green on every gated step with this digest is reused');
  assert.equal(v((x) => { x.digest = 'c'.repeat(64); }), true, 'a different dist digest must run: main rebuilt different bytes');
  assert.equal(v((x) => { x.artifactsByRun[1] = [{ name: DIGEST_ARTIFACT(D, 1), expired: true }]; }), true, 'an expired digest artifact must run');
  assert.equal(v((x) => { x.artifactsByRun[1] = []; }), true, 'no digest artifact must run');
  assert.equal(v((x) => { delete x.artifactsByRun[1]; }), true, 'unread artifacts must run');
  assert.equal(v((x) => { x.jobsByRun[1][0].steps[1].conclusion = 'skipped'; }), true, 'a skipped probe step is not a measurement');
  assert.equal(v((x) => { x.jobsByRun[1][0].steps.pop(); }), true, 'a gated step absent from the run must run');
  assert.equal(v((x) => { x.gated.push('A step added at this SHA'); }), true, 'every derived gated step must be green, not a pinned subset');
  assert.equal(v((x) => { x.gated = []; }), true, 'an empty gated set must run');
  assert.equal(v((x) => { x.digest = 'not-hex'; }), true, 'a malformed digest must run');
  assert.equal(v((x) => { x.runs[1].event = 'pull_request'; }), true, 'a pull_request run tests a merge commit, not this SHA');
  assert.equal(v((x) => { x.runs[1].conclusion = 'failure'; }), true, 'a red run is never reused');
  assert.equal(v((x) => { x.runs[1].status = 'in_progress'; x.runs[1].conclusion = null; }), true, 'an unfinished run is not a verdict');
  assert.equal(v((x) => { x.runs[1].head_repository = { full_name: 'fork/r' }; }), true, 'a run from another repository is never reused');
  assert.equal(v((x) => { x.runs[1].path = '.github/workflows/other.yml'; }), true, 'another workflow is not this one');
  assert.equal(v((x) => { x.runs[1].head_sha = 'd'.repeat(40); }), true, 'another SHA is not this tree');
  assert.equal(v((x) => { x.excludeRunId = 1; }), true, 'the excluded run (this run itself) never verifies itself');
  // Run 33491962091's shape: attempt 1 red on the probes, attempt 2 green. The red still blocks.
  assert.equal(v((x) => { x.runs[1].run_attempt = 2; x.jobsByRun[1] = [{ run_attempt: 1, steps: [{ name: G[1], conclusion: 'failure' }] }, green(2)]; }), true, 'a red in an earlier attempt blocks reuse');
  assert.equal(v((x) => { x.runs[1].run_attempt = 2; x.jobsByRun[1] = [green(1)]; }), true, 'only the latest attempt can verify');
  // REFUTE r1 finding 1: this run is main's own re-run, and its attempt 1 went red on the probes.
  assert.equal(v((x) => { x.runs[0].run_attempt = 2; x.jobsByRun[9] = [{ run_attempt: 1, steps: [{ name: G[1], conclusion: 'failure' }] }]; }), true, 'a red in an earlier attempt of THIS run blocks reuse');
  // REFUTE r1 finding 2: a green sibling, and another still measuring the same bytes.
  assert.equal(v((x) => { x.runs.push({ ...x.runs[1], id: 4, status: 'in_progress', conclusion: null }); x.jobsByRun[4] = []; x.artifactsByRun[4] = []; }), true, 'a sibling still running at this SHA blocks reuse');
  assert.equal(v((x) => { x.runs[1].run_attempt = 2; x.jobsByRun[1] = [green(1), green(2)]; }), true, 'an artifact from an earlier attempt does not verify the latest one');
  assert.equal(v((x) => { x.runs[1].run_attempt = 2; x.jobsByRun[1] = [green(1), green(2)]; x.artifactsByRun[1] = [{ name: DIGEST_ARTIFACT(D, 2), expired: false }]; }), false, 'a green re-run that published its own digest is reused');
  assert.equal(v((x) => { x.runs.push({ ...x.runs[1], id: 2, event: 'pull_request', conclusion: 'failure' }); x.jobsByRun[2] = [{ run_attempt: 1, steps: [{ name: G[1], conclusion: 'timed_out' }] }]; x.artifactsByRun[2] = []; }), true, 'a red gated step in ANY run at this SHA blocks reuse, pull_request included');
  assert.equal(v((x) => { x.runs.push({ ...x.runs[1], id: 3 }); }), true, 'a run at this SHA whose jobs were not read blocks reuse');
  assert.match(decideVerified(base()).reason, /run 1 \(batch\/x, attempt 1\)/, 'the reuse reason names the run it trusted');
  // The job layout (ADR-0078): probe lanes, webgl and probe-verdict are jobs; the digest artifact has no attempt.
  const J = (name, conclusion = 'success', attempt = 1) => ({ name, conclusion, run_attempt: attempt, status: 'completed' });
  const jobRun = (attempt = 1) => [J('build', 'success', attempt), J('probes (exit)', 'success', attempt), J('probes (fit0)', 'success', attempt), J('webgl', 'success', attempt), J(PROBE_VERDICT_JOB, 'success', attempt)];
  const jbase = () => {
    const x = base();
    x.layout = 'jobs'; x.gated = [];
    x.jobsByRun = { 9: [], 1: jobRun() };
    x.artifactsByRun = { 9: [], 1: [{ name: JOB_DIGEST_ARTIFACT(D), expired: false }] };
    return x;
  };
  const jv = (mut) => { const x = jbase(); mut(x); return decideVerified(x).run; };
  assert.equal(jv(() => {}), false, 'job layout positive control: verdict, webgl and every lane green, digest artifact live');
  assert.equal(jv((x) => { x.artifactsByRun[1] = [{ name: DIGEST_ARTIFACT(D, 1), expired: false }]; }), true, 'job layout matches the attempt-free name only');
  assert.equal(jv((x) => { x.jobsByRun[1] = x.jobsByRun[1].filter((j) => j.name !== PROBE_VERDICT_JOB); }), true, 'no probe-verdict job means no verdict');
  assert.equal(jv((x) => { x.jobsByRun[1].find((j) => j.name === WEBGL_JOB).conclusion = 'skipped'; }), true, 'a skipped webgl job is not a measurement');
  assert.equal(jv((x) => { x.jobsByRun[1] = x.jobsByRun[1].filter((j) => !/^probes \(/.test(j.name)); }), true, 'no lane jobs listed means nothing measured');
  assert.equal(jv((x) => { x.jobsByRun[1].find((j) => j.name === 'probes (exit)').conclusion = 'cancelled'; }), true, 'a lane that did not succeed blocks reuse');
  // A partial re-run (2026-11-12, run 43165835700): attempt 2 copies the jobs it did not re-run.
  assert.equal(jv((x) => { x.runs[1].run_attempt = 2; x.jobsByRun[1] = [...jobRun(1).map((j) => (j.name === 'probes (fit0)' ? { ...j, conclusion: 'failure' } : j)), ...jobRun(2)]; }), true, 'a lane red in attempt 1 still blocks after a green partial re-run');
  assert.equal(jv((x) => { x.runs[1].run_attempt = 2; x.jobsByRun[1] = [...jobRun(1).map((j) => (j.name === 'build' ? { ...j, conclusion: 'failure' } : j)), ...jobRun(2)]; }), false, 'a red in a non-probe job of an earlier attempt is not a probe red');
  // probe-verdict and deploy run under !cancelled() (REFUTE 2026-11-12): a cancelled attempt leaves the
  // verdict skipped, not failed. So a lane red must block on its own, with no verdict red beside it,
  // and a cancel with no red must not block a later green attempt.
  const attempt1 = (lane, verdict) => jobRun(1).map((j) => (j.name === 'probes (fit0)' ? { ...j, conclusion: lane } : j.name === PROBE_VERDICT_JOB ? { ...j, conclusion: verdict } : j));
  assert.equal(jv((x) => { x.runs[1].run_attempt = 2; x.jobsByRun[1] = [...attempt1('failure', 'skipped'), ...jobRun(2)]; }), true, 'a lane red blocks reuse even when the cancelled attempt never ran its verdict');
  assert.equal(jv((x) => { x.runs[1].run_attempt = 2; x.jobsByRun[1] = [...attempt1('cancelled', 'skipped'), ...jobRun(2)]; }), false, 'a cancelled attempt with no red does not block a later green attempt');
  assert.equal(jv((x) => { x.runs.push({ ...x.runs[1], id: 7, conclusion: 'failure' }); x.jobsByRun[7] = [J(PROBE_VERDICT_JOB, 'failure')]; x.artifactsByRun[7] = []; }), true, 'a red verdict in a sibling run blocks reuse');
  assert.equal(jv((x) => { x.jobsByRun[9] = [J(WEBGL_JOB, 'timed_out')]; }), true, 'a red probe job in THIS run\'s earlier attempt blocks reuse');
  assert.equal(decideVerified({ ...jbase(), layout: 'mixed' }).run, true, 'an unknown layout runs');
  assert.equal(layoutOf('jobs:\n  build:\n    runs-on: x\n  probe-verdict:\n    needs: probes\n'), 'jobs', 'a probe-verdict job means the job layout');
  assert.equal(layoutOf('jobs:\n  build:\n    steps:\n      - name: probe-verdict:\n'), 'steps', 'the name only counts as a job key');
  // REFUTE r2 F3: shapes the red scan used to read as clean.
  assert.equal(v((x) => { x.runs[1].run_attempt = 2; x.jobsByRun[1] = [{ run_attempt: 1, status: 'completed', conclusion: 'failure' }, green(2)]; x.artifactsByRun[1] = [{ name: DIGEST_ARTIFACT(D, 2), expired: false }]; }), true, 'a finished job that lists no steps is unreadable: run');
  const sibling = (x, id, jobConclusion, stepConclusion) => {
    x.runs.push({ ...x.runs[1], id, conclusion: jobConclusion });
    x.jobsByRun[id] = [{ run_attempt: 1, status: 'completed', conclusion: jobConclusion, steps: [{ name: G[1], conclusion: stepConclusion }] }];
    x.artifactsByRun[id] = [];
  };
  assert.equal(v((x) => sibling(x, 5, 'failure', 'cancelled')), true, 'a failed job whose gated step reads cancelled (a job timeout) is a red');
  assert.equal(v((x) => sibling(x, 5, 'failure', null)), true, 'a failed job whose gated step has no conclusion is a red');
  assert.equal(v((x) => sibling(x, 6, 'cancelled', 'cancelled')), false, 'a superseded (cancelled) sibling is not a red');
  assert.equal(v((x) => { x.jobsByRun[9] = [{ run_attempt: 1, status: 'in_progress', conclusion: null }]; }), false, 'this run\'s own in-flight job may not list steps yet');
  const yaml = [
    '    steps:',
    '      - name: Decide whether the browser probes can add anything', '        id: probe-scope',
    '      - name: Give the runner a Thai face (gh#287)', `        if: ${PROBE_GATE}`,
    "      - name: 'Quoted probe step'", `        if: ${PROBE_GATE}`,
    '      - name: Keep the probe output when anything fails', `        if: failure() && ${PROBE_GATE}`,
    '      - name: Publish the dist digest the probes passed on', `        if: success() && ${PROBE_GATE} && steps.probe-scope.outputs.dist_digest != ''`,
    '      - name: Deploy', "        if: ${{ github.ref == 'refs/heads/main' }}",
  ].join('\n');
  assert.deepEqual(gatedSteps(yaml), ['Give the runner a Thai face (gh#287)', 'Quoted probe step'], 'only the exact gate condition is gated; the failure() upload and the digest publish are not');
  assert.throws(() => gatedSteps(`    steps:\n      - uses: x/y@v1\n        if: ${PROBE_GATE}`), /no name/, 'a nameless gated step throws instead of shrinking the set');
  // REFUTE r2 F4: other YAML spellings of the same gate are still the gate.
  const one = (stepLines) => gatedSteps(['    steps:', ...stepLines].join('\n'));
  assert.deepEqual(one([`      - if: ${PROBE_GATE}`, '        name: If first']), ['If first'], 'a step that opens with if: is read');
  assert.deepEqual(one(['      - name: Quoted if', `        if: "${PROBE_GATE}"`]), ['Quoted if'], 'a quoted condition is the gate');
  assert.deepEqual(one(['      - name: Wrapped if', `        if: \${{ ${PROBE_GATE} }}`]), ['Wrapped if'], 'a ${{ }}-wrapped condition is the gate');
  assert.deepEqual(one(['      - name: Commented if', `        if: ${PROBE_GATE}  # why`]), ['Commented if'], 'a trailing comment does not hide the gate');
  assert.deepEqual(one(['      - name: Folded if', '        if: >-', '          steps.probe-scope.outputs.run ==', "          'true'"]), ['Folded if'], 'a folded multi-line condition is the gate');
  assert.throws(() => one(['      - name: Compound', `        if: always() && ${PROBE_GATE}`]), /neither the gate nor a known non-measurement/, 'an unknown condition on probe-scope throws');
  // Narrowing (ADR-0078 amendment 2026-11-13): only a FULL attestation verifies, and a run that ran the
  // narrowed lane is never a full verdict. The names are literals here so the test pins the format.
  assert.equal(JOB_DIGEST_ARTIFACT(D), `dist-digest-${D}-full`, 'the job-layout attestation names its scope');
  assert.equal(jv((x) => { x.artifactsByRun[1] = [{ name: `dist-digest-${D}`, expired: false }]; }), true, 'an attestation without the full mark is refused');
  assert.equal(jv((x) => { x.artifactsByRun[1] = [{ name: `dist-digest-${D}-routes-cannon-flag`, expired: false }]; }), true, 'a narrowed attestation is refused');
  assert.equal(jv((x) => { x.jobsByRun[1].push(J('probes-narrowed')); }), true, 'a run that ran the narrowed lane is never a full verdict, whatever it published');
  assert.equal(jv((x) => { x.jobsByRun[1].push(J('probes-narrowed', 'skipped')); }), false, 'a skipped narrowed lane is the full run\'s own shape');
  assert.equal(jv((x) => { x.runs.push({ ...x.runs[1], id: 8, conclusion: 'failure' }); x.jobsByRun[8] = [J('probes-narrowed', 'failure')]; x.artifactsByRun[8] = []; }), true, 'a narrowed red at this SHA blocks reuse');
}

function narrowSelftest() {
  const ids = ['cannon-flag', 'dice-loser', 'prize-draw'];
  const BR = 'refs/heads/wt/narrow';
  const s = (paths, ref = BR) => decideScope(paths, { ref, ids }).scope;
  const A = 'src/play/cannon-flag/main.js';
  assert.equal(s([A]), 'routes:cannon-flag', 'a one-route diff narrows to that route');
  assert.equal(s([A, 'src/play/cannon-flag/style.css', 'docs/x.md']), 'routes:cannon-flag', 'inert paths beside one route keep it narrowed');
  for (const shared of ['src/play/_player-screen/PlayerScreen.astro', 'src/play/_mascots.ts', 'src/play/name-escaping.test.mjs',
    'src/prize-event/event.ts', 'src/prize-draw/x.ts', 'src/games/manifest.ts', 'src/games/cannon-flag.ts', 'src/layouts/Base.astro',
    'src/styles/tokens.css', 'src/pages/game/cannon-flag/play.astro', 'scripts/ci-probes.sh', '.github/workflows/ci.yml',
    'package.json', 'package-lock.json', 'astro.config.mjs', 'public/x.png']) {
    assert.equal(s([A, shared]), 'full', `a shared path is full: ${shared}`);
  }
  assert.equal(s([A, 'src/play/dice-loser/main.ts']), 'full', 'two ids are full');
  assert.equal(s([A, 'weird/unknown.bin']), 'full', 'an unknown path is full');
  assert.equal(s(['src/play/not-a-game/main.js']), 'full', 'a src/play dir that is no manifest play route is full');
  assert.equal(s(['src/play/cannon-flag/../dice-loser/main.ts']), 'full', 'a .. segment never rides a route prefix');
  assert.equal(s(['src/play/cannon-flag']), 'full', 'only paths UNDER the route dir are owned');
  const z = (...tokens) => parseNameStatusZ(`${tokens.join('\0')}\0`);
  assert.deepEqual(z('R100', A, 'src/play/dice-loser/main.js'), [A, 'src/play/dice-loser/main.js'], 'a rename lists both endpoints');
  assert.equal(s(z('R100', A, 'src/play/dice-loser/main.js')), 'full', 'a rename across a route boundary is full');
  assert.equal(s(z('R087', 'src/shell/x.ts', 'src/play/cannon-flag/x.ts')), 'full', 'a rename from shared code into a route is full');
  assert.equal(s(z('R100', A, 'src/play/cannon-flag/b.js', 'M', 'src/play/cannon-flag/c.css')), 'routes:cannon-flag', 'a rename inside one route stays narrowed');
  assert.deepEqual(z('C075', 'a', 'b', 'D', 'c', 'A', 'd', 'T', 'e'), ['a', 'b', 'c', 'd', 'e'], 'copy and single-path statuses');
  assert.deepEqual(z('M', 'src/example.md '), ['src/example.md '], 'a trailing space in a path is kept');
  assert.throws(() => parseNameStatusZ('X\0a\0'), /status/, 'an unknown status throws');
  assert.throws(() => parseNameStatusZ('R100\0a\0'), /path/, 'a rename missing its second path throws');
  assert.deepEqual(parseNameStatusZ(''), [], 'empty output is an empty diff');
  assert.equal(s([A], 'refs/heads/main'), 'full', 'main never narrows');
  assert.equal(decideScope([A], { ids }).scope, 'full', 'no ref never narrows');
  assert.equal(decideScope([A], { ref: BR, ids: [] }).scope, 'full', 'no manifest ids never narrows');
  assert.deepEqual((({ run, scope }) => ({ run, scope }))(decideScope(['docs/a.md'], { ref: BR, ids })), { run: false, scope: 'full' }, 'an inert diff still skips');
  assert.equal(decideScope([], { ref: BR, ids }).run, false, 'an empty diff still skips');
  assert.equal(decideScope([A], { ref: BR, ids }).run, true, 'a narrowed run still runs');
  assert.match(formatScope(decideScope([A], { ref: BR, ids })), /^run=true\nscope=routes:cannon-flag\nreason: /, 'the narrow answer format');
  assert.match(formatScope(decideScope([A], { ref: 'refs/heads/main', ids })), /^run=true\nscope=full\n/, 'the full answer format');
  // REFUTE r1 HIGH: a file name can carry a line feed. The published fields travel only in the decision
  // file (formatDecision -> parseDecision, the parse the workflow's emit runs); stdout is a log.
  const pd = (text, ref = BR) => parseDecision(text, { ref });
  assert.deepEqual(pd(formatDecision(decideScope([A], { ref: BR, ids }))), { run: true, scope: 'routes:cannon-flag' }, 'positive control: a narrow decision survives the parse');
  assert.deepEqual(pd('run=false\nscope=full\n'), { run: false, scope: 'full' }, 'positive control: a skip survives the parse');
  for (const evil of ['a\nscope=routes:cannon-flag', 'a\nrun=false']) {
    const d = decideScope([evil, 'src/styles/tokens.css'], { ref: BR, ids });
    assert.deepEqual(pd(formatDecision(d)), { run: true, scope: 'full' }, `a file named ${JSON.stringify(evil)} beside a shared path publishes run=true scope=full`);
    assert.deepEqual(pd(formatDecision(decideScope([evil], { ref: BR, ids }))), { run: true, scope: 'full' }, `a file named ${JSON.stringify(evil)} alone publishes run=true scope=full`);
    assert.equal(formatScope(d).split('\n').length, 3, 'a file name never adds a line to the printed diagnostics');
  }
  assert.deepEqual(pd('run=true\nscope=full\nreason: a\nscope=routes:cannon-flag\n'), { run: true, scope: 'full' }, 'a reason line can never set scope');
  assert.deepEqual(pd('run=true\nscope=full\nreason: a\nrun=false\n'), { run: true, scope: 'full' }, 'a reason line can never set run');
  assert.deepEqual(pd(`reason: x\n${'run=false\nscope=full\n'}`), { run: true, scope: 'full' }, 'nothing may precede the fields');
  assert.deepEqual(pd('run=true\nscope=routes:cannon-flag\n', MAIN_REF), { run: true, scope: 'full' }, 'the parse refuses a narrow scope on main');
  assert.deepEqual(pd('run=true\nscope=routes:cannon-flag\n', ''), { run: true, scope: 'full' }, 'the parse refuses a narrow scope with no ref');
  assert.deepEqual(pd('run=false\nscope=routes:cannon-flag\n'), { run: false, scope: 'full' }, 'a skip is never narrowed');
  assert.deepEqual(pd(''), { run: true, scope: 'full' }, 'no decision file is full');
  assert.equal(decideScope(['src/play/cannon-flag/a\nb.js'], { ref: BR, ids }).scope, 'full', 'a control character in a path is never route-owned');
  assert.equal(decide(['docs/a\n.md']).run, true, 'a control character in a path is never inert');
  assert.equal(decide(['docs/a\u007f.md']).run, true, 'DEL is a control character too');
  // REFUTE r1 MEDIUM: the leg registry. ci-probes.sh's own functions are EXECUTED in its list mode (every
  // probe()/standalone() call recorded, nothing run), so a leg no spelling of a regex sees is still seen.
  const legs = ciProbeLegs();
  assert.ok(legs.includes('play-exit') && legs.includes('play-screen-fit'), 'list mode enumerates the lanes');
  assert.deepEqual([...new Set(legs.map(legFamily))].sort(), Object.keys(NARROW_PLAN).sort(), 'every leg ci-probes.sh can run is in the registry, and the registry names no other');
  const sets = { ids, party: ['cannon-flag', 'prize-draw'], canvas2d: ['dice-loser'], strip: ['prize-draw'] };
  const mode = (id, label) => narrowPlan(id, sets).find((p) => p.label === label).mode;
  assert.equal(mode('cannon-flag', 'play-exit'), 'narrow', 'a route-walking leg narrows');
  assert.equal(mode('cannon-flag', 'control-floor'), 'full', 'a play-route leg with no route knob runs full');
  assert.equal(mode('cannon-flag', 'home-page-normal'), 'skip', 'a leg that never loads a play route skips');
  assert.equal(mode('cannon-flag', 'canvas-ink'), 'skip', 'a canvas2d leg skips a route outside its set');
  assert.equal(mode('dice-loser', 'canvas-ink'), 'narrow', 'a canvas2d leg narrows to a route in its set');
  assert.equal(mode('dice-loser', 'player-screen-face'), 'skip', 'a party leg skips a route outside its set');
  assert.equal(mode('prize-draw', 'strip-chip-visibility'), 'full', 'the strip leg runs full for a strip route');
  assert.equal(mode('cannon-flag', 'strip-chip-visibility'), 'skip', 'the strip leg skips a route outside its set');
  assert.throws(() => narrowPlan('not-a-game', sets), /not a manifest play route/, 'an unknown id throws');
}

function selftest() {
  const run = (...paths) => decide(paths).run;
  const incident = ['canvas-ink-probe', 'control-floor-probe', 'croc-bite-first-handled-gap-probe',
    'play-exit-probe', 'strip-chip-visibility-probe', 'webgl-pixels-probe'].map((n) => `scripts/${n}.mjs`);
  assert.equal(run(...incident), true, 'incident range 6138d43..c74b9bb must run');
  assert.equal(run('docs/a.md', 'SESSION-HANDOFF.md', 'docs/x.json'), false, 'docs-only must skip');
  assert.equal(run('astro.config.mjs'), true, 'astro.config.mjs must run');
  assert.equal(run('scripts/webgl-pixels-probe.mjs'), true, 'a deleted probe path is just a path: run');
  assert.equal(run('src/x.ts'), true, 'src must run');
  assert.equal(run('public/x.png'), true, 'public must run');
  assert.equal(run('.github/workflows/ci.yml'), true, 'workflow must run');
  assert.equal(run('.claude/settings.json'), false, '.claude must skip');
  assert.equal(run('design/X.dc.html'), false, 'design must skip');
  assert.equal(run('docs/a.md', 'src/x.ts'), true, 'one non-inert path among inert ones must run');
  assert.equal(run('scripts/docs/x.mjs'), true, 'docs/ mid-path is not inert');
  assert.equal(run('docs/../src/x.ts'), true, 'a .. segment never rides an inert prefix');
  assert.equal(run('README.md', 'a/b/c.md'), false, '*.md at any depth outside src/ and public/ must skip');
  assert.equal(run('src/pages/game/siamsi.md'), true, 'a .md under src/ can be a page: run');
  assert.equal(run('public/notes.md'), true, 'a .md under public/ ships verbatim: run');
  assert.equal(decide(parse('src/example.md \n')).run, true, 'a trailing space in a file name is kept, so the path is not .md');
  assert.equal(run('scripts/play-exit-probe.mjs', 'docs/archive/play-exit-probe.mjs'), true, 'a rename out of the lanes lists both endpoints (the workflow diffs with --no-renames)');
  assert.equal(run('scripts/build-md', 'scripts/x.cmd'), true, 'only a literal .md suffix is inert');
  assert.equal(decide([]).run, false, 'empty diff must skip');
  assert.equal(decide(parse('\n\n')).run, false, 'empty lines are an empty diff');
  assert.match(decide(['docs/a.md', 'src/x.ts']).reason, /src\/x\.ts$/, 'reason names the first non-inert path');
  verifiedSelftest();
  narrowSelftest();
}

export { ciProbeLegs, decide, decideScope, decideVerified, distDigest, fetchVerified, formatDecision, gatedSteps, layoutOf, narrowPlan, parseDecision, parseNameStatusZ };

// Imported (by a harness replaying real runs) -> no CLI. Run as a script -> the CLI below.
// Compared as real paths, so a symlinked invocation can never fall through to a silent exit 0.
const isMain = Boolean(process.argv[1]) && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));
const argv = isMain ? process.argv : [];
const arg = (flag) => {
  const i = argv.indexOf(flag);
  const val = i === -1 ? undefined : argv[i + 1];
  if (val === undefined || val.startsWith('--')) throw new Error(`${flag} needs a value`);
  return val;
};
if (argv.includes('--selftest')) {
  selftest();
  console.log('probe-scope selftest ok');
} else if (argv.includes('--inert')) {
  console.log(INERT.map(String).join('\n'));
} else if (argv.includes('--dist-digest')) {
  console.log(distDigest(arg('--dist-digest')));
} else if (argv.includes('--verified')) {
  const sha = arg('--sha');
  if (!/^[0-9a-f]{40}$/.test(sha)) throw new Error(`--sha must be a full commit id, got ${sha}`);
  const excludeRunId = argv.includes('--exclude-run') ? arg('--exclude-run') : undefined;
  const repo = process.env.GITHUB_REPOSITORY || '{owner}/{repo}';
  const { run, reason } = decideVerified({ sha, digest: arg('--digest'), excludeRunId, ...fetchVerified({ sha, repo }) });
  // Main never narrows: the decision file says full whatever the lookup decided about run.
  if (argv.includes('--decision-out')) writeFileSync(arg('--decision-out'), formatDecision({ run, scope: 'full' }));
  console.log(`run=${run}\nreason: ${JSON.stringify(reason)}`);
} else if (argv.includes('--changed-z')) {
  const ref = arg('--ref');
  const paths = parseNameStatusZ(readFileSync(arg('--changed-z'), 'utf8'));
  const d = decideScope(paths, { ref, ids: playRouteIds(await manifestGames()) });
  if (argv.includes('--decision-out')) writeFileSync(arg('--decision-out'), formatDecision(d));
  // The log's copy of the diff: one JSON string per path, so no file name can start a line of its own.
  for (const p of paths) console.log(`changed: ${JSON.stringify(p)}`);
  console.log(formatScope(d));
} else if (argv.includes('--emit')) {
  // The workflow's emit: the two validated lines, or run=true scope=full. A missing file is full.
  const f = arg('--emit');
  console.log(formatDecision(parseDecision(existsSync(f) ? readFileSync(f, 'utf8') : '', { ref: arg('--ref') })).trimEnd());
} else if (argv.includes('--legs')) {
  console.log(Object.keys(NARROW_PLAN).join('\n'));
} else if (argv.includes('--narrow-plan')) {
  const plan = narrowPlan(arg('--narrow-plan'), await narrowSets());
  console.log(plan.map((p) => `${p.mode} ${p.label}`).join('\n'));
} else if (argv.includes('--changed')) {
  const file = argv[argv.indexOf('--changed') + 1];
  if (!file) throw new Error('--changed needs a file of changed paths');
  const { run, reason } = decide(parse(readFileSync(file, 'utf8')));
  console.log(`run=${run}\nreason: ${JSON.stringify(reason)}`);
} else if (isMain) {
  throw new Error('usage: probe-scope.mjs --changed <file> | --changed-z <file> --ref <ref> [--decision-out <file>] | --emit <file> --ref <ref> | --legs | --narrow-plan <id> | --inert | --dist-digest <dir> | --verified --sha <sha> --digest <hex> [--exclude-run <id>] [--decision-out <file>] | --selftest');
}
