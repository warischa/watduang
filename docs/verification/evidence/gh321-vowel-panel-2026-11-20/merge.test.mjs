// Tests for merge.mjs. Fixtures are built in a temp directory from a tiny input file, so no real row,
// plant or key is read.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const MERGE = fileURLToPath(new URL('./merge.mjs', import.meta.url));

// id, word, stored cell as the reviewers saw it (planted rows carry the planted cell).
const INPUT_ROWS = [
  ['th-t-001', 'เวลา', 'เ-า|-า'], // planted, wrong-form
  ['th-t-002', 'บัวลอย', '-ัว'], // planted, omission
  ['th-t-003', 'เมาส์', 'เ-|-า'], // planted, decomposition
  ['th-t-004', 'เมือง', 'เ-ือ|เ-'], // planted, extra
  ['th-t-005', 'โรงเรียน', 'โ-|เ-ีย'], // agreed fix
  ['th-t-006', 'หมา', '-า'], // flagged by one reviewer only
  ['th-t-007', 'ดอกไม้', '-อ|ไ-'], // flagged by both, different proposals
  ['th-t-008', 'ปลา', '-า'], // flagged by nobody
  ['th-t-009', 'ขนม', ''], // empty stored cell, flagged by both with the same non-empty proposal
];
const KEY = {
  salt: 'fixture-salt',
  plants: [
    { id: 'th-t-001', class: 'wrong-form', true: 'เ-|-า', planted: 'เ-า|-า' },
    { id: 'th-t-002', class: 'omission', true: '-ัว|-อ', planted: '-ัว' },
    { id: 'th-t-003', class: 'decomposition', true: 'เ-า', planted: 'เ-|-า' },
    { id: 'th-t-004', class: 'extra', true: 'เ-ือ', planted: 'เ-ือ|เ-' },
  ],
};

const row = (...c) => `${c.join('\t')}\n`;
const GPT = [
  row('th-t-001', 'vowels', 'เ-า|-า', 'เ-|-า', 'เ-า is not written'), // caught and restored
  // th-t-002 missed
  row('th-t-003', 'vowels', 'เ-|-า', 'เ-า', 'one form'), // caught and restored
  row('th-t-004', 'vowels', 'เ-ือ|เ-', 'เ-', 'wrong'), // caught, not restored
  row('th-t-005', 'vowels', 'โ-|เ-ีย', 'โ-', 'drop'), // agreed with claude
  row('th-t-006', 'vowels', '-า', '-ะ', 'only gpt'), // one-sided
  row('th-t-007', 'vowels', '-อ|ไ-', 'ไ-', 'gpt reading'), // different proposals
  row('th-t-009', 'vowels', '', '-ะ', 'written'), // agreed on a non-empty proposal for an empty cell
  '# coverage: 9 of 9\n',
].join('');
const CLAUDE = [
  row('th-t-001', 'vowels', 'เ-า|-า', 'เ-|เ-า', 'neither the planted nor the true cell'), // caught, not restored
  row('th-t-002', 'vowels', '-ัว', '-ัว|-อ', 'อ is written'), // caught and restored
  // th-t-003 missed
  row('th-t-004', 'vowels', 'เ-ือ|เ-', 'เ-ือ', 'extra เ-'), // caught and restored
  row('th-t-005', 'vowels', 'โ-|เ-ีย', 'โ-', 'drop'), // agreed with gpt
  row('th-t-007', 'vowels', '-อ|ไ-', '-อ', 'claude reading'), // different proposals
  row('th-t-009', 'vowels', '', '-ะ', 'written'),
  '# coverage: 9 of 9\n',
].join('');

function setup(gpt = GPT, claude = CLAUDE) {
  const dir = mkdtempSync(join(tmpdir(), 'merge-test-'));
  const input = `id\tpool\tword\tvowels\n${INPUT_ROWS.map(([id, w, v]) => row(id, 'general', w, v)).join('')}`;
  writeFileSync(join(dir, 'input.tsv'), input);
  writeFileSync(join(dir, 'key.json'), JSON.stringify(KEY));
  writeFileSync(join(dir, 'gpt.tsv'), gpt);
  writeFileSync(join(dir, 'claude.tsv'), claude);
  return dir;
}
const run = (dir) => spawnSync(process.execPath, [MERGE, join(dir, 'key.json'), join(dir, 'gpt.tsv'), join(dir, 'claude.tsv'), '--input', join(dir, 'input.tsv'), '--out', dir], { encoding: 'utf8' });
const calibration = (stdout, reviewer, cls) => {
  const m = stdout.match(new RegExp(`^calibration ${reviewer} ${cls} planted=(\\d+) caught=(\\d+) restored=(\\d+)$`, 'm'));
  assert.ok(m, `no calibration line for ${reviewer} ${cls}\n${stdout}`);
  return m.slice(1).map(Number);
};
const lines = (path) => readFileSync(path, 'utf8').split('\n').filter((l) => l !== '');

