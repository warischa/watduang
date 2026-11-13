// gh#308 must-red record. Run from the repo root: node docs/verification/evidence/gh308-join-backend-2026-11-11/mutants.mjs
// Copies services/feedback/src to a fresh temp directory once, then for each mutant: writes the
// mutated file into the copy, runs the named test file there, and puts the original back. The repo
// is never written; its two join files are hashed before and after to prove it. Prints one line per
// mutant; every line must show fail >= 1.
import { cpSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';

const REPO = 'services/feedback/src/';
const COPY = join(mkdtempSync(join(tmpdir(), 'gh308-mutant-')), 'src');
cpSync(REPO, COPY, { recursive: true });
writeFileSync(join(COPY, '..', 'package.json'), '{"type":"module"}');
const sha = (f) => createHash('sha256').update(readFileSync(f)).digest('hex');
const repoHashes = () => ['join.mjs', 'functions/join.mjs'].map((f) => sha(REPO + f)).join(' ');
const before = repoHashes();

const A = 'functions/join.mjs';
const J = 'join.mjs';
const S = 'join-service.test.mjs';
const N = 'join-name.test.mjs';
const M = [
  // The Blob adapter: conditions, metadata and the failure statuses.
  ['eager client (the lazy guard reverted)', A, 'const conditions = (ifMatch)', 'draws();\nconst conditions = (ifMatch)', 'join-import.test.mjs'],
  ['adapter: create without If-None-Match', A, "(ifMatch ? { ifMatch } : { ifNoneMatch: '*' })", '(ifMatch ? { ifMatch } : {})', S],
  ['adapter: replace without If-Match', A, "(ifMatch ? { ifMatch } : { ifNoneMatch: '*' })", "(ifMatch ? {} : { ifNoneMatch: '*' })", S],
  ['adapter: upload with no conditions at all', A, '{ conditions: conditions(ifMatch), metadata,', '{ metadata,', S],
  ['adapter: metadata not written', A, '{ conditions: conditions(ifMatch), metadata,', '{ conditions: conditions(ifMatch),', S],
  ['adapter: listing without metadata', A, '{ prefix, includeMetadata: true }', '{ prefix }', S],
  ['adapter: delete without If-Match', A, '.delete(ifMatch ? { conditions: { ifMatch } } : {})', '.delete({})', S],
  ['adapter: 412 on a write treated as an error', A, ' || error?.statusCode === 412;', ';', S],
  // The protocol.
  ['start ignores removals in the record', J, '.filter((r) => reviewed.has(r.id) && !removed.has(r.id))', '.filter((r) => reviewed.has(r.id))', S],
  ['removal frees the name without checking the id', J, 'if (held && decodeNameRecord(held.metadata ?? {}).id === target.id)', 'if (held)', S],
  ['join does not re-check after writing', J, "if (live && (after.state === 'open' || after.roster.some((m) => m.id === record.id))) {", 'if (true) {', S],
  ['purge does not close the event first', J, "if (read.doc.state !== 'closed') {", 'if (false) {', S],
  ['retried purge answers 404', J, "await sweep(store, input.eventId);\n        return reply(200, { purged: true });", "return reply(404, { error: 'gone' });", S],
  ['start gives up after a lost write instead of re-reading', J, 'if (!committed) continue;', "if (!committed) return reply(503, { error: 'unavailable' });", S],
  ['purge gives up after a lost write instead of re-reading', J, 'if (!etag) continue;', "if (!etag) return reply(503, { error: 'unavailable' });", S],
  ['a refused purge still sweeps', J, "if (!input.admin || !sameSecret(sha256(input.admin), read.doc.admin)) return reply(401, { error: 'admin' });", "if (!input.admin || !sameSecret(sha256(input.admin), read.doc.admin)) return (await sweep(store, input.eventId), reply(401, { error: 'admin' }));", S],
  ['start returns the frozen roster before validating the body', J, "      const ids = input.body.ids;\n      if (!Array.isArray(ids) || ids.length > MAX_NAMES || !ids.every((id) => typeof id === 'string' && ID.test(id))) {\n        return reply(400, { error: 'bad-request' });\n      }\n      if (event.state === 'started') return reply(200, { roster: event.roster });\n", "      if (event.state === 'started') return reply(200, { roster: event.roster });\n      const ids = input.body.ids;\n      if (!Array.isArray(ids) || ids.length > MAX_NAMES || !ids.every((id) => typeof id === 'string' && ID.test(id))) {\n        return reply(400, { error: 'bad-request' });\n      }\n", S],
  ['adapter: a missing container read as an absent blob', A, 'const absent = (error) => error?.statusCode === 404 && !noContainer(error);', 'const absent = (error) => error?.statusCode === 404;', S],
  // No abuse budget (owner ruling 2026-11-11): each mutant puts back a piece of the dropped design.
  ['an app-wide create budget put back', J, '    const created = now();\n', "    const created = now();\n    if ((await store.list('')).filter((b) => b.path.endsWith('/event.json')).length >= 100) return reply(429, { error: 'busy' });\n", S],
  ['the PIN throttle put back: a slot claimed before the compare', J, "    const pin = normalizePin(body.pin);\n    if (pin === '' || !sameSecret(pin, event.pin)) return reply(403, { error: 'pin' });\n", "    const pinSlot = `${eventId}/pin/${newId()}`;\n    await store.put(pinSlot, {});\n    if ((await store.list(`${eventId}/pin/`)).length > limits.names) return (await store.del(pinSlot), reply(429, { error: 'locked' }));\n    const pin = normalizePin(body.pin);\n    if (pin === '' || !sameSecret(pin, event.pin)) return reply(403, { error: 'pin' });\n    await store.del(pinSlot);\n", S],
  ['a PIN counter after the compare that locks the event', J, "    const pin = normalizePin(body.pin);\n    if (pin === '' || !sameSecret(pin, event.pin)) return reply(403, { error: 'pin' });\n", "    if ((await store.list(`${eventId}/pin/`)).length >= limits.names) return reply(429, { error: 'locked' });\n    const pin = normalizePin(body.pin);\n    if (pin === '' || !sameSecret(pin, event.pin)) return (await store.put(`${eventId}/pin/${newId()}`, {}), reply(403, { error: 'pin' }));\n", S],
  ['a wrong PIN leaves a trace in storage', J, "if (pin === '' || !sameSecret(pin, event.pin)) return reply(403, { error: 'pin' });", "if (pin === '' || !sameSecret(pin, event.pin)) return (await store.put(`${eventId}/pin/${newId()}`, {}), reply(403, { error: 'pin' }));", S],
  ['start ignores the reviewed ids', J, '.filter((r) => reviewed.has(r.id) && !removed.has(r.id))', '.filter((r) => !removed.has(r.id))', S],
  ['same-device retry treated as taken', J, 'if (held && sameSecret(held.token, token))', 'if (false)', S],
  ['started checked before the same-device retry', J, 'if (existing && sameSecret(existing.token, token)) return sameDevice(existing);', "if (event.state === 'started') return reply(409, { error: 'started' });\n    if (existing && sameSecret(existing.token, token)) return sameDevice(existing);", S],
  ['empty roster frozen', J, "if (members.length === 0) return reply(409, { error: 'empty' });", '', S],
  ['stored record and its metadata both spread the request body', J, [['return { id: record.id, name: Buffer', 'return { ...record, id: record.id, name: Buffer'], ['const record = { id: newId(),', 'const record = { ...body, id: newId(),']], null, S],
  ['name stored in metadata without base64url', J, "name: Buffer.from(record.name, 'utf8').toString('base64url')", 'name: record.name', S],
  ['failure log carries the body', J, "deps.log('draw store failed', route.op,", "deps.log('draw store failed', request.bodyText, route.op,", S],
  ['admin auth skipped', J, 'if (!admin || !sameSecret(sha256(admin), read.doc.admin))', 'if (false)', S],
  ['expiry removed', J, 'return age <= (event.started ? LIVE_AFTER_START_MS : LIVE_UNSTARTED_MS);', 'return true;', S],
  ['expiry clock from creation even after a start', J, 'const age = event.started ? now.getTime() - Date.parse(event.started) : now.getTime() - Date.parse(event.created);', 'const age = now.getTime() - Date.parse(event.created);', S],
  ['an unstarted event lives 24 hours', J, 'return age <= (event.started ? LIVE_AFTER_START_MS : LIVE_UNSTARTED_MS);', 'return age <= LIVE_AFTER_START_MS;', S],
  ['a started event lives 72 hours', J, 'return age <= (event.started ? LIVE_AFTER_START_MS : LIVE_UNSTARTED_MS);', 'return age <= LIVE_UNSTARTED_MS;', S],
  ['create reports the start clock as its expiry', J, 'created.getTime() + LIVE_UNSTARTED_MS', 'created.getTime() + LIVE_AFTER_START_MS', S],
  // REFUTE round 3: liveness at the start's commit, the slot-owned name cap, and the write trace.
  ['start re-checks liveness only at its first read', J, "      if (!isLive(event, at)) return reply(404, { error: 'gone' });\n", '', S],
  ['start does not re-check once its write has landed', J, 'if (!isLive(event, deps.now())) {', 'if (false) {', S],
  ['start answers gone after its write but leaves the write in place', J, "        await store.put(paths.record(input.eventId), { json: event, ifMatch: committed });\n", '', S],
  ['a slot create that committed but answered an error is left behind', J, '      if (held?.metadata.id === id) return { path, etag: held.etag };\n', '', S],
  ['a slot stores more than the join id', J, 'await store.put(path, { metadata: { id } });', 'await store.put(path, { metadata: { id, joined: new Date().toISOString() } });', S],
  ['the name cap counted from a listing again', J, "    const slot = await claimSlot(store, eventId, record.id, limits.names);\n    if (!slot) return reply(409, { error: 'full' });\n", "    if ((await store.list(paths.namesPrefix(eventId))).length >= limits.names) return reply(409, { error: 'full' });\n    const slot = { path: paths.slot(eventId, 0), etag: null };\n", S],
  ['a refused slot create counted as held', J, 'if (etag) return { path, etag };', 'return { path, etag };', S],
  ['a failed admission keeps its slot', J, "        if (!(held && held.id === record.id)) await store.del(slot.path, slot.etag);\n", '', S],
  ['a failed admission frees its slot even when its name was written', J, 'if (!(held && held.id === record.id)) await store.del(slot.path, slot.etag);', 'await store.del(slot.path, slot.etag);', S],
  ['a join that loses the name race keeps its slot', J, "        await store.del(slot.path, slot.etag);\n        return sameDevice(await holder(path));", '        return sameDevice(await holder(path));', S],
  ['a join not admitted keeps its slot', J, "      await store.del(path, etag);\n      await store.del(slot.path, slot.etag);\n", '      await store.del(path, etag);\n', S],
  ['a removal keeps the slot', J, "      await freeSlot(store, input.eventId, target.id);\n", '', S],
  ['a retried removal does not free a slot left behind', J, "        await freeSlot(store, input.eventId, input.id);\n        return reply(200, { removed: false });", '        return reply(200, { removed: false });', S],
  ['a write before the PIN compare, undone at once (the judge\'s mutant)', J, "    // A wrong PIN writes nothing, so neither a guesser nor a phone's retry can leave state behind.\n", "    // A wrong PIN writes nothing, so neither a guesser nor a phone's retry can leave state behind.\n    const scratchWrite = `${eventId}/pre-pin/${newId()}`;\n    await store.put(scratchWrite, {});\n    await store.del(scratchWrite);\n", S],
  // Names.
  ['allow-list removed', J, "if (!ALLOWED.test(name)) return { ok: false, reason: EMOJI.test(name) ? 'emoji' : 'charset' };", '', N],
  ['control/bidi check removed', J, "if (FORBIDDEN.test(nfc)) return { ok: false, reason: 'control' };", '', N],
  ['lone-surrogate check removed', J, "if (!raw.isWellFormed()) return { ok: false, reason: 'lone-surrogate' };", '', N],
  ['clusters counted as code points', J, 'const parts = clusters(name);', 'const parts = [...name].map((c) => [c]);', N],
  ['code-unit ceiling removed', J, "if (name.length > NAME_MAX_UNITS) return { ok: false, reason: 'too-long' };", '', N],
  ['marks allowed on any base', J, "if (attaches(cluster[0]) || (cluster.length > 1 && !isConsonant(cluster[0]))) return { ok: false, reason: 'leading-mark' };", "if (attaches(cluster[0])) return { ok: false, reason: 'leading-mark' };", N],
  ['cluster size cap removed', J, "if (cluster.length > NAME_MAX_CLUSTER) return { ok: false, reason: 'stacked-marks' };", '', N],
  ['repeated mark allowed', J, "if (new Set(cluster).size !== cluster.length) return { ok: false, reason: 'stacked-marks' };", '', N],
  ['SARA AM after any mark', J, 'if (am > 0 && !isConsonant(cluster[am - 1]) && !isToneMark(cluster[am - 1]))', 'if (false)', N],
  ['server pre-escapes', J, "const name = nfc.replace(/\\s+/gu, ' ').trim();", "const name = nfc.replace(/\\s+/gu, ' ').trim().replace(/'/g, '&#39;');", N],
  ['only the ASCII space collapses', J, "const name = nfc.replace(/\\s+/gu, ' ').trim();", "const name = nfc.replace(/ +/gu, ' ').trim();", N],
  ['NFC dropped', J, "const nfc = raw.normalize('NFC');", 'const nfc = raw;', N],
  ['key: NFKC dropped', J, ".normalize('NFKC')\n    .toLowerCase()", '.toLowerCase()', N],
  ['key: mark order kept', J, 'base + marks.sort().join', 'base + marks.join', N],
  ['key: SARA E pair not folded', J, ".replace(/\\u0E40\\u0E40/g, '\\u0E41')", '', N],
];

for (const [label, rel, from, to, testFile] of M) {
  const f = join(COPY, rel);
  const src = readFileSync(f, 'utf8');
  // A mutant is one replacement, or a list of them when one defect needs two edits to show.
  const edits = Array.isArray(from) ? from : [[from, to]];
  const missing = edits.filter(([a]) => !src.includes(a));
  if (missing.length > 0) {
    console.log(`ANCHOR MISSING: ${label}`);
    process.exitCode = 1;
    continue;
  }
  writeFileSync(f, edits.reduce((text, [a, b]) => text.replace(a, () => b), src));
  const run = spawnSync(process.execPath, ['--test', join(COPY, testFile)], { encoding: 'utf8', cwd: join(COPY, '..') });
  writeFileSync(f, src);
  const fail = Number(/# fail (\d+)/.exec(run.stdout)?.[1] ?? NaN);
  const red = run.stdout.split('\n').filter((l) => /^not ok/.test(l)).map((l) => l.replace(/^not ok \d+ - /, '')).join(' | ');
  if (!(fail >= 1)) process.exitCode = 1;
  console.log(`${label} -> ${testFile}: fail=${fail} :: ${red}`);
}
const after = repoHashes();
console.log(`repo join files unchanged: ${before === after}`);
if (before !== after) process.exitCode = 1;
