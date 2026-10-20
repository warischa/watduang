// gh282 diagnosis wrapper: runs the fit probe's own driver function (path in PROBE_PATH) unchanged,
// and after every MEASURE read it takes one extra read of the same screen: lane (in-page WebGL),
// fallback puppet presence, visible text, and the tall boxes that make up the page height.
const probe = (await import(process.env.PROBE_PATH)).default;

const EXTRA = `
  const de = document.documentElement;
  const vis = (e) => { const r = e.getBoundingClientRect(); const cs = getComputedStyle(e);
    return r.width > 0 && r.height > 0 && cs.display !== 'none' && cs.visibility !== 'hidden'; };
  const desc = (e) => (e.tagName.toLowerCase() + (e.id ? '#' + e.id : '') +
    (typeof e.className === 'string' && e.className.trim() ? '.' + e.className.trim().split(/\\s+/).join('.') : '')).slice(0, 70);
  let gl = 'null';
  try { const c = document.createElement('canvas'); gl = c.getContext('webgl2') ? 'webgl2' : (c.getContext('webgl') ? 'webgl' : 'null'); } catch (err) { gl = 'err'; }
  const mouth = document.querySelector('.css-mouth');
  const root = document.querySelector('#app, #app-container, #appRoot');
  const parts = [];
  if (root) for (const e of root.querySelectorAll('*')) { if (e.children.length || !vis(e)) continue; const t = (e.textContent || '').trim(); if (t) parts.push(t); }
  const tall = [];
  const walk = (e, depth) => {
    if (depth > 6 || tall.length >= 60) return;
    for (const c of e.children) {
      if (!vis(c)) continue;
      const r = c.getBoundingClientRect();
      if (r.height >= 30) tall.push({ d: depth, el: desc(c), top: Math.round(r.top), h: Math.round(r.height), bottom: Math.round(r.bottom) });
      walk(c, depth + 1);
    }
  };
  walk(document.body, 0);
  return { path: location.pathname, innerWidth, innerHeight, deScrollH: de.scrollHeight, deClientH: de.clientHeight,
    bodyScrollH: document.body.scrollHeight, gl, cssMouth: mouth ? vis(mouth) : null,
    openDialogs: [...document.querySelectorAll('dialog[open]')].map(desc),
    text: parts.join(' | ').slice(0, 240), tall };
`;

export default async function (session) {
  const orig = session.evaluate.bind(session);
  const extras = [];
  let clicks = 0;
  session.evaluate = async (body, ...rest) => {
    const res = await orig(body, ...rest);
    const v = res && res.value;
    if (typeof body === 'string' && body.trim() === 'return innerWidth;') clicks = 0;
    if (v && typeof v === 'object' && 'found' in v && v.found && 'label' in v) clicks += 1;
    if (v && v.ok && 'scrollPx' in v && 'clippedPx' in v) {
      const x = await orig(EXTRA);
      extras.push({ press: clicks, measured: { overflowPx: v.overflowPx, scrollPx: v.scrollPx, scrollFrom: v.scrollFrom, clippedPx: v.clippedPx, clipFrom: v.clipFrom }, extra: x.value ?? { error: x.error } });
    }
    return res;
  };
  const out = await probe(session);
  return { out, extras };
}