test('calibration: a caught plant, a missed plant, and caught-but-not-restored', () => {
  const dir = setup();
  try {
    const r = run(dir);
    assert.equal(r.status, 0, r.stderr);
    // caught and restored
    assert.deepEqual(calibration(r.stdout, 'gpt', 'wrong-form'), [1, 1, 1]);
    // missed: the reviewer wrote no line for the planted row
    assert.deepEqual(calibration(r.stdout, 'gpt', 'omission'), [1, 0, 0]);
    // caught with a cell that is neither the planted nor the true one: caught is not restored
    assert.deepEqual(calibration(r.stdout, 'claude', 'wrong-form'), [1, 1, 0]);
    assert.deepEqual(calibration(r.stdout, 'gpt', 'extra'), [1, 1, 0]);
    assert.deepEqual(calibration(r.stdout, 'claude', 'omission'), [1, 1, 1]);
    assert.deepEqual(calibration(r.stdout, 'claude', 'decomposition'), [1, 0, 0]);
    assert.deepEqual(calibration(r.stdout, 'claude', 'extra'), [1, 1, 1]);
  } finally { rmSync(dir, { recursive: true }); }
});

test('agreed fix: both propose the same value on a non-plant row, including a non-empty fix for an empty cell', () => {
  const dir = setup();
  try {
    assert.equal(run(dir).status, 0);
    assert.deepEqual(lines(join(dir, 'agreed-vowels.tsv')), [
      'id\tword\tstored\tproposed',
      'th-t-005\tโรงเรียน\tโ-|เ-ีย\tโ-',
      'th-t-009\tขนม\t-\t-ะ',
    ]);
  } finally { rmSync(dir, { recursive: true }); }
});

test('owner list: a one-sided flag and different proposals, never a plant and never an agreed row', () => {
  const dir = setup();
  try {
    assert.equal(run(dir).status, 0);
    assert.deepEqual(lines(join(dir, 'owner-disagreements-vowels.tsv')), [
      'lang\tid\tcolumn\tstored\tgpt (codex)\tclaude',
      'th\tth-t-006\tvowels\t-า\t-ะ — only gpt\t',
      'th\tth-t-007\tvowels\t-อ|ไ-\tไ- — gpt reading\t-อ — claude reading',
    ]);
  } finally { rmSync(dir, { recursive: true }); }
});

test('malformed input exits non-zero and says why, and writes no output file', () => {
  const bad = {
    'wrong column count': row('th-t-008', 'vowels', '-า', '-ะ'),
    'unknown id': row('th-t-999', 'vowels', '-า', '-ะ', 'x'),
    'proposed form not in the list': row('th-t-008', 'vowels', '-า', '-ะ|ซ-', 'x'),
    'duplicate id': row('th-t-008', 'vowels', '-า', '-ะ', 'x') + row('th-t-008', 'vowels', '-า', '-ิ', 'y'),
    'proposed equals stored': row('th-t-008', 'vowels', '-า', '-า', 'x'),
    'wrong column name': row('th-t-008', 'syllables', '-า', '-ะ', 'x'),
  };
  const why = {
    'wrong column count': /5/, 'unknown id': /unknown id/, 'proposed form not in the list': /not in VOWEL_FORMS/,
    'duplicate id': /second line/, 'proposed equals stored': /equals the stored/, 'wrong column name': /column is/,
  };
  for (const [name, line] of Object.entries(bad)) {
    const dir = setup(GPT + line);
    try {
      const r = run(dir);
      assert.notEqual(r.status, 0, `${name}: expected a non-zero exit\n${r.stdout}`);
      assert.match(r.stderr, /malformed/i, name);
      assert.match(r.stderr, why[name], `${name}: rejected for another reason\n${r.stderr}`);
      assert.throws(() => readFileSync(join(dir, 'agreed-vowels.tsv')), { code: 'ENOENT' }, `${name}: output written despite the error`);
    } finally { rmSync(dir, { recursive: true }); }
  }
});
