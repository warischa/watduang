// gh#292: the feedback endpoint's pure rules. Runs in the site's `npm test` (glob widened for
// services/, ADR-0074) and needs none of the function's Azure dependencies.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HEADER, LIMITS, blobName, csvCell, csvRow, parseSubmission } from './record.mjs';

const post = (fields) => new URLSearchParams(fields).toString();

test('a feedback post with a message is stored, game_name dropped', () => {
  const out = parseSubmission(post({ kind: 'feedback', message: '  สนุกมาก  ', game_name: 'x', email: '' }));
  assert.deepEqual(out, { action: 'store', record: { kind: 'feedback', game_name: '', message: 'สนุกมาก', email: '' } });
});

test('a game post needs its name; the message may be empty', () => {
  assert.equal(parseSubmission(post({ kind: 'game', game_name: 'ทายคำใบ้', message: '' })).action, 'store');
  assert.equal(parseSubmission(post({ kind: 'game', game_name: ' ', message: 'idea' })).action, 'reject');
});

test('a filled honeypot is dropped, never stored', () => {
  assert.deepEqual(parseSubmission(post({ kind: 'feedback', message: 'hi', website: 'spam.example' })), { action: 'drop' });
});

test('rejects: unknown kind, empty message, bad email, over-cap fields and body', () => {
  const reasons = [
    post({ kind: 'admin', message: 'hi' }),
    post({ kind: 'feedback', message: '   ' }),
    post({ kind: 'feedback', message: 'hi', email: 'not-an-email' }),
    post({ kind: 'feedback', message: 'a'.repeat(LIMITS.message + 1) }),
    post({ kind: 'game', game_name: 'a'.repeat(LIMITS.gameName + 1) }),
    'kind=feedback&message=' + 'a'.repeat(LIMITS.body),
    undefined,
  ].map((body) => parseSubmission(body));
  for (const out of reasons) assert.equal(out.action, 'reject', JSON.stringify(out));
});

test('the caps themselves are accepted', () => {
  assert.equal(parseSubmission(post({ kind: 'feedback', message: 'a'.repeat(LIMITS.message) })).action, 'store');
});

test('a formula-looking cell is neutralised and quotes are doubled', () => {
  for (const lead of ['=', '+', '-', '@', '\t', '\r']) {
    assert.equal(csvCell(lead + 'SUM(A1)'), `"'${lead}SUM(A1)"`);
  }
  assert.equal(csvCell('say "hi"'), '"say ""hi"""');
  assert.equal(csvCell('line1\nline2'), '"line1\nline2"');
  assert.equal(csvCell('ปกติ'), '"ปกติ"');
});

test('a row has the five columns in header order, CRLF-terminated', () => {
  const row = csvRow({ kind: 'game', game_name: 'g', message: '=1+1', email: 'a@b.co' }, new Date('2026-11-04T03:00:00Z'));
  assert.equal(row, '"2026-11-04T03:00:00.000Z","game","g","\'=1+1","a@b.co"\r\n');
  assert.ok(HEADER.startsWith('\uFEFFreceived_at,kind,game_name,message,email'));
});

test('one blob per UTC month', () => {
  assert.equal(blobName(new Date('2026-11-30T23:59:59Z')), 'feedback-2026-11.csv');
  assert.equal(blobName(new Date('2027-01-01T00:00:00Z')), 'feedback-2027-01.csv');
});
