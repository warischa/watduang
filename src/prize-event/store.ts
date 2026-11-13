// The prize-draw event store (gh#313): the ONE module that reads and writes the stored event. The setup
// page, the projector route and every later prize-draw screen (the per-round 3D games) go through it and
// nothing else. Its whole interface:
//
//   openEventStore(env)          -> Promise<EventStore | null>; null means a REFUSED browser (below).
//   store.load()                 -> Promise<Snapshot | null>: the stored event and its exact text; null when
//                                   the read failed or the store has stopped.
//   store.put(expected, next)    -> Promise<PutResult>: compare-and-set. One read/write IndexedDB transaction
//                                   reads the stored text and writes `next` only when that text is still
//                                   `expected` (null = nothing stored). It resolves only after the transaction
//                                   has COMMITTED: { ok: true } means the write is durable, so a screen may
//                                   show it; { reason: 'stale', now } means someone else moved the event first
//                                   and nothing was written; { reason: 'failed' } means nothing was written
//                                   (the transaction aborted or never started, or the store has stopped).
//   store.subscribe(listener)    -> unsubscribe. Called when another tab committed a change (BroadcastChannel).
//                                   Only a hint to load again: the compare-and-set alone keeps writes safe.
//   store.onSuperseded(listener) -> sets the one listener told, once, that this store has stopped for good,
//                                   with why: 'superseded' (a newer version of this code opened the database;
//                                   the connection is closed so its upgrade is not blocked; the page reloads)
//                                   or 'revoked' (the old key lost its seal, or the two records disagree:
//                                   OLD_TAB_OPEN). A listener set after the stop is told at once.
//   store.status()               -> 'open' | 'superseded' | 'revoked'.
//   store.takeOver(next)         -> Promise<boolean>. Revoked store only, after the MC confirmed replacing the
//                                   saved event: stores `next` and seals the old key again, under the lock.
//
// Why the stored TEXT is the version: it carries the event key and the walk's position, the walk only moves
// forward within one event, and a new event gets a fresh random key, so a stored text never comes back once
// replaced. A changed text always means someone else moved or replaced the event.
//
// Atomicity: IndexedDB runs read/write transactions on one object store one at a time, and a transaction's
// read and write are one atomic step. Owner ruling 2026-11-13 on the gh#313 body: the guarantee is write
// atomicity, not retention against the browser or the user clearing site data.
//
// The old code (gh#313 cutover). Before gh#313 the event lived in localStorage under STORAGE_KEY, and a tab
// that loaded that code before the deploy keeps running it: its projector and its setup page write the key
// inside the exclusive Web Lock named STORAGE_KEY, and nowhere else (no lock manager, no write). So:
//   - every operation here (the move, every load, every put, a take-over) runs inside that same lock, held
//     until its IndexedDB transaction has completed or aborted (lock below); a lock request that fails
//     refuses the operation. Where the Web Locks API does not exist at all, the old code can never write,
//     and the store runs on IndexedDB alone;
//   - the move (migrate) copies the old key's event into an empty IndexedDB, or accepts a byte-identical
//     record, then SEALS the key with SEALED, which the old decoder reads as no event: an old projector then
//     shows no event and never draws, and an old setup page can only overwrite the seal. Records that differ,
//     even for the same event, are refused, never resolved by deleting either one;
//   - every later load and put first checks the seal; a lost seal (an old setup page wrote the key) revokes
//     this store for good, keeping both records, and the screens say OLD_TAB_OPEN until the MC starts a new
//     event from the setup page (takeOver).
//
// Refused browsers (fail closed: nothing is read or written, and the screen shows REFUSED_BROWSER): no
// IndexedDB at all, IndexedDB that throws on access or on open (an opaque origin, storage blocked by the
// user's settings), an open that errors (some private modes), a move whose copy aborted, a seal that could
// not be written, or a lock request that failed. The projector also refuses when its first read fails.

import { STORAGE_KEY, decodeEvent, encodeEvent, type EventState } from './event.ts';

/** Where the event lives. Read-only facts, exported for tests and browser probes that seed a fixture. */
export const DB = { name: 'watduang-prize-draw', version: 1, store: 'event', key: 'current' } as const;

/** Owner-approved (gh#313): why this browser cannot run a prize-draw event. Rendered by the setup page
 *  (start message) and the projector (in place of the event). */
export const REFUSED_BROWSER = 'เบราว์เซอร์นี้บันทึกงานจับรางวัลไม่ได้ ลองเปิดด้วยเบราว์เซอร์รุ่นใหม่';

/** Owner-approved (gh#313): the store was revoked or refused because a tab running the old code holds a
 *  different event. Rendered by the projector (in place of the event) and the setup page (start message). */
export const OLD_TAB_OPEN = 'มีงานที่เปิดค้างในแท็บเก่า ปิดแท็บอื่นทั้งหมด แล้วเริ่มงานใหม่จากหน้าตั้งค่า';

