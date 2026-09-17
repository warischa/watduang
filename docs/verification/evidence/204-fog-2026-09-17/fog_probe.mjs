// Loads bangkok-drift, forces seed 2935300 (matches ticket's known road), drives setup->turn->drive
// through real UI clicks, then freezes camera at pos=190m (matches ticket) and samples sprite pixels.
const URL = process.env.FOG_URL;
const POS = Number(process.env.FOG_POS || 205);

// Per-kind vertical offset from baseY to a point INSIDE the sprite's filled body (read off each
// draw* function: cone/rock are solid triangles rising above baseY; puddle is an ellipse centred
// ON baseY; banana's crescent sits BELOW baseY -- sampling above baseY for banana hits background,
// not the sprite, which is why the first run showed identical near-pixels in both files.
const BODY_OFFSET = { cone: -0.9, rock: -0.5, puddle: 0, banana: 0.65 };

export default async function (session) {
  // Forces Math.random() before the page's own script runs, so buildTrack's seed is deterministic.
  // r chosen so (r*4294967296)>>>0 === 2935300 exactly (verified in node beforehand).
  await session.onNewDocument('Math.random = () => 0.0006834279047325253;');
  await session.setWidth(375, 812);
  await session.nav(URL);

  const r = await session.evaluate(`
    document.getElementById('startGameBtn').click();
    document.getElementById('readyBtn').click();
    cancelAnimationFrame(raf);
    drive.pos = ${POS};
    drive.seg = Math.floor(${POS} / RULES.SEG_LEN);
    drive.x = 0;
    const calls = [];
    for (const k of Object.keys(SPRITES)) {
      const orig = SPRITES[k];
      SPRITES[k] = function (...args) {
        calls.push({ kind: k, cx: args[0], baseY: args[1], hw: args[2] });
        return orig.apply(this, args);
      };
    }
    draw();
    return { calls, HZ: H * 0.4, W, H, dpr: window.devicePixelRatio, seg: drive.seg, pos: drive.pos };
  `);
  if (r.error) return { error: r.error };
  const { calls, HZ, W, H, dpr } = r.value;
  if (!calls.length) return { error: 'no hazards drawn in range', HZ, W, H };

  // Only candidates whose CENTRE lands on-canvas (curve/lane can push a wide sprite's edges off
  // either side, but the sample point is the centre, not the full extent).
  const onscreen = calls.filter((c) => c.cx > 5 && c.cx < W - 5);
  if (!onscreen.length) return { error: 'no on-screen hazards', calls, HZ, W, H };

  // far = smallest baseY (nearest the horizon); near = largest baseY (closest to camera).
  const sorted = [...onscreen].sort((a, b) => a.baseY - b.baseY);
  const far = sorted[0], near = sorted[sorted.length - 1];

  const sample = async (c) => {
    const off = BODY_OFFSET[c.kind] ?? -0.9;
    const x = Math.round(c.cx), y = Math.round(c.baseY + c.hw * off);
    const px = await session.evaluate(`
      const d = ctx.getImageData(${x}, ${y}, 1, 1).data;
      return { r: d[0], g: d[1], b: d[2], a: d[3], x: ${x}, y: ${y} };
    `);
    return px.value ?? { error: px.error };
  };

  const farPx = await sample(far);
  const nearPx = await sample(near);
  await session.screenshot(process.env.FOG_SHOT || '/tmp/fog.png');

  const warn = [];
  if (farPx.a === 0) warn.push('far sample landed on a transparent pixel -- not the sprite');
  if (nearPx.a === 0) warn.push('near sample landed on a transparent pixel -- not the sprite');

  return { calls, HZ, W, H, dpr, warn, far: { kind: far.kind, ...far, px: farPx }, near: { kind: near.kind, ...near, px: nearPx } };
}
