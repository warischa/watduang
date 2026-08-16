// Keeps the screen awake during play — unsupported on iOS < 16.4 and non-secure context; returns null and leaves warning the caller's job

export interface WakeLockHandle {
  release(): void;
  reacquire(): Promise<boolean>;
}

interface NavigatorWithWakeLock extends Navigator {
  wakeLock: {
    request(type: 'screen'): Promise<WakeLockSentinel>;
  };
}

export async function requestWakeLock(): Promise<WakeLockHandle | null> {
  const nav = navigator as NavigatorWithWakeLock;
  if (!nav.wakeLock) return null;

  let sentinel: WakeLockSentinel | null = null;
  try {
    sentinel = await nav.wakeLock.request('screen');
  } catch {
    return null;
  }

  return {
    release(): void {
      sentinel?.release().catch(() => {});
      sentinel = null;
    },
    async reacquire(): Promise<boolean> {
      try {
        sentinel = await nav.wakeLock.request('screen');
        return true;
      } catch {
        // NotAllowedError when the document isn't visible — just return false, do not throw
        return false;
      }
    },
  };
}
