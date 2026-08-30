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
// THIS RENDERER HOLDS NO CLOCK. It never computes remaining time, never reads Date.now(), and never
// accumulates frame deltas. Every frame it READS the engine's fuse element (#tb-fuse, whose width the
// engine writes from `deadline - Date.now()` — src/games/timebomb.ts's frame()), so the absolute
// deadline stays the single source of the round's time and a renderer bug cannot drift it. The only
// thing this file animates on its own is a cosmetic wobble, and that is off performance.now(), which
// is also absolute.

/** Screen state, derived from what the engine currently has on the stage — the renderer owns no
 *  state machine of its own. #tb-fuse exists only on the ticking screen, #tb-again only after the
 *  bomb has gone off. */
type Surface = 'off' | 'ticking' | 'boom';

function readSurface(): Surface {
  if (document.getElementById('tb-fuse')) return 'ticking';
  if (document.getElementById('tb-again')) return 'boom';
  return 'off';
}

/** 0 at the start of the fuse, 1 at detonation — read back out of the engine's own fuse bar, whose
 *  width IS the remaining fuse. Returns null when there is no fuse on screen. */
function readUrgency(): number | null {
  const fill = document.getElementById('tb-fuse');
  if (!fill) return null;
  const remaining = Number.parseFloat(fill.style.width);
  if (!Number.isFinite(remaining)) return null;
  const urgency = 1 - remaining / 100;
  return urgency < 0 ? 0 : urgency > 1 ? 1 : urgency;
}

/** Hand-rolled perspective: a point sitting `depth` behind the picture plane shrinks by this factor.
 *  One divide, no matrices — the whole scene is one object on one ground plane. */
function perspective(depth: number): number {
  const focal = 520;
  return focal / (focal + depth);
}

export interface BombCanvas {
  /** Draws one frame at the current urgency — exported so a probe can force a frame without rAF. */
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
  let lastPainted = -1;

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

  function paint(urgency: number, exploded: boolean): void {
    if (!ctx || width === 0 || height === 0) return;
    const reduced = reduceQuery?.matches === true;
    // Cosmetic only. performance.now() is absolute like the fuse itself, so a throttled tab resumes
    // the wobble where the wall clock is, never where the frame count left off.
    const t = reduced ? 0 : performance.now() / 1000;

    ctx.save();
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, width, height);

    const cx = width / 2;
    const groundY = height * 0.78;
    // The bomb sits slightly behind the picture plane and rises toward the viewer as the fuse burns:
    // the projection does the work, so "closer" is drawn simply as "bigger".
    const depth = 120 - urgency * 40;
    const scale = perspective(depth);
    const radius = Math.min(width * 0.30, height * 0.30) * (1 + urgency * 0.06) * scale * 1.25;
    // Pass-the-phone motion: a slow sway and a breathing scale, both quickening with the fuse.
    const sway = reduced ? 0 : Math.sin(t * (1.1 + urgency * 3)) * (2 + urgency * 5);
    const tilt = reduced ? 0 : Math.sin(t * (0.7 + urgency * 2)) * (0.02 + urgency * 0.05);
    const hover = reduced ? 0 : Math.sin(t * (1.4 + urgency * 3)) * (2 + urgency * 3);
    const cy = groundY - radius * 1.05 + hover;

    // 1. Ground shadow — an ELLIPSE, not a circle: that foreshortening is what puts the bomb on a
    //    floor instead of on a flat backdrop. It tightens and darkens as the bomb rises.
    const shadowSpread = radius * (1.15 - urgency * 0.12);
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

    // 5. The fuse. Its drawn length IS the remaining fuse: the cord shortens in screen space toward
    //    the bomb as urgency climbs, and the spark rides its end. Same signal as the DOM fuse bar,
    //    same source — no second clock.
    const capW = radius * 0.34;
    const capH = radius * 0.26;
    ctx.fillStyle = '#1c2533';
    ctx.beginPath();
    ctx.rect(-capW / 2, -radius - capH * 0.75, capW, capH);
    ctx.fill();

    const fuseFull = radius * 1.15;
    const fuseLen = fuseFull * (1 - urgency);
    const baseX = 0;
    const baseY = -radius - capH * 0.7;
    const tipX = baseX + fuseLen * 0.75;
    const tipY = baseY - fuseLen * 0.8;
    if (fuseLen > 1) {
      ctx.strokeStyle = '#c9a227';
      ctx.lineWidth = Math.max(2, radius * 0.055);
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(baseX, baseY);
      ctx.quadraticCurveTo(baseX + fuseLen * 0.1, baseY - fuseLen * 0.6, tipX, tipY);
      ctx.stroke();
    }

    // 6. Spark at the burning end. shadowBlur is the glow; under reduced motion it stops flickering
    //    but stays lit, because it is the thing that says the fuse is still burning.
    const flicker = reduced ? 1 : 0.75 + Math.abs(Math.sin(t * 22)) * 0.25;
    ctx.save();
    ctx.shadowColor = 'rgba(245, 158, 11, 0.9)';
    ctx.shadowBlur = (10 + urgency * 22) * flicker;
    ctx.fillStyle = '#fde68a';
    ctx.beginPath();
    ctx.arc(tipX, tipY, Math.max(2.5, radius * 0.07 * flicker), 0, Math.PI * 2);
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
    paint(surface === 'boom' ? 1 : (readUrgency() ?? 0), surface === 'boom');
  }

  function frame(): void {
    rafId = 0;
    const surface = readSurface();

    if (surface !== lastSurface) {
      lastSurface = surface;
      // The canvas only occupies space while there is a round to show, so the setup and idle screens
      // keep their full height at 320px.
      canvas.hidden = surface === 'off';
      if (surface !== 'off') resize();
    }

    if (surface !== 'off') {
      const urgency = surface === 'boom' ? 1 : (readUrgency() ?? 0);
      // Under reduced motion nothing on this canvas moves except the fuse, and the engine already
      // throttles that to coarse steps — so an unchanged urgency has nothing new to paint. Skipping
      // it costs a comparison and saves a full redraw per frame on the devices least able to afford
      // one. Never skipped otherwise: the wobble is what needs those frames.
      if (!(reduceQuery?.matches === true && urgency === lastPainted)) {
        paint(urgency, surface === 'boom');
        lastPainted = urgency;
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
