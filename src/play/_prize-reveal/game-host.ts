// The one renderer state machine of the prize-draw reveal (gh#305). Every 3D game -- fireworks, cards,
// ladder -- runs inside this host, so fallback, holding and disposal are implemented once.
//
//   idle -> loading -> running <-> held -> settled
//   loading | running | held -> fallback        (sticky for this outcome)
//   idle -> fallback                            (no game, unavailable game, reduced motion or a phone-width
//                                                viewport at entry)
//   any -> disposed
//
// Reduced motion at entry, a viewport narrower than the phone boundary at entry, a null game or an
// unavailable one go straight to the 2D view, before three or the game is imported: a phone shows the 2D
// reveal, never the 1920 frame scaled down until its names are unreadable. No WebGL2, an import or init
// failure, a mount or render exception, a module error, a lost context, reduced motion turning on or the
// viewport narrowing past that boundary mid-reveal fall back to that same 2D view, and nothing restarts the
// reveal afterwards -- not a restored context, not motion turned back on, not a viewport widened again.
// Slow frames never fall back.
//
// Every exit, whichever way: abort the module's signal, cancel the frame, drop every listener and
// observer, dispose the module's handle, everything it registered through `own`, and the renderer;
// release the raw WebGL context (held from acquisition, renderer or not) and detach its canvas and the 3D
// layer; then draw the committed 2D view exactly once (ADR-0051: the projector never blanks). The 2D
// view is the caller's callback, so the stage keeps its own name sinks, fitting and live region.
//
// The host owns the one canvas, the one renderer and the animation loop. Held time (the shared render
// hold, gh#272) and hidden time are excluded from the elapsed time a module sees.

import type { GameEvent, GameId, RevealHandle, RevealInput, RevealModule, Viewport } from './game-contract.ts';
import { isAvailable, loaderFor } from './game-registry.ts';
import { activeFrameSampler, type FrameSampler } from './frame-time.ts';
import { isRenderHeld, onRenderHold, RENDER_HOLD_INSTANCE_ATTR } from '../_render-hold.ts';

export type HostState = 'idle' | 'loading' | 'running' | 'held' | 'settled' | 'fallback' | 'disposed';
export type FallbackReason =
  | 'no-game'
  | 'unavailable'
  | 'reduced-motion-entry'
  | 'no-webgl2'
  | 'import'
  | 'init'
  | 'mount'
  | 'render'
  | 'module-error'
  | 'context-lost'
  | 'reduced-motion'
  | 'narrow-entry'
  | 'narrow';

/** The slice of three's WebGLRenderer the host itself touches. */
export type HostRenderer = {
  setSize(width: number, height: number, updateStyle?: boolean): void;
  setPixelRatio(ratio: number): void;
  dispose(): void;
  forceContextLoss?(): void;
};
export type RendererFactory = (canvas: HTMLCanvasElement, gl: WebGL2RenderingContext) => HostRenderer;

type MotionQuery = {
  matches: boolean;
  addEventListener(type: 'change', fn: (e: { matches: boolean }) => void): void;
  removeEventListener(type: 'change', fn: (e: { matches: boolean }) => void): void;
};
type Observer = { observe(el: Element): void; disconnect(): void };

/** Every browser seam the host touches, injectable so the machine runs under node:test. The render hold is
 *  deliberately NOT one of them (gh#305 REFUTE round 2): the host imports it, so no environment can hand
 *  it a different hold, and the wiring gate can prove the subscription by symbol. */
export type HostEnv = {
  document: Document;
  matchMedia(query: string): MotionQuery;
  requestAnimationFrame(cb: (t: number) => void): number;
  cancelAnimationFrame(id: number): void;
  now(): number;
  devicePixelRatio(): number;
  /** Imports three and returns how to build a renderer on an existing WebGL2 context. */
  loadRenderer(): Promise<RendererFactory>;
  ResizeObserver?: new (cb: () => void) => Observer;
  frameSampler?: FrameSampler | null;
};

