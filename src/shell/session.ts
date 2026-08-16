// State for "this group" — sessionStorage, self-expiring (6h), not tied to the roster.
import type { Checkpoint, GameSession } from '../games/types';

const KEY = 'watduang:session';
const MAX_AGE_MS = 6 * 60 * 60 * 1000;

/** A record written before identities existed. sessionStorage keeps it for the whole 6h window, so on
 *  the deploy that added the field there are live sessions in this shape. It has no owner, so every
 *  closure loaded off it shares this one — pre-identity behaviour among peers, and no create right. */
const LEGACY_ID = 'legacy';

interface StoredSession {
  /** Which round this is. Minted on create, never rewritten; absent only on a legacy record. */
  id?: string;
  players: string[];
  played: string[];
  checkpoint: Checkpoint | null;
  stamp: number;
}

let minted = 0;
/** Unique within a tab: the counter covers one page, the timestamp covers reloads of the same tab. */
const mintId = (): string => `${Date.now().toString(36)}-${++minted}`;

/** The live record, or null when there is none. Absent, aged out and unparseable all read the same —
 *  aging matters here because the key outlives MAX_AGE_MS, and an aged record must not block a start. */
function readRaw(): StoredSession | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredSession;
    return Date.now() - parsed.stamp > MAX_AGE_MS ? null : parsed;
  } catch {
    return null;
  }
}

function read(): StoredSession {
  const parsed = readRaw();
  if (!parsed) return { players: [], played: [], checkpoint: null, stamp: Date.now() };
  return {
    id: parsed.id ?? LEGACY_ID,
    players: Array.isArray(parsed.players) ? parsed.players : [],
    played: Array.isArray(parsed.played) ? parsed.played : [],
    checkpoint: parsed.checkpoint ?? null,
    stamp: parsed.stamp,
  };
}

export function loadSession(): GameSession {
  const stored = read();

  /**
   * The record this closure is talking about — captured at load, minted on create, null until it has
   * one. Every write compares it against the record actually in the slot and refuses on a mismatch.
   *
   * Why compare instead of trusting the closure: loadSession() hands out an independent mutable closure
   * per call — the shell holds one, the mounted game holds another (game/[id].astro builds ctx.session
   * once) — over a single storage key. clear() cannot invalidate a closure it does not know about, so
   * after a clear the game's closure is still live and still armed. Press Clear-and-drop-pending-round mid-round
   * and location.reload() is a macrotask away; a tap that lands before unload ran save() through the
   * game's closure and setItem the discarded round straight back. After the reload the panel offered
   * Resume-pending-round for the round the player had just thrown away — a discard that silently
   * un-discards, which is an ADR-0008 violation in substance. The round-over path did it too, reviving
   * the whole record through markPlayed + saveCheckpoint(null).
   *
   * An existence check ("is there a record") closed only half of that, and a per-closure first-call flag
   * only the other half: a stale closure whose first setPlayers had not been spent still created over an
   * absent record, and once any new round existed a stale closure wrote its pre-discard snapshot over it.
   * Identity answers both with one question, so both mechanisms are gone. It stays compatible with issue
   * #20's refresh-resume by construction: a closure updating the record it is actually talking about —
   * siamsi.ts:344 writing the checkpoint's roster back — still matches.
   */
  let myId: string | null = stored.id ?? null;

  /**
   * The one chokepoint all three writers route through. `create` = this writer may bring a record into
   * existence; setPlayers is the only one, because starting a round is what brings a session into being
   * (games/_template.ts:29-31 documents that to every future game). Defaults to refusing, so a writer
   * added later inherits the safe side.
   */
  function write(create = false): void {
    try {
      const current = readRaw();
      if (current === null) {
        // Gone means gone, whoever still holds a handle: a closure that knew a record may not re-create
        // it. Only one that never had an identity may start a round.
        if (!create || myId !== null) return;
      } else if (current.id !== undefined && current.id !== myId) {
        // Someone else's round is in the slot. This closure's snapshot predates it — refuse.
        return;
      }
      const id = myId ?? mintId();
      sessionStorage.setItem(
        KEY,
        JSON.stringify({
          id,
          players: session.players,
          played: session.played,
          checkpoint: session.checkpoint,
          stamp: Date.now(),
        } satisfies StoredSession),
      );
      // Only now: minting before the write would make Safari private mode (setItem throws every time)
      // look like a create that succeeded, and every later write would then refuse against an id that
      // was never persisted — permanent silent no-ops instead of an in-memory session.
      myId = id;
    } catch {
      // Quota full or Safari private mode — keep going in memory for this page, never throw.
    }
  }

  const session: GameSession = {
    players: stored.players,
    played: stored.played,
    checkpoint: stored.checkpoint,
    setPlayers(names: string[]): void {
      session.players = names;
      write(true);
    },
    markPlayed(id: string): void {
      if (!session.played.includes(id)) {
        session.played = [...session.played, id];
      }
      write();
    },
    saveCheckpoint(cp: Checkpoint | null): void {
      session.checkpoint = cp;
      write();
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
