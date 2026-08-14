// สถานะของ "วงนี้" — sessionStorage + หมดอายุเอง (6 ชม.) ไม่ผูกกับ roster
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

function write(stored: StoredSession): void {
  stored.stamp = Date.now();
  try {
    sessionStorage.setItem(KEY, JSON.stringify(stored));
  } catch {
    // เต็มโควต้าหรือ Safari private mode — เก็บใน memory ต่อไปในหน้านี้ ไม่ throw
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
      write({ players: session.players, played: session.played, checkpoint: session.checkpoint, stamp: 0 });
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
