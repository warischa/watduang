// กันจอดับระหว่างเล่น — ไม่มีใน iOS < 16.4 และ non-secure context ต้องคืน null แล้วให้ผู้เรียกโชว์คำเตือนเอง

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
        // NotAllowedError เมื่อ document ไม่ visible — คืน false เฉยๆ ไม่ throw
        return false;
      }
    },
  };
}
