// The play surface: a Canvas 2D bomb with a three-dimensional look (owner direction 2026-08-30).
//
// CANVAS 2D, NEVER WebGL, and that is a decision rather than a preference: the WebGL mockup this
// site was offered overwrites document.body with an error string when getContext('webgl') returns
// null, and a play surface that can blank the page is not shippable to a low-end Android audience.
// Everything below is hand-drawn depth — a projected ground shadow, a radial-gradient sphere, an
// offset specular highlight — which needs no library and has no hard failure mode. Idiom follows
// src/play/cannon-flag/main.js: backing store sized to devicePixelRatio, ctx.scale(dpr, dpr) inside
// one save/restore, gradients and shadowBlur for depth.
//
// THIS RENDERER HOLDS NO CLOCK, and since gh#151 it holds no countdown either. It never computes
// remaining time, never reads Date.now(), and never accumulates frame deltas. It reads the engine's
// #tb-fuse element for ONE bit — is the ticking screen up — and nothing else: no size, no position and
// no length drawn below is proportional to the time left, because a drawn quantity that tracks the
// deadline is a countdown a player can read (owner ruling 2026-08-30). Burning, flickering and
// sparking are what say the fuse is lit. Everything that moves here is off performance.now(), which is
// absolute and cosmetic, so a throttled tab resumes where the wall clock is.
//
// The one timed thing is the detonation burst (gh#295): a flash, a shake and a blast that grows to
// its resting size over BOOM_MS. It is timed from the moment this renderer first sees the boom
// screen -- after the round is over -- and runs the same whatever the fuse was, so it carries nothing
// about the deadline. Under prefers-reduced-motion it is skipped and the resting frame is drawn at once.

/** Screen state, derived from what the engine currently has on the stage — the renderer owns no
 *  state machine of its own. #tb-fuse exists only on the ticking screen, #tb-again only after the
 *  bomb has gone off. */
type Surface = 'off' | 'ticking' | 'boom';

function readSurface(): Surface {
  if (document.getElementById('tb-fuse')) return 'ticking';
  if (document.getElementById('tb-again')) return 'boom';
  return 'off';
}

/** Hand-rolled perspective: a point sitting `depth` behind the picture plane shrinks by this factor.
 *  One divide, no matrices — the whole scene is one object on one ground plane. */
function perspective(depth: number): number {
  const focal = 520;
  return focal / (focal + depth);
}

/** Everything paint() positions, in CSS pixels, before the cosmetic motion (sway, tilt, hover).
 *  A pure function of the canvas box and nothing else: no time, no fuse, no round. */
export interface BombLayout {
  cx: number;
  groundY: number;
  radius: number;
  capW: number;
  capH: number;
  /** The cord, as offsets from the bomb centre: base on the cap, one control point, the burning tip. */
  baseY: number;
  ctrlX: number;
  ctrlY: number;
  tipX: number;
  tipY: number;
  sparkR: number;
  /** The spark glow's shadowBlur, sized with the bomb so a small bomb does not carry a huge halo. */
  glow: number;
}

/** The cosmetic motion paint() adds on top of the layout, as worst-case bounds. The layout reserves
 *  room for them so a swaying, hovering bomb still never crosses the box. */
export const MOTION = { sway: 2, hover: 2, tilt: 0.02 } as const;

/** Cord shape, in units of the cord's own length, which is a fixed multiple of the radius (gh#151:
 *  the cord never shortens). Leaning sideways rather than straight up is what lets the whole lit cord
 *  fit in the 120px floor box at a usable bomb size: the old upright cord put its tip 2.1 radii above
 *  the centre, which no layout of the box could keep on screen. */
const CORD_LEN = 1.15;
const CORD_TIP = { x: 0.8, y: -0.55 };
const CORD_CTRL = { x: 0.12, y: -0.6 };
const SPARK_R = 0.07;
/** The spark never shrinks below this, so a small bomb still shows a lit point. */
const SPARK_MIN = 2.5;
const GLOW_PER_R = 0.18;
const GLOW_MIN = 4;
/** Clear space kept between the drawing and every edge of the box. */
const EDGE_PAD = 2;

