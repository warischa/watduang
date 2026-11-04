// gh#292: POST /api/feedback. The site links this Function App at /api (SWA bring-your-own
// functions), so the form posts same-origin and the page needs no script and no CSP change.
// It answers every post with a 303 to a static result page.
import { app } from '@azure/functions';
import { DefaultAzureCredential } from '@azure/identity';
import { BlobServiceClient } from '@azure/storage-blob';
import {
  APPEND_BLOCK_LIMIT,
  HEADER,
  REDIRECT,
  appendWithRollover,
  blobName,
  csvRow,
  declaredTooLarge,
  isBlockLimitError,
  parseSubmission,
  readCapped,
} from '../record.mjs';

// Streams hand the handler the body as it arrives, so readCapped can stop an oversize post at the
// cap instead of the worker buffering all of it first (@azure/functions v4 HTTP streams).
app.setup({ enableHttpStream: true });

// The managed identity holds Storage Blob Data Contributor on the container and nothing else;
// shared-key access is off on that account, so there is no secret to leak.
const container = new BlobServiceClient(
  process.env.FEEDBACK_ACCOUNT_URL,
  new DefaultAzureCredential(),
).getContainerClient(process.env.FEEDBACK_CONTAINER ?? 'feedback');

const seeOther = (location) => ({ status: 303, headers: { Location: location, 'Cache-Control': 'no-store' } });

/** Append one row to one part of the month; 'full' once that part holds its block limit. */
async function appendToPart(row, receivedAt, part) {
  const blob = container.getAppendBlobClient(blobName(receivedAt, part));
  await blob.createIfNotExists({ blobHTTPHeaders: { blobContentType: 'text/csv; charset=utf-8' } });
  const { contentLength, blobCommittedBlockCount } = await blob.getProperties();
  if ((blobCommittedBlockCount ?? 0) >= APPEND_BLOCK_LIMIT) return 'full';
  if (contentLength === 0) {
    // Only the first append at position 0 wins; a writer that loses gets 412, and by then the
    // header is in place, so no row can ever land above it. Every part gets its own header.
    try {
      await blob.appendBlock(HEADER, Buffer.byteLength(HEADER), { conditions: { appendPosition: 0 } });
    } catch (error) {
      if (isBlockLimitError(error)) return 'full';
      if (error?.statusCode !== 412) throw error;
    }
  }
  try {
    await blob.appendBlock(row, Buffer.byteLength(row));
  } catch (error) {
    // A writer that raced past the count check above meets the limit here instead.
    if (isBlockLimitError(error)) return 'full';
    throw error;
  }
  return 'stored';
}

app.http('feedback', {
  route: 'feedback',
  methods: ['POST'],
  authLevel: 'anonymous',
  handler: async (request, context) => {
    if (declaredTooLarge(request.headers.get('content-length'))) {
      context.log('feedback rejected: declared body too large');
      return seeOther(REDIRECT.failed);
    }
    const body = request.body ? await readCapped(request.body) : { ok: true, text: '' };
    if (!body.ok) {
      context.log('feedback rejected: body over the cap');
      return seeOther(REDIRECT.failed);
    }
    const outcome = parseSubmission(body.text);
    if (outcome.action === 'drop') return seeOther(REDIRECT.sent);
    if (outcome.action === 'reject') {
      context.log(`feedback rejected: ${outcome.reason}`);
      return seeOther(REDIRECT.failed);
    }
    const receivedAt = new Date();
    try {
      const row = csvRow(outcome.record, receivedAt);
      await appendWithRollover((part) => appendToPart(row, receivedAt, part));
      return seeOther(REDIRECT.sent);
    } catch (error) {
      context.error('feedback store failed', error);
      return seeOther(REDIRECT.failed);
    }
  },
});
