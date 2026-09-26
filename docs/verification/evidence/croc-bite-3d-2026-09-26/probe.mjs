// Screenshot + renderer.info probe for croc-bite. OUT and TAG env pick destination and label.
const BASE = process.env.BASE || 'http://localhost:4361';
const OUT = process.env.OUT;
const TAG = process.env.TAG;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const INFO = `
  const a = window.__khengApp, s = a && a.scene;
  if (!s) return { noScene: true };
  const r = s.renderer, gl = r.getContext();
  // renderer.info resets AFTER the shadow pass, so it cannot see shadow-map draws. Count every GL
  // draw of one full render() instead.
  let gpuDraws = 0; const saved = {};
  for (const f of ['drawElements', 'drawArrays', 'drawElementsInstanced', 'drawArraysInstanced']) {
    saved[f] = gl[f]; gl[f] = function (...a) { gpuDraws++; return saved[f].apply(this, a); };
  }
  r.render(s.scene, s.camera);
  for (const f in saved) gl[f] = saved[f];
  return { hidden: document.hidden, innerWidth, innerHeight, dpr: devicePixelRatio,
    coarse: matchMedia('(pointer: coarse)').matches, lite: s.lite ?? null,
    pixelRatio: r.getPixelRatio(), gpuDraws, calls: r.info.render.calls, triangles: r.info.render.triangles,
    programs: r.info.programs ? r.info.programs.length : null, shadowMap: r.shadowMap.enabled,
    env: !!(s.scene.environment || s.scene.userData.envMap),
    notice: !!document.querySelector('.webgl-error:not(.hidden), #webgl-error:not(.hidden)') };`;

const TOOTH = `
  const a = window.__khengApp, s = a.scene, c = a.crocodile;
  const ids = [...c.teethMap.keys()];
  const t = c.teethMap.get(ids.find((i) => c.teethMap.get(i).jaw === 'lower' && Math.abs(c.teethMap.get(i).group.position.x) < 0.5) ?? ids[0]);
  const V = t.mesh.position.constructor;
  const p = t.mesh.getWorldPosition(new V()).project(s.camera);
  const rect = s.renderer.domElement.getBoundingClientRect();
  return { x: rect.left + (p.x + 1) / 2 * rect.width, y: rect.top + (1 - p.y) / 2 * rect.height, phase: a.state.phase, n: ids.length };`;

export default async function (session) {
  const out = {};
  for (const [name, w, h] of [['desktop', 1280, 800], ['mobile', 375, 812]]) {
    await session.setWidth(w, h);
    await session.nav(`${BASE}/game/croc-bite/play/`);
    await session.wipe();
    await session.nav(`${BASE}/game/croc-bite/play/`);
    await sleep(800);
    const start = await session.evaluate(`const b = document.getElementById('btn-start-game'); if (!b) return 'no-btn'; b.click(); return 'clicked';`);
    await sleep(2500);
    const info = (await session.evaluate(INFO)).value;
    await session.evaluate(`document.querySelector("astro-dev-toolbar")?.remove();return 1`);
    await session.screenshot(`${OUT}/${TAG}-${name}-${w}x${h}-idle.png`);
    const tooth = await session.evaluate(TOOTH);
    let pressed = null;
    if (tooth.value) {
      await session.tap(tooth.value.x, tooth.value.y); // settles 400ms after release
      await session.evaluate(`document.querySelector("astro-dev-toolbar")?.remove();return 1`);
    await session.screenshot(`${OUT}/${TAG}-${name}-${w}x${h}-press.png`);
      pressed = (await session.evaluate(`return window.__khengApp.state.phase`)).value;
    }
    out[name] = { start: start.value, info, tooth: tooth.value ?? tooth.error, phaseAfterTap: pressed };
  }
  out.consoleErrors = session.consoleErrors;
  await session.close();
  return out;
}
