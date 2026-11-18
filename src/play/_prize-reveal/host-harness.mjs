// Test-only harness for game-host.ts (gh#305). Not a *.test.mjs file, so the runner does not collect it.
// Node has no WebGL, so every browser seam the host touches is faked here and counted: the canvas and its
// listeners, matchMedia and its change listeners, the RAF queue, the clock, the render hold, the document's
// visibility, the renderer factory and the game module. A fake that cannot be observed proves nothing, so
// each one records what was done to it.

import * as hold from '../_render-hold.ts';
import { startReveal } from './game-host.ts';

// The hold is the REAL module (gh#305 REFUTE round 2): the host reaches it by import, never through the
// environment, so these tests acquire and release real holds. The module writes <html>'s attribute, so a
// minimal document stands in for it here; the host's own document is the fake page below.
globalThis.document ??= {
  documentElement: {
    attrs: new Map(),
    setAttribute(k, v) { this.attrs.set(k, String(v)); },
    getAttribute(k) { return this.attrs.has(k) ? this.attrs.get(k) : null; },
  },
};
/** Holds a page took and has not released: a new page releases every earlier one first, so no test
 *  inherits a hold from the last. */
const openHolds = new Set();

class FakeTarget {
  constructor() {
    this.listeners = new Map();
  }
  addEventListener(type, fn) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type).add(fn);
  }
  removeEventListener(type, fn) {
    this.listeners.get(type)?.delete(fn);
  }
  count(type) {
    return this.listeners.get(type)?.size ?? 0;
  }
  dispatch(type, event = {}) {
    for (const fn of [...(this.listeners.get(type) ?? [])]) fn({ type, ...event });
  }
}

class FakeEl extends FakeTarget {
  constructor(tag, page) {
    super();
    this.tagName = tag.toUpperCase();
    this.page = page;
    this.children = [];
    this.parentNode = null;
    this.style = {};
    this.className = '';
    this.clientWidth = 1920;
    this.clientHeight = 1080;
    this.attrs = new Map();
  }
  setAttribute(k, v) {
    this.attrs.set(k, String(v));
  }
  getAttribute(k) {
    return this.attrs.has(k) ? this.attrs.get(k) : null;
  }
  appendChild(child) {
    child.parentNode = this;
    this.children.push(child);
    return child;
  }
  removeChild(child) {
    this.children = this.children.filter((c) => c !== child);
    child.parentNode = null;
    return child;
  }
  remove() {
    this.parentNode?.removeChild(this);
  }
  getContext(kind) {
    const page = this.page;
    page.contextRequests.push(kind);
    page.canvases.push(this);
    page.onGetContext?.(this);
    if (page.getContextThrows) throw page.getContextThrows;
    if (!page.webgl2 || kind !== 'webgl2') return null;
    // A raw context that counts its own release: WEBGL_lose_context when the page has it, nothing otherwise.
    const gl = {
      fakeGl: true,
      released: 0,
      getExtension(name) {
        if (name !== 'WEBGL_lose_context' || !page.loseExtension) return null;
        return { loseContext: () => { gl.released++; } };
      },
    };
    page.gls.push(gl);
    return gl;
  }
}

const WIDTH_FEATURE = /^\((max|min)-width:\s*(\d+(?:\.\d+)?)px\)$/;

/** Reads a viewport-width query as a browser does at a CSS width: `max-width` is <=, `min-width` is >=, so a
 *  fractional width between two whole-pixel bounds matches neither. A query the fake cannot read throws, so a
 *  test never passes on a query nobody evaluated. */
export function widthMatches(query, width) {
  const q = query.trim();
  const negated = /^not all and (.+)$/.exec(q);
  if (negated) return !widthMatches(negated[1], width);
  const m = WIDTH_FEATURE.exec(q);
  if (!m) throw new Error(`the fake page cannot evaluate the media query ${JSON.stringify(query)}`);
  return m[1] === 'max' ? width <= Number(m[2]) : width >= Number(m[2]);
}

/**
 * A fresh fake page. Options: webgl2 (default true), reducedMotion (default false), held (default false),
 * hidden (default false), width -- the viewport's CSS width (default 1920), media -- when a width query's
 * `change` is reported: 'immediate' (default; on the resize itself, hidden or not) or 'next-frame' (as the
 * HTML spec does: at the next rendering update, which a hidden page never gets, before that update's frames
 * run, and only for a list whose answer differs from the one last reported).
 */
