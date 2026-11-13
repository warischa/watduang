// gh#308 / ADR-0076: the join function ships in the same Function App as the live feedback endpoint,
// and the host loads every module under src/functions/ (package.json `main`). One module that throws
// while loading takes every function in the app down, feedback included. So the join module must
// build its storage client on first use, never at import.
//
// The Azure packages are not installed in this repo (ADR-0074), so a child process resolves them to
// stubs through a module hook. The storage stub parses its URL the way the real BlobServiceClient
// does (its constructor runs `new URL(url)` on the account URL), so an eager client with no app
// settings throws here exactly as it would on the host. The child gets an env with no app settings.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = (rel) => pathToFileURL(fileURLToPath(new URL(rel, import.meta.url))).href;
const JOIN = here('./functions/join.mjs');
const FEEDBACK = here('./functions/feedback.mjs');

const STUBS = {
  '@azure/functions': `
    export const app = {
      http(name, options) { globalThis.__registered.push({ name, route: options.route, methods: options.methods }); },
      setup() {},
    };`,
  '@azure/identity': `export class DefaultAzureCredential { constructor() { globalThis.__credentials += 1; } }`,
  '@azure/storage-blob': `
    export class BlobServiceClient {
      constructor(url) { new URL(url); globalThis.__clients += 1; }
      getContainerClient() { return {}; }
    }`,
};

/** Import the given module URLs, in order, in a child with stubbed Azure packages; report what happened. */
function loadInChild(urls, env = {}) {
  const program = `
    import { registerHooks } from 'node:module';
    if (typeof registerHooks !== 'function') { console.log(JSON.stringify({ harness: 'no registerHooks' })); process.exit(3); }
    const STUBS = ${JSON.stringify(STUBS)};
    registerHooks({
      resolve(specifier, context, next) {
        if (specifier in STUBS) return { url: 'stub:' + specifier, shortCircuit: true };
        return next(specifier, context);
      },
      load(url, context, next) {
        if (url.startsWith('stub:')) return { format: 'module', source: STUBS[url.slice(5)], shortCircuit: true };
        return next(url, context);
      },
    });
    globalThis.__registered = [];
    globalThis.__clients = 0;
    globalThis.__credentials = 0;
    let error = null;
    for (const url of ${JSON.stringify(urls)}) {
      try { await import(url); } catch (e) { error = { url, name: e?.name, message: String(e?.message) }; break; }
    }
    console.log(JSON.stringify({ error, registered: globalThis.__registered, clients: globalThis.__clients, credentials: globalThis.__credentials }));
  `;
  const run = spawnSync(process.execPath, ['--input-type=module', '-e', program], {
    env: { PATH: process.env.PATH, ...env },
    encoding: 'utf8',
  });
  assert.equal(run.status, 0, `child exited ${run.status}: ${run.stderr}${run.stdout}`);
  return JSON.parse(run.stdout.trim().split('\n').pop());
}

test('control: the harness reds an eager client (a module that builds one at import throws)', () => {
  const eager = `data:text/javascript,${encodeURIComponent(
    "import { BlobServiceClient } from '@azure/storage-blob'; new BlobServiceClient(process.env.FEEDBACK_ACCOUNT_URL);",
  )}`;
  const out = loadInChild([eager]);
  assert.equal(out.error?.name, 'TypeError', 'an eager client with no app settings must throw in this harness');
});

test('importing the join function with no app settings does not throw and builds no client', () => {
  const out = loadInChild([JOIN]);
  assert.equal(out.error, null, JSON.stringify(out.error));
  assert.deepEqual(out.registered, [{ name: 'draw', route: 'draw/{*path}', methods: ['GET', 'POST'] }]);
  assert.equal(out.clients, 0, 'no storage client is built at import');
  assert.equal(out.credentials, 0, 'no credential is built at import');
});

test('with app settings present, join still builds nothing, and loads beside feedback', () => {
  const settings = { FEEDBACK_ACCOUNT_URL: 'https://account.blob.core.windows.net' };
  const alone = loadInChild([JOIN], settings);
  assert.equal(alone.error, null, JSON.stringify(alone.error));
  assert.deepEqual([alone.clients, alone.credentials], [0, 0], 'join builds no client even when it could');
  const both = loadInChild([JOIN, FEEDBACK], settings);
  assert.equal(both.error, null, JSON.stringify(both.error));
  assert.deepEqual(both.registered.map((r) => r.name), ['draw', 'feedback']);
});
