// The marble-race reveal (gh#316, the game named in copy.ts): an elimination round is the live field racing
// as marbles, 20 lanes a heat, heat after heat; in each heat the round's survivors cross the finish line and
// the rest stop short, and time stops the instant the round's last survivor crosses.
//
// Design: the picked options of design/Gh316Marbles.dc.html (owner pick 2026-11-16): M1 A HEAT LANES, M2 A
// FREEZE AT THE CUT, frames mb-reveal and mb-result of option A, with the board's same-day correction (the
// crossing order is heat-major; the freeze lands in the last heat holding a survivor). Its 3D intent: the
// marbles are one instanced mesh of glass spheres with a spec highlight and no transmission pass, the track
// is a plane, the camera is fixed and frames the board's 1920x1080 frame exactly.
//
// What this module does NOT do: choose anything. The committed outcome arrives in `input`; plan.ts turns it
// into a timeline and refuses an outcome or a plan it cannot stage as given. It owns no loop (the host ticks
// it, and leaves held and hidden time out of the elapsed time it is given), no fallback (the host draws the
// 2D view, which is also the reduced-motion and phone path), and allocates GPU resources only through
// `context.own`. The board's idle frame (mb-idle) is the step before the draw, so it is the stage's.

import {
  CircleGeometry,
  InstancedBufferAttribute,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  PerspectiveCamera,
  PlaneGeometry,
  Scene,
  Shape,
  ShapeGeometry,
  ShaderMaterial,
  SphereGeometry,
  Color,
  CanvasTexture,
  LinearFilter,
} from 'three';
import type { GameCommand, GameContext, GameEvent, RevealHandle, RevealInput, RevealModule, Viewport } from '../../_prize-reveal/game-contract.ts';
import {
  COPY,
  FINISH_X,
  FRAME_H,
  FRAME_W,
  HEAT_SIZE,
  LANE_Y0,
  MARBLE_R,
  TRACK,
  bandAt,
  beatsIn,
  dimAt,
  heatAt,
  laneY,
  marbleX,
  planFor,
  pulseAt,
  stateAt,
  streakAt,
  topDots,
  topLabel,
  type Marble,
} from './plan.ts';
import {
  BAND_CY,
  BAND_SHIFT,
  COLOR,
  FACES,
  FIGURE_H,
  FIGURE_W,
  MARBLE_COLOR,
  PLATES_BOX,
  TRACK_COLOR,
  fitPlates,
  paintBackground,
  paintBand,
  paintFigure,
  paintPlates,
  surface,
  type Paintable,
  type PlateFit,
} from './paint.ts';

// Instance types read off the classes: three ships no declarations (see _prize-reveal/three-shim.d.ts).
type CanvasTextureT = InstanceType<typeof CanvasTexture>;
type ShaderMaterialT = InstanceType<typeof ShaderMaterial>;
type SceneT = InstanceType<typeof Scene>;
type PlaneGeometryT = InstanceType<typeof PlaneGeometry>;
type MeshT = InstanceType<typeof Mesh>;
type ColorT = InstanceType<typeof Color>;

/** 35mm-equivalent: the vertical field of view of a 35mm lens on a 24mm-tall frame (as the fireworks). */
const VFOV_DEG = (2 * Math.atan(12 / 35) * 180) / Math.PI;

/** Render order: background, the finish pulse, streaks, glows, marbles, plates, the band and its figure.
 *  Every mesh is transparent: three draws its opaque list before its transparent one and sorts renderOrder
 *  only within a list, so a single opaque race mesh would be drawn first and overpainted by the full-frame
 *  background whatever its order says. */
const LAYER = { background: 0, pulse: 5, streak: 8, glow: 9, marble: 10, plates: 20, band: 30, figure: 31 } as const;

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

