// The zones reveal (gh#315, the game named in copy.ts): the round's live field stands in four colour zones; the
// verdict lands name by name, one zone after another; the names that did not pass sit down (their chip lowers
// and tilts back as it dims and is struck through), the names that passed light gold; each zone's badge counts
// who sat, and the band counts down to the survivors.
//
// Design: design/Gh315Zones.dc.html, owner pick 2026-11-16 -- Z1 A FOUR BLOCKS, Z2 B NAMES SIT IN THEIR ZONES,
// frames zn-reveal and zn-result. Its 3D intent: panels are rounded planes in the night space, names one
// canvas-texture atlas on an instanced mesh, the camera fixed. Frames not drawn here: zn-rm and zn-fallback are
// the host's 2D view. zn-idle is the projector's pre-draw frame (src/play/prize-draw/zones-idle.ts): the MC's press
// commits the draw, this module mounts on that commit, and the wave starts at once in the zones the room already
// stands in.
//
// What this module does NOT do: choose anything. plan.ts turns the committed outcome into a timeline, assigns
// zones from the event key, the round and the live field alone, and refuses a plan it cannot draw as given;
// every per-chip fate below is read off that plan, never off the outcome. It owns no loop (the host ticks it), no fallback (the host draws the 2D
// view), and allocates GPU resources only through `context.own`.

import {
  CanvasTexture,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  LinearFilter,
  Mesh,
  PerspectiveCamera,
  PlaneGeometry,
  Scene,
  ShaderMaterial,
} from 'three';
import type { GameCommand, GameContext, GameEvent, RevealHandle, RevealInput, RevealModule, Viewport } from '../../_prize-reveal/game-contract.ts';
import { FIGURE_H, FIGURE_W, paintBand, paintFigure, paintTop, surface, type Paintable } from '../../prize-fireworks/renderer/paint.ts';
import {
  BAND_CY,
  COPY,
  FRAME_H,
  FRAME_W,
  GRID,
  NAME_BOX,
  PANEL,
  T,
  ZONES,
  ZONE_COUNT,
  badgeAt,
  bandAt,
  beatsIn,
  headBox,
  panelBox,
  planFor,
  topDots,
  topLabel,
  zoneGrid,
  type Band,
} from './plan.ts';
import type { Fit } from '../../prize-fireworks/renderer/text-fit.ts';
import { ATLAS_PAD_Y, COLOR, FACES, fitNames, paintHead, paintNameAtlas } from './paint.ts';

// Instance types read off the classes: three ships no declarations (see _prize-reveal/three-shim.d.ts).
type CanvasTextureT = InstanceType<typeof CanvasTexture>;
type ShaderMaterialT = InstanceType<typeof ShaderMaterial>;
type SceneT = InstanceType<typeof Scene>;
type PlaneGeometryT = InstanceType<typeof PlaneGeometry>;
type MeshT = InstanceType<typeof Mesh>;
type Own = GameContext['own'];

/** 35mm-equivalent vertical field of view, as the fireworks and cards reveals. */
const VFOV_DEG = (2 * Math.atan(12 / 35) * 180) / Math.PI;
/** A passed chip's glow: the board's 16px blur is a gaussian of sigma 8; the quad keeps 3 sigma past the chip. */
const GLOW_SIGMA = 8;
const CHIP_PAD = Math.max(3 * GLOW_SIGMA, ATLAS_PAD_Y);
/** The fireworks band painter centres the band on frame y 965 (its 190px band); this band is 170px tall. */
const FIREWORKS_BAND_CY = 965;
const BAND_SHIFT = BAND_CY - FIREWORKS_BAND_CY;
/** Band canvas: from here to the bottom holds both side columns of the lower band. */
const BAND_TOP = 860;

const hexRgb = (hex: string): [number, number, number] => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255) as [number, number, number];
const glsl = (hex: string): string => `vec3(${hexRgb(hex).map((v) => v.toFixed(4)).join(', ')})`;
const f = (v: number): string => v.toFixed(2);

