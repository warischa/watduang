// The ladder reveal (gh#307, the game named in copy.ts): the five finalists' lanes run away from the room
// down a track; one finalist at a time, a light runs down its lane, lighting each rung it reaches and
// crossing it, until it lands under a prize slot; then the camera glides to face the slots and the gh#302
// result frame fades up over the track.
//
// Design: the picked option of design/Gh303Ladder.dc.html, B DEPTH, ONE AT A TIME (owner pick 2026-11-11),
// frames ld-idle, ld-reveal, ld-result and ld-few, with the stamped change to the far slots. Its 3D intent:
// lanes, rungs and paths are thin flat geometry on one plane, MeshBasicMaterial, the camera behind the start
// 35 degrees above the plane, FogExp2 softening the far end. Plates and slots are world-anchored panels
// facing the camera, sized so the base camera reproduces the board's frame; the chrome and the result are
// fixed to the camera.
//
// What this module does NOT do: choose anything. The committed record arrives in `input`; plan.ts builds the
// ladder that realizes its permutation and refuses a record it cannot draw as given. It owns no loop (the
// host ticks it), no fallback (the host draws the 2D view), and allocates GPU resources only through
// `context.own`. Its reduced-motion frame (ld-rm) is not drawn here: the host shows the 2D view instead.

import {
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  CircleGeometry,
  Color,
  FogExp2,
  Group,
  LinearFilter,
  Mesh,
  MeshBasicMaterial,
  PerspectiveCamera,
  PlaneGeometry,
  Scene,
  ShaderMaterial,
} from 'three';
import { ELIMINATION_ROUNDS } from '../../../prize-draw/schedule.ts';
import type { GameCommand, GameContext, GameEvent, RevealHandle, RevealInput, RevealModule, Viewport } from '../../_prize-reveal/game-contract.ts';
import { COLOR, FACES, HUD_BOX, paintHud, paintPlate, paintResult, paintSlot, paintTop, surface, type Dot, type Paintable } from './paint.ts';
import {
  COPY,
  FRAME_H,
  FRAME_W,
  HUD,
  PLATE,
  RIG,
  SLOT,
  STYLES,
  T,
  TOP_H,
  TRACK,
  WIDTH,
  arcLengths,
  beatsIn,
  cameraAt,
  chromeOpacity,
  lightDistance,
  planFor,
  pointAt,
  project,
  rowU,
  slotName,
  unproject,
  worldOf,
  type Plan,
} from './plan.ts';

// Instance types read off the classes: three ships no declarations (see _prize-reveal/three-shim.d.ts),
// and this form stays right if its typings are added.
type CanvasTextureT = InstanceType<typeof CanvasTexture>;
type ShaderMaterialT = InstanceType<typeof ShaderMaterial>;
type MeshBasicMaterialT = InstanceType<typeof MeshBasicMaterial>;
type BufferGeometryT = InstanceType<typeof BufferGeometry>;
type BufferAttributeT = InstanceType<typeof BufferAttribute>;
type PlaneGeometryT = InstanceType<typeof PlaneGeometry>;
type GroupT = InstanceType<typeof Group>;
type MeshT = InstanceType<typeof Mesh>;
type ColorT = InstanceType<typeof Color>;
type Object3DT = GroupT | InstanceType<typeof PerspectiveCamera>;

type Vec3 = [number, number, number];
type Own = GameContext['own'];

/** FogExp2 density per world unit (one lane apart). The board names the fog and no figure; at this density
 *  the far end of the track takes about a fifth of the fog colour and the near end a twentieth. */
const FOG_DENSITY = 0.06;

/** Render order: ground, track (lanes and leaders, rungs, glows, paths, heads), panels, chrome, result. */
const LAYER = { ground: 0, lanes: 10, rungs: 12, glow: 14, path: 16, head: 18, panel: 30, hud: 40, result: 50 } as const;

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

