// Companion to zero-test-files-reporter.mjs (gh#293): synthetic node:test events in, verdict out.
import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import reporter from './zero-test-files-reporter.mjs';

afterEach(() => {
  // The reporter sets the exit code on a hit; reset it so this runner is not itself failed.
  process.exitCode = 0;
});

const abs = (rel) => `${process.cwd()}/${rel}`;
const enqueue = (file) => ({ type: 'test:enqueue', data: { file: abs(file), nesting: 0, line: 1, column: 1, name: file } });
const summary = (file, tests) => ({ type: 'test:summary', data: { file: file && abs(file), counts: { tests } } });

async function run(events) {
  process.exitCode = 0;
  let out = '';
  for await (const chunk of reporter((async function* () { yield* events; })())) out += chunk;
  const code = process.exitCode;
  return { out, code };
}

test('empty file: red', async () => {
  const { out, code } = await run([enqueue('a/empty.test.mjs'), summary('a/empty.test.mjs', 0)]);
  assert.equal(code, 1);
  assert.match(out, /ZERO-TEST FILES: ran=1 credited=0 zero-summaries=1: a\/empty\.test\.mjs /);
});

test('file with no summary at all (failed to load): red', async () => {
  const { out, code } = await run([enqueue('a/broken.test.mjs')]);
  assert.equal(code, 1);
  assert.match(out, /a\/broken\.test\.mjs/);
});

test('describe-only file (suite, no test): red', async () => {
  const events = [
    enqueue('a/suite.test.mjs'),
    { type: 'test:enqueue', data: { file: abs('a/suite.test.mjs'), nesting: 1, line: 3, column: 1, name: 'suite' } },
    summary('a/suite.test.mjs', 0),
  ];
  const { code } = await run(events);
  assert.equal(code, 1);
});

test('harness-defined tests: summary file is the test file, pass file is the harness: green', async () => {
  const events = [
    enqueue('a/hold.test.mjs'),
    { type: 'test:pass', data: { file: abs('a/_harness.mjs'), nesting: 1, name: 'x' } },
    summary('a/hold.test.mjs', 3),
  ];
  const { out, code } = await run(events);
  assert.equal(code, 0);
  assert.match(out, /1 files/);
});

test('relative-path stderr event is ignored: green', async () => {
  const events = [
    enqueue('a/ok.test.mjs'),
    { type: 'test:stderr', data: { file: 'a/other.test.mjs', message: 'x' } },
    summary('a/ok.test.mjs', 1),
  ];
  const { code } = await run(events);
  assert.equal(code, 0);
});

test('test named as its own path is not the file-level entry: green', async () => {
  const events = [
    enqueue('a/named.test.mjs'),
    { type: 'test:enqueue', data: { file: abs('a/named.test.mjs'), nesting: 1, line: 7, column: 3, name: abs('a/named.test.mjs') } },
    summary('a/named.test.mjs', 1),
  ];
  const { code } = await run(events);
  assert.equal(code, 0);
});

test('one empty file among healthy ones is named alone', async () => {
  const { out, code } = await run([
    enqueue('a/ok.test.mjs'), summary('a/ok.test.mjs', 2),
    enqueue('b/empty.test.mjs'), summary('b/empty.test.mjs', 0),
  ]);
  assert.equal(code, 1);
  assert.match(out, /ZERO-TEST FILES: ran=2 credited=1 zero-summaries=1: b\/empty\.test\.mjs /);
});

test('ordinary test in an imported helper at line 1, column 1 is not a ran file: green', async () => {
  // entry.test.mjs imports helper.mjs; the helper's hoisted-import layout puts its test at line 1, column 1.
  const events = [
    enqueue('a/entry.test.mjs'),
    { type: 'test:enqueue', data: { file: abs('a/helper.mjs'), nesting: 0, line: 1, column: 1, name: 'healthy' } },
    { type: 'test:pass', data: { file: abs('a/helper.mjs'), nesting: 0, line: 1, column: 1, name: 'healthy' } },
    summary('a/entry.test.mjs', 1),
  ];
  const { out, code } = await run(events);
  assert.equal(code, 0);
  assert.match(out, /1 files/);
});

test('documented residual: helper test at line 1, column 1 named as its own relative path reds', async () => {
  const events = [
    enqueue('a/entry.test.mjs'),
    { type: 'test:enqueue', data: { file: abs('a/helper.mjs'), nesting: 0, line: 1, column: 1, name: 'a/helper.mjs' } },
    summary('a/entry.test.mjs', 1),
  ];
  const { out, code } = await run(events);
  assert.equal(code, 1);
  assert.match(out, /a\/helper\.mjs/);
});

// Credit is a count, never the child-reported label: summary.data.file is the child's argv[1], which a
// test can reassign, so a summary may be filed under a path no ran entry carries.
const foreign = (tests) => ({ type: 'test:summary', data: { file: '/tmp/subject-cli.mjs', counts: { tests } } });

test('argv reassigned: summary filed under a foreign path still credits the one ran file: green', async () => {
  const { out, code } = await run([enqueue('a/argv.test.mjs'), foreign(1)]);
  assert.equal(code, 0);
  assert.match(out, /1 files/);
});

test('argv reassigned beside an empty file: two ran, one foreign summary with tests: red', async () => {
  const { out, code } = await run([enqueue('a/argv.test.mjs'), enqueue('a/empty.test.mjs'), foreign(1)]);
  assert.equal(code, 1);
  assert.match(out, /ran=2 credited=1 zero-summaries=0/);
});

test('foreign-label summary with zero tests: red', async () => {
  const { out, code } = await run([enqueue('a/argv.test.mjs'), foreign(0)]);
  assert.equal(code, 1);
  assert.match(out, /ran=1 credited=0 zero-summaries=1/);
});

test('suite passed but no summary at all: red', async () => {
  const events = [
    enqueue('a/suite.test.mjs'),
    { type: 'test:pass', data: { file: abs('a/suite.test.mjs'), nesting: 1, line: 3, column: 1, name: 'suite' } },
  ];
  const { out, code } = await run(events);
  assert.equal(code, 1);
  assert.match(out, /ran=1 credited=0 zero-summaries=0/);
});

test('healthy run reports ran equal to credited in its green line', async () => {
  const { out, code } = await run([enqueue('a/x.test.mjs'), summary('a/x.test.mjs', 1), enqueue('b/y.test.mjs'), summary('b/y.test.mjs', 4)]);
  assert.equal(code, 0);
  assert.match(out, /2 files, each ran at least one test/);
});
