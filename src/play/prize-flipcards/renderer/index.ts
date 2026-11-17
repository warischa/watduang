// The flipcards reveal (gh#318, the game named in copy.ts): five face-down cards stand in a row, each with its
// picker's name plate under it; one at a time, the cards that win nothing first and the first prize last, a card
// turns over about its upright centre line to show its face (the prize slot), until the row stands face up under
// the result heading and the claim line.
//
// Design: the picked options of design/Gh318Cards.dc.html, A ROW and ONE AT A TIME (owner pick 2026-11-16),
// frames card-idle, card-rv-one, card-result and card-few. Its 3D intent: the camera square to the row; each
// turn a rotateY about the card's centre. The backs, faces, plates and chrome lie on the row's plane, where one
// world unit is one frame px, so the base camera reproduces the board's frame; a card leaves the plane only
// while it turns. Every word, the face text included, is painted into a canvas and shown as a texture (the
// envelopes final's way), not laid over the scene as HTML.
//
// What this module does NOT do: choose anything. The committed record arrives in `input`; plan.ts reads what
// each card turns to from the shared pick-final plan and refuses a record it cannot draw as given. It owns no
// loop (the host ticks it), no fallback and no reduced-motion frame (the host draws its 2D final view for both),
// and allocates GPU resources only through `context.own`. Nothing in it is random, so there is nothing to seed:
// a refresh replays the same picture.

import { CanvasTexture, Group, LinearFilter, Mesh, PerspectiveCamera, PlaneGeometry, Scene, ShaderMaterial, Vector3 } from 'three';
import { ELIMINATION_ROUNDS } from '../../../prize-draw/schedule.ts';
import type { GameCommand, GameContext, GameEvent, RevealHandle, RevealInput, RevealModule, Viewport } from '../../_prize-reveal/game-contract.ts';
import {
  CLAIM_W,
  COLOR,
  FACE_MARGIN,
  FACES,
  FIGURE_H,
  FIGURE_W,
  HUD_W,
  claimHeight,
  hudHeight,
  paintBack,
  paintBand,
  paintClaim,
  paintFace,
  paintFigure,
  paintHud,
  paintPlate,
  paintTop,
  surface,
  type Dot,
  type Paintable,
} from './paint.ts';
import {
  BAND,
  BAND_TOP,
  CARD,
  CARD_CY,
  CLAIM_BOTTOM,
  COPY,
  FOCAL,
  FRAME_H,
  FRAME_W,
  HUD,
  PLATE,
  TOP_H,
  XS,
  assertPlan,
  bandAt,
  beatsIn,
  claimOpacity,
  hudAt,
  planFor,
  turnAt,
  type Plan,
} from './plan.ts';

// Instance types read off the classes: three ships no declarations (see _prize-reveal/three-shim.d.ts), and
// this form stays right if its typings are added.
type CanvasTextureT = InstanceType<typeof CanvasTexture>;
type ShaderMaterialT = InstanceType<typeof ShaderMaterial>;
type PlaneGeometryT = InstanceType<typeof PlaneGeometry>;
type GroupT = InstanceType<typeof Group>;
type MeshT = InstanceType<typeof Mesh>;

type Own = GameContext['own'];

/** Render order: ground, cards, plates, chrome. Nothing tests depth: the row is a plane, the cards never
 *  overlap one another, and a card shows one side at a time. Everything but the ground is transparent, so this
 *  one order governs it all. */
const LAYER = { ground: 0, card: 10, plate: 30, chrome: 40 } as const;

/** How close to edge-on a card may be before its facing stops deciding which side shows: a cosine of the
 *  angle to the camera below this is a card presenting no area at all, where the sign is float noise rather
 *  than a side genuinely turned away. Inside it the face shows, so a card the camera looks at square-on
 *  swaps sides on its half turn. */
const EDGE_ON = 1e-6;

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

/** A painted panel: a quad in its parent's px space (y up), showing a canvas. A new paint gets a new texture,
 *  the old one disposed. Front side only: a panel turned away from the room is not drawn. */