const hexRgb = (hex: string): string => [1, 3, 5].map((i) => (parseInt(hex.slice(i, i + 2), 16) / 255).toFixed(4)).join(', ');
const GROUND_VERT = /* glsl */ `
varying float vY;
void main() {
  vY = uv.y;
  gl_Position = vec4(position.xy * 2.0, 0.0, 1.0);
}`;
const GROUND_FRAG = /* glsl */ `
varying float vY;
void main() {
  gl_FragColor = vec4(mix(vec3(${hexRgb(COLOR.groundBottom)}), vec3(${hexRgb(COLOR.groundTop)}), vY), 1.0);
}`;

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

/** A painted panel: a quad in its parent's px space (y up), showing a canvas. A repaint of the same size
 *  reuses the canvas; a new size gets a new canvas and texture, the old texture disposed. */
class Panel {
  readonly mesh: MeshT;
  readonly material: ShaderMaterialT;
  private paint: Paintable | null = null;
  private tex: CanvasTextureT | null = null;
  private readonly own: Own;
  private readonly doc: Document;
  constructor(own: Own, doc: Document, quad: PlaneGeometryT, parent: Object3DT, order: number) {
    this.own = own;
    this.doc = doc;
    this.material = own(
      new ShaderMaterial({
        uniforms: { uMap: { value: null }, uOpacity: { value: 1 } },
        vertexShader: PANEL_VERT,
        fragmentShader: PANEL_FRAG,
        transparent: true,
        premultipliedAlpha: true,
        depthTest: false,
        depthWrite: false,
      }),
    );
    this.mesh = new Mesh(quad, this.material);
    this.mesh.renderOrder = order;
    this.mesh.frustumCulled = false;
    parent.add(this.mesh);
  }
  /** Show a finished paint: the panel takes it over. */
  show(painted: Paintable): void {
    this.tex?.dispose();
    this.paint = painted;
    this.tex = canvasTexture(this.own, painted);
    this.material.uniforms.uMap!.value = this.tex;
  }
  /** Paint on a w x h canvas of its own, reused while its size and scale hold. */
  draw(w: number, h: number, scale: number, fn: (p: Paintable) => void): void {
    if (!this.paint || this.paint.w !== w || this.paint.h !== h || this.paint.scale !== scale) {
      this.show(surface(this.doc, w, h, scale));
    } else {
      const { ctx, canvas } = this.paint;
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.restore();
    }
    fn(this.paint!);
    this.tex!.needsUpdate = true;
  }
  /** Centre (cx, cy) and size, in the parent's px, y up. */
  at(cx: number, cy: number, w: number, h: number): void {
    this.mesh.position.set(cx, cy, 0);
    this.mesh.scale.set(w, h, 1);
  }
  /** A rect in frame px (y down), for a panel on the camera's frame layer. */
  frame(x: number, y: number, w: number, h: number): void {
    this.at(x + w / 2 - FRAME_W / 2, FRAME_H / 2 - y - h / 2, w, h);
  }
  set opacity(v: number) {
    this.material.uniforms.uOpacity!.value = v;
    this.mesh.visible = v > 0;
  }
}

/** A world-anchored group that faces the camera, scaled so one unit is one frame px at the base camera. */
function anchor(scene: InstanceType<typeof Scene>, at: Vec3, depth: number): GroupT {
  const g = new Group();
  g.position.set(...at);
  const s = RIG.px(depth);
  g.scale.set(s, s, s);
  scene.add(g);
  return g;
}

// ---- flat lines: quads on the track plane, or facing the view -----------------------------------------------

type Quad = { a: Vec3; b: Vec3; side: Vec3; from: number; to: number };

const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const norm = (v: Vec3): Vec3 => {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
};
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const along = (a: Vec3, b: Vec3, k: number): Vec3 => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
const UP: Vec3 = [0, 1, 0];
const VIEW = norm(sub(RIG.baseTarget, RIG.basePosition));