export function makePage({ webgl2 = true, reducedMotion = false, held = false, hidden = false, width = 1920, media = 'immediate' } = {}) {
  const page = { webgl2, contextRequests: [], canvases: [], gls: [], loseExtension: true, onGetContext: null, getContextThrows: null, onFactory: null };

  const doc = new FakeTarget();
  doc.visibilityState = hidden ? 'hidden' : 'visible';
  Object.defineProperty(doc, 'hidden', { get: () => doc.visibilityState === 'hidden' });
  doc.createElement = (tag) => new FakeEl(tag, page);
  page.doc = doc;
  page.container = new FakeEl('div', page);
  page.setHidden = (h) => {
    doc.visibilityState = h ? 'hidden' : 'visible';
    doc.dispatch('visibilitychange');
  };

  const mql = new FakeTarget();
  mql.matches = reducedMotion;
  mql.media = '(prefers-reduced-motion: reduce)';
  page.mqlQueries = [];
  page.mql = mql;
  page.setReducedMotion = (on) => {
    mql.matches = on;
    mql.dispatch('change', { matches: on });
  };

  // Every other query is a viewport-width one, one list per query string as a browser hands out, read live
  // against the page's width; a resize fires `change` only on the lists whose answer flipped.
  page.width = width;
  page.widthMqls = new Map();
  const widthList = (query) => {
    if (!page.widthMqls.has(query)) {
      const list = new FakeTarget();
      list.media = query;
      Object.defineProperty(list, 'matches', { get: () => widthMatches(query, page.width) });
      list.reported = list.matches;
      page.widthMqls.set(query, list);
    }
    return page.widthMqls.get(query);
  };
  /** Reports every list whose answer changed since it was last reported. */
  const reportMedia = () => {
    for (const list of [...page.widthMqls.values()]) {
      if (list.matches === list.reported) continue;
      list.reported = list.matches;
      list.dispatch('change', { matches: list.matches });
    }
  };
  page.setWidth = (w) => {
    page.width = w;
    if (media === 'immediate') reportMedia();
  };

  const frames = new Map();
  let nextFrame = 1;
  page.clock = 0;
  page.frames = frames;
  page.cancelled = [];
  page.flush = (t) => {
    // Runs the frames queued before this call, at time t, the way a browser runs one RAF batch.
    page.clock = t;
    if (media === 'next-frame' && doc.visibilityState !== 'hidden') reportMedia();
    const batch = [...frames.entries()];
    frames.clear();
    for (const [, cb] of batch) cb(t);
  };

  for (const release of [...openHolds]) release();
  openHolds.clear();
  let release = null;
  /** Acquire or release this page's real hold. */
  page.setHeld = (h) => {
    if (h && !release) {
      release = hold.acquireRenderHold();
      openHolds.add(release);
    } else if (!h && release) {
      const r = release;
      release = null;
      openHolds.delete(r);
      r();
    }
  };
  page.isHeld = () => hold.isRenderHeld();
  /** The real module's active registrations, and this page's host's among them. */
  page.registrations = () => hold.renderHoldDiagnostics().registrations;
  page.instance = null;
  page.mine = () => page.registrations().filter((r) => r.instance !== null && r.instance === page.instance).length;
  if (held) page.setHeld(true);

  page.rendererCalls = [];
  page.renderers = [];
  page.rendererFactoryThrows = null;
  page.listenersAtFactory = null;
  let resolveRenderer;
  let rejectRenderer;
  page.rendererLoads = 0;
  page.rendererReady = null;
  page.deferRenderer = false;
  page.resolveRenderer = () => resolveRenderer();
  page.rejectRenderer = (e) => rejectRenderer(e);

  const factory = (canvas, gl) => {
    page.listenersAtFactory = canvas.count('webglcontextlost');
    page.rendererCalls.push({ canvas, gl });
    if (page.rendererFactoryThrows) throw page.rendererFactoryThrows;
    const r = {
      gl,
      disposed: 0,
      lost: 0,
      sizes: [],
      ratios: [],
      setSize(w, h, s) {
        r.sizes.push([w, h, s]);
      },
      setPixelRatio(x) {
        r.ratios.push(x);
      },
      dispose() {
        r.disposed++;
      },
      // As three's does: the same raw context, released through the same extension.
      forceContextLoss() {
        r.lost++;
        gl.getExtension('WEBGL_lose_context')?.loseContext();
      },
    };
    page.renderers.push(r);
    page.onFactory?.(r);
    return r;
  };

  page.env = {
    document: doc,
    matchMedia: (q) => {
      page.mqlQueries.push(q);
      return q === mql.media ? mql : widthList(q);
    },
    requestAnimationFrame: (cb) => {
      const id = nextFrame++;
      frames.set(id, cb);
      return id;
    },
    cancelAnimationFrame: (id) => {
      page.cancelled.push(id);
      frames.delete(id);
    },
    now: () => page.clock,
    devicePixelRatio: () => 1,
    loadRenderer: () => {
      page.rendererLoads++;
      if (page.loadRendererThrowsSync) throw page.loadRendererThrowsSync;
      if (!page.deferRenderer) return Promise.resolve(factory);
      return new Promise((res, rej) => {
        resolveRenderer = () => res(factory);
        rejectRenderer = rej;
      });
    },
    ResizeObserver: class {
      constructor(cb) {
        this.cb = cb;
        this.observed = [];
        page.resizeObservers.push(this);
      }
      observe(el) {
        this.observed.push(el);
      }
      disconnect() {
        this.observed = [];
        this.disconnected = true;
      }
    },
    frameSampler: null,
  };
  page.resizeObservers = [];
  return page;
}

