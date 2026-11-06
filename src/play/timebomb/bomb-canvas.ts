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

  function paint(exploded: boolean): void {
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

    // 7. Detonation: one bright ring plus a wash, drawn as a final resting frame rather than an
    //    animation — the round is already over and the result is announced in the DOM below.
    if (exploded) {
      ctx.save();
      ctx.globalAlpha = 0.85;
      // Sized to fade out INSIDE the canvas box: a wash still bright at the edge is clipped square by
      // the element bounds and reads as a lit rectangle rather than a blast (measured on the 320px
      // reduced-motion capture, where the corners were visibly cut).
      const boomR = Math.min(radius * 2.1, Math.min(width, height) * 0.48);
      const boomGrad = ctx.createRadialGradient(0, 0, radius * 0.2, 0, 0, boomR);
      boomGrad.addColorStop(0, 'rgba(255, 237, 213, 0.95)');
      boomGrad.addColorStop(0.45, 'rgba(249, 115, 22, 0.5)');
      boomGrad.addColorStop(1, 'rgba(249, 115, 22, 0)');
      ctx.fillStyle = boomGrad;
      ctx.beginPath();
      ctx.arc(0, 0, boomR, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.75)';
      ctx.lineWidth = Math.max(2, radius * 0.05);
      ctx.beginPath();
      ctx.arc(0, 0, radius * 1.45, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    ctx.restore();
    ctx.restore();
  }

  function drawOnce(): void {
    const surface = readSurface();
    if (surface === 'off') return;
    resize();
    paint(surface === 'boom');
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
      if (surface !== 'off') resize();
    }

    if (surface !== 'off') {
      // Under reduced motion every term in paint() is a constant, so a second frame of the same
      // surface would paint the identical image — one paint per surface is the whole picture, and
      // skipping the rest saves a full redraw per frame on the devices least able to afford one. Never
      // skipped otherwise: the wobble and the spark's flicker are what need those frames.
      if (!(reduceQuery?.matches === true && lastPainted === surface)) {
        paint(surface === 'boom');
        lastPainted = surface;
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
