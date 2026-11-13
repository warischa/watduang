// The fireworks reveal (gh#305, the game named in copy.ts): an elimination round is a 10-to-0 countdown,
// five rockets bursting one after another, and the lanterns of the eliminated going dark in five waves; the
// final is five rockets side by side, bursting in prize order reversed, the last one up winning first prize.
//
// Design: the picked options of design/Gh303Fireworks.dc.html (owner pick 2026-11-11): A FIVE BURSTS for
// elimination, A SIDE BY SIDE for the final; frames fw-countdown, fw-reveal, fw-result and fwf-reveal,
// fwf-result. Their 3D intent: lanterns are one instanced mesh with the names in a canvas-texture atlas,
// bursts are additive point sprites, the camera is fixed at a 35mm-equivalent field of view.
//
// What this module does NOT do: choose anything. The committed outcome arrives in `input`; plan.ts turns it
// into a timeline and refuses an outcome it cannot draw as given. It owns no loop (the host ticks it), no
// fallback (the host draws the 2D view), and allocates GPU resources only through `context.own`. The
// board's idle frames (fw-idle, fwf-idle) are the step before the draw, so they are the stage's, not this
// module's; its reduced-motion frames are not drawn here because the host shows the 2D view instead.

import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  CircleGeometry,
  Group,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  LinearFilter,
  Mesh,
  MeshBasicMaterial,
  PerspectiveCamera,
  PlaneGeometry,
  Points,
  Scene,
  Shape,
  ShapeGeometry,
  ShaderMaterial,
} from 'three';
import type { GameCommand, GameContext, GameEvent, RevealHandle, RevealInput, RevealModule, Viewport } from '../../_prize-reveal/game-contract.ts';
import {
  BURSTS,
  COPY,
  FRAME_H,
  FRAME_W,
  FT,
  LANES_X,
  LANTERN_W,
  PAD_Y,
  PLATE_PAD_TOP,
  PLATE_UNDER_BURST,
  T,
  beatsIn,
  easeInCubic,
  easeOutCubic,
  fieldLayout,
  lowBand,
  planFor,
  rocketY,
  stillUp,
  topDots,
  topLabel,
  type FinalPlan,
  type RoundPlan,
} from './plan.ts';
import {
  ATLAS_PAD_Y,
  COLOR,
  FACES,
  FIGURE_CY,
  FIGURE_H,
  FIGURE_W,
  LANTERN_FIT,
  PLATE,
  fitLanterns,
  paintAtlas,
  paintBand,
  paintFigure,
  paintHud,
  paintPlate,
  paintResult,
  paintTop,
  surface,
  type Paintable,
} from './paint.ts';
import { randomFor } from './seed.ts';

// Instance types read off the classes: three ships no declarations (see _prize-reveal/three-shim.d.ts),
// and this form stays right if its typings are added.
type CanvasTextureT = InstanceType<typeof CanvasTexture>;
type MeshBasicMaterialT = InstanceType<typeof MeshBasicMaterial>;
type ShaderMaterialT = InstanceType<typeof ShaderMaterial>;
type SceneT = InstanceType<typeof Scene>;
type PointsT = InstanceType<typeof Points>;
type BufferGeometryT = InstanceType<typeof BufferGeometry>;
type GroupT = InstanceType<typeof Group>;
type PlaneGeometryT = InstanceType<typeof PlaneGeometry>;
type MeshT = InstanceType<typeof Mesh>;

/** 35mm-equivalent: the vertical field of view of a 35mm lens on a 24mm-tall frame. */
const VFOV_DEG = (2 * Math.atan(12 / 35) * 180) / Math.PI;
/** Lantern glow: the board's 16px box-shadow blur is a gaussian of sigma 8; the quad keeps 3 sigma. */
const GLOW_SIGMA = 8;
const GLOW_PAD = 24;
/** Where an elimination rocket starts: just below the frame. */
const LAUNCH_FROM_Y = FRAME_H + 60;
/** Burst sizes and particle budgets (MOTION rows: 1200 per burst, 3000 for the final's last). */
const BURST_RADIUS = 130;
const LAST_BURST_RADIUS = 220;
const BURST_PARTICLES = 1200;
const LAST_BURST_PARTICLES = 3000;
const TRAIL_PARTICLES = 300;
const TRAIL_LEN = 300;
/** The board says the sparks fall under gravity and gives no figure: frame px per second squared. */
const GRAVITY = 90;