class Panel {
  readonly mesh: MeshT;
  readonly material: ShaderMaterialT;
  private tex: CanvasTextureT | null = null;
  private readonly own: Own;
  constructor(own: Own, quad: PlaneGeometryT, parent: GroupT | InstanceType<typeof Scene>, order: number, name: string) {
    this.own = own;
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
    this.mesh.name = name;
    parent.add(this.mesh);
  }
  show(painted: Paintable): void {
    this.tex?.dispose();
    this.tex = canvasTexture(this.own, painted);
    this.material.uniforms.uMap!.value = this.tex;
  }
  /** Centre (cx, cy) and size, in the parent's px, y up. */
  at(cx: number, cy: number, w: number, h: number): void {
    this.mesh.position.set(cx, cy, 0);
    this.mesh.scale.set(w, h, 1);
  }
  /** A rect in frame px (y down), on the row's plane. */
  frame(x: number, y: number, w: number, h: number): void {
    this.at(x + w / 2 - FRAME_W / 2, FRAME_H / 2 - y - h / 2, w, h);
  }
  set opacity(v: number) {
    this.material.uniforms.uOpacity!.value = v;
    this.mesh.visible = v > 0;
  }
}

function mountFlipcards(context: GameContext, input: RevealInput<'flipcards'>, emit: (event: GameEvent) => void): RevealHandle {
  const plan: Plan = planFor(input);
  assertPlan(plan, input);
  const { own, renderer, signal } = context;
  const doc = context.root.ownerDocument;
  const names = new Map(input.people.map((p) => [p.id, p.name]));
  let viewport: Viewport = input.viewport;
  let scale = backingScale(viewport);

  const scene = new Scene();
  const camera = new PerspectiveCamera(30, 16 / 9, 1, FOCAL * 4);
  camera.position.set(0, 0, FOCAL);
  camera.lookAt(0, 0, 0);
  scene.add(camera);
  const quadGeo = own(new PlaneGeometry(1, 1));

  const ground = new Mesh(
    quadGeo,
    own(new ShaderMaterial({ vertexShader: GROUND_VERT, fragmentShader: GROUND_FRAG, depthTest: false, depthWrite: false })),
  );
  ground.renderOrder = LAYER.ground;
  ground.frustumCulled = false;
  ground.name = 'ground';
  scene.add(ground);

  function fitCamera(): void {
    const aspect = viewport.cssWidth / Math.max(1, viewport.cssHeight);
    // The whole frame stays in view: height-limited on a wide screen, width-limited on a narrow one.
    const visibleH = aspect >= FRAME_W / FRAME_H ? FRAME_H : FRAME_W / aspect;
    camera.fov = (2 * Math.atan(visibleH / 2 / FOCAL) * 180) / Math.PI;
    camera.aspect = aspect;
    camera.updateProjectionMatrix();
  }

  // ---- the row ----
  const backPaint = surface(doc, CARD.w, CARD.h, 2);
  paintBack(backPaint);

  const cards = XS.map((x, index) => {
    // The pivot sits on the card's centre; turning it about y turns the card over on its upright centre line.
    const pivot = new Group();
    pivot.position.set(x - FRAME_W / 2, FRAME_H / 2 - CARD_CY, 0);
    pivot.name = `card:${index}`;
    scene.add(pivot);
    const back = new Panel(own, quadGeo, pivot, LAYER.card, `back:${index}`);
    back.show(backPaint);
    back.at(0, 0, CARD.w, CARD.h);
    back.mesh.userData.back = index;
    // The face starts turned half round, its front away from the room; the card's half turn brings it round
    // the right way, never mirrored.
    const face = new Panel(own, quadGeo, pivot, LAYER.card, `face:${index}`);
    face.mesh.rotation.y = Math.PI;
    face.mesh.userData.card = index;
    const plate = new Panel(own, quadGeo, scene, LAYER.plate, `plate:${index}`);
    plate.mesh.userData.plate = index;
    return { x, index, pivot, back, face, plate };
  });

  // ---- the chrome ----
  const top = new Panel(own, quadGeo, scene, LAYER.chrome, 'top');
  const hud = new Panel(own, quadGeo, scene, LAYER.chrome, 'hud');
  const band = new Panel(own, quadGeo, scene, LAYER.chrome, 'band');
  const figure = new Panel(own, quadGeo, scene, LAYER.chrome, 'figure');
  const claim = new Panel(own, quadGeo, scene, LAYER.chrome, 'claim');
  const dots: Dot[] = Array.from({ length: ELIMINATION_ROUNDS + 1 }, (_, i) => (i < ELIMINATION_ROUNDS ? 'done' : 'on'));
  let hudKey = '';
  let bandKey = '';

  const paintHudPanel = (instruction: string): void => {
    const h = hudHeight(doc, instruction);
    const p = surface(doc, HUD_W, h, scale);
    paintHud(p, instruction);
    hud.show(p);
    hud.frame(HUD.side, HUD.top, HUD_W, h);
  };
  const paintBandPanel = (status: string, note: string): void => {
    const p = surface(doc, FRAME_W, BAND.h, scale);
    paintBand(p, status, note);
    band.show(p);
    band.frame(0, BAND_TOP, FRAME_W, BAND.h);
  };

  const buildText = (): void => {
    for (const c of cards) {
      const s = plan.slots[c.index]!;
      const face = paintFace(doc, s, names.get(s.id) ?? '', scale);
      c.face.show(face.paint);
      // Centred on the card: the margin holds the ring and glow, and a face taller than the card overflows
      // it evenly above and below.
      c.face.at(0, 0, CARD.w + 2 * FACE_MARGIN, face.height);
      const plate = paintPlate(doc, names.get(s.id) ?? '', scale);
      c.plate.show(plate.paint);
      c.plate.frame(c.x - PLATE.w / 2, PLATE.top, PLATE.w, plate.height);
    }
    const t = surface(doc, FRAME_W, TOP_H, scale);
    paintTop(t, input.eventName, COPY.finalLabel, dots);
    top.show(t);
    top.frame(0, 0, FRAME_W, TOP_H);
    const f = surface(doc, FIGURE_W, FIGURE_H, scale);
    paintFigure(f, { kind: 'count', value: plan.prizeCount }, COPY.unit);
    figure.show(f);
    figure.frame(FRAME_W / 2 - FIGURE_W / 2, BAND_TOP + BAND.h / 2 - FIGURE_H / 2, FIGURE_W, FIGURE_H);
    const ch = claimHeight(doc);
    const c = surface(doc, CLAIM_W, ch, scale);
    paintClaim(c);
    claim.show(c);
    claim.frame(HUD.side, FRAME_H - CLAIM_BOTTOM - ch, CLAIM_W, ch);
    hudKey = '';
    bandKey = '';
  };
  buildText();

  // Which side of a card the room sees is a fact about where that card stands under this camera. The scratch
  // vectors are reused every frame; the camera's place is read once per update.
  const camPos = new Vector3();
  const normal = new Vector3();
  const centre = new Vector3();
  const toCam = new Vector3();
  /** The cosine of the angle between a panel's outward normal and the direction to the camera from where the
   *  panel stands: positive its front faces the room, negative its back does, zero edge-on. */
  const facing = (mesh: MeshT): number => {
    mesh.updateWorldMatrix(true, false);
    normal.set(0, 0, 1).transformDirection(mesh.matrixWorld);
    centre.setFromMatrixPosition(mesh.matrixWorld);
    toCam.copy(camPos).sub(centre);
    const d = toCam.length();
    return d > 0 ? normal.dot(toCam) / d : 0;
  };

  const update = (t: number): void => {
    camera.getWorldPosition(camPos);
    for (const c of cards) {
      c.pivot.rotation.y = Math.PI * turnAt(plan, c.index, t);
      // One side at a time, chosen by the panel's real facing toward the camera from this card's place in the
      // row -- never by the clock. Away from the centre the half turn is not edge-on: swapping on the clock
      // there hides the back while the face still points away, and the card vanishes for part of its turn.
      // The face is mounted half round, so its facing is the back's opposite and one sign decides the pair.
      const backShows = facing(c.back.mesh) > EDGE_ON;
      c.back.mesh.visible = backShows;
      c.face.mesh.visible = !backShows;
    }
    const label = hudAt(plan, t);
    if (label !== hudKey) {
      hudKey = label;
      paintHudPanel(label);
    }
    const sides = bandAt(plan, t);
    const key = `${sides.status}|${sides.note}`;
    if (key !== bandKey) {
      bandKey = key;
      paintBandPanel(sides.status, sides.note);
    }
    const o = claimOpacity(plan, t);
    claim.opacity = o;
    band.opacity = 1 - o;
    figure.opacity = 1 - o;
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

export const reveal: RevealModule<'flipcards'> = { mount: mountFlipcards };
