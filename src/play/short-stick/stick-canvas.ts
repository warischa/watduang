// The play surface for short-stick: the bundle of sticks is DRAWN in Canvas 2D with hand-built depth
// (owner request 2026-08-30), so the draw board reads as a game rather than a row of flat rectangles.
//
// CANVAS 2D, NEVER WebGL, and that is a decision rather than a preference: the WebGL mockup this site
// was offered overwrites document.body with an error string when getContext('webgl') returns null, and
// a play surface that can blank the page is not shippable to a low-end Android audience. Everything
// below is hand-drawn depth -- a projected elliptical ground shadow, a cylinder gradient across each
// stick, a vertical shade down its length, an offset specular strip -- which needs no library and has
// no hard failure mode. Idiom follows src/play/timebomb/bomb-canvas.ts: backing store sized to
// devicePixelRatio, ctx.scale(dpr, dpr) inside one save/restore, gradients and shadowBlur for depth.
//
// THIS RENDERER TOUCHES NO GAME STATE. It never reads or writes `game`, never generates a length,
// never decides a winner. Every frame it MEASURES the DOM main.js already renders -- the .straw-unit
// elements, their .straw-btn boxes (whose height main.js sets from the drawn length), and the
// used / is-short / drawing classes -- and paints that. The fairness lock in main.js
// (stickCount = players.length, shortCount = 1, pinned by fairness.test.mjs) is therefore untouched
// and untouchable from here: there is no code path from this file into the shuffle.
//
// It also owns no layout. The buttons keep their flex-wrap positions, which is what keeps ten seats at
// >=44px tap targets in a 320px viewport (see the .straw-unit rule in overrides.css); the art is drawn
// INSIDE each button's own box, so a stick's pixels can never drift onto a neighbour's hit area and
// draw the wrong stick.

/** One stick, measured from the DOM rather than from game state. Coordinates are canvas-local CSS px. */
interface Stick {
  /** Centre x of the stick's foot, and the ground line it stands on. */
  baseX: number;
  groundY: number;
  /** Height and width of the button box -- main.js writes the height, so a revealed stick is short. */
  height: number;
  width: number;
  /** Perspective depth: how far behind the picture plane this stick sits. */
  depth: number;
  used: boolean;
  isShort: boolean;
  drawing: boolean;
  /** Stable per-stick phase, so the idle sway is not in lockstep across the bundle. */
  phase: number;
}

/** Hand-rolled perspective: a point sitting `depth` behind the picture plane shrinks by this factor.
 *  One divide, no matrices -- the whole scene is one bundle standing on one ground plane. */
function perspective(depth: number): number {
  const focal = 520;
  return focal / (focal + depth);
}

/** The lean of a stick's top toward the centre of its row, in CSS px, HARD CAPPED. The cap is not
 *  cosmetic: the tap target is the button box the DOM laid out, so art that leans further than the
 *  slack inside that box would sit over a neighbour's hit area. 5px keeps the drawn top inside a
 *  44px button around a ~34px stick with a pixel to spare. */
const MAX_LEAN = 5;

export interface StickCanvas {
  /** Draws one frame from the current DOM -- exported so a probe can force a frame without rAF. */
  drawOnce(): void;
  stop(): void;
}

