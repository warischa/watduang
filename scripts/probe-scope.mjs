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
//   - that latest attempt uploaded the digest artifact for the SAME dist/ digest this run built:
//     `dist-digest-<hex>-a<attempt>` in the step layout, `dist-digest-<hex>` in the job layout. Same
//     SHA is not enough: the probes must measure the bytes Deploy uploads, and main rebuilds dist/;
//   - NO run at this SHA -- this run's own earlier attempts included -- has a probe unit that
//     failed or timed out in ANY attempt. A red is a signal; a later green on a re-run does
//     not erase it, so main measures again;
//   - no other run at this SHA is still running: it may yet go red on the same bytes.
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
// Suffixed with the attempt, so the match binds the digest to the attempt that measured it. On a
// real re-run (run 43150614193, 2026-11-12) `-a2` published green and `-a1` was no longer listed.
const DIGEST_ARTIFACT = (hex, attempt) => `dist-digest-${hex}-a${attempt}`;
// The job layout (the probe matrix, ADR-0078): the digest is the identity, so the name carries no attempt.
// A partial re-run keeps the earlier attempts' artifacts and copies the jobs it did not re-run into the
// new attempt (observed 2026-11-12, run 43165835700), so binding the name to an attempt would orphan a
// verdict that was never re-run.
const JOB_DIGEST_ARTIFACT = (hex) => `dist-digest-${hex}`;
// The probe jobs of the job layout, by the names GitHub gives them: the matrix lanes, WebGL, the verdict.
const PROBE_VERDICT_JOB = 'probe-verdict';
const WEBGL_JOB = 'webgl';
const isProbeJob = (name) => name === PROBE_VERDICT_JOB || name === WEBGL_JOB || /^probes \(/.test(String(name));
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
      if (!verdict || verdict.conclusion !== 'success') { why(`${PROBE_VERDICT_JOB} ${verdict?.conclusion ?? 'absent'}`); continue; }
      if (!webgl || webgl.conclusion !== 'success') { why(`${WEBGL_JOB} ${webgl?.conclusion ?? 'absent'}`); continue; }
      if (lanes.length === 0 || lanes.some((j) => j.conclusion !== 'success')) { why(`probe lanes not all success (${lanes.length} listed)`); continue; }
      const jarts = artifactsByRun[r.id];
      if (!Array.isArray(jarts)) { why('artifacts not read'); continue; }
      if (!jarts.some((a) => a.name === JOB_DIGEST_ARTIFACT(digest) && a.expired === false)) { why('no live artifact for this dist digest'); continue; }
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

export { decide, decideVerified, distDigest, fetchVerified, gatedSteps, layoutOf };

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