const QUAD_VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;
const TEX_FRAG = /* glsl */ `
uniform sampler2D uMap;
varying vec2 vUv;
void main() {
  gl_FragColor = texture2D(uMap, vec2(vUv.x, 1.0 - vUv.y));
}`;

const GROUND_VERT = /* glsl */ `
varying float vY;
void main() {
  vY = uv.y;
  gl_Position = vec4(position.xy * 2.0, 0.0, 1.0);
}`;
const GROUND_FRAG = /* glsl */ `
varying float vY;
void main() {
  gl_FragColor = vec4(mix(${glsl(COLOR.groundBottom)}, ${glsl(COLOR.groundTop)}, vY), 1.0);
}`;

/** A zone panel: a rounded plane, its tint, a 3px rim in the zone colour. */
const PANEL_FRAG = /* glsl */ `
uniform vec3 uFill;
uniform vec3 uRim;
uniform vec2 uSize;
varying vec2 vUv;
float box(vec2 p, vec2 b, float r) {
  vec2 q = abs(p) - b + r;
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
}
void main() {
  vec2 p = (vUv - 0.5) * uSize;
  float d = box(p, uSize * 0.5, ${f(PANEL.radius)});
  float aa = max(fwidth(d), 0.0001);
  float inside = 1.0 - smoothstep(-aa, aa, d);
  float inner = 1.0 - smoothstep(-aa, aa, d + ${f(PANEL.rim)});
  vec3 col = mix(uRim, uFill, inner);
  gl_FragColor = vec4(col, 1.0) * inside;
}`;

const CHIP_VERT = /* glsl */ `
attribute vec4 aRect;
attribute vec4 aPlain;
attribute vec4 aStruck;
attribute vec2 aVerdict;
attribute float aFit;
uniform float uTime;
varying vec2 vP;
varying vec2 vHalf;
varying float vIn;
varying float vOut;
varying float vFit;
varying vec4 vPlain;
varying vec4 vStruck;
void main() {
  vFit = aFit;
  vec2 halfSize = aRect.zw * 0.5;
  vec2 ext = halfSize + vec2(${f(CHIP_PAD)} * vFit);
  vec2 local = position.xy * 2.0 * ext;
  float u = clamp((uTime - aVerdict.x) / ${f(T.verdict)}, 0.0, 1.0);
  u = 1.0 - (1.0 - u) * (1.0 - u) * (1.0 - u);
  float pass = aVerdict.y;
  vIn = pass * u;
  vOut = (1.0 - pass) * u;
  // A seated name lowers and tilts back about its own horizontal axis. The drop scales with the chip: it is what
  // the grid's scale reserves room for, so the pose a name ends in stays inside its panel.
  float ang = radians(${f(T.tiltDeg)}) * vOut;
  float cy = aRect.y + ${f(T.lowerPx)} * vFit * vOut;
  vec3 p = vec3(aRect.x - ${f(FRAME_W / 2)} + local.x, ${f(FRAME_H / 2)} - cy + local.y * cos(ang), -local.y * sin(ang));
  vP = vec2(local.x, -local.y);
  vHalf = halfSize;
  vPlain = aPlain;
  vStruck = aStruck;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
}`;

