// gh#308 / ADR-0076: /api/draw/*, the prize-draw QR join. One catch-all route, so routing lives in
// the pure join.mjs where it is tested. This file only adapts HTTP and Blob storage to it.
//
// It shares this Function App with the live feedback endpoint, and the host loads every module in
// this directory: a throw while this file loads takes feedback down too. So nothing here touches
// an app setting or builds a client at import; the client is built on the first request, inside
// the handler's error path, and a missing setting answers 503 instead of failing the app.
// app.setup is feedback's alone (HTTP streams are app-wide), so it is not called here.
import { app } from '@azure/functions';
import { DefaultAzureCredential } from '@azure/identity';
import { BlobServiceClient } from '@azure/storage-blob';
import { declaredTooLarge, readCapped } from '../record.mjs';
import { ADMIN_HEADER, BODY_CAP, DRAW_CONTAINER, handleDraw, routeDraw, tooLarge } from '../join.mjs';

let container = null;
/** Same account and identity as feedback; its own container, with its own role grant (ADR-0076). */
function draws() {
  container ??= new BlobServiceClient(process.env.FEEDBACK_ACCOUNT_URL, new DefaultAzureCredential()).getContainerClient(
    process.env.DRAW_CONTAINER ?? DRAW_CONTAINER,
  );
  return container;
}

/**
 * A write that may only create (no ETag given) or only replace the version that was read. Blob
 * storage answers a failed condition with 409 (exists), 412 (ETag moved, or gone, as Azurite answers
 * it) or 404 (gone); all three mean the condition failed, never an error. For a create that is not
 * proof of "not written": the SDK retries a write whose answer was lost, and the retry of one that
 * landed is refused by its own blob. join.mjs reads the owner it wrote back to tell. A missing
 * container is also a 404, and is an error: read as "absent" it would make every event read as gone.
 */
const conditions = (ifMatch) => (ifMatch ? { ifMatch } : { ifNoneMatch: '*' });
const noContainer = (error) => (error?.details?.errorCode ?? error?.code) === 'ContainerNotFound';
const absent = (error) => error?.statusCode === 404 && !noContainer(error);
const conditionFailed = (error) => absent(error) || error?.statusCode === 409 || error?.statusCode === 412;

async function readAll(stream) {
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf8');
}

/** The store port of join.mjs (documented on handleDraw), on Blob storage. Every write is conditional. */
const store = {
  async read(path) {
    try {
      const res = await draws().getBlockBlobClient(path).download();
      return { doc: JSON.parse(await readAll(res.readableStreamBody)), etag: res.etag };
    } catch (error) {
      if (absent(error)) return null;
      throw error;
    }
  },
  async put(path, { json, metadata, ifMatch } = {}) {
    const body = json === undefined ? '' : JSON.stringify(json);
    const headers = json === undefined ? undefined : { blobContentType: 'application/json' };
    try {
      const res = await draws()
        .getBlockBlobClient(path)
        .upload(body, Buffer.byteLength(body), { conditions: conditions(ifMatch), metadata, blobHTTPHeaders: headers });
      return res.etag;
    } catch (error) {
      if (conditionFailed(error)) return null;
      throw error;
    }
  },
  async head(path) {
    try {
      const { metadata, etag } = await draws().getBlockBlobClient(path).getProperties();
      return { metadata: metadata ?? {}, etag };
    } catch (error) {
      if (absent(error)) return null;
      throw error;
    }
  },
  async del(path, ifMatch) {
    try {
      await draws().getBlockBlobClient(path).delete(ifMatch ? { conditions: { ifMatch } } : {});
      return true;
    } catch (error) {
      // Absent is deleted: the SDK's retry of a delete that landed meets a missing blob. A moved ETag is
      // not deleted (and is what Azurite answers on a missing blob too; join.mjs reads back when it
      // matters). A missing container stays an error.
      if (absent(error)) return true;
      if (ifMatch && error?.statusCode === 412) return false;
      throw error;
    }
  },
  async list(prefix) {
    const out = [];
    for await (const blob of draws().listBlobsFlat({ prefix, includeMetadata: true })) out.push({ path: blob.name, metadata: blob.metadata ?? {} });
    return out;
  },
};

app.http('draw', {
  route: 'draw/{*path}',
  methods: ['GET', 'POST'],
  authLevel: 'anonymous',
  handler: async (request, context) => {
    const path = request.params.path ?? '';
    const cap = BODY_CAP[routeDraw(request.method, path)?.op] ?? 0;
    if (declaredTooLarge(request.headers.get('content-length'), cap)) return tooLarge();
    const body = request.body ? await readCapped(request.body, cap) : { ok: true, text: '' };
    if (!body.ok) return tooLarge();
    // Exactly these fields cross into join.mjs. Of the headers, only Content-Length (for the cap,
    // above) and the admin token are read; no other (the client IP included) reaches join logic,
    // storage or a log.
    return handleDraw(
      { method: request.method, path, admin: request.headers.get(ADMIN_HEADER), bodyText: body.text },
      { store, now: () => new Date(), log: (...parts) => context.log(...parts) },
    );
  },
});
