// gh#292: the pure half of the feedback endpoint. It parses one form post, decides what happens to
// it, and renders the CSV row. No Azure SDK here, so the site's own `npm test` runs these rules
// without installing the function's dependencies (ADR-0074).

/** Field caps in characters. The page sets the same numbers as HTML maxlength; the server holds them. */
const FIELDS = { message: 2000, gameName: 120, email: 254 };

// One character of a form post costs at most 9 bytes on the wire: a 3-byte UTF-8 character, each
// byte percent-encoded. The body cap is derived from the field caps so a form filled to every
// maxlength in Thai always fits; the slack covers names, separators, `kind` and the honeypot.
export const BYTES_PER_CHAR = 9;
const BODY_SLACK = 1024;

export const LIMITS = {
  ...FIELDS,
  body: (FIELDS.message + FIELDS.gameName + FIELDS.email) * BYTES_PER_CHAR + BODY_SLACK,
};

/** The two forms on the page post one of these as `kind`. */
export const KINDS = ['feedback', 'game'];

/** The off-screen field a person never fills. A value means a bot; it gets the success page and no row. */
export const HONEYPOT = 'website';

export const COLUMNS = ['received_at', 'kind', 'game_name', 'message', 'email'];

// The BOM is what makes Excel read the file as UTF-8, so Thai opens as Thai rather than mojibake.
export const HEADER = '\uFEFF' + COLUMNS.join(',') + '\r\n';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** A native form sends a textarea line break as CRLF; one line break is one character here. */
export function normalizeNewlines(text) {
  return text.replace(/\r\n?/g, '\n');
}

/** True when the request declares a body bigger than the cap, so it is refused unread. */
export function declaredTooLarge(contentLength, cap = LIMITS.body) {
  const n = Number(contentLength);
  return contentLength != null && Number.isFinite(n) && n > cap;
}

/**
 * Read a request body from an async iterable of byte chunks, stopping as soon as it passes the cap,
 * so an oversize post is never buffered whole whatever its Content-Length says. It never rejects:
 * a stream that errors mid-read, or a cancel that rejects when the cap stops the read, is a refusal,
 * so the handler still answers with the failure redirect.
 * @param {AsyncIterable<Uint8Array>} chunks
 * @returns {Promise<{ ok: true, text: string } | { ok: false }>}
 */
export async function readCapped(chunks, cap = LIMITS.body) {
  const parts = [];
  let total = 0;
  try {
    for await (const chunk of chunks) {
      total += chunk.byteLength;
      if (total > cap) return { ok: false };
      parts.push(chunk);
    }
  } catch {
    return { ok: false };
  }
  return { ok: true, text: Buffer.concat(parts).toString('utf8') };
}

/**
 * Decide what one form post becomes.
 * @param {string} body the raw application/x-www-form-urlencoded body
 * @returns {{ action: 'store', record: Record<string, string> } | { action: 'drop' } | { action: 'reject', reason: string }}
 */
export function parseSubmission(body) {
  if (typeof body !== 'string') return { action: 'reject', reason: 'no body' };
  if (Buffer.byteLength(body, 'utf8') > LIMITS.body) return { action: 'reject', reason: 'body too large' };

  const form = new URLSearchParams(body);
  if ((form.get(HONEYPOT) ?? '') !== '') return { action: 'drop' };

  const kind = form.get('kind') ?? '';
  if (!KINDS.includes(kind)) return { action: 'reject', reason: 'unknown kind' };

  const field = (name) => normalizeNewlines(form.get(name) ?? '').trim();
  const message = field('message');
  const gameName = kind === 'game' ? field('game_name') : '';
  const email = field('email');

  if (message.length > LIMITS.message) return { action: 'reject', reason: 'message too long' };
  if (gameName.length > LIMITS.gameName) return { action: 'reject', reason: 'game name too long' };
  if (email.length > LIMITS.email) return { action: 'reject', reason: 'email too long' };
  if (email !== '' && !EMAIL.test(email)) return { action: 'reject', reason: 'email malformed' };

  // Feedback needs a message; a game idea needs at least its name. Same rule as the page's `required`.
  if (kind === 'feedback' && message === '') return { action: 'reject', reason: 'empty message' };
  if (kind === 'game' && gameName === '') return { action: 'reject', reason: 'empty game name' };

  return { action: 'store', record: { kind, game_name: gameName, message, email } };
}

/**
 * One CSV cell, RFC 4180 quoted. A leading = + - @ tab or CR would make a spreadsheet run the cell
 * as a formula, so it gets an apostrophe in front: the owner opens this file in Excel.
 * @param {string} value
 */
export function csvCell(value) {
  let text = String(value ?? '');
  if (/^[=+\-@\t\r]/.test(text)) text = "'" + text;
  return '"' + text.replace(/"/g, '""') + '"';
}

/**
 * @param {Record<string, string>} record from parseSubmission
 * @param {Date} receivedAt
 */
export function csvRow(record, receivedAt) {
  const values = { ...record, received_at: receivedAt.toISOString() };
  return COLUMNS.map((column) => csvCell(values[column])).join(',') + '\r\n';
}

/**
 * One append blob per UTC month, so the lifecycle rule ages whole months out (6 months, gh#292).
 * An append blob holds 50,000 blocks, one per row, so a month that fills it (spam, with no rate
 * limiter) continues in part 2, 3 and on; part 1 keeps the plain month name.
 */
export function blobName(receivedAt, part = 1) {
  const month = String(receivedAt.getUTCMonth() + 1).padStart(2, '0');
  const suffix = part > 1 ? `-part${part}` : '';
  return `feedback-${receivedAt.getUTCFullYear()}-${month}${suffix}.csv`;
}

/** Blocks an append blob accepts; the header row takes the first. */
export const APPEND_BLOCK_LIMIT = 50000;

/** Parts a month may use before posts fail: 20 x 50,000 rows. */
export const MAX_PARTS = 20;

/** The service code an append returns once a blob holds APPEND_BLOCK_LIMIT blocks. */
export function isBlockLimitError(error) {
  return error?.code === 'BlockCountExceedsLimit' || error?.details?.errorCode === 'BlockCountExceedsLimit';
}

/**
 * Try part 1, then the next part each time the current one reports "full", up to maxParts.
 * @param {(part: number) => Promise<'stored' | 'full'>} appendToPart
 * @returns {Promise<number>} the part the row went to
 */
export async function appendWithRollover(appendToPart, maxParts = MAX_PARTS) {
  for (let part = 1; part <= maxParts; part++) {
    if ((await appendToPart(part)) !== 'full') return part;
  }
  throw new Error(`feedback: all ${maxParts} parts of this month are full`);
}

/** Where the browser goes next. Relative, so it lands on whatever origin served the form. */
export const REDIRECT = {
  sent: '/feedback/sent/',
  failed: '/feedback/failed/',
};