/** Lays the bomb out INSIDE the box: radius from both axes, then the whole composition (glowing
 *  spark on top, ground shadow at the bottom) centred vertically. The radius never exceeds what the
 *  route has always drawn, so a box that already fitted keeps its bomb size. */
export function bombLayout(width: number, height: number): BombLayout {
  // The bomb sits at a FIXED depth. It used to rise toward the viewer as the fuse burned, which made
  // its drawn size a readout of the time left (gh#151) -- this is that projection taken at the start.
  const legacyR = Math.min(width * 0.3, height * 0.3) * perspective(120) * 1.25;

  // Extents in units of r, measured from the ground line. Above it: the bomb centre sits 1.05 r up,
  // the cord base 1.182 r above that, the tip CORD_TIP.y cord lengths higher, the spark disc on top,
  // and the tilt can lift the tip by its horizontal offset times the tilt angle. Below it: the shadow
  // ellipse (centre 0.08 r down, vertical radius 1.15 r squashed to 0.26).
  const tipUp = 1.182 - CORD_TIP.y * CORD_LEN;
  const above = 1.05 + tipUp + SPARK_R + CORD_TIP.x * CORD_LEN * MOTION.tilt + GLOW_PER_R;
  const below = 0.08 + 1.15 * 0.26;
  const fixedV = MOTION.hover + GLOW_MIN + SPARK_MIN + EDGE_PAD * 2;
  const fitH = (height - fixedV) / (above + below);
  // Across: the shadow spreads 1.15 r each side and the tip reaches CORD_TIP.x cord lengths right,
  // plus what the tilt swings it out by (its height above the centre times the angle).
  const right = Math.max(1.15, CORD_TIP.x * CORD_LEN + SPARK_R + GLOW_PER_R + tipUp * MOTION.tilt);
  const fitW = (width - (MOTION.sway + GLOW_MIN + SPARK_MIN + EDGE_PAD) * 2) / (2 * right);
  const radius = Math.max(1, Math.min(legacyR, fitH, fitW));

  const glow = Math.max(GLOW_MIN, radius * GLOW_PER_R);
  const sparkR = Math.max(SPARK_MIN, radius * SPARK_R);
  const top = radius * (above - GLOW_PER_R - SPARK_R) + sparkR + glow + MOTION.hover;
  const bottom = radius * below;
  const groundY = top + (height - top - bottom) / 2;
  const capH = radius * 0.26;
  const baseY = -radius - capH * 0.7;
  const len = radius * CORD_LEN;
  return {
    cx: width / 2,
    groundY,
    radius,
    capW: radius * 0.34,
    capH,
    baseY,
    ctrlX: len * CORD_CTRL.x,
    ctrlY: baseY + len * CORD_CTRL.y,
    tipX: len * CORD_TIP.x,
    tipY: baseY + len * CORD_TIP.y,
    sparkR,
    glow,
  };
}

/** How long the detonation burst takes to settle into its resting frame. */
export const BOOM_MS = 650;

/** The burst's moving terms at `progress` (0 = the instant of detonation, 1 = at rest): how hard the
 *  scene shakes, how far the blast has grown, how bright the flash over it is. At 1 every term is at
 *  rest -- no shake, full size, no flash -- which is the frame reduced motion draws straight away. */
export function boomMotion(progress: number): { shake: number; grow: number; flash: number } {
  const p = Math.min(1, Math.max(0, progress));
  const rest = 1 - p;
  return { shake: rest * rest, grow: 1 - rest * rest * rest * 0.65, flash: rest * rest * rest };
}

export interface BombCanvas {
  /** Draws one frame of the current surface — exported so a probe can force a frame without rAF. */
  drawOnce(): void;
  stop(): void;
}

