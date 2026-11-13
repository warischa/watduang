// Cosmetic randomness for the fireworks reveal, seeded from the reveal key: a refresh replays the same sky.
// Never used for an outcome -- the outcome is committed before the reveal mounts.

/** FNV-1a over the UTF-16 code units, to a 32-bit seed. */
export function hashKey(key: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** mulberry32: a small, fast generator, uniform in [0, 1). */
export function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function randomFor(key: string, salt: string): () => number {
  return seeded(hashKey(`${key}|${salt}`));
}