/**
 * A fake game module. `behave` hooks: onMount(context, input, emit) may throw or emit; onAdvance(command)
 * may throw. Records every mount, command and dispose, and registers `owned` fake GPU resources.
 */
export function makeModule({ owned = 2, onMount, onAdvance } = {}) {
  const mod = { mounts: [], commands: [], disposed: 0, resources: [], emit: null, context: null };
  mod.module = {
    mount(context, input, emit) {
      mod.mounts.push({ context, input });
      mod.emit = emit;
      mod.context = context;
      for (let i = 0; i < owned; i++) {
        const res = { disposed: 0, dispose() { res.disposed++; } };
        mod.resources.push(context.own(res));
      }
      onMount?.(context, input, emit);
      return {
        advance(command) {
          mod.commands.push(command);
          onAdvance?.(command);
        },
        dispose() {
          mod.disposed++;
        },
      };
    },
  };
  return mod;
}

/** A registry with one game whose loader the test controls. */
export function makeRegistry(mod, { available = true, defer = false, throwSync = null } = {}) {
  const reg = { loads: 0, resolve: null, reject: null };
  reg.registry = {
    isAvailable: () => available,
    loaderFor: () => () => {
      reg.loads++;
      if (throwSync) throw throwSync;
      if (!defer) return Promise.resolve(mod.module);
      return new Promise((res, rej) => {
        reg.resolve = () => res(mod.module);
        reg.reject = rej;
      });
    },
  };
  return reg;
}

export const OUTCOME = Object.freeze({ kind: 'round', game: 'fireworks', round: 1, code: 'C', survivors: ['a'] });

export function baseOptions(page, extra = {}) {
  const calls = { render2D: [], events: [], states: [] };
  const options = {
    container: page.container,
    game: 'fireworks',
    input: { key: 'k', eventName: 'E', outcome: OUTCOME, people: [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }], claim: false },
    render2D: (outcome) => calls.render2D.push(outcome),
    onEvent: (e) => calls.events.push(e),
    onState: (s, reason) => calls.states.push(reason ? `${s}:${reason}` : s),
    ...extra,
  };
  return { options, calls };
}

/** Let every queued promise job run. */
export const settle = () => new Promise((r) => setTimeout(r, 0));

/** Start a reveal on `page`, noting the hold instance its host registered under (null when it never did). */
export function launch(page, options) {
  const before = new Set(page.registrations().map((r) => r.instance));
  const host = startReveal(options, page.env);
  page.instance = page.registrations().map((r) => r.instance).find((i) => i !== null && !before.has(i)) ?? null;
  return host;
}
