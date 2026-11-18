// The envelopes reveal (gh#317, the game named in copy.ts): five gift envelopes stand in a row, each with its
// picker's name plate under it; one at a time, the envelopes that win nothing first and the first prize last, a
// flap lifts and the prize slot fades in over the body, until the row stands open under the result heading and
// the claim line.
//
// Design: the picked options of design/Gh317Envelopes.dc.html, A ROW and ONE AT A TIME (owner pick 2026-11-16),
// frames env-idle, env-rv-one, env-result and env-few. Its 3D intent: the camera square to the row; each flap a
// hinged quad that turns up and back over the body; type never scaled by depth. The bodies, slots, plates and
// chrome lie on the row's plane, where one world unit is one frame px, so the base camera reproduces the
// board's frame; only the flaps leave the plane. The bows and seal ride the flap tip, always facing the room.
//
// What this module does NOT do: choose anything. The committed record arrives in `input`; plan.ts reads what
// each envelope opens to from the shared pick-final plan and refuses a record it cannot draw as given. It owns
// no loop (the host ticks it), no fallback and no reduced-motion frame (the host draws its 2D final view for
// both), and allocates GPU resources only through `context.own`. Nothing in it is random, so there is nothing
// to seed: a refresh replays the same picture.

import {
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  DoubleSide,
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
import { isRenderHeld, onRenderHold } from '../../_render-hold.ts';
import {
  BODY_PANEL,
  CLAIM_W,
  COLOR,
  FACES,
  FIGURE_H,
  FIGURE_W,
  HUD_W,
  SEAL_PANEL,
  claimHeight,
  hudHeight,
  paintBand,
  paintBody,
  paintClaim,
  paintFigure,
  paintHud,
  paintPlate,
  paintSeal,
  paintSlot,
  paintTop,
  surface,
  type Dot,
  type Paintable,
} from './paint.ts';
import {
  BAND,
  BAND_TOP,
  CLAIM_BOTTOM,
  COPY,
  ENV,
  FLAP_LEN,
  FOCAL,
  FRAME_H,
  FRAME_W,
  HUD,
  OPEN_ANGLE,
  PLATE,
  SLOT,
  TOP_H,
  XS,
  bandAt,
  beatsIn,
  claimOpacity,
  flapAt,
  hudAt,
  planFor,
  slotOpacity,
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

/** Render order: ground, bodies, flaps, seals, slots, plates, chrome. Nothing tests depth: the row is a
 *  plane, and a flap turning toward the room is drawn over its own body anyway. Everything but the ground is
 *  transparent, so this one order governs it all. */
const LAYER = { ground: 0, body: 10, flap: 12, seal: 14, slot: 20, plate: 30, chrome: 40 } as const;

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
 *  the old one disposed. */
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

/** The flap: a triangle from the hinge's two ends down to the tip, in its pivot's px (y up, hinge at 0). */
function flapGeometry(own: Own): InstanceType<typeof BufferGeometry> {
  const g = own(new BufferGeometry());
  const half = ENV.w / 2;
  g.setAttribute('position', new BufferAttribute(new Float32Array([-half, 0, 0, half, 0, 0, 0, -FLAP_LEN, 0]), 3));
  g.setIndex(new BufferAttribute(new Uint16Array([0, 2, 1]), 1));
  return g;
}

function mountEnvelopes(context: GameContext, input: RevealInput<'envelopes'>, emit: (event: GameEvent) => void): RevealHandle {
  const plan: Plan = planFor(input);
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
  const flapGeo = flapGeometry(own);
  // Transparent like every panel: three draws its opaque list before its transparent one and sorts renderOrder
  // only within a list, so an opaque flap would land under the body it closes over.
  const flapMaterial = own(new MeshBasicMaterial({ color: COLOR.gold, side: DoubleSide, transparent: true, depthTest: false, depthWrite: false }));
  const bodyPaint = surface(doc, BODY_PANEL.w, BODY_PANEL.h, 2);
  paintBody(bodyPaint);
  const sealPaint = surface(doc, SEAL_PANEL.w, SEAL_PANEL.h, 2);
  paintSeal(sealPaint);

  const envelopes = XS.map((x, index) => {
    const body = new Panel(own, quadGeo, scene, LAYER.body, `body:${index}`);
    body.show(bodyPaint);
    body.frame(x - BODY_PANEL.w / 2, BODY_PANEL.top, BODY_PANEL.w, BODY_PANEL.h);

    // The pivot sits on the hinge; turning it about x lifts the flap toward the room and back over the top.
    const pivot = new Group();
    pivot.position.set(x - FRAME_W / 2, FRAME_H / 2 - (ENV.top + ENV.hinge), 0);
    scene.add(pivot);
    const flap = new Mesh(flapGeo, flapMaterial);
    flap.renderOrder = LAYER.flap;
    flap.frustumCulled = false;
    flap.name = `flap:${index}`;
    pivot.add(flap);
    // The tip carries the bows and seal; it turns back by the pivot's angle, so they always face the room.
    const tip = new Group();
    tip.position.set(0, -FLAP_LEN, 0);
    pivot.add(tip);
    const seal = new Panel(own, quadGeo, tip, LAYER.seal, `seal:${index}`);
    seal.show(sealPaint);
    // The seal's centre is on the tip; the panel's centre sits that far above it (y up).
    seal.at(0, SEAL_PANEL.cy - SEAL_PANEL.h / 2, SEAL_PANEL.w, SEAL_PANEL.h);

    const slot = new Panel(own, quadGeo, scene, LAYER.slot, `slot:${index}`);
    slot.mesh.userData.envelope = index;
    const plate = new Panel(own, quadGeo, scene, LAYER.plate, `plate:${index}`);
    plate.mesh.userData.plate = index;
    return { x, index, pivot, tip, slot, plate };
  });

  // ---- the chrome ----
  const top = new Panel(own, quadGeo, scene, LAYER.chrome, 'top');
  const hud = new Panel(own, quadGeo, scene, LAYER.chrome, 'hud');
  const band = new Panel(own, quadGeo, scene, LAYER.chrome, 'band');
  const figure = new Panel(own, quadGeo, scene, LAYER.chrome, 'figure');
  // The claim line is QR mode's (input.claim): admin mode and the demo have no phones, so its surface is
  // never built and never painted there. The band and figure keep their own fade either way (gh#319).
  const claim = input.claim ? new Panel(own, quadGeo, scene, LAYER.chrome, 'claim') : null;
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
    for (const e of envelopes) {
      const s = plan.slots[e.index]!;
      const slot = paintSlot(doc, s, names.get(s.id) ?? '', scale);
      e.slot.show(slot.paint);
      e.slot.frame(e.x - SLOT.w / 2, SLOT.top, SLOT.w, slot.height);
      const plate = paintPlate(doc, names.get(s.id) ?? '', scale);
      e.plate.show(plate.paint);
      e.plate.frame(e.x - PLATE.w / 2, PLATE.top, PLATE.w, plate.height);
    }
    const t = surface(doc, FRAME_W, TOP_H, scale);
    paintTop(t, input.eventName, COPY.finalLabel, dots);
    top.show(t);
    top.frame(0, 0, FRAME_W, TOP_H);
    const f = surface(doc, FIGURE_W, FIGURE_H, scale);
    paintFigure(f, { kind: 'count', value: plan.prizeCount }, COPY.unit);
    figure.show(f);
    figure.frame(FRAME_W / 2 - FIGURE_W / 2, BAND_TOP + BAND.h / 2 - FIGURE_H / 2, FIGURE_W, FIGURE_H);
    if (claim) {
      const ch = claimHeight(doc);
      const c = surface(doc, CLAIM_W, ch, scale);
      paintClaim(c);
      claim.show(c);
      claim.frame(HUD.side, FRAME_H - CLAIM_BOTTOM - ch, CLAIM_W, ch);
    }
    hudKey = '';
    bandKey = '';
  };
  buildText();

  const update = (t: number): void => {
    for (const e of envelopes) {
      const angle = OPEN_ANGLE * flapAt(plan, e.index, t);
      // Negative about x: the tip swings toward the room (+z) on its way up.
      e.pivot.rotation.x = -angle;
      e.tip.rotation.x = angle;
      e.slot.opacity = slotOpacity(plan, e.index, t);
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
    const c = claimOpacity(plan, t);
    if (claim) claim.opacity = c;
    band.opacity = 1 - c;
    figure.opacity = 1 - c;
  };

  fitCamera();
  update(0);
  renderer.render(scene, camera);

  // A face still loading paints with a fallback; repaint every text once the board's faces are in.
  const fonts = doc.fonts as FontFaceSet | undefined;
  if (fonts && !FACES.every((f) => fonts.check(f))) {
    Promise.all(FACES.map((f) => fonts.load(f))).then(
      () => {
        if (signal.aborted) return;
        buildText();
        // Repaint EVERY keyed surface with the new faces -- the hud and band included, which buildText only
        // resets the keys for (gh#319). Then redraw the held result, never during a render hold.
        update(now);
        if (completed) redrawHeld();
      },
      () => {},
    );
  }

  let last = -1;
  // The picture's own clock, clamped to the plan: a held resize or a finish redraws the result at this time.
  let now = 0;
  let completed = false;
  let disposed = false;
  const complete = (): void => {
    if (completed) return;
    completed = true;
    emit({ type: 'complete' });
  };
  // Draw the committed result frame. A hold game's picture must always BE the result state (gh#319): finish
  // draws it before completing, and a resize while held redraws it at the new size, never the opening frame.
  const drawResult = (): void => {
    now = plan.total;
    update(now);
    renderer.render(scene, camera);
  };

  // The held result's font redraw never submits a frame during a render hold (gh#272): if held, it waits and
  // draws once when the hold lifts, only while the scene is still attached and not aborted; if the host
  // released the picture meanwhile, it draws nothing (gh#319).
  let fontHoldOff: (() => void) | null = null;
  const redrawHeld = (): void => {
    if (signal.aborted || disposed) return;
    if (!isRenderHeld()) {
      renderer.render(scene, camera);
      return;
    }
    if (fontHoldOff) return;
    const onAbort = (): void => {
      fontHoldOff?.();
      fontHoldOff = null;
    };
    fontHoldOff = onRenderHold((held) => {
      if (held) return;
      onAbort();
      signal.removeEventListener('abort', onAbort);
      if (!signal.aborted && !disposed) renderer.render(scene, camera);
    });
    signal.addEventListener('abort', onAbort);
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
        now = Math.min(t, plan.total);
        update(now);
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
        drawResult();
        complete();
      }
    },
    dispose(): void {
      if (disposed) return;
      disposed = true;
      fontHoldOff?.();
      fontHoldOff = null;
      camera.clear();
      scene.clear();
    },
  };
}

export const reveal: RevealModule<'envelopes'> = { mount: mountEnvelopes };
