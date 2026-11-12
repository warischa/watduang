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
//   - a completed `push` run of this workflow at this SHA (never a pull_request run: that one tests
//     a merge commit, not this SHA) concluded success, and in its latest attempt every probe-gated
//     step concluded success -- the gated set is derived from ci.yml AT THIS SHA, never pinned;
//   - that run uploaded `dist-digest-<hex>` for the SAME dist/ digest this run built. Same SHA is
//     not enough: the probes must measure the bytes Deploy uploads, and main rebuilds dist/;
//   - NO run at this SHA, in ANY attempt, has a probe-gated step that failed or timed out. A red
//     is a signal; a later green on a re-run does not erase it, so main measures again.
// Anything it cannot read or enumerate throws, and the workflow treats a throw as "run".
//
//   node scripts/probe-scope.mjs --changed <file>   one path per line -> `run=...` + a reason line
//   node scripts/probe-scope.mjs --inert            prints the inert patterns
//   node scripts/probe-scope.mjs --dist-digest <dir>  sha256 over every file's relative path + sha256
//   node scripts/probe-scope.mjs --verified --sha <sha> --digest <hex> [--exclude-run <id>]
//   node scripts/probe-scope.mjs --selftest
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, realpathSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

// A .md under src/ or public/ is NOT inert: Astro builds src/pages/**.md into a page, and a static
// page outranks a dynamic route at the same URL, so one Markdown file can replace a page the probes load.
const INERT = [/^docs\//, /^(?!(?:src|public)\/).*\.md$/, /^\.claude\//, /^design\//];

const isInert = (p) => !p.split('/').includes('..') && INERT.some((re) => re.test(p));

function decide(paths) {
  if (paths.length === 0) return { run: false, reason: 'empty diff: nothing changed' };
  const first = paths.find((p) => !isInert(p));
  if (first === undefined) return { run: false, reason: `all ${paths.length} changed paths are inert` };
  return { run: true, reason: `first non-inert path: ${first}` };
}

// Lines are taken verbatim, never trimmed: git keeps a trailing space in a file name, and trimming
// `src/example.md ` would turn a non-inert path into an inert one. Only empty lines are dropped.
const parse = (text) => text.split('\n').filter((l) => l.length > 0);

// The exact `if:` that gates the browser lane. A step whose condition merely CONTAINS it (the
// `failure() && ...` upload) is not a measurement and is not in the set.
const PROBE_GATE = "steps.probe-scope.outputs.run == 'true'";
const WORKFLOW_PATH = '.github/workflows/ci.yml';
const DIGEST_ARTIFACT = (hex) => `dist-digest-${hex}`;

// Step names in ci.yml whose `if:` is exactly PROBE_GATE. A gated step with no name cannot be found
// in the API's step list, so it throws rather than shrinking the set.
function gatedSteps(yamlText) {
  const out = [];
  let name = null;
  let named = false;
  for (const line of yamlText.split('\n')) {
    if (/^\s*-\s+\S/.test(line)) {
      const m = line.match(/^\s*-\s+name:\s*(.*?)\s*$/);
      name = m ? m[1].replace(/^(['"])(.*)\1$/, '$2') : null;
      named = Boolean(m);
      continue;
    }
    const iff = line.match(/^\s*if:\s*(.*?)\s*$/);
    if (iff && iff[1] === PROBE_GATE) {
      if (!named || !name) throw new Error('a probe-gated step has no name: the API cannot be matched against it');
      out.push(name);
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
function decideVerified({ sha, digest, runs, jobsByRun, artifactsByRun, gated, excludeRunId }) {
  const run = (reason) => ({ run: true, reason });
  if (!Array.isArray(gated) || gated.length === 0) return run('no probe-gated step found in ci.yml at this SHA');
  if (!/^[0-9a-f]{64}$/.test(String(digest))) return run(`no usable dist digest (${digest})`);
  const atSha = runs.filter((r) => r.head_sha === sha && r.path === WORKFLOW_PATH && String(r.id) !== String(excludeRunId));
  if (atSha.length === 0) return run('no other run of this workflow at this SHA');
  for (const r of atSha) {
    const jobs = jobsByRun[r.id];
    if (!Array.isArray(jobs)) return run(`jobs of run ${r.id} were not read`);
    for (const j of jobs) {
      for (const s of j.steps ?? []) {
        if (gated.includes(s.name) && RED.has(s.conclusion)) {
          return run(`run ${r.id} attempt ${j.run_attempt}: "${s.name}" ${s.conclusion} at this SHA`);
        }
      }
    }
  }
  const misses = [];
  for (const r of atSha) {
    const why = (m) => misses.push(`run ${r.id}: ${m}`);
    if (r.event !== 'push') { why(`event ${r.event}`); continue; }
    if (r.status !== 'completed' || r.conclusion !== 'success') { why(`${r.status}/${r.conclusion}`); continue; }
    if (!r.repository?.full_name || r.head_repository?.full_name !== r.repository.full_name) { why('head repository differs'); continue; }
    const latest = jobsByRun[r.id].filter((j) => j.run_attempt === r.run_attempt);
    const steps = latest.flatMap((j) => j.steps ?? []);
    const notGreen = gated.filter((g) => !steps.some((s) => s.name === g && s.conclusion === 'success'));
    if (notGreen.length) { why(`not success: ${notGreen.join(' | ')}`); continue; }
    const arts = artifactsByRun[r.id];
    if (!Array.isArray(arts)) { why('artifacts not read'); continue; }
    if (!arts.some((a) => a.name === DIGEST_ARTIFACT(digest) && a.expired === false)) { why('no live artifact for this dist digest'); continue; }
    return { run: false, reason: `run ${r.id} (${r.head_branch}, attempt ${r.run_attempt}) passed every probe-gated step on dist digest ${digest}` };
  }
  return run(`no run at this SHA measured this dist: ${misses.join('; ')}`);
}

// Network half: `gh api` with the workflow's own token. Any short page, missing field or failed call
// throws -- the caller's fail-safe branch then runs the probes.
function fetchVerified({ sha, repo }) {
  const gh = (path) => JSON.parse(execFileSync('gh', ['api', path], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }));
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
  return { runs: runsPage.workflow_runs, jobsByRun, artifactsByRun, gated: gatedSteps(yaml) };
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
    artifactsByRun: { 9: [], 1: [{ name: DIGEST_ARTIFACT(D), expired: false }] },
  });
  const v = (mut) => { const x = base(); mut(x); return decideVerified(x).run; };
  assert.equal(v(() => {}), false, 'positive control: a same-SHA push run green on every gated step with this digest is reused');
  assert.equal(v((x) => { x.digest = 'c'.repeat(64); }), true, 'a different dist digest must run: main rebuilt different bytes');
  assert.equal(v((x) => { x.artifactsByRun[1] = [{ name: DIGEST_ARTIFACT(D), expired: true }]; }), true, 'an expired digest artifact must run');
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
  assert.equal(v((x) => { x.runs.push({ ...x.runs[1], id: 2, event: 'pull_request', conclusion: 'failure' }); x.jobsByRun[2] = [{ run_attempt: 1, steps: [{ name: G[1], conclusion: 'timed_out' }] }]; x.artifactsByRun[2] = []; }), true, 'a red gated step in ANY run at this SHA blocks reuse, pull_request included');
  assert.equal(v((x) => { x.runs.push({ ...x.runs[1], id: 3 }); }), true, 'a run at this SHA whose jobs were not read blocks reuse');
  assert.match(decideVerified(base()).reason, /run 1 \(batch\/x, attempt 1\)/, 'the reuse reason names the run it trusted');
  const yaml = [
    '      - name: Decide whether the browser probes can add anything', '        id: probe-scope',
    '      - name: Give the runner a Thai face (gh#287)', `        if: ${PROBE_GATE}`,
    "      - name: 'Quoted probe step'", `        if: ${PROBE_GATE}`,
    '      - name: Keep the probe output when anything fails', `        if: failure() && ${PROBE_GATE}`,
    '      - name: Deploy', "        if: ${{ github.ref == 'refs/heads/main' }}",
  ].join('\n');
  assert.deepEqual(gatedSteps(yaml), ['Give the runner a Thai face (gh#287)', 'Quoted probe step'], 'only the exact gate condition is gated; the failure() upload is not');
  assert.throws(() => gatedSteps(`      - uses: x/y@v1\n        if: ${PROBE_GATE}`), /no name/, 'a nameless gated step throws instead of shrinking the set');
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
}

export { decide, decideVerified, distDigest, fetchVerified, gatedSteps };

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
  console.log(`run=${run}\nreason: ${reason}`);
} else if (argv.includes('--changed')) {
  const file = argv[argv.indexOf('--changed') + 1];
  if (!file) throw new Error('--changed needs a file of changed paths');
  const { run, reason } = decide(parse(readFileSync(file, 'utf8')));
  console.log(`run=${run}\nreason: ${reason}`);
} else if (isMain) {
  throw new Error('usage: probe-scope.mjs --changed <file> | --inert | --dist-digest <dir> | --verified --sha <sha> --digest <hex> [--exclude-run <id>] | --selftest');
}
