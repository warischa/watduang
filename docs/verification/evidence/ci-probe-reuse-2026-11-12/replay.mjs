// Replays the --verified decision on real runs; injects a digest artifact only where named.
import { execFileSync } from 'node:child_process';
const { decideVerified, fetchVerified } = await import(process.argv[2]);
const repo = 'warischa/watduang';
const full = (s) => execFileSync('git', ['-C', process.argv[3], 'rev-parse', s], { encoding: 'utf8' }).trim();
const D = 'e'.repeat(64);
const cases = [
  ['478288a branch+main pair, main excluded, no artifact (past runs carry none)', '478288a', '42378263557', null],
  ['478288a same, digest artifact injected on the branch run -> reuse', '478288a', '42378263557', 42376969725],
  ['478288a same, artifact injected but main digest differs -> run', '478288a', '42378263557', 42376969725, 'f'.repeat(64)],
  ['7390261 run 33491962091: attempt 1 red, attempt 2 green -> run', '73902612b149820b41430379b399bfc9ed149704', 'none', 33491962091],
  ['aee4377 only run is the excluded one -> run', 'aee4377', '42352449715', null],
];
for (const [label, s, excl, inject, digest = D] of cases) {
  const sha = full(s);
  const data = fetchVerified({ sha, repo });
  if (inject) data.artifactsByRun[inject] = [...(data.artifactsByRun[inject] ?? []), { name: `dist-digest-${D}-a1`, expired: false }];
  const r = decideVerified({ sha, digest, excludeRunId: excl, ...data });
  console.log(`${label}\n  gated=${data.gated.length} runs=${data.runs.length} -> run=${r.run} | ${r.reason}`);
}