const CHIP_FRAG = /* glsl */ `
uniform sampler2D uAtlas;
varying vec2 vP;
varying vec2 vHalf;
varying float vIn;
varying float vOut;
varying float vFit;
varying vec4 vPlain;
varying vec4 vStruck;
float box(vec2 p, vec2 b, float r) {
  vec2 q = abs(p) - b + r;
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
}
vec4 over(vec4 top, vec4 under) { return top + under * (1.0 - top.a); }
float mask(vec4 rect, vec2 lo, vec2 size, vec2 p) {
  vec2 t = (p - lo) / size;
  if (t.x < 0.0 || t.y < 0.0 || t.x > 1.0 || t.y > 1.0) return 0.0;
  return texture2D(uAtlas, mix(rect.xy, rect.zw, t)).a;
}
void main() {
  float d = box(vP, vHalf, vHalf.y);
  float aa = max(fwidth(d), 0.0001);
  float inside = 1.0 - smoothstep(-aa, aa, d);
  float inner = 1.0 - smoothstep(-aa, aa, d + 2.0 * vFit);
  // Passed: gold with the glow. Did not pass: the fill clears to a 2px inset ring. Both scale with the chip.
  float sigma = ${f(GLOW_SIGMA)} * vFit;
  float glow = d > 0.0 ? 0.45 * exp(-(d * d) / (2.0 * sigma * sigma)) : 0.0;
  vec4 col = vec4(${glsl(COLOR.gold)}, 1.0) * glow * vIn;
  vec3 fill = mix(${glsl(COLOR.raised)}, ${glsl(COLOR.gold)}, vIn);
  col = over(vec4(fill, 1.0) * inside * (1.0 - vOut), col);
  col = over(vec4(${glsl(COLOR.raised)}, 1.0) * clamp(inside - inner, 0.0, 1.0) * vOut, col);
  // The atlas cell this chip samples: its own name box (the chip less its padding) and its height plus the pad,
  // both in the grid's unscaled units, so both scale by vFit exactly as the cell's quad does.
  vec2 boxSize = vec2(vHalf.x * 2.0 - ${f(2 * GRID.chipPadX)} * vFit, vHalf.y * 2.0 + ${f(2 * ATLAS_PAD_Y)} * vFit);
  vec2 lo = -boxSize * 0.5;
  float m = mix(mask(vPlain, lo, boxSize, vP), mask(vStruck, lo, boxSize, vP), vOut);
  vec3 ink = mix(mix(${glsl(COLOR.ink)}, ${glsl(COLOR.onGold)}, vIn), ${glsl(COLOR.out)}, vOut);
  col = over(vec4(ink, 1.0) * m, col);
  gl_FragColor = col;
}`;

/** Render order: ground, panels, chips, text. */
const LAYER = { ground: 0, panels: 10, chips: 20, text: 30 } as const;

function world(x: number, y: number): [number, number, number] {
  return [x - FRAME_W / 2, FRAME_H / 2 - y, 0];
}

function backingScale(vp: Viewport): number {
  return Math.min(2, Math.max(0.5, Math.min(vp.cssWidth / FRAME_W, vp.cssHeight / FRAME_H) * vp.dpr));
}

function canvasTexture(own: Own, paint: Paintable): CanvasTextureT {
  const tex = own(new CanvasTexture(paint.canvas));
  tex.flipY = false;
  tex.premultiplyAlpha = true;
  tex.generateMipmaps = false;
  tex.minFilter = LinearFilter;
  tex.magFilter = LinearFilter;
  return tex;
}

function overlayMaterial(own: Own, extra: Record<string, unknown>): ShaderMaterialT {
  return own(new ShaderMaterial({ transparent: true, premultipliedAlpha: true, depthTest: false, depthWrite: false, ...extra }));
}

