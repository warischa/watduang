// The render hold (gh#272), moved out of the shared player screen (gh#305) so a renderer that never mounts
// that screen -- the prize-draw reveal host -- reads the same hold. The player screen re-exports every name
// here and binds its handover bookkeeping through bindRenderHoldEdge, so its behaviour is unchanged.
//
// A WebGL route that keeps drawing behind the player screen starves the roster lock's grant on a slow
// device, so the screen HOLDS rendering and every WebGL route stops drawing while it is held (owner ruling
// 2026-10-17: a frozen background is acceptable).
//
// One holder per acquirer, never a page-wide count: a holder releases only its own entry, so one release
// cannot end another holder's hold.

/** gh#272: the hold, observable on <html> -- 'held' or 'free', written on every change, from the same
 *  value isRenderHeld() returns. A probe in the page counts draws while it reads 'held'; absent means
 *  nothing has ever held, which is not the same as 'free'. */
export const RENDER_HOLD_ATTR = 'data-render-hold';

const holders = new Set<object>();
const listeners = new Set<(held: boolean) => void>();
/** Which instance registered each listener, for the diagnostics only; null when the caller named none. */
const instances = new Map<(held: boolean) => void, string | null>();
let held = false;
let edge: ((held: boolean) => void) | null = null;

/** Is rendering held right now? The current state, for a renderer that subscribes after a hold began. */
export function isRenderHeld(): boolean {
  return held;
}

/** Calls `listener` on every CHANGE of the hold, with the new value, never with a repeat. Returns the
 *  unsubscribe. Not called with the current state: read isRenderHeld() for that. `instance` names the
 *  registering renderer for the diagnostics (a reveal host stamps the same name on its layer); it changes
 *  nothing about how the listener is called. */
export function onRenderHold(listener: (held: boolean) => void, instance: string | null = null): () => void {
  listeners.add(listener);
  instances.set(listener, instance);
  return () => {
    listeners.delete(listener);
    instances.delete(listener);
  };
}

// ---- diagnostics (gh#305): read-only, for the browser probe, never for production logic ---------------

export type RenderHoldDiagnostics = { held: boolean; holders: number; registrations: { instance: string | null }[] };

/** A copy of what this module holds now: every ACTIVE registration, read off the listener set itself, so a
 *  listener that unsubscribed is gone from it. Nothing returned is the module's own state. */
export function renderHoldDiagnostics(): RenderHoldDiagnostics {
  return {
    held,
    holders: holders.size,
    registrations: [...listeners].map((listener) => ({ instance: instances.get(listener) ?? null })),
  };
}

/** The attribute a renderer stamps on its own element with the instance name it registered under, so a
 *  probe can tell the live renderer's registration from any other. */
export const RENDER_HOLD_INSTANCE_ATTR = 'data-render-hold-instance';

/** The page global a probe opts in through, before any page script runs: `{ enabled: true }`. */
export const RENDER_HOLD_PROBE_GLOBAL = '__watduangRenderHold';

/** On a page that opted in, give the probe this module's diagnostics and a real hold to acquire, as
 *  read-only properties: the probe measures the module that actually shipped, not a copy of it. A page
 *  that never opted in gets nothing. */
export function installProbeHooks(scope: object): void {
  const slot = (scope as Record<string, unknown>)[RENDER_HOLD_PROBE_GLOBAL];
  if (typeof slot !== 'object' || slot === null || (slot as { enabled?: unknown }).enabled !== true) return;
  if ('snapshot' in slot) return;
  Object.defineProperty(slot, 'snapshot', { value: renderHoldDiagnostics, enumerable: true });
  Object.defineProperty(slot, 'acquire', { value: acquireRenderHold, enumerable: true });
}

/** The player screen's one hook: runs on every change after <html> is written and before any listener,
 *  exactly where its handover bookkeeping ran before the extraction. One slot; null unbinds. */
export function bindRenderHoldEdge(hook: ((held: boolean) => void) | null): void {
  edge = hook;
}

/** Raise or drop `holder`'s entry. The hold is the union of every entry. */
export function setRenderHold(holder: object, on: boolean): void {
  if (on) holders.add(holder);
  else holders.delete(holder);
  const next = holders.size > 0;
  if (next === held) return;
  held = next;
  document.documentElement.setAttribute(RENDER_HOLD_ATTR, next ? 'held' : 'free');
  edge?.(next);
  for (const listener of [...listeners]) {
    // A listener that changed the hold itself has already told everyone the newer value.
    if (held !== next) return;
    // A failing listener must not stop the others, nor the close it runs inside -- that close is
    // followed by the handover. Rethrown on its own job, so it stays loud.
    try {
      listener(next);
    } catch (err) {
      queueMicrotask(() => {
        throw err;
      });
    }
  }
}

/** Hold rendering until the returned release runs. Releasing twice is a no-op. */
export function acquireRenderHold(): () => void {
  const holder = {};
  setRenderHold(holder, true);
  let released = false;
  return () => {
    if (released) return;
    released = true;
    setRenderHold(holder, false);
  };
}

installProbeHooks(globalThis);
