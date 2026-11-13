// Test-only: one browser origin in memory, as far as the prize-draw event store uses it (store.ts). Node has
// no IndexedDB, and package.json takes no new dependency, so this models exactly the semantics store.ts
// relies on, and can be told to fail where a real browser can:
//
//   IndexedDB
//     - open(name, version): a request whose success, error or upgradeneeded events fire as tasks; an
//       upgrade may createObjectStore; a lower version than stored is a VersionError. Fault: `open` set to
//       'throw' throws from open() itself (SecurityError), 'error' fires the request's error event.
//     - db.transaction(store, mode): throws on a closed connection or an unknown store. Transactions on one
//       database run ONE AT A TIME in creation order (stricter than a browser, which may run read-only ones
//       side by side; read/write ones are serialized the same way there).
//     - a transaction is active only while the code that created it runs and while one of its request
//       callbacks runs; a request made at any other time throws TransactionInactiveError, so an await inside
//       a transaction fails here as it does in a browser. (A browser also keeps it active through the
//       microtasks of that callback; this double does not, which is stricter.)
//     - get(key) / put(value, key): each request's success fires as its own task and sees the transaction's
//       own earlier writes; put on a read-only transaction throws ReadOnlyError; values are structured-cloned.
//     - auto-commit: once a transaction has no pending request after a callback, it commits as one task:
//       its writes land together and `complete` fires. Nothing it wrote is visible to any other transaction
//       before that. Fault: `abortCommits` > 0 makes the next read/write transaction that wrote something
//       abort at commit instead (QuotaExceededError): no write lands and `abort` fires, never `complete`.
//       tx.abort() discards the writes and fires `abort`.
//     - versionchange: an open at a higher version fires `versionchange` at every open connection of that
//       database; when any of them stays open, the open fires `blocked` and waits, going ahead (upgrade, then
//       success) only once the last of them has closed. A closed connection refuses new transactions.
//     NOT modelled: the `close` event (a connection lost by the browser), deleteDatabase, key ranges, cursors,
//     indexes, request error events (a request never fails on its own), durability modes.
//   BroadcastChannel: postMessage reaches every OTHER channel object of the same name on the origin, never
//     the sender. Delivery is a task in auto mode; in manual mode a tab's messages wait for tab.deliver().
//   localStorage: one map shared by every tab; `localStorageThrows` makes every call throw, `setItemThrows`
//     only setItem (a full or read-only storage).
//   Web Locks (only with fakeOrigin({ locks: true }); otherwise a tab has no navigator.locks at all):
//     request(name, callback) grants one holder per name at a time, in request order, each grant a task;
//     the lock is held until the callback's returned promise settles, and request() resolves with its
//     value. Fault: `lockRequest` set to 'reject' makes request() reject without running the callback,
//     'throw' makes it throw.
//
// Scheduling. Auto mode runs one task per macrotask turn (setImmediate), so promise continuations run
// between IndexedDB events as they do in a browser; `await origin.idle()` waits until nothing is left.
// Manual mode runs a task only when the test calls step(), which is how a test interleaves two tabs; step()
// returns the kind of task it ran, and 'boundary' marks the end of an open request or of a transaction
// (its complete or abort event). Stepping from boundary to boundary loses no interleaving here: transactions
// run one at a time, so a tab's action landing inside another tab's transaction only queues behind it.

const domError = (name) => Object.assign(new Error(name), { name });