/** A text panel: a frame-px canvas shown as a quad at its frame position. Repaints reuse the canvas. */
class TextPanel {
  readonly mesh: MeshT;
  private readonly material: ShaderMaterialT;
  private paint: Paintable | null = null;
  private tex: CanvasTextureT | null = null;
  private readonly own: Own;
  private readonly doc: Document;
  constructor(own: Own, doc: Document, quad: PlaneGeometryT, scene: SceneT, order: number, name: string) {
    this.own = own;
    this.doc = doc;
    this.material = overlayMaterial(own, { uniforms: { uMap: { value: null } }, vertexShader: QUAD_VERT, fragmentShader: TEX_FRAG });
    this.mesh = new Mesh(quad, this.material);
    this.mesh.name = name;
    this.mesh.renderOrder = order;
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
    scene.add(this.mesh);
  }
  /** Paint a w x h frame-px canvas at `scale`, and place its top-left at frame (x, y). */
  draw(x: number, y: number, w: number, h: number, scale: number, fn: (p: Paintable) => void): void {
    if (!this.paint || this.paint.w !== w || this.paint.h !== h || this.paint.scale !== scale) {
      this.tex?.dispose();
      this.paint = surface(this.doc, w, h, scale);
      this.tex = canvasTexture(this.own, this.paint);
      this.material.uniforms.uMap!.value = this.tex;
    } else {
      const { ctx, canvas } = this.paint;
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.restore();
    }
    fn(this.paint);
    this.tex!.needsUpdate = true;
    const [wx, wy] = world(x + w / 2, y + h / 2);
    this.mesh.position.set(wx, wy, 0);
    this.mesh.scale.set(w, h, 1);
    this.mesh.visible = true;
  }
}