export type HostRegistry = {
  isAvailable(game: GameId): boolean;
  loaderFor<G extends GameId>(game: G): () => Promise<RevealModule<G>>;
};

export type HostOptions<G extends GameId> = {
  /** The element the 3D layer fills. */
  container: HTMLElement;
  /** The picked game; null reveals in 2D. */
  game: G | null;
  /** Everything but what the host measures itself (viewport, reduced motion). */
  input: Omit<RevealInput<G>, 'viewport' | 'reducedMotion'>;
  /** Draw the committed 2D view. Called exactly once, on whichever exit comes first. */
  render2D(outcome: RevealInput<G>['outcome']): void;
  /** The module's beats and its completion, for the stage's announcements and controls. */
  onEvent?(event: GameEvent): void;
  onState?(state: HostState, reason?: FallbackReason): void;
  registry?: HostRegistry;
};

export type RevealHost = {
  readonly state: HostState;
  readonly reason: FallbackReason | null;
  /** 'next' is forwarded to the module; 'finish' is forwarded and then settles at once. */
  command(command: 'next' | 'finish'): void;
  /** Ends the reveal (drawing the 2D view if no exit has yet). Idempotent. */
  dispose(): void;
  /** Resolves with the first exit state, once the 2D view is drawn. */
  readonly done: Promise<HostState>;
};

export const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';
/** A viewport narrower than the site's phone boundary (640px, the tokens' breakpoints). Written as the
 *  complement of `min-width: 640px` rather than `max-width: 639px`: a fractional width (a zoomed page,
 *  639.5px) matches neither whole-pixel bound, and would otherwise get the 3D reveal on a phone. */
export const NARROW_QUERY = 'not all and (min-width: 640px)';
/** The context the host asks for; three builds on it as given. */
const GL_ATTRIBUTES: WebGLContextAttributes = {
  alpha: false,
  antialias: true,
  depth: true,
  stencil: false,
  premultipliedAlpha: true,
  preserveDrawingBuffer: false,
  powerPreference: 'high-performance',
};
/** A backing store past 2x buys no visible detail on a projector and costs fill rate. */
const MAX_DPR = 2;

export function browserEnv(): HostEnv {
  return {
    document,
    matchMedia: (query) => window.matchMedia(query),
    requestAnimationFrame: (cb) => window.requestAnimationFrame(cb),
    cancelAnimationFrame: (id) => window.cancelAnimationFrame(id),
    now: () => performance.now(),
    devicePixelRatio: () => window.devicePixelRatio || 1,
    loadRenderer: async () => {
      // Destructured at the import, so the bundler keeps three tree-shaken (ADR-0068's measured variant).
      const { WebGLRenderer } = await import('three');
      return (canvas, gl) => new WebGLRenderer({ canvas, context: gl });
    },
    ResizeObserver: typeof ResizeObserver === 'undefined' ? undefined : ResizeObserver,
    frameSampler: activeFrameSampler(),
  };
}

/** Each host's name in the hold's diagnostics; stamped on its layer so a probe finds the live one's. */
let hostInstances = 0;