export function startStickCanvas(canvas: HTMLCanvasElement, grid: HTMLElement): StickCanvas {
  const ctx = canvas.getContext('2d');
  const reduceQuery =
    typeof window.matchMedia === 'function' ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;

  let width = 0;
  let height = 0;
  let dpr = 1;
  let rafId = 0;
  let lastSignature = '';

  function resize(): void {
    const rect = canvas.getBoundingClientRect();
    dpr = window.devicePixelRatio || 1;
    width = rect.width;
    height = rect.height;
    // The backing store is sized in device pixels and the context scaled back down, or every edge
    // drawn below is soft on a phone (dpr 2 and 3 are the common cases).
    canvas.width = Math.max(1, Math.round(rect.width * dpr));
    canvas.height = Math.max(1, Math.round(rect.height * dpr));
    // Writing canvas.width WIPES the bitmap. The reduced-motion skip below can then return before the
    // next paint and leave the board blank for good -- which is exactly what a 320px reduced-motion
    // capture measured: coverage 0.0000, on every sample, with correct geometry. Dropping the cached
    // signature here makes "the canvas was just cleared" always imply "repaint this frame".
    lastSignature = '';
  }

  /** Measures the bundle. Rows come out of the layout itself: .stick-grid wraps, so units sharing a
   *  bottom edge share a ground line, and a row further UP the stage is a row further BACK -- that is
   *  the coarse depth. Within a row, distance from the middle is the fine depth, so the bundle fans
   *  away at its edges. */
  function readSticks(): Stick[] {
    const box = canvas.getBoundingClientRect();
    const units = Array.from(grid.querySelectorAll<HTMLElement>('.straw-unit'));
    if (units.length === 0) return [];

    // Group by ground line before any depth is assigned. Rounded to 2px: sub-pixel layout noise would
    // otherwise split one visual row into two.
    const rowOf = new Map<HTMLElement, number>();
    const groundLines: number[] = [];
    for (const unit of units) {
      const bottom = Math.round(unit.getBoundingClientRect().bottom / 2) * 2;
      let row = groundLines.indexOf(bottom);
      if (row === -1) {
        row = groundLines.length;
        groundLines.push(bottom);
      }
      rowOf.set(unit, row);
    }
    // Highest on screen = furthest back. groundLines is in DOM order, which for a wrapping flex row is
    // top-to-bottom, but sorting makes that an assertion rather than an assumption.
    const backToFront = [...groundLines].sort((a, b) => a - b);

    const sticks: Stick[] = [];
    units.forEach((unit, index) => {
      const btn = unit.querySelector<HTMLElement>('.straw-btn');
      if (!btn) return;
      // The BUTTON's box, not the unit's: main.js writes the drawn length into btn.style.height, and
      // its CSS transform carries the pull animation. Reading the rect inherits both for free.
      const rect = btn.getBoundingClientRect();
      const rowIndex = rowOf.get(unit) ?? 0;
      const rowDepth = backToFront.indexOf(groundLines[rowIndex]) * 70;

      const peers = units.filter((u) => rowOf.get(u) === rowIndex);
      const seat = peers.indexOf(unit);
      const middle = (peers.length - 1) / 2;
      const spread = middle === 0 ? 0 : Math.abs(seat - middle) / middle;

      sticks.push({
        baseX: rect.left + rect.width / 2 - box.left,
        groundY: unit.getBoundingClientRect().bottom - box.top - 22,
        height: rect.height,
        width: rect.width,
        depth: rowDepth + spread * 55,
        used: unit.classList.contains('used'),
        isShort: unit.classList.contains('is-short'),
        drawing: unit.classList.contains('drawing'),
        phase: index * 1.7,
      });
    });
    return sticks;
  }

  /** One stick: ground shadow, tapered body, shade down the length, specular strip, cut end.
   *  Called back-to-front by paint(), so a nearer stick overlaps the one behind it. */
  function drawStick(c: CanvasRenderingContext2D, s: Stick, t: number): void {
    const scale = perspective(s.depth);
    const drawH = s.height * scale;
    // Foot half-width. 0.42 of the button box leaves the tap target visibly wider than the art, which
    // is the margin the MAX_LEAN cap is spending.
    const footHalf = s.width * 0.42 * scale;
    // The top is narrower than the foot: a cylinder receding from the eye foreshortens, and this taper
    // is what stops the stick reading as a flat bar.
    const topHalf = footHalf * 0.8;

    const toMiddle = width / 2 - s.baseX;
    const lean = Math.max(-MAX_LEAN, Math.min(MAX_LEAN, toMiddle * 0.05));
    // Idle sway: the bundle breathes, so an untouched board is not a still image. Off performance.now()
    // like the timebomb renderer, which is absolute -- a throttled tab resumes where the wall clock is.
    const sway = t === 0 ? 0 : Math.sin(t * 1.1 + s.phase) * 1.2;

    const footY = s.groundY;
    const topY = footY - drawH;
    const topX = s.baseX + lean + sway;

    // 1. Ground shadow -- an ELLIPSE, not a circle: that foreshortening is what puts the bundle on a
    //    floor instead of on a flat backdrop. A stick further back casts a wider, fainter one.
    c.save();
    c.translate(s.baseX, footY);
    c.scale(1, 0.3);
    const shadowR = footHalf * 2.4;
    const shadowGrad = c.createRadialGradient(0, 0, footHalf * 0.2, 0, 0, shadowR);
    shadowGrad.addColorStop(0, `rgba(41, 37, 36, ${0.42 * scale})`);
    shadowGrad.addColorStop(1, 'rgba(41, 37, 36, 0)');
    c.fillStyle = shadowGrad;
    c.beginPath();
    c.arc(0, 0, shadowR, 0, Math.PI * 2);
    c.fill();
    c.restore();

    // 2. Body. Bamboo when in play, rose when the short one has surfaced, greyed once spent -- the same
    //    three states style.css gave the flat button, so nothing the player learned changes meaning.
    const palette = s.used
      ? s.isShort
        ? { light: '#fda4af', mid: '#e11d48', dark: '#881337' }
        : { light: '#e7e0d2', mid: '#a8a29e', dark: '#57534e' }
      : { light: '#fef08a', mid: '#d97706', dark: '#7c3d09' };

    const path = new Path2D();
    path.moveTo(s.baseX - footHalf, footY);
    path.lineTo(topX - topHalf, topY);
    // A rounded cut end, drawn as one curve across the top rather than a flat lid.
    path.quadraticCurveTo(topX, topY - topHalf * 0.75, topX + topHalf, topY);
    path.lineTo(s.baseX + footHalf, footY);
    path.closePath();

    c.save();
    if (s.used && s.isShort) {
      // The reveal is the moment the round turns on, so the short stick is the one thing that glows.
      c.shadowColor = 'rgba(225, 29, 72, 0.85)';
      c.shadowBlur = 18;
    }
    // Across the width: light -> mid -> dark is the whole cylinder illusion. A flat fill here reads as
    // a rectangle no matter what else is drawn.
    const bodyGrad = c.createLinearGradient(s.baseX - footHalf, 0, s.baseX + footHalf, 0);
    bodyGrad.addColorStop(0, palette.light);
    bodyGrad.addColorStop(0.38, palette.mid);
    bodyGrad.addColorStop(1, palette.dark);
    c.fillStyle = bodyGrad;
    c.fill(path);
    c.restore();

    // 3. Shade DOWN the length: the foot sits in the shadow of the bundle, the head catches the light.
    //    Clipped to the body so the wash cannot leak past the silhouette.
    c.save();
    c.clip(path);
    const depthGrad = c.createLinearGradient(0, topY, 0, footY);
    depthGrad.addColorStop(0, 'rgba(255, 244, 214, 0.14)');
    depthGrad.addColorStop(0.45, 'rgba(255, 255, 255, 0)');
    depthGrad.addColorStop(1, 'rgba(28, 25, 23, 0.45)');
    c.fillStyle = depthGrad;
    c.fillRect(s.baseX - footHalf - 2, topY - topHalf, footHalf * 2 + 4, drawH + topHalf * 2);

    // 4. Specular strip, OFF CENTRE toward the light. A centred one reads as a seam, not a reflection.
    const specGrad = c.createLinearGradient(s.baseX - footHalf, 0, s.baseX + footHalf, 0);
    specGrad.addColorStop(0.1, 'rgba(255, 255, 255, 0)');
    specGrad.addColorStop(0.26, `rgba(255, 255, 255, ${s.used ? 0.3 : 0.62})`);
    specGrad.addColorStop(0.42, 'rgba(255, 255, 255, 0)');
    c.fillStyle = specGrad;
    c.fillRect(s.baseX - footHalf - 2, topY, footHalf * 2 + 4, drawH);
    c.restore();

    // 5. Outline last, so the silhouette stays crisp over the washes -- the mockup's own heavy-ink look.
    c.strokeStyle = 'rgba(41, 37, 36, 0.9)';
    c.lineWidth = Math.max(1, 1.6 * scale);
    c.stroke(path);

    // 6. The cut end, as an ellipse sitting ON the top rather than a line across it. This is the second
    //    depth cue after the shadow: you are looking slightly DOWN at the bundle, so you see the end.
    //    ctx.ellipse rather than scale()+arc, so the outline keeps an even weight -- squashing the
    //    context stretches the stroke horizontally, and the thick bright rim that produced made the
    //    sticks read as glass tubes on the first 320px capture. Kept in the wood palette for the same
    //    reason: nothing on this surface may look like a glass (site content rule).
    c.beginPath();
    c.ellipse(topX, topY, topHalf, topHalf * 0.34, 0, 0, Math.PI * 2);
    c.fillStyle = s.used && s.isShort ? '#fda4af' : s.used ? '#e7e5e4' : '#f0dda6';
    c.fill();
    c.strokeStyle = 'rgba(41, 37, 36, 0.75)';
    c.lineWidth = Math.max(1, 1.2 * scale);
    c.stroke();
  }

  function paint(sticks: Stick[]): void {
    if (!ctx || width === 0 || height === 0) return;
    const t = reduceQuery?.matches === true ? 0 : performance.now() / 1000;

    ctx.save();
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, width, height);
    // Painter's algorithm: deepest first. Without this the fan's near sticks are overlapped BY the far
    // ones and the whole depth read inverts.
    for (const s of [...sticks].sort((a, b) => b.depth - a.depth)) drawStick(ctx, s, t);
    ctx.restore();
  }

  /** Cheap change detector. Everything the picture depends on, rounded -- if this string is unchanged
   *  there is nothing new to paint, which is what keeps an idle reduced-motion board off the GPU. */
  function signature(sticks: Stick[]): string {
    return `${width}x${height}|${sticks
      .map((s) => `${Math.round(s.baseX)},${Math.round(s.groundY)},${Math.round(s.height)},${s.used ? 1 : 0}${s.isShort ? 1 : 0}${s.drawing ? 1 : 0}`)
      .join(';')}`;
  }

  function drawOnce(): void {
    resize();
    paint(readSticks());
  }

  function frame(): void {
    rafId = requestAnimationFrame(frame);
    // The canvas only occupies space while there is a board to show, so the hero and setup views keep
    // their full height at 320px.
    const live = grid.querySelector('.straw-unit') !== null && grid.getClientRects().length > 0;
    if (canvas.hidden !== !live) {
      canvas.hidden = !live;
      if (live) resize();
    }
    if (!live) return;

    if (canvas.width === 0 || canvas.getBoundingClientRect().width !== width) resize();
    const sticks = readSticks();
    // Under reduced motion nothing sways, so an unchanged board has nothing new to paint. Skipping it
    // costs one string compare and saves a full redraw per frame on the devices least able to afford
    // one. Never skipped otherwise: the sway is what needs those frames.
    if (reduceQuery?.matches === true) {
      const sig = signature(sticks);
      if (sig === lastSignature) return;
      lastSignature = sig;
    }
    paint(sticks);
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

/** What the canvas cannot say. The sticks are pixels now, so the round's state is mirrored into a live
 *  region as text. The per-stick aria-labels main.js writes on each button are untouched and still
 *  carry "choose stick N" / "stick, N cm" -- this only adds the turn and the result, which were
 *  previously silent heading updates no screen reader was told about. textContent in and textContent
 *  out: nothing here is an HTML sink, so no player name is ever parsed as markup. */
function startAnnouncer(liveEl: HTMLElement): void {
  let last = '';
  const read = (id: string): string => document.getElementById(id)?.textContent?.trim() ?? '';
  const tick = (): void => {
    const result = document.getElementById('view-result');
    const next = result?.classList.contains('active')
      ? `${read('result-loser-title')} ${read('result-loser-desc')}`.trim()
      : `${read('draw-player-name')} ${read('draw-round-step')}`.trim();
    if (next !== last) {
      last = next;
      liveEl.textContent = next;
    }
  };
  // Scoped to the two views that carry the round's state, NOT to document.body: this observer's own
  // callback ends in a textContent write, and a body-wide subtree observer would see that write and
  // re-enter. attributeFilter catches setView flipping `active`; characterData catches main.js
  // rewriting the banner text in place.
  const observer = new MutationObserver(tick);
  for (const id of ['view-draw', 'view-result']) {
    const view = document.getElementById(id);
    if (view) {
      observer.observe(view, {
        childList: true,
        subtree: true,
        characterData: true,
        attributes: true,
        attributeFilter: ['class'],
      });
    }
  }
  tick();
}

const canvasEl = document.getElementById('stick-canvas') as HTMLCanvasElement | null;
const gridEl = document.getElementById('stick-grid');
if (canvasEl && gridEl) startStickCanvas(canvasEl, gridEl);

const liveEl = document.getElementById('stick-live');
if (liveEl) startAnnouncer(liveEl);