// A glass marble: its body colour lit by one key light from the upper left (where the board puts the spec
// highlight), and a white spec spot. instanceMatrix is declared by three for an instanced mesh.
const MARBLE_VERT = /* glsl */ `
attribute vec3 aTint;
varying vec3 vNormal;
varying vec3 vTint;
void main() {
  vTint = aTint;
  vNormal = normalize(normalMatrix * mat3(instanceMatrix) * normal);
  gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
}`;
const MARBLE_FRAG = /* glsl */ `
varying vec3 vNormal;
varying vec3 vTint;
void main() {
  vec3 n = normalize(vNormal);
  vec3 light = normalize(vec3(-0.45, 0.55, 0.7));
  float diffuse = max(dot(n, light), 0.0);
  float spec = pow(max(dot(n, normalize(light + vec3(0.0, 0.0, 1.0))), 0.0), 60.0);
  gl_FragColor = vec4(min(vTint * (0.72 + 0.28 * diffuse) + vec3(0.9 * spec), vec3(1.0)), 1.0);
}`;

type Own = GameContext['own'];

/** Frame px (y down) to world (y up, the frame plane at z 0, origin at the frame's centre). */
function world(x: number, y: number): [number, number, number] {
  return [x - FRAME_W / 2, FRAME_H / 2 - y, 0];
}

/** A #rrggbb colour as its raw 0..1 channels, with no colour-space conversion. */
function rawRgb(hex: string): [number, number, number] {
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255) as [number, number, number];
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

/** A text or flat-shape panel: a frame-px canvas shown as a quad at its frame position. Repaints reuse the
 *  canvas while its size and scale hold. */
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
    this.material = own(
      new ShaderMaterial({
        transparent: true,
        premultipliedAlpha: true,
        depthTest: false,
        depthWrite: false,
        uniforms: { uMap: { value: null }, uOpacity: { value: 1 } },
        vertexShader: PANEL_VERT,
        fragmentShader: PANEL_FRAG,
      }),
    );
    this.mesh = new Mesh(quad, this.material);
    this.mesh.renderOrder = order;
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
    scene.add(this.mesh);
  }
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
  /** Place the panel's top-left at frame (x, y), w x h frame px. */
  place(x: number, y: number, w: number, h: number): void {
    const [wx, wy] = world(x + w / 2, y + h / 2);
    this.mesh.position.set(wx, wy, 0);
    this.mesh.scale.set(w, h, 1);
  }
}