const hexRgb = (hex: string): [number, number, number] => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255) as [number, number, number];
const glsl = (hex: string): string => `vec3(${hexRgb(hex).map((v) => v.toFixed(4)).join(', ')})`;
const clamp01 = (u: number): number => Math.min(1, Math.max(0, u));

const PANEL_VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;
const PANEL_FRAG = /* glsl */ `
uniform sampler2D uMap;
uniform float uOpacity;
varying vec2 vUv;
void main() {
  gl_FragColor = texture2D(uMap, vec2(vUv.x, 1.0 - vUv.y)) * uOpacity;
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

const LANTERN_VERT = /* glsl */ `
attribute vec4 aRect;
attribute vec4 aLit;
attribute vec4 aOut;
attribute float aDimAt;
uniform float uTime;
uniform float uRise;
varying vec2 vP;
varying vec2 vHalf;
varying float vDim;
varying vec4 vLit;
varying vec4 vOut;
void main() {
  vec2 halfSize = aRect.zw * 0.5;
  vec2 ext = halfSize + vec2(${GLOW_PAD.toFixed(1)});
  vec2 local = position.xy * 2.0 * ext;
  float dim = aDimAt < 0.0 ? 0.0 : clamp((uTime - aDimAt) / ${T.dim.toFixed(1)}, 0.0, 1.0);
  float rise = aDimAt < 0.0 ? uRise : 0.0;
  vec2 frame = vec2(aRect.x + local.x, aRect.y - local.y - rise);
  vP = vec2(local.x, -local.y);
  vHalf = halfSize;
  vDim = dim;
  vLit = aLit;
  vOut = aOut;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(frame.x - ${(FRAME_W / 2).toFixed(1)}, ${(FRAME_H / 2).toFixed(1)} - frame.y, 0.0, 1.0);
}`;
const LANTERN_FRAG = /* glsl */ `
uniform sampler2D uAtlas;
varying vec2 vP;
varying vec2 vHalf;
varying float vDim;
varying vec4 vLit;
varying vec4 vOut;
float box(vec2 p, vec2 b, float r) {
  vec2 q = abs(p) - b + r;
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
}
vec4 over(vec4 top, vec4 under) { return top + under * (1.0 - top.a); }
float mask(vec4 rect) {
  vec2 lo = vec2(-vHalf.x + ${LANTERN_FIT.pad.toFixed(1)}, -vHalf.y - ${ATLAS_PAD_Y.toFixed(1)});
  vec2 size = vec2(vHalf.x * 2.0 - ${(2 * LANTERN_FIT.pad).toFixed(1)}, vHalf.y * 2.0 + ${(2 * ATLAS_PAD_Y).toFixed(1)});
  vec2 t = (vP - lo) / size;
  if (t.x < 0.0 || t.y < 0.0 || t.x > 1.0 || t.y > 1.0) return 0.0;
  return texture2D(uAtlas, mix(rect.xy, rect.zw, t)).a;
}
void main() {
  // The board's lantern: 10px radius on top, 16px below.
  float d = box(vP, vHalf, vP.y < 0.0 ? 10.0 : 16.0);
  float aa = max(fwidth(d), 0.0001);
  float inside = 1.0 - smoothstep(-aa, aa, d);
  float glow = d > 0.0 ? 0.45 * exp(-(d * d) / ${(2 * GLOW_SIGMA * GLOW_SIGMA).toFixed(1)}) : 0.0;
  vec4 gold = vec4(${glsl(COLOR.gold)}, 1.0);
  vec4 lit = over(gold * inside, gold * glow);
  lit = over(vec4(${glsl(COLOR.onGold)}, 1.0) * mask(vLit), lit);
  // Dark: transparent, a 2px inset ring, the name in the not-passed grey, struck through.
  float inner = 1.0 - smoothstep(-aa, aa, d + 2.0);
  vec4 dark = vec4(${glsl(COLOR.raised)}, 1.0) * clamp(inside - inner, 0.0, 1.0);
  dark = over(vec4(${glsl(COLOR.out)}, 1.0) * mask(vOut), dark);
  gl_FragColor = mix(lit, dark, vDim);
}`;

const SPARK_VERT = /* glsl */ `
attribute vec3 aDir;
attribute vec3 aColor;
attribute float aSize;
uniform float uAge;
uniform float uRadius;
uniform float uPx;
uniform float uCam;
varying vec3 vColor;
void main() {
  float e = clamp(uAge / ${T.burstExpand.toFixed(1)}, 0.0, 1.0);
  float r = uRadius * (1.0 - pow(1.0 - e, 3.0)) + uRadius * 0.12 * max(uAge - ${T.burstExpand.toFixed(1)}, 0.0) / 1000.0;
  float s = max(uAge, 0.0) / 1000.0;
  vec3 p = aDir * r + vec3(0.0, -0.5 * ${GRAVITY.toFixed(1)} * s * s, 0.0);
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_PointSize = uAge < 0.0 ? 0.0 : aSize * uPx * (uCam / -mv.z);
  gl_Position = projectionMatrix * mv;
  vColor = aColor;
}`;
const SPARK_FRAG = /* glsl */ `
uniform float uAlpha;
varying vec3 vColor;
void main() {
  float d = length(gl_PointCoord - 0.5);
  if (d > 0.5) discard;
  float a = (1.0 - smoothstep(0.3, 0.5, d)) * uAlpha;
  gl_FragColor = vec4(vColor * a, a);
}`;

const TRAIL_VERT = /* glsl */ `
attribute float aT;
attribute float aJit;
attribute float aSize;
uniform vec3 uHead;
uniform float uLen;
uniform float uPx;
uniform float uCam;
varying float vA;
void main() {
  vec3 p = uHead + vec3(aJit * 6.5 * (1.0 - aT), -aT * uLen, 0.0);
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_PointSize = aSize * uPx * (uCam / -mv.z);
  gl_Position = projectionMatrix * mv;
  vA = 1.0 - aT;
}`;
const TRAIL_FRAG = /* glsl */ `
uniform float uAlpha;
varying float vA;
void main() {
  float d = length(gl_PointCoord - 0.5);
  if (d > 0.5) discard;
  float a = (1.0 - smoothstep(0.3, 0.5, d)) * vA * uAlpha;
  gl_FragColor = vec4(${glsl(COLOR.gold)} * a, a);
}`;

/** Render order: ground, sky (bursts, trails, rockets), lanterns, frame text, the result frame. */
const LAYER = { ground: 0, sky: 10, rocket: 14, lanterns: 20, text: 30, result: 40 } as const;

type Own = GameContext['own'];

/** Frame px (y down) to world (y up, the frame plane at z 0, origin at the frame's centre). */
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
  return own(
    new ShaderMaterial({
      transparent: true,
      premultipliedAlpha: true,
      depthTest: false,
      depthWrite: false,
      ...extra,
    }),
  );
}

/** A text panel: a frame-px canvas shown as a quad at its frame position. Repaints reuse the canvas. */
class Panel {
  readonly mesh: MeshT;
  readonly material: ShaderMaterialT;
  private paint: Paintable | null = null;
  private tex: CanvasTextureT | null = null;
  private readonly own: Own;
  private readonly doc: Document;
  constructor(own: Own, doc: Document, quad: PlaneGeometryT, scene: SceneT, order: number) {
    this.own = own;
    this.doc = doc;
    this.material = overlayMaterial(own, {
      uniforms: { uMap: { value: null }, uOpacity: { value: 1 } },
      vertexShader: PANEL_VERT,
      fragmentShader: PANEL_FRAG,
    });
    this.mesh = new Mesh(quad, this.material);
    this.mesh.renderOrder = order;
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
    scene.add(this.mesh);
  }
  /** Paint on a canvas of w x h frame px, reused while its size and scale hold. */
  draw(w: number, h: number, scale: number, fn: (p: Paintable) => void): void {
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
    this.mesh.visible = true;
  }
  /** Show a finished paint (owned by the caller's texture). */
  show(tex: CanvasTextureT): void {
    this.material.uniforms.uMap!.value = tex;
    this.mesh.visible = true;
  }
  /** Place the panel's top-left at frame (x, y), w x h frame px, scaled about its centre. */
  place(x: number, y: number, w: number, h: number, scale = 1): void {
    const [wx, wy] = world(x + w / 2, y + h / 2);
    this.mesh.position.set(wx, wy, 0);
    this.mesh.scale.set(w * scale, h * scale, 1);
  }
  set opacity(v: number) {
    this.material.uniforms.uOpacity!.value = v;
  }
}

/** The board's rocket drawing (white body, gold nose, pink fins, a raised-colour window), as flat
 *  shapes in rocket px around the body's centre, y up. */
function rocketParts(own: Own): { geometry: BufferGeometryT; color: string }[] {
  const body = new Shape();
  body.moveTo(0, 60);
  body.bezierCurveTo(14, 44, 18, 24, 18, 0);
  body.lineTo(18, -34);
  body.lineTo(-18, -34);
  body.lineTo(-18, 0);
  body.bezierCurveTo(-18, 24, -14, 44, 0, 60);
  const nose = new Shape();
  nose.moveTo(0, 60);
  nose.bezierCurveTo(9, 50, 13, 40, 15, 30);
  nose.lineTo(-15, 30);
  nose.bezierCurveTo(-13, 40, -9, 50, 0, 60);
  const finL = new Shape();
  finL.moveTo(-18, -14);
  finL.lineTo(-32, -40);
  finL.lineTo(-18, -34);
  const finR = new Shape();
  finR.moveTo(18, -14);
  finR.lineTo(32, -40);
  finR.lineTo(18, -34);
  const windowDisc = own(new CircleGeometry(7, 24));
  windowDisc.translate(0, 6, 0);
  return [
    { geometry: own(new ShapeGeometry(body, 16)), color: COLOR.ink },
    { geometry: own(new ShapeGeometry(nose, 16)), color: COLOR.gold },
    { geometry: own(new ShapeGeometry([finL, finR])), color: COLOR.punch },
    { geometry: windowDisc, color: COLOR.raised },
  ];
}

type Rocket = { group: GroupT; materials: MeshBasicMaterialT[] };

function makeRocket(own: Own, scene: SceneT, parts: { geometry: BufferGeometryT; color: string }[]): Rocket {
  const group = new Group();
  const materials = parts.map((p, i) => {
    const material = own(new MeshBasicMaterial({ color: p.color, transparent: true, depthTest: false, depthWrite: false }));
    const mesh = new Mesh(p.geometry, material);
    mesh.renderOrder = LAYER.rocket + i;
    mesh.frustumCulled = false;
    group.add(mesh);
    return material;
  });
  group.visible = false;
  scene.add(group);
  return { group, materials };
}

type Burst = { points: PointsT; material: ShaderMaterialT };

function makeBurst(own: Own, scene: SceneT, rand: () => number, count: number, radius: number, palette: readonly string[], at: [number, number]): Burst {
  const dir = new Float32Array(count * 3);
  const color = new Float32Array(count * 3);
  const size = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    // A filled shell: a uniform direction on the sphere, at 55-100% of the radius.
    const z = rand() * 2 - 1;
    const a = rand() * Math.PI * 2;
    const k = Math.sqrt(1 - z * z) * (0.55 + 0.45 * rand());
    const rs = 0.55 + 0.45 * rand();
    dir.set([Math.cos(a) * k, Math.sin(a) * k, z * rs], i * 3);
    color.set(hexRgb(palette[Math.floor(rand() * palette.length)]!), i * 3);
    size[i] = 5 + 5 * rand();
  }
  // The core flash: the board's 20px-radius disc at the burst's centre.
  dir.set([0, 0, 0], 0);
  color.set(hexRgb(COLOR.ink), 0);
  size[0] = 41;
  const geometry = own(new BufferGeometry());
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(count * 3), 3));
  geometry.setAttribute('aDir', new BufferAttribute(dir, 3));
  geometry.setAttribute('aColor', new BufferAttribute(color, 3));
  geometry.setAttribute('aSize', new BufferAttribute(size, 1));
  const material = overlayMaterial(own, {
    blending: AdditiveBlending,
    uniforms: { uAge: { value: -1 }, uRadius: { value: radius }, uPx: { value: 1 }, uCam: { value: 1 }, uAlpha: { value: 0 } },
    vertexShader: SPARK_VERT,
    fragmentShader: SPARK_FRAG,
  });
  const points = new Points(geometry, material);
  points.position.set(...world(at[0], at[1]));
  points.renderOrder = LAYER.sky;
  points.frustumCulled = false;
  points.visible = false;
  scene.add(points);
  return { points, material };
}

type Trail = { points: PointsT; material: ShaderMaterialT };

function makeTrail(own: Own, scene: SceneT, rand: () => number): Trail {
  const t = new Float32Array(TRAIL_PARTICLES);
  const jit = new Float32Array(TRAIL_PARTICLES);
  const size = new Float32Array(TRAIL_PARTICLES);
  for (let i = 0; i < TRAIL_PARTICLES; i++) {
    t[i] = rand();
    jit[i] = rand() * 2 - 1;
    size[i] = 3 + 3 * rand();
  }
  const geometry = own(new BufferGeometry());
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(TRAIL_PARTICLES * 3), 3));
  geometry.setAttribute('aT', new BufferAttribute(t, 1));
  geometry.setAttribute('aJit', new BufferAttribute(jit, 1));
  geometry.setAttribute('aSize', new BufferAttribute(size, 1));
  const material = overlayMaterial(own, {
    blending: AdditiveBlending,
    uniforms: { uHead: { value: [0, 0, 0] }, uLen: { value: 0 }, uPx: { value: 1 }, uCam: { value: 1 }, uAlpha: { value: 1 } },
    vertexShader: TRAIL_VERT,
    fragmentShader: TRAIL_FRAG,
  });
  const points = new Points(geometry, material);
  points.renderOrder = LAYER.sky + 1;
  points.frustumCulled = false;
  points.visible = false;
  scene.add(points);
  return { points, material };
}

function setRocket(rocket: Rocket, trail: Trail, x: number, y: number | null, fromY: number, opacity = 1): void {
  rocket.group.visible = y !== null;
  trail.points.visible = y !== null;
  if (y === null) return;
  rocket.group.position.set(...world(x, y));
  for (const m of rocket.materials) m.opacity = opacity;
  // The trail hangs from the rocket's tail, as long as the climb so far.
  trail.material.uniforms.uHead!.value = world(x, y + 34);
  trail.material.uniforms.uLen!.value = Math.max(0, Math.min(TRAIL_LEN, fromY - y));
  trail.material.uniforms.uAlpha!.value = opacity;
}

function mountFireworks(context: GameContext, input: RevealInput<'fireworks'>, emit: (event: GameEvent) => void): RevealHandle {
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
  ground.renderOrder = LAYER.ground;
  ground.frustumCulled = false;
  scene.add(ground);

  const pointMaterials: ShaderMaterialT[] = [];
  function fitCamera(): void {
    const aspect = viewport.cssWidth / Math.max(1, viewport.cssHeight);
    const tanHalf = Math.tan((VFOV_DEG * Math.PI) / 360);
    // The whole frame stays in view: height-limited on a wide screen, width-limited on a narrow one.
    const dist = Math.max(FRAME_H / 2 / tanHalf, FRAME_W / 2 / (tanHalf * aspect));
    camera.aspect = aspect;
    camera.position.set(0, 0, dist);
    camera.near = dist * 0.1;
    camera.far = dist * 4;
    camera.updateProjectionMatrix();
    const px = Math.min(viewport.cssWidth / FRAME_W, viewport.cssHeight / FRAME_H) * viewport.dpr;
    for (const m of pointMaterials) {
      m.uniforms.uPx!.value = px;
      m.uniforms.uCam!.value = dist;
    }
  }

  const chrome = new Panel(own, doc, quad, scene, LAYER.text);
  const parts = rocketParts(own);
  const sparks = randomFor(input.key, 'sparks');
  const trails = randomFor(input.key, 'trails');
  const palette = [COLOR.gold, COLOR.ink, COLOR.punch] as const;

  let chromeKey = '';
  const repaintChrome = (key: string, fn: (p: Paintable) => void): void => {
    if (key === chromeKey) return;
    chromeKey = key;
    chrome.draw(FRAME_W, FRAME_H, scale, (p) => {
      paintTop(p, input.eventName, topLabel(plan), topDots(plan));
      fn(p);
    });
    chrome.place(0, 0, FRAME_W, FRAME_H);
  };

  let update: (t: number) => void;
  let rebuildText: () => void;

  if (plan.kind === 'round') {
    const round: RoundPlan = plan;
    const n = round.lanterns.length;
    const geometry = own(new InstancedBufferGeometry());
    // Own copies of the quad's buffers: disposing this geometry must not free the shared quad's.
    geometry.setIndex(quad.index!.clone());
    geometry.setAttribute('position', quad.getAttribute('position').clone());
    geometry.instanceCount = n;
    const aRect = new InstancedBufferAttribute(new Float32Array(n * 4), 4);
    const aLit = new InstancedBufferAttribute(new Float32Array(n * 4), 4);
    const aOut = new InstancedBufferAttribute(new Float32Array(n * 4), 4);
    const aDimAt = new InstancedBufferAttribute(new Float32Array(round.lanterns.map((l) => (l.dimAt === null ? -1 : l.dimAt))), 1);
    geometry.setAttribute('aRect', aRect);
    geometry.setAttribute('aLit', aLit);
    geometry.setAttribute('aOut', aOut);
    geometry.setAttribute('aDimAt', aDimAt);
    const lanternMaterial = overlayMaterial(own, {
      uniforms: { uTime: { value: 0 }, uRise: { value: 0 }, uAtlas: { value: null } },
      vertexShader: LANTERN_VERT,
      fragmentShader: LANTERN_FRAG,
    });
    const lanterns = new Mesh(geometry, lanternMaterial);
    lanterns.renderOrder = LAYER.lanterns;
    lanterns.frustumCulled = false;
    scene.add(lanterns);
    let atlasTex: CanvasTextureT | null = null;

    const buildLanterns = (): void => {
      const box = LANTERN_W - 2 * LANTERN_FIT.pad;
      const fits = fitLanterns(doc, round.lanterns.map((l) => names.get(l.id) ?? ''), box);
      const rows = Math.ceil(n / 8);
      const rowHeights = Array.from({ length: rows }, (_, r) =>
        Math.max(...fits.slice(r * 8, r * 8 + 8).flatMap((f) => [f.lit.lines.length * f.lit.size, f.out.lines.length * f.out.size])),
      );
      const rects = fieldLayout(n, rowHeights);
      const atlas = paintAtlas(doc, fits, rects.filter((_, i) => i % 8 === 0).map((r) => r[3]), box, scale);
      rects.forEach((r, i) => {
        aRect.set(r, i * 4);
        aLit.set(atlas.lit[i]!, i * 4);
        aOut.set(atlas.out[i]!, i * 4);
      });
      aRect.needsUpdate = true;
      aLit.needsUpdate = true;
      aOut.needsUpdate = true;
      atlasTex?.dispose();
      atlasTex = canvasTexture(own, atlas.paint);
      lanternMaterial.uniforms.uAtlas!.value = atlasTex;
    };
    buildLanterns();

    const bursts = BURSTS.map((at) => makeBurst(own, scene, sparks, BURST_PARTICLES, BURST_RADIUS, palette, [at[0], at[1]]));
    const rockets = BURSTS.map(() => makeRocket(own, scene, parts));
    const rocketTrails = BURSTS.map(() => makeTrail(own, scene, trails));
    pointMaterials.push(...bursts.map((b) => b.material), ...rocketTrails.map((t) => t.material));

    const figure = new Panel(own, doc, quad, scene, LAYER.text + 1);
    let figureKey = '';

    // Smoke: a burst holds full strength while it opens, falls to 60% by the end of its wave (the board's
    // past-burst shade), hangs at about 20% (the board's smoke) until the count, then clears in the settle.
    const smoke = (k: number, t: number): number => {
      const age = t - round.burstAt[k]!;
      if (age < 0) return 0;
      let a: number;
      if (age <= T.burstExpand) a = 1;
      else if (age <= T.slot) a = 1 - 0.4 * ((age - T.burstExpand) / T.wave);
      else {
        const from = round.burstAt[k]! + T.slot;
        a = round.settleAt > from ? 0.6 - 0.38 * clamp01((t - from) / (round.settleAt - from)) : 0.22;
      }
      if (t >= round.settleAt) a = Math.min(a, 0.22) * (1 - clamp01((t - round.settleAt) / T.settle));
      return a;
    };

    update = (t) => {
      lanternMaterial.uniforms.uTime!.value = t;
      lanternMaterial.uniforms.uRise!.value = t >= round.settleAt ? 6 * easeOutCubic((t - round.settleAt) / T.settle) : 0;
      BURSTS.forEach(([bx, by], k) => {
        const at = round.burstAt[k]!;
        const b = bursts[k]!;
        b.points.visible = t >= at;
        b.material.uniforms.uAge!.value = t - at;
        b.material.uniforms.uAlpha!.value = smoke(k, t);
        const start = at - T.launch;
        const y = t >= start && t < at ? LAUNCH_FROM_Y - (LAUNCH_FROM_Y - by) * easeInCubic((t - start) / T.launch) : null;
        setRocket(rockets[k]!, rocketTrails[k]!, bx, y, LAUNCH_FROM_Y);
      });
      const band = lowBand(round, t);
      const right = band.right.kind === 'text' ? band.right : { kind: 'legend' as const, passed: COPY.passed, notPassed: COPY.notPassed };
      repaintChrome(`${band.left}|${band.right.kind === 'text' ? band.right.text : 'legend'}`, (p) => paintBand(p, band.left, COPY.gameName, right));
      const key = `${band.figure.kind}:${band.figure.value}`;
      if (key !== figureKey) {
        figureKey = key;
        figure.draw(FIGURE_W, FIGURE_H, scale, (p) => paintFigure(p, band.figure, COPY.people));
      }
      figure.place(FRAME_W / 2 - FIGURE_W / 2, FIGURE_CY - FIGURE_H / 2, FIGURE_W, FIGURE_H, band.figure.kind === 'numeral' ? band.figure.scale : 1);
    };
    rebuildText = () => {
      buildLanterns();
      chromeKey = '';
      figureKey = '';
    };
  } else {
    const final: FinalPlan = plan;
    const railMaterial: MeshBasicMaterialT = own(new MeshBasicMaterial({ color: COLOR.raised, transparent: true, depthTest: false, depthWrite: false }));
    const rail = new Mesh(quad, railMaterial);
    rail.position.set(...world(960, 793));
    rail.scale.set(1680, 6, 1);
    rail.renderOrder = LAYER.rocket;
    rail.frustumCulled = false;
    scene.add(rail);

    const lastLane = final.burstOrder[final.burstOrder.length - 1]!;
    const bursts = final.lanes.map((lane) =>
      makeBurst(
        own,
        scene,
        sparks,
        lane.lane === lastLane ? LAST_BURST_PARTICLES : BURST_PARTICLES,
        lane.lane === lastLane ? LAST_BURST_RADIUS : BURST_RADIUS,
        lane.lane === lastLane ? [...palette, COLOR.sky] : palette,
        [LANES_X[lane.lane]!, lane.burstY],
      ),
    );
    const rockets = final.lanes.map(() => makeRocket(own, scene, parts));
    const rocketTrails = final.lanes.map(() => makeTrail(own, scene, trails));
    pointMaterials.push(...bursts.map((b) => b.material), ...rocketTrails.map((t) => t.material));

    type PlateSet = { panel: Panel; up: { tex: CanvasTextureT; height: number }; done: { tex: CanvasTextureT; height: number } };
    let plates: PlateSet[] = [];
    const result = new Panel(own, doc, quad, scene, LAYER.result);

    const buildPlates = (): void => {
      const old = plates;
      plates = final.lanes.map((lane, i) => {
        const name = names.get(lane.id) ?? '';
        const up = paintPlate(doc, name, scale, null);
        const done = paintPlate(doc, name, scale, lane.plateLabel);
        old[i]?.up.tex.dispose();
        old[i]?.done.tex.dispose();
        return {
          panel: old[i]?.panel ?? new Panel(own, doc, quad, scene, LAYER.text),
          up: { tex: canvasTexture(own, up.paint), height: up.height },
          done: { tex: canvasTexture(own, done.paint), height: done.height },
        };
      });
      result.draw(FRAME_W, FRAME_H, scale, (p) =>
        paintResult(
          p,
          COPY.winnersHeading,
          final.winners.map((w) => ({ line: w.line, name: names.get(w.id) ?? '' })),
        ),
      );
      result.place(0, 0, FRAME_W, FRAME_H);
      result.opacity = 0;
    };
    buildPlates();

    const burstAlpha = (age: number): number => (age < 0 ? 0 : age <= T.burstExpand ? 1 : Math.max(0.5, 1 - (0.45 * (age - T.burstExpand)) / 2000));

    update = (t) => {
      const fade = t >= final.resultAt ? clamp01((t - final.resultAt) / FT.result) : 0;
      result.opacity = fade;
      railMaterial.opacity = 1 - fade;
      final.lanes.forEach((lane, i) => {
        const x = LANES_X[lane.lane]!;
        const y = t >= 0 ? rocketY(lane, t) : PAD_Y;
        setRocket(rockets[i]!, rocketTrails[i]!, x, y, PAD_Y, 1 - fade);
        const age = t - lane.burstAt;
        bursts[i]!.points.visible = age >= 0;
        bursts[i]!.material.uniforms.uAge!.value = age;
        bursts[i]!.material.uniforms.uAlpha!.value = burstAlpha(age);
        const set = plates[i]!;
        const burst = age >= 0;
        const face = burst ? set.done : set.up;
        // A rising plate rides 100px under its rocket (the pad frame); a burst one drops to hang under its burst.
        const top = burst
          ? lane.burstY + 100 + (PLATE_UNDER_BURST - 100) * easeOutCubic(age / T.burstExpand)
          : (y ?? PAD_Y) + (PLATE_PAD_TOP - PAD_Y);
        const m = PLATE.glow * 2;
        set.panel.show(face.tex);
        set.panel.place(x - PLATE.w / 2 - m, top - m, PLATE.w + 2 * m, face.height + 2 * m);
        set.panel.opacity = 1 - fade;
      });
      const up = stillUp(final, t);
      repaintChrome(`hud:${up}:${fade > 0}`, (p) => {
        if (fade === 0) paintHud(p, COPY.stillUp(up), COPY.gameName, COPY.finalRule);
      });
    };
    rebuildText = () => {
      buildPlates();
      chromeKey = '';
    };
  }

  fitCamera();
  update(0);
  renderer.render(scene, camera);

  // A face still loading paints with a fallback; repaint every text once the board's faces are in.
  const fonts = doc.fonts as FontFaceSet | undefined;
  if (fonts && !FACES.every((f) => fonts.check(f))) {
    Promise.all(FACES.map((f) => fonts.load(f))).then(
      () => {
        if (!signal.aborted) rebuildText();
      },
      () => {},
    );
  }

  let last = -1;
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
        for (const event of beatsIn(plan, last, t)) {
          if (event.type === 'complete') complete();
          else emit(event);
          // An event can end the reveal; nothing is drawn with what the host has already disposed.
          if (signal.aborted) return;
        }
        last = t;
        update(Math.min(t, plan.total));
        renderer.render(scene, camera);
      } else if (command.type === 'resize') {
        viewport = command.viewport;
        scale = backingScale(viewport);
        fitCamera();
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

export const reveal: RevealModule<'fireworks'> = { mount: mountFireworks };