export function startBombCanvas(canvas: HTMLCanvasElement): BombCanvas {
  const ctx = canvas.getContext('2d');
  const reduceQuery =
    typeof window.matchMedia === 'function' ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;

  let width = 0;
  let height = 0;
  let dpr = 1;
  let rafId = 0;
  let lastSurface: Surface = 'off';
  let lastPainted: Surface | null = null;
  /** performance.now() when this renderer first saw the boom screen; 0 when it is not up. */
  let boomAt = 0;

  function resize(): void {
    const rect = canvas.getBoundingClientRect();
    dpr = window.devicePixelRatio || 1;
    width = rect.width;
    height = rect.height;
    // The backing store is sized in device pixels and the context scaled back down, or every edge
    // drawn below is soft on a phone (dpr 2 and 3 are the common cases).
    canvas.width = Math.max(1, Math.round(rect.width * dpr));
    canvas.height = Math.max(1, Math.round(rect.height * dpr));
  }

  function paint(): void {
    if (!ctx || width === 0 || height === 0) return;
    const reduced = reduceQuery?.matches === true;
    // Cosmetic only. performance.now() is absolute like the fuse itself, so a throttled tab resumes
    // the wobble where the wall clock is, never where the frame count left off.
    const t = reduced ? 0 : performance.now() / 1000;

    ctx.save();
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, width, height);

    // gh#295: every position comes from bombLayout(), which fits the lit cord and its glow inside the
    // box. The spark used to sit above the top edge at every size, so the bomb never looked lit.
    const layout = bombLayout(width, height);
    const { cx, groundY, radius } = layout;
    // Pass-the-phone motion: a slow sway and a breathing hover, at ONE fixed rate. The rate used to
    // quicken with the fuse, which is a countdown a player can watch just as well as a shrinking bar.
    const sway = reduced ? 0 : Math.sin(t * 1.1) * MOTION.sway;
    const tilt = reduced ? 0 : Math.sin(t * 0.7) * MOTION.tilt;
    const hover = reduced ? 0 : Math.sin(t * 1.4) * MOTION.hover;
    const cy = groundY - radius * 1.05 + hover;

    // 1. Ground shadow — an ELLIPSE, not a circle: that foreshortening is what puts the bomb on a
    //    floor instead of on a flat backdrop. It tightens and darkens as the bomb rises.
    const shadowSpread = radius * 1.15;
    ctx.save();
    ctx.translate(cx + sway * 0.6, groundY + radius * 0.08);
    ctx.scale(1, 0.26);
    const shadowGrad = ctx.createRadialGradient(0, 0, radius * 0.1, 0, 0, shadowSpread);
    shadowGrad.addColorStop(0, 'rgba(2, 6, 16, 0.75)');
    shadowGrad.addColorStop(1, 'rgba(2, 6, 16, 0)');
    ctx.fillStyle = shadowGrad;
    ctx.beginPath();
    ctx.arc(0, 0, shadowSpread, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.translate(cx + sway, cy);
    ctx.rotate(tilt);

    // 2. Body — a radial gradient whose light source is OFF CENTRE (upper left). A centred gradient
    //    reads as a flat disc; the offset is the whole sphere illusion.
    const bodyGrad = ctx.createRadialGradient(
      -radius * 0.35,
      -radius * 0.42,
      radius * 0.08,
      0,
      0,
      radius * 1.05,
    );
    bodyGrad.addColorStop(0, '#5b6b85');
    bodyGrad.addColorStop(0.35, '#2b3648');
    bodyGrad.addColorStop(0.78, '#131a26');
    bodyGrad.addColorStop(1, '#070a11');
    ctx.fillStyle = bodyGrad;
    ctx.beginPath();
    ctx.arc(0, 0, radius, 0, Math.PI * 2);
    ctx.fill();

    // 3. Rim light along the lower right — bounce off the ground, the second depth cue after the
    //    shadow. Drawn as a clipped arc so it hugs the silhouette.
    ctx.save();
    ctx.beginPath();
    ctx.arc(0, 0, radius, 0, Math.PI * 2);
    ctx.clip();
    ctx.globalAlpha = 0.5;
    const rimGrad = ctx.createRadialGradient(
      radius * 0.55,
      radius * 0.6,
      radius * 0.05,
      radius * 0.35,
      radius * 0.4,
      radius * 1.1,
    );
    rimGrad.addColorStop(0, 'rgba(148, 163, 184, 0.85)');
    rimGrad.addColorStop(1, 'rgba(148, 163, 184, 0)');
    ctx.fillStyle = rimGrad;
    ctx.fillRect(-radius, -radius, radius * 2, radius * 2);
    ctx.restore();

    // 4. Specular highlight — offset from centre, squashed, and slightly rotated so it reads as a
    //    reflection curving over a surface rather than a sticker.
    ctx.save();
    ctx.translate(-radius * 0.34, -radius * 0.4);
    ctx.rotate(-0.5);
    ctx.scale(1, 0.62);
    const specGrad = ctx.createRadialGradient(0, 0, 0, 0, 0, radius * 0.34);
    specGrad.addColorStop(0, 'rgba(255, 255, 255, 0.85)');
    specGrad.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = specGrad;
    ctx.beginPath();
    ctx.arc(0, 0, radius * 0.34, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // 5. The fuse cord, drawn at a CONSTANT length with the spark riding its end. Its length used to
    //    shrink in proportion to the time left — exactly the readable countdown gh#151 removes. The
    //    cord now says the fuse is lit and nothing more.
    const { capW, capH, baseY, ctrlX, ctrlY, tipX, tipY } = layout;
    ctx.fillStyle = '#1c2533';
    ctx.beginPath();
    ctx.rect(-capW / 2, -radius - capH * 0.75, capW, capH);
    ctx.fill();

    ctx.strokeStyle = '#c9a227';
    ctx.lineWidth = Math.max(2, radius * 0.055);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(0, baseY);
    ctx.quadraticCurveTo(ctrlX, ctrlY, tipX, tipY);
    ctx.stroke();

    // 6. Spark at the burning end. shadowBlur is the glow; under reduced motion it stops flickering
    //    but stays lit, because it is the thing that says the fuse is still burning.
    const flicker = reduced ? 1 : 0.75 + Math.abs(Math.sin(t * 22)) * 0.25;
    ctx.save();
    ctx.shadowColor = 'rgba(245, 158, 11, 0.9)';
    // A glow sized with the bomb and nothing else: it used to grow with the fuse, which read as a gauge.
    ctx.shadowBlur = layout.glow * flicker;
    ctx.fillStyle = '#fde68a';
    ctx.beginPath();
    ctx.arc(tipX, tipY, Math.max(2.5, layout.sparkR * flicker), 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    ctx.restore();
    ctx.restore();
  }

  /** The detonation. The bomb is gone: a scorch where it stood, a jagged blast with a wash behind it
   *  and a ring around it, and over the first moments a shake and a white flash. `progress` runs 0..1
   *  over BOOM_MS; at 1 nothing moves, and that resting frame is what reduced motion gets. */
  function paintBoom(progress: number, ageMs: number): void {
    if (!ctx || width === 0 || height === 0) return;
    const { cx, groundY, radius } = bombLayout(width, height);
    const cy = groundY - radius * 1.05;
    const m = boomMotion(progress);
    const amp = radius * 0.15 * m.shake;
    const dx = amp * Math.sin(ageMs * 0.09);
    const dy = amp * Math.cos(ageMs * 0.13);

    ctx.save();
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, width, height);
    ctx.save();
    ctx.translate(dx, dy);

    // Scorch: the ground shadow, wider and darker, where the bomb stood.
    ctx.save();
    ctx.translate(cx, groundY + radius * 0.08);
    ctx.scale(1, 0.26);
    const scorch = ctx.createRadialGradient(0, 0, radius * 0.1, 0, 0, radius * 1.15);
    scorch.addColorStop(0, 'rgba(2, 6, 16, 0.9)');
    scorch.addColorStop(1, 'rgba(2, 6, 16, 0)');
    ctx.fillStyle = scorch;
    ctx.beginPath();
    ctx.arc(0, 0, radius * 1.15, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Sized to fade out INSIDE the canvas box: a wash still bright at the edge is clipped square by
    // the element bounds and reads as a lit rectangle rather than a blast (measured on the 320px
    // reduced-motion capture, where the corners were visibly cut). The room is measured from the
    // blast centre to the nearest edge, since the centre is not the middle of the box.
    const room = Math.min(cx, width - cx, cy, height - cy) - 2;
    const boomR = Math.max(1, Math.min(radius * 2.1, room) * m.grow);
    ctx.translate(cx, cy);

    const wash = ctx.createRadialGradient(0, 0, boomR * 0.1, 0, 0, boomR);
    wash.addColorStop(0, 'rgba(255, 237, 213, 0.95)');
    wash.addColorStop(0.45, 'rgba(249, 115, 22, 0.35)');
    wash.addColorStop(1, 'rgba(249, 115, 22, 0)');
    ctx.fillStyle = wash;
    ctx.beginPath();
    ctx.arc(0, 0, boomR, 0, Math.PI * 2);
    ctx.fill();

    // The blast: a jagged star, long and short points alternating so it reads as torn, not drawn.
    const points = 12;
    const outer = boomR * 0.8;
    ctx.beginPath();
    for (let i = 0; i < points * 2; i += 1) {
      const a = (i / (points * 2)) * Math.PI * 2 - Math.PI / 2;
      const r = i % 2 === 1 ? outer * 0.48 : i % 4 === 0 ? outer : outer * 0.78;
      ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    ctx.closePath();
    const star = ctx.createRadialGradient(0, 0, 0, 0, 0, outer);
    star.addColorStop(0, '#fffbeb');
    star.addColorStop(0.35, '#fde047');
    star.addColorStop(0.75, '#f97316');
    star.addColorStop(1, 'rgba(220, 38, 38, 0.85)');
    ctx.fillStyle = star;
    ctx.fill();

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.55)';
    ctx.lineWidth = Math.max(2, radius * 0.05);
    ctx.beginPath();
    ctx.arc(0, 0, Math.min(radius * 1.45, boomR * 0.95), 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();

    // The flash sits over everything and is gone well before the burst settles. Radial, and faded out
    // before the nearest edge for the same reason as the wash: a flat fill lights the canvas box up
    // as a rectangle (the first capture of this burst did exactly that).
    if (m.flash > 0.01) {
      const reach = Math.max(1, room);
      const flash = ctx.createRadialGradient(cx, cy, 0, cx, cy, reach);
      flash.addColorStop(0, `rgba(255, 247, 230, ${(0.95 * m.flash).toFixed(3)})`);
      flash.addColorStop(0.6, `rgba(255, 247, 230, ${(0.5 * m.flash).toFixed(3)})`);
      flash.addColorStop(1, 'rgba(255, 247, 230, 0)');
      ctx.fillStyle = flash;
      ctx.fillRect(0, 0, width, height);
    }
    ctx.restore();
  }

  /** 0..1 through the burst. Reduced motion, and a boom this renderer never saw begin (a probe's
   *  drawOnce before the first frame), get the resting frame. */
  function boomProgress(): number {
    if (reduceQuery?.matches === true || boomAt === 0) return 1;
    return (performance.now() - boomAt) / BOOM_MS;
  }

  function draw(surface: Surface): void {
    if (surface === 'boom') paintBoom(boomProgress(), boomAt === 0 ? 0 : performance.now() - boomAt);
    else paint();
  }

  function drawOnce(): void {
    const surface = readSurface();
    if (surface === 'off') return;
    resize();
    draw(surface);
  }

  function frame(): void {
    rafId = 0;
    const surface = readSurface();

    if (surface !== lastSurface) {
      lastSurface = surface;
      // The canvas only occupies space while there is a round to show, so the setup and idle screens
      // keep their full height at 320px.
      canvas.hidden = surface === 'off';
      // resize() writes canvas.width, which CLEARS the backing store — so the reduced-motion
      // paint-once bookkeeping has to be reset here or a re-entered surface stays blank.
      lastPainted = null;
      boomAt = surface === 'boom' ? performance.now() : 0;
      if (surface !== 'off') resize();
    }

    if (surface !== 'off') {
      // Under reduced motion every term in paint() is a constant, so a second frame of the same
      // surface would paint the identical image — one paint per surface is the whole picture, and
      // skipping the rest saves a full redraw per frame on the devices least able to afford one. The
      // burst's resting frame is the same case with motion on: once it settles nothing moves. Never
      // skipped otherwise: the wobble, the spark's flicker and the burst are what need those frames.
      const still = reduceQuery?.matches === true || (surface === 'boom' && boomProgress() >= 1);
      if (!(still && lastPainted === surface)) {
        draw(surface);
        lastPainted = still ? surface : null;
      }
    }
    rafId = requestAnimationFrame(frame);
  }

  resize();
  canvas.hidden = true;
  window.addEventListener('resize', () => {
    resize();
    drawOnce();
  });
  rafId = requestAnimationFrame(frame);

  return {
    drawOnce,
    stop(): void {
      if (rafId) cancelAnimationFrame(rafId);
      rafId = 0;
    },
  };
}
