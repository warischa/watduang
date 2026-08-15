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
 * round is what brings a session into being; the guard defaults to refusing so a writer added later
 * inherits the safe side.
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

  const session: GameSession = {
    players: stored.players,
    played: stored.played,
    checkpoint: stored.checkpoint,
    setPlayers(names: string[]): void {
      session.players = names;
      write({ players: session.players, played: session.played, checkpoint: session.checkpoint, stamp: 0 }, true);
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