/** A segment as a quad `width` wide: on the track plane, or (for a leader rising off it) facing the base
 *  view. `cap` extends both ends by half the width, so joined segments meet without a notch. The side vector
 *  sets the winding (Ribbon's index order): a flat quad's front face must point up, at the camera above the
 *  plane, or a material that culls back faces draws nothing of the track. */
function quad(a: Vec3, b: Vec3, width: number, from: number, to: number, flat: boolean, cap: boolean): Quad {
  const dir = norm(sub(b, a));
  const n = norm(flat ? cross(UP, dir) : cross(dir, VIEW));
  const half = width / 2;
  const e = cap ? half : 0;
  return {
    a: [a[0] - dir[0] * e, a[1] - dir[1] * e, a[2] - dir[2] * e],
    b: [b[0] + dir[0] * e, b[1] + dir[1] * e, b[2] + dir[2] * e],
    side: [n[0] * half, n[1] * half, n[2] * half],
    from: from - e,
    to: to + e,
  };
}

/** A path's quads at arc lengths along it: solid with caps, or 14-on-10 dashes. */
function pathQuads(points: Vec3[], arcs: number[], width: number, dashed: boolean): Quad[] {
  const out: Quad[] = [];
  if (!dashed) {
    for (let i = 1; i < points.length; i++) out.push(quad(points[i - 1]!, points[i]!, width, arcs[i - 1]!, arcs[i]!, true, true));
    return out;
  }
  const unit = RIG.px(RIG.nearDepth);
  const dash = WIDTH.dash * unit;
  const period = dash + WIDTH.gap * unit;
  const total = arcs[arcs.length - 1]!;
  for (let s = 0; s < total; s += period) {
    const e = Math.min(total, s + dash);
    for (let i = 1; i < points.length; i++) {
      const lo = Math.max(s, arcs[i - 1]!);
      const hi = Math.min(e, arcs[i]!);
      if (hi <= lo) continue;
      const len = arcs[i]! - arcs[i - 1]!;
      const a = along(points[i - 1]!, points[i]!, (lo - arcs[i - 1]!) / len);
      const b = along(points[i - 1]!, points[i]!, (hi - arcs[i - 1]!) / len);
      out.push(quad(a, b, width, lo, hi, true, false));
    }
  }
  return out;
}

/** Quads in one geometry, revealed up to an arc length (the last one cut where the reveal stands). */
class Ribbon {
  readonly geometry: BufferGeometryT;
  private readonly quads: Quad[];
  private readonly position: BufferAttributeT;
  private shown = -1;
  constructor(own: Own, quads: Quad[]) {
    this.quads = [...quads].sort((p, q) => p.from - q.from);
    this.geometry = own(new BufferGeometry());
    this.position = new BufferAttribute(new Float32Array(Math.max(1, quads.length) * 12), 3);
    const index = new Uint32Array(Math.max(1, quads.length) * 6);
    for (let i = 0; i < quads.length; i++) index.set([4 * i, 4 * i + 1, 4 * i + 2, 4 * i + 2, 4 * i + 1, 4 * i + 3], 6 * i);
    this.geometry.setAttribute('position', this.position);
    this.geometry.setIndex(new BufferAttribute(index, 1));
    this.reveal(0);
  }
  reveal(s: number): void {
    if (s === this.shown) return;
    this.shown = s;
    const arr = this.position.array as Float32Array;
    let n = 0;
    for (const q of this.quads) {
      if (q.from >= s) break;
      const end = q.to <= s ? q.b : along(q.a, q.b, (s - q.from) / (q.to - q.from));
      const v = [
        [q.a[0] + q.side[0], q.a[1] + q.side[1], q.a[2] + q.side[2]],
        [q.a[0] - q.side[0], q.a[1] - q.side[1], q.a[2] - q.side[2]],
        [end[0] + q.side[0], end[1] + q.side[1], end[2] + q.side[2]],
        [end[0] - q.side[0], end[1] - q.side[1], end[2] - q.side[2]],
      ];
      v.forEach((p, j) => arr.set(p, n * 12 + j * 3));
      n++;
    }
    this.geometry.setDrawRange(0, n * 6);
    this.position.needsUpdate = true;
  }
}