export function fakeOrigin({ manual = false, locks = false } = {}) {
  /** name -> { version, stores: Map<storeName, Map<key, value>> } — committed data only. */
  const dbs = new Map();
  const tasks = [];
  let pumping = false;
  /** Every transaction not yet finished, per database, in creation order; the head is the one running. */
  const queues = new Map();
  const channels = [];
  /** Open connections per database name, and opens waiting on connections that did not close. */
  const conns = new Map();
  const blocked = [];

  const origin = {
    manual,
    tasks,
    /** Every committed put that changed data: { by, db, store, key, before, after }. */
    log: [],
    faults: { open: null, abortCommits: 0, localStorageThrows: false, setItemThrows: false, lockRequest: null },
    /** Every lock request in order: { by, name }. */
    lockLog: [],
    /** Test hooks. `transaction(by, mode)` runs at the start of every db.transaction() call, before it can
     *  throw on a closed connection: every transaction a tab ATTEMPTS is seen. */
    hooks: { transaction: null },
    localStorage: new Map(),
    /** Run one task: its kind ('boundary', 'request' or 'message'), or false when there was none. */
    step() {
      const task = tasks.shift();
      if (!task) return false;
      task();
      return task.kind ?? 'request';
    },
    /** Auto mode: resolves once no task is queued and no turn is pending. */
    async idle() {
      for (let i = 0; i < 100000; i++) {
        await new Promise((resolve) => setImmediate(resolve));
        if (!tasks.length && !pumping) return;
      }
      throw new Error('the fake origin never went idle');
    },
    /** The committed value at db/store/key, or undefined. */
    get(db, store, key) {
      return dbs.get(db)?.stores.get(store)?.get(key);
    },
    /** Write committed data directly, as a profile that already holds it, or a write from outside this code. */
    put(db, version, store, key, value) {
      if (!dbs.has(db)) dbs.set(db, { version, stores: new Map() });
      const d = dbs.get(db);
      if (!d.stores.has(store)) d.stores.set(store, new Map());
      d.stores.get(store).set(key, structuredClone(value));
    },
    tab,
    /** A newer version of the page opening database `name` at `version` from its own tab: returns the open
     *  request, so a test reads its blocked / upgradeneeded / success events. */
    openNewer(name, version, by = 'newer') {
      return tab(by).indexedDB.open(name, version);
    },
  };

  function schedule(task, kind) {
    if (kind) task.kind = kind;
    tasks.push(task);
    if (!manual && !pumping) pump();
  }
  function pump() {
    pumping = true;
    setImmediate(() => {
      origin.step();
      if (tasks.length) pump();
      else pumping = false;
    });
  }

  // ---- IndexedDB

  function startNext(dbName) {
    const q = queues.get(dbName);
    const head = q?.[0];
    if (head && !head.started) {
      head.started = true;
      head.advance();
    }
  }

  function makeTransaction(by, conn, storeName, mode) {
    const d = dbs.get(conn.name);
    const writes = new Map(); // key -> value, this transaction's own
    const pending = [];
    let active = true;
    let finished = false;
    let wrote = false;
    const deactivateLater = () => setImmediate(() => (active = false));
    const tx = {
      mode,
      error: null,
      oncomplete: null,
      onabort: null,
      onerror: null,
      started: false,
      objectStore(name) {
        if (name !== storeName) throw domError('NotFoundError');
        return store;
      },
      abort() {
        if (finished) throw domError('InvalidStateError');
        finish('abort', domError('AbortError'));
      },
      advance() {
        // Runs the next pending request as a task, or commits once there is none.
        schedule(() => {
          if (finished) return;
          const req = pending.shift();
          if (!req) return commit();
          req.readyState = 'done';
          req.result = req.run();
          active = true;
          try {
            req.onsuccess?.({ target: req });
          } catch (err) {
            active = false;
            finish('abort', err);
            return;
          }
          active = false;
          tx.advance();
        });
      },
    };
    const request = (run) => {
      if (finished || !active) throw domError('TransactionInactiveError');
      const req = { readyState: 'pending', result: undefined, error: null, onsuccess: null, onerror: null, transaction: tx, run };
      pending.push(req);
      return req;
    };
    const committed = () => d.stores.get(storeName);
    const store = {
      name: storeName,
      get(key) {
        return request(() => structuredClone(writes.has(key) ? writes.get(key) : committed().get(key)));
      },
      put(value, key) {
        if (mode !== 'readwrite') throw domError('ReadOnlyError');
        const copy = structuredClone(value);
        return request(() => {
          writes.set(key, copy);
          wrote = true;
          return key;
        });
      },
    };
    function commit() {
      if (mode === 'readwrite' && wrote && origin.faults.abortCommits > 0) {
        origin.faults.abortCommits--;
        return finish('abort', domError('QuotaExceededError'));
      }
      for (const [key, value] of writes) {
        const before = committed().get(key);
        committed().set(key, value);
        origin.log.push({ by, db: conn.name, store: storeName, key, before, after: value });
      }
      finish('complete');
    }
    function finish(kind, error) {
      if (finished) return;
      finished = true;
      active = false;
      const q = queues.get(conn.name);
      q.splice(q.indexOf(tx), 1);
      const fire = () => {
        if (kind === 'complete') tx.oncomplete?.({ target: tx });
        else {
          tx.error = error;
          tx.onabort?.({ target: tx });
        }
        startNext(conn.name);
      };
      schedule(fire, 'boundary');
    }
    deactivateLater();
    return tx;
  }

  function factory(by) {
    return {
      open(name, version) {
        if (origin.faults.open === 'throw') throw domError('SecurityError');
        const req = { readyState: 'pending', result: undefined, error: null, onsuccess: null, onerror: null, onupgradeneeded: null, onblocked: null, transaction: null };
        schedule(() => {
          req.readyState = 'done';
          if (origin.faults.open === 'error') {
            req.error = domError('InvalidStateError');
            req.onerror?.({ target: req });
            return;
          }
          const have = dbs.get(name);
          if (have && version < have.version) {
            req.error = domError('VersionError');
            req.onerror?.({ target: req });
            return;
          }
          // A higher version first tells every open connection (versionchange); any that stays open blocks the
          // open, which goes ahead only once the last of them has closed.
          if (have && version > have.version) {
            const open = (conns.get(name) ?? []).filter((c) => !c.closed);
            for (const c of open) c.onversionchange?.({ target: c, oldVersion: have.version, newVersion: version });
            const still = open.filter((c) => !c.closed);
            if (still.length) {
              req.onblocked?.({ target: req, oldVersion: have.version, newVersion: version });
              blocked.push({ still, go: () => schedule(() => proceed(have), 'boundary') });
              return;
            }
          }
          proceed(have);
        }, 'boundary');
        function proceed(have) {
          const d = have ?? { version: 0, stores: new Map() };
          dbs.set(name, d);
          let upgrading = false;
          const conn = {
            name,
            version,
            closed: false,
            onversionchange: null,
            onclose: null,
            objectStoreNames: { contains: (s) => d.stores.has(s) },
            createObjectStore(s) {
              if (!upgrading) throw domError('InvalidStateError');
              if (d.stores.has(s)) throw domError('ConstraintError');
              d.stores.set(s, new Map());
              return {};
            },
            transaction(storeNames, mode = 'readonly') {
              const s = Array.isArray(storeNames) ? storeNames[0] : storeNames;
              origin.hooks.transaction?.(by, mode);
              if (conn.closed) throw domError('InvalidStateError');
              if (!d.stores.has(s)) throw domError('NotFoundError');
              const tx = makeTransaction(by, conn, s, mode);
              if (!queues.has(name)) queues.set(name, []);
              queues.get(name).push(tx);
              startNext(name);
              return tx;
            },
            close() {
              conn.closed = true;
              for (const b of blocked.splice(0)) {
                if (b.still.every((c) => c.closed)) b.go();
                else blocked.push(b);
              }
            },
          };
          if (!conns.has(name)) conns.set(name, []);
          conns.get(name).push(conn);
          req.result = conn;
          if (version > d.version) {
            upgrading = true;
            d.version = version;
            req.onupgradeneeded?.({ target: req, oldVersion: have ? have.version : 0, newVersion: version });
            upgrading = false;
          }
          req.onsuccess?.({ target: req });
        }
        return req;
      },
    };
  }

  // ---- BroadcastChannel and localStorage

  // ---- Web Locks: one manager for the origin, shared by every tab

  const held = new Map(); // name -> true while a callback holds it
  const lockQueue = new Map(); // name -> [grant]
  function lockManager(by) {
    return {
      request(name, cb) {
        if (origin.faults.lockRequest === 'throw') throw domError('SecurityError');
        origin.lockLog.push({ by, name });
        if (origin.faults.lockRequest === 'reject') return Promise.reject(domError('AbortError'));
        return new Promise((resolve, reject) => {
          if (!lockQueue.has(name)) lockQueue.set(name, []);
          lockQueue.get(name).push(() => {
            held.set(name, true);
            let out;
            try {
              out = Promise.resolve(cb({ name, mode: 'exclusive' }));
            } catch (err) {
              out = Promise.reject(err);
            }
            out.then(resolve, reject).finally(() => {
              held.delete(name);
              grantNext(name);
            });
          });
          grantNext(name);
        });
      },
    };
  }
  function grantNext(name) {
    if (held.get(name)) return;
    const next = lockQueue.get(name)?.shift();
    if (!next) return;
    held.set(name, true);
    schedule(next, 'lock');
  }
  origin.locksHeld = (name) => Boolean(held.get(name));

  function tab(by) {
    const inbox = [];
    const deliver = (fn) => (manual ? inbox.push(fn) : schedule(fn, 'message'));
    class Channel {
      constructor(name) {
        this.name = name;
        this.listeners = [];
        this.onmessage = null;
        this.closed = false;
        channels.push({ by, deliver, ch: this });
      }
      postMessage(data) {
        if (this.closed) throw domError('InvalidStateError');
        for (const other of channels) {
          if (other.ch === this || other.ch.closed || other.ch.name !== this.name) continue;
          other.deliver(() => {
            if (other.ch.closed) return;
            const ev = { data: structuredClone(data) };
            other.ch.onmessage?.(ev);
            for (const l of other.ch.listeners) l(ev);
          });
        }
      }
      addEventListener(type, listener) {
        if (type === 'message') this.listeners.push(listener);
      }
      close() {
        this.closed = true;
      }
    }
    const guard = () => {
      if (origin.faults.localStorageThrows) throw domError('SecurityError');
    };
    return {
      by,
      indexedDB: factory(by),
      ...(locks ? { navigator: { locks: lockManager(by) } } : {}),
      BroadcastChannel: Channel,
      localStorage: {
        getItem: (k) => (guard(), origin.localStorage.has(k) ? origin.localStorage.get(k) : null),
        setItem: (k, v) => {
          guard();
          if (origin.faults.setItemThrows) throw domError('QuotaExceededError');
          origin.localStorage.set(k, String(v));
        },
        removeItem: (k) => (guard(), void origin.localStorage.delete(k)),
      },
      /** Manual mode: hand this tab every message posted to it so far. */
      deliver() {
        for (const fn of inbox.splice(0)) fn();
      },
      pendingMessages: () => inbox.length,
    };
  }

  return origin;
}