function mountMarbles(context: GameContext, input: RevealInput<'marbles'>, emit: (event: GameEvent) => void): RevealHandle {
  const plan = planFor(input);
  const { own, renderer, signal } = context;
  const doc = context.root.ownerDocument;
  const names = new Map(input.people.map((p) => [p.id, p.name]));
  let viewport: Viewport = input.viewport;
  let scale = backingScale(viewport);

  const scene = new Scene();
  const camera = new PerspectiveCamera(VFOV_DEG, 16 / 9, 10, 10000);
  const fitCamera = (): void => {
    const aspect = viewport.cssWidth / Math.max(1, viewport.cssHeight);
    const tanHalf = Math.tan((VFOV_DEG * Math.PI) / 360);
    // The whole frame stays in view: height-limited on a wide screen, width-limited on a narrow one.
    const dist = Math.max(FRAME_H / 2 / tanHalf, FRAME_W / 2 / (tanHalf * aspect));
    camera.aspect = aspect;
    camera.position.set(0, 0, dist);
    camera.near = dist * 0.1;
    camera.far = dist * 4;
    camera.updateProjectionMatrix();
  };

  const quad = own(new PlaneGeometry(1, 1));
  const background = new Panel(own, doc, quad, scene, LAYER.background);
  const plates = new Panel(own, doc, quad, scene, LAYER.plates);
  const band = new Panel(own, doc, quad, scene, LAYER.band);
  const figure = new Panel(own, doc, quad, scene, LAYER.figure);

  // The finish line's one gold pulse at the freeze.
  const pulseMaterial = own(new MeshBasicMaterial({ color: COLOR.gold, transparent: true, opacity: 0, depthTest: false, depthWrite: false }));
  const pulse = new Mesh(quad, pulseMaterial);
  const lanesH = TRACK.top + TRACK.height - LANE_Y0;
  pulse.position.set(...world(FINISH_X, LANE_Y0 + lanesH / 2));
  pulse.scale.set(48, lanesH, 1);
  pulse.renderOrder = LAYER.pulse;
  pulse.frustumCulled = false;
  scene.add(pulse);

  // One heat's 20 marbles: spheres, the glow disc under an across-marble, the streak behind a rolling one.
  const sphere = own(new SphereGeometry(MARBLE_R, 32, 20));
  const tint = new InstancedBufferAttribute(new Float32Array(HEAT_SIZE * 3), 3);
  sphere.setAttribute('aTint', tint);
  const marbles = new InstancedMesh(
    sphere,
    own(new ShaderMaterial({ vertexShader: MARBLE_VERT, fragmentShader: MARBLE_FRAG, transparent: true, depthTest: false, depthWrite: false })),
    HEAT_SIZE,
  );
  marbles.renderOrder = LAYER.marble;
  marbles.frustumCulled = false;
  scene.add(marbles);
  const glows = new InstancedMesh(
    own(new CircleGeometry(MARBLE_R + 5, 40)),
    own(new MeshBasicMaterial({ color: TRACK_COLOR.marbleGlow, transparent: true, depthTest: false, depthWrite: false })),
    HEAT_SIZE,
  );
  glows.renderOrder = LAYER.glow;
  glows.frustumCulled = false;
  scene.add(glows);
  // The board's streak: a tapered bar trailing the marble, 36px long, 4 to 6px tall.
  const streakShape = new Shape();
  streakShape.moveTo(-MARBLE_R - 34, -2);
  streakShape.lineTo(-MARBLE_R + 2, -3);
  streakShape.lineTo(-MARBLE_R + 2, 3);
  streakShape.lineTo(-MARBLE_R - 34, 2);
  const streaks = new InstancedMesh(
    own(new ShapeGeometry(streakShape)),
    own(new MeshBasicMaterial({ color: '#ffffff', transparent: true, depthTest: false, depthWrite: false })),
    HEAT_SIZE,
  );
  streaks.renderOrder = LAYER.streak;
  streaks.frustumCulled = false;
  scene.add(streaks);

  const m4 = new Matrix4();
  const hidden = new Matrix4().makeScale(0, 0, 0);
  // The streak mesh is a built-in material: three keeps its colours linear and converts them on output, so
  // they go in as Color. The marble shader writes its tint as given, so its tints are the board's sRGB
  // values taken raw (as the fireworks shaders take theirs), never a Color.
  const track = new Color(TRACK_COLOR.ground);
  const streakColours = MARBLE_COLOR.map((c) => new Color(c.streak));
  const mix = new Color();
  const mixed = (a: ColorT, b: ColorT, u: number): ColorT => mix.copy(a).lerp(b, u);
  const goldRgb = rawRgb(COLOR.gold);
  const tints = MARBLE_COLOR.map((c) => ({ body: rawRgb(c.body), out: rawRgb(c.out) }));
  for (let i = 0; i < HEAT_SIZE; i++) {
    glows.setMatrixAt(i, hidden);
    streaks.setMatrixAt(i, hidden);
    streaks.setColorAt(i, track);
  }

  // Per-heat state: the heat on the track, its marbles by lane, its plate fits; repainted only on change.
  let heat = -1;
  let lanes: Marble[] = [];
  let fits: PlateFit[] = [];
  let backgroundKey = '';
  let platesKey = '';
  let bandKey = '';
  let figureKey = '';

  const paintBackgroundFor = (count: number): void => {
    const key = `${count}|${scale}`;
    if (key === backgroundKey) return;
    backgroundKey = key;
    background.draw(FRAME_W, FRAME_H, scale, (p) => paintBackground(p, input.eventName, topLabel(plan), topDots(plan), count, COPY.finishLabel));
    background.place(0, 0, FRAME_W, FRAME_H);
  };

  const loadHeat = (h: number): void => {
    heat = h;
    lanes = plan.marbles.filter((m) => m.heat === h);
    fits = fitPlates(doc, lanes.map((m) => names.get(m.id) ?? ''));
    // Every instanced mesh draws this heat's lanes only: a short heat must not show a longer one's glows.
    marbles.count = lanes.length;
    glows.count = lanes.length;
    streaks.count = lanes.length;
    platesKey = '';
    paintBackgroundFor(lanes.length);
  };

  const update = (t: number): void => {
    const h = heatAt(plan, t);
    if (h !== heat) loadHeat(h);
    lanes.forEach((m, lane) => {
      const colour = lane % MARBLE_COLOR.length;
      const [x, y] = world(marbleX(plan, m, t), laneY(lane));
      m4.makeTranslation(x, y, 0);
      marbles.setMatrixAt(lane, m4);
      const state = stateAt(plan, m, t);
      const { body, out } = tints[colour]!;
      const d = dimAt(plan, m, t);
      const [r, g, b] = state === 'in' ? goldRgb : [0, 1, 2].map((k) => body[k]! + (out[k]! - body[k]!) * d);
      tint.setXYZ(lane, r!, g!, b!);
      glows.setMatrixAt(lane, state === 'in' ? m4 : hidden);
      const streak = streakAt(plan, m, t);
      streaks.setMatrixAt(lane, streak > 0 ? m4 : hidden);
      streaks.setColorAt(lane, mixed(track, streakColours[colour]!, streak));
    });
    marbles.instanceMatrix.needsUpdate = true;
    glows.instanceMatrix.needsUpdate = true;
    streaks.instanceMatrix.needsUpdate = true;
    if (streaks.instanceColor) streaks.instanceColor.needsUpdate = true;
    tint.needsUpdate = true;
    pulseMaterial.opacity = 0.35 * pulseAt(plan, t);

    const states = lanes.map((m) => stateAt(plan, m, t));
    const pk = `${heat}|${scale}|${states.join(',')}`;
    if (pk !== platesKey) {
      platesKey = pk;
      plates.draw(PLATES_BOX.w, PLATES_BOX.h, scale, (p) => paintPlates(p, fits, states));
      plates.place(PLATES_BOX.x, PLATES_BOX.y, PLATES_BOX.w, PLATES_BOX.h);
    }

    const b = bandAt(plan, t);
    const bk = `${scale}|${b.left}|${b.right.kind === 'text' ? b.right.text : 'legend'}`;
    if (bk !== bandKey) {
      bandKey = bk;
      const right = b.right.kind === 'text' ? b.right : { kind: 'legend' as const, passed: COPY.passed, notPassed: COPY.notPassed };
      band.draw(FRAME_W, FRAME_H, scale, (p) => paintBand(p, b.left, COPY.gameName, right));
      // The fireworks band is centred for gh#303's 190px band; this board's is 170px, 10px lower.
      band.place(0, BAND_SHIFT, FRAME_W, FRAME_H);
    }
    const fk = `${scale}|${b.figure}`;
    if (fk !== figureKey) {
      figureKey = fk;
      figure.draw(FIGURE_W, FIGURE_H, scale, (p) => paintFigure(p, { kind: 'count', value: b.figure }, COPY.people));
      figure.place(FRAME_W / 2 - FIGURE_W / 2, BAND_CY - FIGURE_H / 2, FIGURE_W, FIGURE_H);
    }
  };

  /** Fits and every canvas again: the faces arrived, or the backing scale changed. */
  const rebuildText = (): void => {
    if (heat >= 0) fits = fitPlates(doc, lanes.map((m) => names.get(m.id) ?? ''));
    backgroundKey = '';
    platesKey = '';
    bandKey = '';
    figureKey = '';
    paintBackgroundFor(lanes.length);
  };

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
  let shown = 0;
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
        shown = Math.min(t, plan.total);
        update(shown);
        renderer.render(scene, camera);
      } else if (command.type === 'resize') {
        viewport = command.viewport;
        scale = backingScale(viewport);
        fitCamera();
        rebuildText();
        update(shown);
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

export const reveal: RevealModule<'marbles'> = { mount: mountMarbles };
