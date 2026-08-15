// State for "this group" — sessionStorage, self-expiring (6h), not tied to the roster.
import type { Checkpoint, GameSession } from '../games/types';

const KEY = 'watduang:session';
const MAX_AGE_MS = 6 * 60 * 60 * 1000;

interface StoredSession {
  players: string[];
  played: string[];
  checkpoint: Checkpoint | null;
  stamp: number;
}

function read(): StoredSession {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return { players: [], played: [], checkpoint: null, stamp: Date.now() };
    const parsed = JSON.parse(raw) as StoredSession;
    if (Date.now() - parsed.stamp > MAX_AGE_MS) {
      return { players: [], played: [], checkpoint: null, stamp: Date.now() };
    }
    return {
      players: Array.isArray(parsed.players) ? parsed.players : [],
      played: Array.isArray(parsed.played) ? parsed.played : [],
      checkpoint: parsed.checkpoint ?? null,
      stamp: parsed.stamp,
    };
  } catch {
    return { players: [], played: [], checkpoint: null, stamp: Date.now() };
  }
}

/**
 * `create` = this writer is allowed to bring the record into existence. Every other writer may only
 * UPDATE a record that is still there, and re-reads storage to find out.
 *
 * Why re-read instead of trusting the closure: loadSession() hands out an independent mutable closure
 * per call — the shell holds one, the mounted game holds another (game/[id].astro builds ctx.session
 * once) — over a single storage key. clear() cannot invalidate a closure it does not know about, so
 * after a clear the game's closure is still live and still armed. Press ล้างและทิ้งรอบที่ค้าง mid-round
 * and location.reload() is a macrotask away; a tap that lands before unload ran save() through the
 * game's closure and setItem the discarded round straight back. After the reload the panel offered
 * กลับไปเล่นรอบที่ค้าง for the round the player had just thrown away — a discard that silently
 * un-discards, which is an ADR-0008 violation in substance. The round-over path did it too, reviving
 * the whole record through markPlayed + saveCheckpoint(null).
 *
 * Gone means gone, whoever still holds a handle. setPlayers is the one creator, because starting a
 * round is what brings a session into being — and only on its first call per closure, since a later
 * one is a resume writing back, not a start (see loadSession()). The guard defaults to refusing so a
 * writer added later inherits the safe side.
 */
function write(stored: StoredSession, create = false): void {
  try {
    if (!create && sessionStorage.getItem(KEY) === null) return;
    stored.stamp = Date.now();
    sessionStorage.setItem(KEY, JSON.stringify(stored));
  } catch {
    // Quota full or Safari private mode — keep going in memory for this page, never throw.
  }
}

export function loadSession(): GameSession {
  const stored = read();

  /**
   * Only the FIRST setPlayers on a given closure may create. Starting a round is what brings a session
   * into being, and the start handler's own call is that one: game/[id].astro:50-51 runs loadSession()
   * and setPlayers() back-to-back, so nothing can land in between.
   *
   * Later calls on the same closure are not starts. siamsi.ts:344 writes the checkpoint's roster back on
   * resume, and on first mount `await load()` (game/[id].astro:56) separates it from the closure's
   * creation by a macrotask. The panel is live in that gap: ล้างกลุ่มนี้ → clear() (PlayerSetup.astro:304)
   * empties the record and location.reload() (:310) has not committed yet. With create still true that
   * late call setItem the closure's stale snapshot back — record AND checkpoint — and the discarded round
   * un-discarded, the same ADR-0008 violation 65d3d3c closed for the #ss-draw / #ss-pass writers.
   *
   * This flag decides nothing by itself: it only downgrades to create = false, and the refusal is
   * write()'s existence check above. That is deliberate — refreshing into a resume, with the record still
   * there, must keep updating (issue #20), and only a missing record means gone.
   */
  let mayCreate = true;

  const session: GameSession = {
    players: stored.players,
    played: stored.played,
    checkpoint: stored.checkpoint,
    setPlayers(names: string[]): void {
      session.players = names;
      write({ players: session.players, played: session.played, checkpoint: session.checkpoint, stamp: 0 }, mayCreate);
      mayCreate = false;
    },
    markPlayed(id: string): void {
      if (!session.played.includes(id)) {
        session.played = [...session.played, id];
      }
      write({ players: session.players, played: session.played, checkpoint: session.checkpoint, stamp: 0 });
    },
    saveCheckpoint(cp: Checkpoint | null): void {
      session.checkpoint = cp;
      write({ players: session.players, played: session.played, checkpoint: session.checkpoint, stamp: 0 });
    },
    clear(): void {
      session.players = [];
      session.played = [];
      session.checkpoint = null;
      try {
        sessionStorage.removeItem(KEY);
      } catch {
        // ignore
      }
    },
  };

  return session;
}
