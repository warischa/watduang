// Optional frame-time sampling for the prize reveal (gh#305). Off unless the page opts in: a probe sets
// `window[FRAME_TIME_GLOBAL] = { enabled: true }` before the reveal starts, and the host then records, per
// frame, the RAF interval and the CPU time around `advance(tick)` (which includes the module's render and
// name updates), labelled by the phase the module last announced. Held, hidden and load time are not frame
// intervals: they are recorded apart as gaps.
//
// What it measures: RAF intervals are frame pacing; CPU time is submission, not GPU execution time. No probe
// script exists yet; this is only the in-page half.

export const FRAME_TIME_GLOBAL = '__watduangRevealFrameTime';

export type GapKind = 'held' | 'hidden' | 'load';
export type FrameRecord = { phase: string; rafMs: number | null; cpuMs: number };
export type Stats = { count: number; median: number; p95: number; max: number };
export type PhaseSummary = { raf: Stats; cpu: Stats };

export interface FrameSampler {
  /** One frame: its RAF interval (null on the first frame after a start or a resume) and its CPU time. */
  frame(phase: string, rafMs: number | null, cpuMs: number): void;
  /** Time that is not a frame interval. */
  gap(kind: GapKind, ms: number): void;
}

export type FrameStore = FrameSampler & {
  enabled: true;
  frames: FrameRecord[];
  gaps: { kind: GapKind; ms: number }[];
  summary(): Record<string, PhaseSummary>;
};

function stats(values: number[]): Stats {
  const v = [...values].sort((a, b) => a - b);
  const n = v.length;
  if (n === 0) return { count: 0, median: 0, p95: 0, max: 0 };
  const median = n % 2 ? v[(n - 1) / 2]! : (v[n / 2 - 1]! + v[n / 2]!) / 2;
  // Nearest rank: the smallest sample with at least 95% of samples at or below it.
  const p95 = v[Math.max(0, Math.ceil(0.95 * n) - 1)]!;
  return { count: n, median, p95, max: v[n - 1]! };
}

function attach(target: Record<string, unknown>): FrameStore {
  const store = target as unknown as FrameStore;
  store.frames = [];
  store.gaps = [];
  store.frame = (phase, rafMs, cpuMs) => {
    store.frames.push({ phase, rafMs, cpuMs });
  };
  store.gap = (kind, ms) => {
    store.gaps.push({ kind, ms });
  };
  store.summary = () => {
    const byPhase = new Map<string, FrameRecord[]>();
    for (const f of store.frames) {
      const list = byPhase.get(f.phase) ?? [];
      list.push(f);
      byPhase.set(f.phase, list);
    }
    const out: Record<string, PhaseSummary> = {};
    for (const [phase, list] of byPhase) {
      out[phase] = {
        raf: stats(list.flatMap((f) => (f.rafMs === null ? [] : [f.rafMs]))),
        cpu: stats(list.map((f) => f.cpuMs)),
      };
    }
    return out;
  };
  return store;
}

/** A standalone sampler, for a caller that wants one without the page global. */
export function createFrameSampler(): FrameStore {
  return attach({ enabled: true });
}

/** The page's sampler when a probe opted in, else null. The opt-in object is upgraded in place once, so
 *  every reveal on the page records into the one object the probe reads back. */
export function activeFrameSampler(scope: object = globalThis): FrameSampler | null {
  const slot = (scope as Record<string, unknown>)[FRAME_TIME_GLOBAL];
  if (typeof slot !== 'object' || slot === null) return null;
  const obj = slot as Record<string, unknown>;
  if (obj.enabled !== true) return null;
  if (typeof obj.frame === 'function' && Array.isArray(obj.frames)) return obj as unknown as FrameSampler;
  return attach(obj);
}
