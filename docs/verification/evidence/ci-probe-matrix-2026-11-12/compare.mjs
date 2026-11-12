#!/usr/bin/env node
// Probe-matrix calibration: does a lane alone on a runner read what the packed run reads, on one SHA?
//   node compare.mjs <packed-dir> <lanes-root>
// <packed-dir>  ci.yml's `packed-probe-output-a<N>` artifact, unpacked (one ci-probes output dir)
// <lanes-root>  probe-matrix-shadow.yml's `shadow-lane-*-a<N>` artifacts, unpacked one per subdir
// Compared, each as its own section, exit 1 if any differs: leg verdicts (pass/fail per label) · every
// play-screen-fit route x viewport row (scrolls, clipped px, sideways px, worst press) · play-exit and
// play-exit-guard summaries (failures, VOID bursts, UNMEASURED routes). Leg seconds are REPORTED, never
// judged: wall time is what the matrix is for, and it is expected to differ.
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const [packed, lanesRoot] = process.argv.slice(2);
if (!packed || !lanesRoot) { console.error('usage: compare.mjs <packed-dir> <lanes-root>'); process.exit(2); }
const laneDirs = readdirSync(lanesRoot).map((d) => join(lanesRoot, d)).filter((d) => statSync(d).isDirectory());
const read = (f) => (existsSync(f) ? readFileSync(f, 'utf8') : '');
const filesIn = (dirs, re) => dirs.flatMap((d) => readdirSync(d).filter((f) => re.test(f)).map((f) => join(d, f)));

function verdicts(dirs) {
  const v = new Map();
  for (const f of filesIn(dirs, /^lane\d\.(pass|fail)$/)) {
    const kind = f.endsWith('.pass') ? 'pass' : 'fail';
    for (const label of read(f).split('\n').filter(Boolean)) v.set(label, kind);
  }
  return v;
}
function seconds(dirs) {
  const s = new Map();
  for (const f of filesIn(dirs, /^lane\d\.log$/)) {
    for (const m of read(f).matchAll(/^LEG_SECONDS (\S+) (\S+) (\d+)$/gm)) s.set(m[2], Number(m[3]));
  }
  return s;
}
// `::notice::bangkok-drift      320x568   scrolls YES   126px  clipped     0px  sideways     0px ... (worst of 3 screen(s): press 0, ...`
const ROW = /^::notice::(\S+)\s+(\d+x\d+)\s+scrolls (YES|no)\s+(\d+)px\s+clipped\s+(\d+)px\s+sideways\s+(\d+)px.*?press (\d+)/;
function fitRows(dirs) {
  const rows = new Map();
  for (const f of filesIn(dirs, /^play-screen-fit-\d+\.log$/)) {
    for (const line of read(f).split('\n')) {
      const m = line.match(ROW);
      if (m) rows.set(`${m[1]} ${m[2]}`, `scrolls ${m[3]} ${m[4]}px clipped ${m[5]}px sideways ${m[6]}px worst press ${m[7]}`);
    }
  }
  return rows;
}
// `play-exit: 15 of 15 route(s) fully checked, 0 failure(s), 0 burst leg(s) VOID after a retry, 0 route(s) UNMEASURED ...`
function exitSummaries(dirs) {
  const out = new Map();
  for (const name of ['play-exit', 'play-exit-guard']) {
    const f = filesIn(dirs, new RegExp(`^${name}\\.log$`))[0];
    const line = f ? read(f).split('\n').find((l) => l.startsWith(`${name}:`)) : undefined;
    // play-exit's counts are picked out by name; play-exit-guard's line has no such phrases and is compared
    // whole (its counts and wording are fixed text plus numbers).
    const nums = line ? [...line.matchAll(/(\d+) (?:of \d+ )?(route\(s\) fully checked|failure\(s\)|burst leg\(s\) VOID|route\(s\) UNMEASURED)/g)].map((m) => `${m[2]} ${m[1]}`) : [];
    out.set(name, line ? nums.join(' · ') || line.slice(0, 200) : '(no summary line)');
  }
  return out;
}

let differs = 0;
function section(title, a, b) {
  const keys = [...new Set([...a.keys(), ...b.keys()])].sort();
  const diffs = keys.filter((k) => a.get(k) !== b.get(k));
  console.log(`\n## ${title}: ${keys.length} key(s), ${diffs.length} differ`);
  for (const k of diffs) console.log(`  ${k}\n    packed: ${a.get(k) ?? '(absent)'}\n    matrix: ${b.get(k) ?? '(absent)'}`);
  if (keys.length === 0) { console.log('  (nothing parsed on either side -- the parser, not the probes, is suspect)'); differs++; }
  differs += diffs.length;
}

section('leg verdicts', verdicts([packed]), verdicts(laneDirs));
section('play-screen-fit rows (route viewport)', fitRows([packed]), fitRows(laneDirs));
section('play-exit summaries', exitSummaries([packed]), exitSummaries(laneDirs));

const ps = seconds([packed]);
const ms = seconds(laneDirs);
console.log('\n## leg seconds (reported, not judged): label packed -> matrix');
for (const k of [...new Set([...ps.keys(), ...ms.keys()])].sort()) console.log(`  ${k.padEnd(32)} ${String(ps.get(k) ?? '-').padStart(4)} -> ${String(ms.get(k) ?? '-').padStart(4)}`);
console.log(`\nRESULT: ${differs === 0 ? 'MATCH' : `${differs} difference(s)`}`);
process.exit(differs === 0 ? 0 : 1);
