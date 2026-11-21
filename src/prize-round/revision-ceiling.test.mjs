// node --test — the deal revision ceiling (gh#311, gh#328). A word-family code carries DEAL_REVISION mod 10 as one
// digit, so revision 11 would read as revision 1 and a stale phone would accept a code built on a different deal.
// The format digit separates them: revisions 1-10 are format 0, 11-20 format 1, and a phone refuses any other
// format digit. codeFormatProblem holds that rule as a pure function, so the must-red below feeds it directly.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CODE_FORMAT, DEAL_REVISION, codeFormatProblem } from './round.ts';

test(`CODE_FORMAT ${CODE_FORMAT} is the format deal revision ${DEAL_REVISION} must be minted under`, () => {
  assert.equal(codeFormatProblem(DEAL_REVISION, CODE_FORMAT), null);
  assert.ok(CODE_FORMAT <= 9);
});

test('must-red: the rule refuses a repeated digit under an old format, and a format past one digit', () => {
  assert.match(codeFormatProblem(11, 0), /must be minted under CODE_FORMAT 1, not 0/);
  assert.match(codeFormatProblem(20, 0), /CODE_FORMAT 1/);
  assert.match(codeFormatProblem(10, 1), /CODE_FORMAT 0/);
  assert.match(codeFormatProblem(101, 10), /past the one format digit/);
  assert.match(codeFormatProblem(0, 0), /whole number/);
  for (const [r, f] of [[1, 0], [10, 0], [11, 1], [20, 1], [100, 9]]) assert.equal(codeFormatProblem(r, f), null, `revision ${r}, format ${f}`);
});