function flatMaterial(own: Own, color: string): MeshBasicMaterialT {
  return own(new MeshBasicMaterial({ color, transparent: true, depthTest: false, depthWrite: false }));
}

function lineMesh(scene: InstanceType<typeof Scene>, geometry: BufferGeometryT, material: MeshBasicMaterialT, order: number, name: string): MeshT {
  const mesh = new Mesh(geometry, material);
  mesh.renderOrder = order;
  mesh.frustumCulled = false;
  mesh.name = name;
  scene.add(mesh);
  return mesh;
}

function mountLadder(context: GameContext, input: RevealInput<'ladder'>, emit: (event: GameEvent) => void): RevealHandle {
  const plan: Plan = planFor(input);
  const { own, renderer, signal } = context;
  const doc = context.root.ownerDocument;
  const names = new Map(input.people.map((p) => [p.id, p.name]));
  let viewport: Viewport = input.viewport;
  let scale = backingScale(viewport);

  const scene = new Scene();
  scene.fog = new FogExp2(COLOR.raised, FOG_DENSITY);
  const camera = new PerspectiveCamera(40, 16 / 9, 0.05, 100);
  scene.add(camera);
  const quadGeo = own(new PlaneGeometry(1, 1));

  const ground = new Mesh(
    quadGeo,
    own(new ShaderMaterial({ vertexShader: GROUND_VERT, fragmentShader: GROUND_FRAG, depthTest: false, depthWrite: false })),
  );
  ground.renderOrder = LAYER.ground;
  ground.frustumCulled = false;
  scene.add(ground);

  // The frame layer: fixed to the camera one unit ahead, one unit per frame px at the focal length.
  const frameLayer = new Group();
  frameLayer.position.set(0, 0, -1);
  frameLayer.scale.set(1 / RIG.focal, 1 / RIG.focal, 1);
  camera.add(frameLayer);

  function fitCamera(): void {
    const aspect = viewport.cssWidth / Math.max(1, viewport.cssHeight);
    // The whole frame stays in view: height-limited on a wide screen, width-limited on a narrow one.
    const visibleH = aspect >= FRAME_W / FRAME_H ? FRAME_H : FRAME_W / aspect;
    camera.fov = (2 * Math.atan(visibleH / 2 / RIG.focal) * 180) / Math.PI;
    camera.aspect = aspect;
    camera.updateProjectionMatrix();
  }

  // ---- the track ----
  const unitNear = RIG.px(RIG.nearDepth);
  const laneMaterial = flatMaterial(own, TRACK.lane);
  const laneQuads = [0, 1, 2, 3, 4].map((lane) => quad(RIG.laneWorld(lane, 0), RIG.laneWorld(lane, 1), WIDTH.lane * unitNear, 0, 1, true, true));
  const lanes = new Ribbon(own, laneQuads);
  lanes.reveal(Infinity);
  lineMesh(scene, lanes.geometry, laneMaterial, LAYER.lanes, 'lanes');
  const unitFar = RIG.px(RIG.farDepth);
  const leaderQuads = [0, 1, 2, 3, 4].map((exit) =>
    quad(RIG.laneWorld(exit, 1), unproject(SLOT.x(exit), SLOT.leaderY, RIG.farDepth), WIDTH.leader * unitFar, 0, 1, false, false),
  );
  const leaders = new Ribbon(own, leaderQuads);
  leaders.reveal(Infinity);
  lineMesh(scene, leaders.geometry, laneMaterial, LAYER.lanes, 'leaders');

  const rungs = plan.rungs.map((r, i) => {
    const u = rowU(r.row);
    const ribbon = new Ribbon(own, [quad(RIG.laneWorld(r.left, u), RIG.laneWorld(r.left + 1, u), WIDTH.rung * unitNear, 0, 1, true, true)]);
    ribbon.reveal(Infinity);
    const material = flatMaterial(own, TRACK.rung);
    const mesh = lineMesh(scene, ribbon.geometry, material, LAYER.rungs, `rung:${i}`);
    return { litAt: r.litAt, material, mesh };
  });

  const disc = own(new CircleGeometry(1, 32));
  const arcsByTravel = plan.travels.map((tr) => arcLengths(tr.points));
  const paths = plan.travels.map((tr, k) => {
    const style = STYLES[tr.style]!;
    const pts = tr.points.map(worldOf);
    const arcs = arcsByTravel[k]!;
    const glow = new Ribbon(own, pathQuads(pts, arcs, WIDTH.glow * unitNear, false));
    const line = new Ribbon(own, pathQuads(pts, arcs, WIDTH.path * unitNear, style.dashed));
    const glowMaterial = flatMaterial(own, style.glow);
    const lineMaterial = flatMaterial(own, style.color);
    const headMaterial = flatMaterial(own, style.color);
    lineMesh(scene, glow.geometry, glowMaterial, LAYER.glow, `glow:${k}`);
    lineMesh(scene, line.geometry, lineMaterial, LAYER.path, `path:${k}`);
    const head = lineMesh(scene, disc, headMaterial, LAYER.head, `head:${k}`);
    return {
      tr,
      arcs,
      glow,
      line,
      head,
      glowMaterial,
      lineMaterial,
      headMaterial,
      color: new Color(style.color) as ColorT,
      dim: new Color(style.dim) as ColorT,
    };
  });

  // ---- plates, slots, hud, result ----
  const plates = plan.plates.map((p) => {
    const group = anchor(scene, unproject(PLATE.x(p.lane), PLATE.top, RIG.nearDepth), RIG.nearDepth);
    const panel = new Panel(own, doc, quadGeo, group, LAYER.panel);
    panel.mesh.name = `plate:${p.lane}`;
    return { ...p, group, panel };
  });
  const slots = plan.slots.map((slot) => {
    const group = anchor(scene, unproject(SLOT.x(slot.exit), SLOT.top, RIG.farDepth), RIG.farDepth);
    const panel = new Panel(own, doc, quadGeo, group, LAYER.panel);
    panel.mesh.name = `slot:${slot.exit}`;
    panel.mesh.userData.slotExit = slot.exit;
    return { slot, group, panel, named: null as boolean | null };
  });
  const top = new Panel(own, doc, quadGeo, frameLayer, LAYER.hud);
  const hud = new Panel(own, doc, quadGeo, frameLayer, LAYER.hud);
  const result = new Panel(own, doc, quadGeo, frameLayer, LAYER.result);
  top.mesh.name = 'top';
  hud.mesh.name = 'hud';
  result.mesh.name = 'result';
  const dots: Dot[] = Array.from({ length: ELIMINATION_ROUNDS + 1 }, (_, i) => (i < ELIMINATION_ROUNDS ? 'done' : 'on'));
  let hudKey = '';

  const paintSlotFor = (s: (typeof slots)[number], named: boolean): void => {
    const painted = paintSlot(doc, s.slot, named ? slotName(s.slot, names) : null, scale);
    s.panel.show(painted.paint);
    s.panel.at(0, -painted.height / 2, SLOT.w, painted.height);
    s.named = named;
  };

  const buildText = (): void => {
    for (const p of plates) {
      const painted = paintPlate(doc, names.get(p.id) ?? '', p.style, scale);
      p.panel.show(painted.paint);
      p.panel.at(0, -painted.height / 2, PLATE.w, painted.height);
    }
    for (const s of slots) if (s.named !== null) paintSlotFor(s, s.named);
    top.draw(FRAME_W, TOP_H, scale, (p) => paintTop(p, input.eventName, COPY.finalLabel, dots));
    top.frame(0, 0, FRAME_W, TOP_H);
    hudKey = '';
    const named = (r: { id: string; line: string; none: boolean }) => ({ ...r, name: names.get(r.id) ?? '' });
    result.draw(FRAME_W, FRAME_H, scale, (p) => paintResult(p, named(plan.result.spot), plan.result.cards.map(named)));
    result.frame(0, 0, FRAME_W, FRAME_H);
  };
  buildText();

  const lerpColor = (m: MeshBasicMaterialT, from: ColorT, to: ColorT, k: number): void => {
    m.color.copy(from).lerp(to, k);
  };
  const laneFull = new Color(TRACK.lane) as ColorT;
  const laneDim = new Color(TRACK.laneDim) as ColorT;
  const rungFull = new Color(TRACK.rung) as ColorT;
  const rungDim = new Color(TRACK.rungDim) as ColorT;

  const update = (t: number): void => {
    const pose = cameraAt(plan, arcsByTravel, t);
    camera.position.set(...pose.position);
    camera.lookAt(...pose.target);
    camera.updateMatrixWorld();

    const fade = t >= plan.resultAt ? clamp01((t - plan.resultAt) / T.result) : 0;
    result.opacity = fade;
    lerpColor(laneMaterial, laneFull, laneDim, fade);

    for (const r of rungs) {
      const lit = clamp01((t - r.litAt) / T.rungLit);
      r.mesh.visible = lit > 0;
      r.material.opacity = lit;
      lerpColor(r.material, rungFull, rungDim, fade);
    }

    for (const p of paths) {
      const s = lightDistance(p.tr, p.arcs, t);
      const started = t >= p.tr.startAt;
      p.glow.reveal(started ? s : 0);
      p.line.reveal(started ? s : 0);
      p.glowMaterial.opacity = 1 - fade;
      lerpColor(p.lineMaterial, p.color, p.dim, fade);
      lerpColor(p.headMaterial, p.color, p.dim, fade);
      p.head.visible = started;
      if (started) {
        const at = pointAt(p.tr.points, p.arcs, s);
        p.head.position.set(...at);
        p.head.quaternion.copy(camera.quaternion);
        const r = WIDTH.head * RIG.px(project(at).depth);
        p.head.scale.set(r, r, r);
      }
    }

    for (const g of [...plates.map((p) => p.group), ...slots.map((s) => s.group)]) g.quaternion.copy(camera.quaternion);
    const chrome = chromeOpacity(plan, t);
    for (const p of plates) p.panel.opacity = chrome;
    for (const s of slots) {
      const named = t >= s.slot.landAt;
      if (named !== s.named) paintSlotFor(s, named);
      s.panel.opacity = 1 - fade;
    }

    const label = t < plan.travels[0]!.startAt ? COPY.picked : COPY.oneAtATime;
    if (label !== hudKey) {
      hudKey = label;
      hud.draw(HUD_BOX.w, HUD_BOX.h, scale, (p) => paintHud(p, label));
      hud.frame(HUD.left, HUD.top, HUD_BOX.w, HUD_BOX.h);
    }
    hud.opacity = chrome;
  };

  fitCamera();
  update(0);
  renderer.render(scene, camera);

  // A face still loading paints with a fallback; repaint every text once the board's faces are in.
  const fonts = doc.fonts as FontFaceSet | undefined;
  if (fonts && !FACES.every((f) => fonts.check(f))) {
    Promise.all(FACES.map((f) => fonts.load(f))).then(
      () => {
        if (!signal.aborted) buildText();
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
        const next = backingScale(viewport);
        fitCamera();
        if (next !== scale) {
          scale = next;
          buildText();
        }
      } else if (command.type === 'finish') {
        complete();
      }
    },
    dispose(): void {
      if (disposed) return;
      disposed = true;
      camera.clear();
      scene.clear();
    },
  };
}

export const reveal: RevealModule<'ladder'> = { mount: mountLadder };
