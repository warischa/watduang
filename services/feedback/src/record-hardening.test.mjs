// gh#292 REFUTE round 1: the body is read capped and streamed (F1), the cap is derived from the
// field maxima so a full Thai form fits (F2), a native form's CRLF counts as one character (F3), and
// a month that fills its append blob rolls to the next part (F5).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as record from './record.mjs';

const post = (fields) => new URLSearchParams(fields).toString();
const thai = (n) => 'ก'.repeat(n);

test('F1: a streamed 1 MB body is refused after reading at most cap + one chunk', async () => {
  const chunk = new Uint8Array(64 * 1024).fill(97);
  let yielded = 0;
  async function* stream() {
    for (let i = 0; i < 16; i++) {
      yielded++;
      yield chunk;
    }
  }
  const out = await record.readCapped(stream());
  assert.equal(out.ok, false);
  assert.ok(yielded * chunk.length <= record.LIMITS.body + chunk.length, `read ${yielded} chunks`);
});

test('F1: a body under the cap is read whole, across chunk boundaries that split a Thai character', async () => {
  const bytes = Buffer.from(post({ kind: 'feedback', message: thai(10) }));
  async function* stream() {
    for (let i = 0; i < bytes.length; i += 5) yield bytes.subarray(i, i + 5);
  }
  assert.deepEqual(await record.readCapped(stream()), { ok: true, text: bytes.toString('utf8') });
});

test('F8: a stream that throws mid-read becomes a refusal, never a rejected promise', async () => {
  async function* stream() {
    yield Buffer.from('kind=feedback&message=x');
    throw new Error('connection reset');
  }
  assert.deepEqual(await record.readCapped(stream()), { ok: false });
});

test('F8: a cancel that rejects on the oversize path becomes a refusal, never a rejected promise', async () => {
  const big = new Uint8Array(record.LIMITS.body + 1);
  const chunks = {
    [Symbol.asyncIterator]() {
      return {
        next: async () => ({ done: false, value: big }),
        return: async () => {
          throw new Error('cancel failed');
        },
      };
    },
  };
  assert.deepEqual(await record.readCapped(chunks), { ok: false });
});

test('F1: a declared Content-Length over the cap is refused before any read', () => {
  assert.equal(record.declaredTooLarge(String(record.LIMITS.body + 1)), true);
  assert.equal(record.declaredTooLarge(String(record.LIMITS.body)), false);
  assert.equal(record.declaredTooLarge(null), false);
  assert.equal(record.declaredTooLarge('1'), false);
});

test('F2: every field at its maximum, in Thai, is stored', () => {
  const body = post({
    kind: 'game',
    game_name: thai(record.LIMITS.gameName),
    message: thai(record.LIMITS.message),
    email: 'a@b.co',
    website: '',
  });
  assert.equal(parseSubmission(body).action, 'store');
});

test('F2: one Thai character past the message maximum fails on length, not on size', () => {
  const out = parseSubmission(post({ kind: 'feedback', message: thai(record.LIMITS.message + 1) }));
  assert.deepEqual(out, { action: 'reject', reason: 'message too long' });
});

test('F3: CRLF and lone CR count as one character and are stored as LF', () => {
  const crlf = 'a\r\n'.repeat(record.LIMITS.message / 2);
  const out = parseSubmission(post({ kind: 'feedback', message: crlf }));
  assert.equal(out.action, 'store');
  assert.equal(out.record.message, 'a\n'.repeat(record.LIMITS.message / 2).trim());
  assert.equal(parseSubmission(post({ kind: 'feedback', message: 'x\ry' })).record.message, 'x\ny');
});

test('F5: part 1 keeps the month name; later parts carry their number', () => {
  const at = new Date('2026-11-04T00:00:00Z');
  assert.equal(record.blobName(at), 'feedback-2026-11.csv');
  assert.equal(record.blobName(at, 1), 'feedback-2026-11.csv');
  assert.equal(record.blobName(at, 2), 'feedback-2026-11-part2.csv');
});

test('F5: a full part rolls to the next; the walk is bounded', async () => {
  const tried = [];
  const part = await record.appendWithRollover(async (n) => {
    tried.push(n);
    return n < 3 ? 'full' : 'stored';
  });
  assert.equal(part, 3);
  assert.deepEqual(tried, [1, 2, 3]);
  await assert.rejects(record.appendWithRollover(async () => 'full', 4), /all 4 parts/);
});

test('F5: the block-limit error is recognised by its service code', () => {
  assert.equal(record.isBlockLimitError({ code: 'BlockCountExceedsLimit' }), true);
  assert.equal(record.isBlockLimitError({ details: { errorCode: 'BlockCountExceedsLimit' } }), true);
  assert.equal(record.isBlockLimitError({ code: 'ConditionNotMet', statusCode: 412 }), false);
  assert.equal(record.isBlockLimitError(undefined), false);
});

function parseSubmission(body) {
  return record.parseSubmission(body);
}