/** What the old key holds once its event has moved: the old decoder refuses it (`v` is not 1). */
export const SEALED = '{"v":0,"movedTo":"indexeddb"}';

export type Snapshot = { raw: string | null; state: EventState | null };
export type PutResult =
  | { ok: true; raw: string }
  | { ok: false; reason: 'stale'; now: Snapshot }
  | { ok: false; reason: 'failed' };

export type Loss = 'superseded' | 'revoked';

export type EventStore = {
  load(): Promise<Snapshot | null>;
  put(expected: string | null, next: EventState): Promise<PutResult>;
  subscribe(listener: () => void): () => void;
  onSuperseded(listener: (why: Loss) => void): void;
  status(): 'open' | Loss;
  takeOver(next: EventState): Promise<boolean>;
};

type Channel = {
  postMessage(message: unknown): void;
  addEventListener(type: 'message', listener: () => void): void;
};

/** What the store takes from the page. The real `window` fits as is; every member may be absent or throw. */
export type StoreEnv = {
  indexedDB?: Pick<IDBFactory, 'open'> | null;
  localStorage?: Pick<Storage, 'getItem' | 'setItem'> | null;
  BroadcastChannel?: new (name: string) => Channel;
  navigator?: { locks?: Pick<LockManager, 'request'> | null } | null;
};

/** Runs `fn` inside the old code's exclusive lock, held until `fn` settles: `held: false` when the lock
 *  request failed and `fn` never ran. With no Web Locks API at all, `fn` runs alone (the old code cannot
 *  write there). `fn` must not throw. */
type Lock = <T>(fn: () => Promise<T>) => Promise<{ held: true; value: T } | { held: false }>;

function compatLock(env: StoreEnv): Lock {
  let locks: Pick<LockManager, 'request'> | null = null;
  let broken = false;
  try {
    locks = env.navigator?.locks ?? null;
  } catch {
    broken = true;
  }
  return async <T>(fn: () => Promise<T>) => {
    if (broken) return { held: false };
    if (!locks) return { held: true, value: await fn() };
    let entered = false;
    let value: T | undefined;
    try {
      await locks.request(STORAGE_KEY, async () => {
        entered = true;
        value = await fn();
      });
    } catch {
      return { held: false };
    }
    return entered ? { held: true, value: value as T } : { held: false };
  };
}

type Moved = 'open' | 'diverged' | 'refused';

const snapshot = (value: unknown): Snapshot => {
  const raw = typeof value === 'string' ? value : null;
  return { raw, state: decodeEvent(raw) };
};

function openDb(factory: Pick<IDBFactory, 'open'>): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    let req: IDBOpenDBRequest;
    try {
      req = factory.open(DB.name, DB.version);
    } catch {
      resolve(null);
      return;
    }
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(DB.store)) db.createObjectStore(DB.store);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => resolve(null);
  });
}

/**
 * One transaction on the event store. `body` runs synchronously inside it and reports its outcome through
 * `done`; the promise resolves with that outcome once the transaction has committed, and with null when it
 * aborted or could not start. Nothing in `body` may await: a transaction ends once its callbacks return.
 */
function run<T>(
  db: IDBDatabase,
  mode: IDBTransactionMode,
  body: (store: IDBObjectStore, done: (outcome: T) => void) => void,
): Promise<T | null> {
  return new Promise((resolve) => {
    let tx: IDBTransaction;
    let outcome: T | null = null;
    try {
      tx = db.transaction(DB.store, mode);
      tx.oncomplete = () => resolve(outcome);
      tx.onabort = () => resolve(null);
      body(tx.objectStore(DB.store), (o) => (outcome = o));
    } catch {
      resolve(null);
    }
  });
}

