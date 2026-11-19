// node --test — the bank revision ceiling (gh#311). A word-round code carries BANK_REVISION mod 10 as
// one digit, so revision 11 would read as revision 1 and a stale phone would accept a code built on a
// different bank. Past 10 the code format itself must change.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BANK_REVISION } from '../prize-words/schema.ts';

const CEILING = 10;

test(`BANK_REVISION stays at or below ${CEILING} while one code digit carries it`, () => {
  assert.ok(
    BANK_REVISION <= CEILING,
    `BANK_REVISION is ${BANK_REVISION}, past the ceiling ${CEILING}: its digit now repeats an earlier revision. ` +
      `Bump CODE_FORMAT in round.ts (parseFamilyCode refuses any other format digit) and raise this ceiling by 10.`,
  );
});