export function startReveal<G extends GameId>(options: HostOptions<G>, env: HostEnv = browserEnv()): RevealHost {
  const { container, game, input, render2D, onEvent, onState } = options;
  const registry: HostRegistry = options.registry ?? { isAvailable, loaderFor };
  const sampler = env.frameSampler ?? null;
  const doc = env.document;
  const instance = `prize-reveal:${++hostInstances}`;

  // The terminal latch. `exited` is set first thing on the first exit and never cleared; every step that
  // follows a call out of the host (an await, a listener, a factory, a module) re-reads it before it
  // advances the machine, schedules a frame or builds anything. While a module is mounting the host does
  // not yet hold its handle, so an exit asked for then is deferred to the moment mount returns, and a
  // dispose among the requests always wins. An exit asked for inside an exit (from render2D or the exit's
  // own onState) is queued behind it, so listeners hear the first exit, then the dispose.
  let state: HostState = 'idle';
  let reason: FallbackReason | null = null;
  let exited = false;
  let exiting = false;
  let disposeQueued = false;
  let mounting = false;
  let deferred: ['settled' | 'fallback' | 'disposed', FallbackReason | null] | null = null;
  const abort = new AbortController();
  const offs: (() => void)[] = [];
  const owned: { dispose(): void }[] = [];
  let canvas: HTMLCanvasElement | null = null;
  let gl: WebGL2RenderingContext | null = null;
  let renderer: HostRenderer | null = null;
  let handle: RevealHandle | null = null;
  let layer: HTMLElement | null = null;
  let observer: Observer | null = null;
  let rafId = 0;
  let last: number | null = null;
  let elapsed = 0;
  let phase = 'start';
  let pausedSince = 0;
  /** Why the reveal paused, read as it paused: by the resume the page is visible again. */
  let pausedFor: 'held' | 'hidden' = 'held';
  let resolveDone!: (s: HostState) => void;
  const done = new Promise<HostState>((r) => (resolveDone = r));

  const loud = (err: unknown): void => {
    queueMicrotask(() => {
      throw err;
    });
  };
  /** A call out to code the host does not own: its failure is rethrown on its own job, never into the
   *  machine, so a throwing listener cannot leave a transition half done. */
  const guard = (fn: () => void): void => {
    try {
      fn();
    } catch (err) {
      loud(err);
    }
  };
  /** A non-terminal transition. False when a listener ended the reveal meanwhile: the caller stops. */
  const enter = (next: HostState): boolean => {
    state = next;
    guard(() => onState?.(next));
    return !exited;
  };
  const hidden = (): boolean => doc.visibilityState === 'hidden';
  const paused = (): boolean => isRenderHeld() || hidden();
  const viewport = (): Viewport => ({
    cssWidth: container.clientWidth,
    cssHeight: container.clientHeight,
    dpr: Math.min(env.devicePixelRatio(), MAX_DPR),
  });
  const schedule = (): void => {
    if (exited || state !== 'running' || rafId) return;
    const id = env.requestAnimationFrame(frame);
    // The request is a call-out too: if it ended the reveal, the frame it queued is cancelled.
    if (exited) env.cancelAnimationFrame(id);
    else rafId = id;
  };
  /** A frame-time hook, then the latch: a sampler is a probe's code and may end the reveal. */
  const sample = (fn: (s: FrameSampler) => void): boolean => {
    if (sampler) guard(() => fn(sampler));
    return !exited;
  };
  /** Mounted and ready: wait held, or run. Every call-out between here and the transition re-reads the
   *  latch (the hold read, the clock). */
  const settleIn = (): void => {
    const hold = paused();
    if (exited) return;
    if (hold) {
      pausedFor = hidden() ? 'hidden' : 'held';
      pausedSince = env.now();
      if (!exited) enter('held');
    } else if (enter('running')) {
      schedule();
    }
  };

  /** The raw context is the host's from the moment it is acquired, with or without a renderer on it:
   *  released once, through WEBGL_lose_context where the browser has it. */
  function releaseContext(): void {
    const ctx = gl;
    gl = null;
    if (ctx) guard(() => ctx.getExtension('WEBGL_lose_context')?.loseContext());
  }

  function teardown(): void {
    abort.abort();
    if (rafId) env.cancelAnimationFrame(rafId);
    rafId = 0;
    // Listeners first, the context-loss one included: nothing below can re-enter the machine.
    for (const off of offs.splice(0)) guard(off);
    if (observer) guard(() => observer!.disconnect());
    observer = null;
    const h = handle;
    handle = null;
    if (h) guard(() => h.dispose());
    for (const res of owned.splice(0).reverse()) guard(() => res.dispose());
    const r = renderer;
    renderer = null;
    if (r) guard(() => r.dispose());
    releaseContext();
    if (canvas) canvas.parentNode?.removeChild(canvas);
    canvas = null;
    if (layer) layer.parentNode?.removeChild(layer);
    layer = null;
  }

  function exit(kind: 'settled' | 'fallback' | 'disposed', why: FallbackReason | null = null): void {
    if (exited) {
      if (kind !== 'disposed') return;
      if (exiting) disposeQueued = true;
      else if (state !== 'disposed') enter('disposed');
      return;
    }
    if (mounting) {
      if (!deferred || kind === 'disposed') deferred = [kind, why];
      return;
    }
    exited = true;
    exiting = true;
    reason = why;
    state = kind;
    teardown();
    guard(() => render2D(input.outcome));
    guard(() => onState?.(kind, why ?? undefined));
    exiting = false;
    resolveDone(kind);
    if (disposeQueued) enter('disposed');
  }

  function frame(t: number): void {
    rafId = 0;
    if (exited || state !== 'running' || !handle) return;
    const delta = last === null ? 0 : t - last;
    const interval = last === null ? null : delta;
    last = t;
    elapsed += delta;
    const t0 = env.now();
    if (exited) return;
    try {
      handle.advance({ type: 'tick', elapsedMs: elapsed, deltaMs: delta });
    } catch {
      exit('fallback', 'render');
      return;
    }
    if (exited) return;
    if (!sample((s) => s.frame(phase, interval, env.now() - t0))) return;
    schedule();
  }

  /** Running and held follow the hold and the page's visibility, once the module is mounted. */
  function sync(): void {
    if (exited || (state !== 'running' && state !== 'held')) return;
    const want = paused() ? 'held' : 'running';
    if (exited || want === state) return;
    if (want === 'held') {
      const id = rafId;
      rafId = 0;
      if (id) env.cancelAnimationFrame(id);
      if (exited) return;
      pausedFor = hidden() ? 'hidden' : 'held';
      pausedSince = env.now();
      if (!exited) enter('held');
    } else {
      if (!sample((s) => s.gap(pausedFor, env.now() - pausedSince))) return;
      last = null;
      if (enter('running')) schedule();
    }
  }

  function emit(event: GameEvent): void {
    if (exited || deferred) return;
    if (event.type === 'beat') {
      phase = `${event.beat}:${event.index}`;
      guard(() => onEvent?.(event));
    } else if (event.type === 'complete') {
      guard(() => onEvent?.(event));
      exit('settled');
    } else {
      exit('fallback', 'module-error');
    }
  }

  function own<T extends { dispose(): void }>(resource: T): T {
    if (exited) guard(() => resource.dispose());
    else owned.push(resource);
    return resource;
  }

  function resize(): void {
    if (exited || !renderer || !handle) return;
    const vp = viewport();
    try {
      if (exited) return;
      renderer.setPixelRatio(vp.dpr);
      if (exited) return;
      renderer!.setSize(vp.cssWidth, vp.cssHeight, false);
      if (exited) return;
      handle!.advance({ type: 'resize', viewport: vp });
    } catch {
      exit('fallback', 'render');
    }
  }

  function begin(module: RevealModule<G>, factory: RendererFactory, loadStart: number): void {
    const cv = canvas!;
    try {
      const made = factory(cv, gl!);
      // A dispose (or any exit) inside the factory already tore down without it: release it and stop.
      if (exited) {
        guard(() => made.dispose());
        return;
      }
      renderer = made;
      const vp = viewport();
      made.setPixelRatio(vp.dpr);
      made.setSize(vp.cssWidth, vp.cssHeight, false);
    } catch {
      exit('fallback', 'init');
      return;
    }
    if (exited) return;
    const box = doc.createElement('div');
    if (exited) return;
    box.className = 'pr-host';
    box.setAttribute(RENDER_HOLD_INSTANCE_ATTR, instance);
    box.style.position = 'absolute';
    box.style.inset = '0';
    cv.style.display = 'block';
    cv.style.width = '100%';
    cv.style.height = '100%';
    box.appendChild(cv);
    layer = box;
    container.appendChild(box);
    if (env.ResizeObserver) {
      observer = new env.ResizeObserver(resize);
      observer.observe(container);
    }
    // The DOM calls, the observer and the viewport reads above are call-outs: re-read before mounting.
    if (exited) return;
    const full = { ...input, viewport: viewport(), reducedMotion: false } as RevealInput<G>;
    let threw = false;
    mounting = true;
    try {
      handle = module.mount({ root: box, renderer: renderer!, signal: abort.signal, own }, full, emit);
    } catch {
      threw = true;
    }
    mounting = false;
    // An exit asked for during mount comes first (a dispose above all); then a mount that threw.
    if (deferred) {
      const [kind, why] = deferred;
      deferred = null;
      exit(kind, why);
      return;
    }
    if (threw) {
      exit('fallback', 'mount');
      return;
    }
    if (!sample((s) => s.gap('load', env.now() - loadStart))) return;
    settleIn();
  }

  function start(): void {
    if (game === null) return exit('fallback', 'no-game');
    if (!registry.isAvailable(game)) return exit('fallback', 'unavailable');
    const motion = env.matchMedia(REDUCED_MOTION_QUERY);
    if (motion.matches) return exit('fallback', 'reduced-motion-entry');
    const width = env.matchMedia(NARROW_QUERY);
    if (width.matches) return exit('fallback', 'narrow-entry');

    if (!enter('loading')) return;
    const loadStart = env.now();
    const onMotion = (e: { matches: boolean }): void => {
      if (e.matches) exit('fallback', 'reduced-motion');
    };
    motion.addEventListener('change', onMotion);
    offs.push(() => motion.removeEventListener('change', onMotion));
    const onWidth = (e: { matches: boolean }): void => {
      if (e.matches) exit('fallback', 'narrow');
    };
    width.addEventListener('change', onWidth);
    offs.push(() => width.removeEventListener('change', onWidth));
    offs.push(onRenderHold(sync, instance));
    doc.addEventListener('visibilitychange', sync);
    offs.push(() => doc.removeEventListener('visibilitychange', sync));

    const cv = doc.createElement('canvas');
    canvas = cv;
    // Attached before any context exists, so a loss during acquisition or init is caught too.
    const onLost = (e: Event): void => {
      e.preventDefault();
      exit('fallback', 'context-lost');
    };
    cv.addEventListener('webglcontextlost', onLost);
    offs.push(() => cv.removeEventListener('webglcontextlost', onLost));
    let acquired: WebGL2RenderingContext | null = null;
    try {
      acquired = cv.getContext('webgl2', GL_ATTRIBUTES);
    } catch {
      acquired = null;
    }
    gl = acquired;
    // Lost while being acquired: the teardown ran before the context was held, so release it here.
    if (exited) return releaseContext();
    if (!gl) return exit('fallback', 'no-webgl2');

    // Called inside the promise, so a loader that throws at once reads as a failed import too.
    const call = <T,>(fn: () => Promise<T>): Promise<T> => new Promise<T>((resolve) => resolve(fn()));
    Promise.all([call(() => registry.loaderFor(game)()), call(() => env.loadRenderer())]).then(
      ([module, factory]) => {
        // A late import after any exit is discarded: nothing is built for a reveal that is over.
        if (exited) return;
        try {
          begin(module, factory, loadStart);
        } catch (err) {
          exit('fallback', 'init');
          loud(err);
        }
      },
      () => exit('fallback', 'import'),
    );
  }

  start();

  return {
    get state() {
      return state;
    },
    get reason() {
      return reason;
    },
    command(command) {
      if (exited) return;
      if ((state === 'running' || state === 'held') && handle) {
        try {
          handle.advance({ type: command });
        } catch {
          exit('fallback', 'render');
          return;
        }
      }
      if (command === 'finish') exit('settled');
    },
    dispose() {
      exit('disposed');
    },
    done,
  };
}