function mountZones(context: GameContext, input: RevealInput<'zones'>, emit: (event: GameEvent) => void): RevealHandle {
  const plan = planFor(input);
  const { own, renderer, signal } = context;
  const doc = context.root.ownerDocument;
  const names = new Map(input.people.map((p) => [p.id, p.name]));
  let viewport: Viewport = input.viewport;
  let scale = backingScale(viewport);

  const scene = new Scene();
  const camera = new PerspectiveCamera(VFOV_DEG, 16 / 9, 10, 10000);
  const quad = own(new PlaneGeometry(1, 1));
  const ground = new Mesh(quad, overlayMaterial(own, { transparent: false, vertexShader: GROUND_VERT, fragmentShader: GROUND_FRAG }));
  ground.name = 'ground';
  ground.renderOrder = LAYER.ground;
  ground.frustumCulled = false;
  scene.add(ground);

  function fitCamera(): void {
    const aspect = viewport.cssWidth / Math.max(1, viewport.cssHeight);
    const tanHalf = Math.tan((VFOV_DEG * Math.PI) / 360);
    // The whole frame stays in view: height-limited on a wide screen, width-limited on a narrow one.
    const dist = Math.max(FRAME_H / 2 / tanHalf, FRAME_W / 2 / (tanHalf * aspect));
    camera.aspect = aspect;
    camera.near = dist * 0.1;
    camera.far = dist * 4;
    camera.position.set(0, 0, dist);
    camera.updateProjectionMatrix();
  }

  // ---- the four zone panels: fixed planes; the room keeps its spatial map
  for (let k = 0; k < ZONE_COUNT; k++) {
    const b = panelBox(k);
    const material = overlayMaterial(own, {
      uniforms: { uFill: { value: hexRgb(ZONES[k]!.tint) }, uRim: { value: hexRgb(ZONES[k]!.color) }, uSize: { value: [b.w, b.h] } },
      vertexShader: QUAD_VERT,
      fragmentShader: PANEL_FRAG,
    });
    const mesh = new Mesh(quad, material);
    mesh.name = `zone-${k}`;
    mesh.renderOrder = LAYER.panels;
    mesh.frustumCulled = false;
    mesh.position.set(...world(b.x + b.w / 2, b.y + b.h / 2));
    mesh.scale.set(b.w, b.h, 1);
    scene.add(mesh);
  }

  // ---- the names: one instanced quad per participant, in roster order
  const n = plan.chips.length;
  const geometry = own(new InstancedBufferGeometry());
  // Own copies of the quad's buffers: disposing this geometry must not free the shared quad's.
  geometry.setIndex(quad.index!.clone());
  geometry.setAttribute('position', quad.getAttribute('position').clone());
  geometry.instanceCount = n;
  const attr = (size: number, values?: number[]): InstanceType<typeof InstancedBufferAttribute> =>
    new InstancedBufferAttribute(values ? new Float32Array(values) : new Float32Array(n * size), size);
  const aRect = attr(4);
  const aPlain = attr(4);
  const aStruck = attr(4);
  // The scale each chip's grid took, so its padding, glow and drop scale with it.
  const aFit = attr(1);
  // Each chip's fate and moment, read off the plan.
  const aVerdict = attr(2, plan.chips.flatMap((c) => [c.verdictAt, c.pass ? 1 : 0]));
  for (const [name, a] of Object.entries({ aRect, aPlain, aStruck, aFit, aVerdict })) geometry.setAttribute(name, a);
  const chipMaterial = overlayMaterial(own, {
    uniforms: { uTime: { value: 0 }, uAtlas: { value: null } },
    vertexShader: CHIP_VERT,
    fragmentShader: CHIP_FRAG,
  });
  const chips = new Mesh(geometry, chipMaterial);
  chips.name = 'chips';
  chips.renderOrder = LAYER.chips;
  chips.frustumCulled = false;
  scene.add(chips);

  const chipNames = plan.chips.map((c) => names.get(c.id) ?? '');
  let atlasTex: CanvasTextureT | null = null;
  const buildChips = (): void => {
    const fits = new Array<Fit>(n);
    // Heights and name boxes stay in the grid's unscaled units: the atlas paints in those and the shader maps
    // each cell over the chip's scaled box.
    const heights = new Array<number>(n).fill(GRID.minRow);
    const boxes = new Array<number>(n).fill(NAME_BOX);
    for (const z of plan.zones) {
      const members = plan.chips.filter((c) => c.zone === z.index).sort((a, b) => a.slot - b.slot);
      const memberNames = members.map((c) => chipNames[c.index]!);
      // A grown column narrows the name box, so the fit is asked again at every width the grid tries. Cached, so
      // the fit the grid was chosen on is exactly the fit painted.
      const tried = new Map<number, Fit[]>();
      const fitsAt = (box: number): Fit[] => {
        let f = tried.get(box);
        if (!f) {
          f = fitNames(doc, memberNames, box);
          tried.set(box, f);
        }
        return f;
      };
      const layout = zoneGrid(z.index, members.length, (box) => fitsAt(box).map((f) => f.lines.length));
      const chosen = fitsAt(layout.nameBox);
      members.forEach((c, j) => {
        const cell = layout.cells[j]!;
        aRect.set([cell.cx, cell.cy, cell.w, cell.h], c.index * 4);
        aFit.set([layout.scale], c.index);
        fits[c.index] = chosen[j]!;
        heights[c.index] = layout.rowH[Math.floor(j / layout.cols)]!;
        boxes[c.index] = layout.nameBox;
      });
    }
    aRect.needsUpdate = true;
    aFit.needsUpdate = true;
    const atlas = paintNameAtlas(doc, chipNames, fits, heights, scale, boxes);
    atlas.plain.forEach((cell, i) => aPlain.set(cell, i * 4));
    atlas.struck.forEach((cell, i) => aStruck.set(cell, i * 4));
    aPlain.needsUpdate = true;
    aStruck.needsUpdate = true;
    atlasTex?.dispose();
    atlasTex = canvasTexture(own, atlas.paint);
    chipMaterial.uniforms.uAtlas!.value = atlasTex;
  };
  buildChips();

  // ---- the frame's text: the top bar, the zone headers, the band's side columns, the band's centre
  const top = new TextPanel(own, doc, quad, scene, LAYER.text, 'top');
  const heads = Array.from({ length: ZONE_COUNT }, (_, k) => new TextPanel(own, doc, quad, scene, LAYER.text, `head-${k}`));
  const band = new TextPanel(own, doc, quad, scene, LAYER.text, 'band');
  const centre = new TextPanel(own, doc, quad, scene, LAYER.text + 1, 'centre');
  let headKeys: string[] = [];
  let bandKey = '';
  let centreKey = '';
  const paintTopBar = (): void => {
    top.draw(0, 0, FRAME_W, 96, scale, (p) => paintTop(p, input.eventName, topLabel(plan), topDots(plan)));
  };
  paintTopBar();
  const paintHeadsAt = (t: number): void => {
    for (let k = 0; k < ZONE_COUNT; k++) {
      const badge = badgeAt(plan, k, t);
      if (headKeys[k] === badge) continue;
      headKeys[k] = badge;
      const b = headBox(k);
      heads[k]!.draw(b.x, b.y, b.w, b.h, scale, (p) => paintHead(p, ZONES[k]!.color, COPY.zoneLabel[k]!, badge));
    }
  };
  const paintBandAt = (b: Band): void => {
    const key = `${b.left}|${b.right.kind === 'text' ? b.right.text : 'legend'}`;
    if (key !== bandKey) {
      bandKey = key;
      const right = b.right.kind === 'text' ? b.right : { kind: 'legend' as const, passed: COPY.passed, notPassed: COPY.notPassed };
      band.draw(0, BAND_TOP, FRAME_W, FRAME_H - BAND_TOP, scale, (p) => {
        // The band painter works in frame px around its own band centre; this canvas starts at BAND_TOP.
        p.ctx.save();
        p.ctx.translate(0, BAND_SHIFT - BAND_TOP);
        paintBand(p, b.left, COPY.gameName, right);
        p.ctx.restore();
      });
    }
    const ckey = String(b.figure.value);
    if (ckey !== centreKey) {
      centreKey = ckey;
      centre.draw(FRAME_W / 2 - FIGURE_W / 2, BAND_CY - FIGURE_H / 2, FIGURE_W, FIGURE_H, scale, (p) => paintFigure(p, b.figure, COPY.people));
    }
  };

  const update = (t: number): void => {
    chipMaterial.uniforms.uTime!.value = t;
    paintHeadsAt(t);
    paintBandAt(bandAt(plan, t));
  };
  const rebuildText = (): void => {
    buildChips();
    paintTopBar();
    headKeys = [];
    bandKey = '';
    centreKey = '';
  };

  fitCamera();
  update(0);
  renderer.render(scene, camera);

  // A face still loading paints with a fallback; repaint every text once the board's faces are in.
  const fonts = doc.fonts as FontFaceSet | undefined;
  if (fonts && !FACES.every((face) => fonts.check(face))) {
    Promise.all(FACES.map((face) => fonts.load(face))).then(
      () => {
        if (!signal.aborted) rebuildText();
      },
      () => {},
    );
  }

  let last = -1;
  let now = 0;
  let completed = false;
  let disposed = false;
  const complete = (): void => {
    if (completed) return;
    completed = true;
    emit({ type: 'complete' });
  };

  return {
    advance(command: GameCommand): void {
      if (disposed || signal.aborted) return;
      if (command.type === 'tick') {
        const t = command.elapsedMs;
        const due = beatsIn(plan, last, t);
        last = t;
        // Draw first, then report: the frame a beat names is on screen before the event that may end the
        // reveal, and nothing is drawn after the host disposes.
        now = Math.min(t, plan.total);
        update(now);
        renderer.render(scene, camera);
        for (const event of due) {
          if (event.type === 'complete') complete();
          else emit(event);
          if (signal.aborted) return;
        }
      } else if (command.type === 'resize') {
        viewport = command.viewport;
        const next = backingScale(viewport);
        fitCamera();
        if (next !== scale) {
          scale = next;
          rebuildText();
        }
        update(now);
      } else if (command.type === 'finish') {
        complete();
      }
    },
    dispose(): void {
      if (disposed) return;
      disposed = true;
      scene.clear();
    },
  };
}

export const reveal: RevealModule<'zones'> = { mount: mountZones };
