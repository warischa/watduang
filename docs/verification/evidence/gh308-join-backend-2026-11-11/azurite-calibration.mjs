// gh#308: what Blob storage answers each conditional case the join adapter relies on, through the real
// storage SDK against Azurite. The in-memory container in join-service.test.mjs copies these answers.
// Run by azurite-run.sh from a scratch copy that has the SDK installed.
import { BlobServiceClient } from '@azure/storage-blob';
const conn = 'UseDevelopmentStorage=true';
const c = BlobServiceClient.fromConnectionString(conn).getContainerClient('calib' + Date.now());
await c.create();
const b = c.getBlockBlobClient('x/a.json');
const r = async (label, fn) => { try { const v = await fn(); console.log(label, 'OK', JSON.stringify(v)); } catch (e) { console.log(label, 'ERR', e.statusCode, e.code, e.details?.errorCode, e.name); } };
let e1;
await r('create absent ifNoneMatch*', async () => { const x = await b.upload('1', 1, { conditions: { ifNoneMatch: '*' }, metadata: { id: 'abc' } }); e1 = x.etag; return x.etag; });
await r('create existing ifNoneMatch*', () => b.upload('2', 1, { conditions: { ifNoneMatch: '*' } }).then((x) => x.etag));
await r('replace wrong ifMatch', () => b.upload('3', 1, { conditions: { ifMatch: '"0x1"' } }).then((x) => x.etag));
await r('replace on missing blob ifMatch', () => c.getBlockBlobClient('x/missing').upload('3', 1, { conditions: { ifMatch: e1 } }).then((x) => x.etag));
await r('download etag', async () => { const d = await b.download(); const ch = []; for await (const k of d.readableStreamBody) ch.push(k); return [d.etag, Buffer.concat(ch).toString()]; });
await r('getProperties', async () => { const p = await b.getProperties(); return [p.etag, p.metadata]; });
await r('list etag', async () => { const o = []; for await (const x of c.listBlobsFlat({ prefix: 'x/', includeMetadata: true })) o.push([x.name, x.properties.etag, x.metadata]); return o; });
await r('list no metadata', async () => { const o = []; for await (const x of c.listBlobsFlat({ prefix: 'x/' })) o.push([x.name, x.metadata]); return o; });
await r('metadata non-ascii', () => c.getBlockBlobClient('x/t').upload('', 0, { metadata: { name: 'ต้น' } }).then((x) => x.etag));
await r('metadata mixed-case key', async () => { await c.getBlockBlobClient('x/m').upload('', 0, { metadata: { MyKey: 'v' } }); return (await c.getBlockBlobClient('x/m').getProperties()).metadata; });
await r('delete wrong ifMatch', () => b.delete({ conditions: { ifMatch: '"0x1"' } }).then(() => 'deleted'));
await r('deleteIfExists wrong ifMatch', () => b.deleteIfExists({ conditions: { ifMatch: '"0x1"' } }).then((x) => x.succeeded));
await r('delete missing ifMatch', () => c.getBlockBlobClient('x/missing').delete({ conditions: { ifMatch: e1 } }).then(() => 'deleted'));
await r('delete missing plain', () => c.getBlockBlobClient('x/missing').delete().then(() => 'deleted'));
await r('deleteIfExists missing', () => c.getBlockBlobClient('x/missing').deleteIfExists().then((x) => x.succeeded));
await r('download missing', () => c.getBlockBlobClient('x/missing').download().then(() => 'got'));
await r('getProperties missing', () => c.getBlockBlobClient('x/missing').getProperties().then(() => 'got'));
await r('delete right ifMatch', async () => { const p = await b.getProperties(); await b.delete({ conditions: { ifMatch: p.etag } }); return 'deleted'; });
await c.delete();