export async function openEventStore(env: StoreEnv): Promise<EventStore | null> {
  let factory: Pick<IDBFactory, 'open'> | null = null;
  try {
    factory = env.indexedDB ?? null;
  } catch {
    factory = null;
  }
  if (!factory) return null;
  const db = await openDb(factory);
  if (!db) return null;
  const lock = compatLock(env);

  // The stop latch. It is set BEFORE the connection closes, so nothing that checks it can start a
  // transaction on a closing connection, and it is told once, to a listener set before or after.
  let lost: Loss | null = null;
  let closed = false;
  let onLost: ((why: Loss) => void) | null = null;
  let told = false;
  const tell = (): void => {
    if (!lost || !onLost || told) return;
    told = true;
    onLost(lost);
  };
  const stop = (why: Loss): void => {
    if (!lost) lost = why;
    tell();
  };
  db.onversionchange = () => {
    if (!lost) lost = 'superseded';
    closed = true;
    db.close();
    tell();
  };

  const listeners = new Set<() => void>();
  let channel: Channel | null = null;
  try {
    if (env.BroadcastChannel) {
      channel = new env.BroadcastChannel(STORAGE_KEY);
      channel.addEventListener('message', () => {
        for (const l of [...listeners]) l();
      });
    }
  } catch {
    channel = null;
  }
  const notify = (): void => {
    try {
      channel?.postMessage('changed');
    } catch {
      // No channel: other tabs learn of the change on their next compare-and-set.
    }
  };

  /** One load or put: inside the lock, only while the store runs and the old key still carries the seal. */
  const guarded = async <T>(refused: T, op: () => Promise<T>): Promise<T> => {
    if (lost) return refused;
    const r = await lock(async () => {
      if (lost) return refused;
      let seal: string | null = null;
      try {
        seal = env.localStorage ? env.localStorage.getItem(STORAGE_KEY) : null;
      } catch {
        seal = null;
      }
      if (seal !== SEALED) {
        stop('revoked');
        return refused;
      }
      return op();
    });
    return r.held ? r.value : refused;
  };

  let moved = 'refused' as Moved;
  await migrate(db, env, lock, () => closed, null, (m) => (moved = m));
  if (!lost) {
    if (moved === 'refused') {
      db.close();
      return null;
    }
    if (moved === 'diverged') stop('revoked');
  }

  const store: EventStore = {
    load: () =>
      guarded<Snapshot | null>(null, () =>
        run<Snapshot>(db, 'readonly', (store, done) => {
          const req = store.get(DB.key);
          req.onsuccess = () => done(snapshot(req.result));
        }),
      ),
    async put(expected, next) {
      const raw = encodeEvent(next);
      const r = await guarded<PutResult | null>(null, () =>
        run<PutResult>(db, 'readwrite', (store, done) => {
          const req = store.get(DB.key);
          req.onsuccess = () => {
            const now = snapshot(req.result);
            if (now.raw !== expected) {
              done({ ok: false, reason: 'stale', now });
              return;
            }
            store.put(raw, DB.key);
            done({ ok: true, raw });
          };
        }),
      );
      if (!r) return { ok: false, reason: 'failed' };
      if (r.ok) notify();
      return r;
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
    onSuperseded(listener) {
      onLost = listener;
      tell();
    },
    status: () => lost ?? 'open',
    async takeOver(next) {
      if (lost !== 'revoked' || closed) return false;
      let taken = 'refused' as Moved;
      await migrate(db, env, lock, () => closed, encodeEvent(next), (m) => (taken = m));
      if (taken === 'open') notify();
      return taken === 'open';
    },
  };
  return store;
}

/**
 * The move, and the MC's take-over, inside the old code's lock. Without `take`: the old key's event is copied
 * into an empty IndexedDB, or accepted when IndexedDB holds the very same text; any other record is refused
 * ('diverged') and both are kept. With `take` (the MC confirmed replacing the saved event): the stored record,
 * read now, is replaced by `take`. Either way the old key is then sealed and the seal read back; the outcome
 * is 'open' only when both landed. `closed` stops it before any transaction on a closing connection.
 */
async function migrate(
  db: IDBDatabase,
  env: StoreEnv,
  lock: Lock,
  closed: () => boolean,
  take: string | null,
  report: (moved: Moved) => void,
): Promise<void> {
  const held = await lock(async (): Promise<Moved> => {
    let legacy: string | null = null;
    try {
      legacy = env.localStorage ? env.localStorage.getItem(STORAGE_KEY) : null;
    } catch {
      return 'refused';
    }
    // What IndexedDB must hold before the write (undefined: nothing), and what to write.
    let expected: unknown = undefined;
    let text: string | null = null;
    if (take !== null) {
      if (closed()) return 'refused';
      const now = await run<{ value: unknown }>(db, 'readonly', (store, done) => {
        const req = store.get(DB.key);
        req.onsuccess = () => done({ value: req.result });
      });
      if (now === null) return 'refused';
      expected = now.value;
      text = take;
    } else if (legacy !== null && legacy !== SEALED && decodeEvent(legacy)) {
      text = legacy;
    }
    if (text !== null) {
      if (closed()) return 'refused';
      const want = text;
      const copied = await run<'written' | 'same' | 'diverged'>(db, 'readwrite', (store, done) => {
        const req = store.get(DB.key);
        req.onsuccess = () => {
          if (req.result === want) {
            done('same');
            return;
          }
          if (req.result !== expected) {
            done('diverged');
            return;
          }
          store.put(want, DB.key);
          done('written');
        };
      });
      if (copied === null) return 'refused';
      if (copied === 'diverged') return 'diverged';
    }
    // Text that is no event (unreadable, or empty) holds nothing to move: it is sealed like the rest.
    try {
      env.localStorage?.setItem(STORAGE_KEY, SEALED);
      return env.localStorage?.getItem(STORAGE_KEY) === SEALED ? 'open' : 'refused';
    } catch {
      return 'refused';
    }
  });
  report(held.held ? held.value : 'refused');
}
