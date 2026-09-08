// Purely synthesized sound — OscillatorNode + GainNode only, no audio files, no dependency

/** The site-wide "sound off" flag (gh#165, owner rulings 2026-09-08 #2 and #3).
 *
 *  A NEW named constant, deliberately its own storage slot rather than a field on anything that
 *  already exists: not the checkpoint (ADR-0010's one-slot-one-writer reasoning, enforced by
 *  scripts/checkpoint-writer-check.mjs) and not the roster (ADR-0053 keeps the roster as the
 *  identity channel). Muting is a property of the DEVICE, not of a round or of a group, so it
 *  shares neither of their lifetimes: clearing a checkpoint must not un-mute a phone.
 *
 *  Home is this file because this file IS the site's sound. gh#227 rewires the other routes' own
 *  toggles onto these three exports; nothing else should spell the key.
 *
 *  DEFAULT: absent key -> not muted -> sound ON. That default is the comparison below and nothing
 *  else — there is no initialising write anywhere, so a fresh device cannot start silent, and this
 *  is what keeps the 2026-08-30 ruling that timebomb's tick is KEPT. */
export const MUTED_KEY = 'watduang:muted';

/** ponytail: localStorage in a try/catch, not a feature-detect. Private mode throws on ACCESS, not
 *  on lookup, and this runs in Node under the engine's tests where there is no storage at all.
 *  Both paths fall back to "not muted", which is the tested default rather than a silent guess. */
export function isMuted(): boolean {
  try {
    return localStorage.getItem(MUTED_KEY) === '1';
  } catch {
    return false;
  }
}

export function setMuted(muted: boolean): void {
  try {
    if (muted) localStorage.setItem(MUTED_KEY, '1');
    else localStorage.removeItem(MUTED_KEY);
  } catch {
    // STATED CEILING, not a silent one: where storage is denied the preference cannot be persisted
    // AND cannot be applied — isMuted() above has nothing to read back, so it returns the default
    // and the round stays audible. The toggle is inert on such a device rather than half-working.
    // An in-memory fallback would fix that and is deliberately not built: it would make the flag
    // route-local exactly where the ruling says site-wide, and it is unreachable in every browser
    // this site ships to except private mode with storage blocked outright.
  }
}

export function unlockAudio(): AudioContext | null {
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;

  const ctx = new Ctor();
  if (ctx.state === 'suspended') {
    ctx.resume().catch(() => {});
  }
  return ctx;
}

function playTone(ctx: AudioContext, freq: number, duration: number, gainValue: number): void {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.frequency.value = freq;
  gain.gain.value = gainValue;
  osc.connect(gain);
  gain.connect(ctx.destination);

  const now = ctx.currentTime;
  gain.gain.setValueAtTime(gainValue, now);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

  osc.start(now);
  osc.stop(now + duration);
  osc.onended = () => {
    osc.disconnect();
    gain.disconnect();
  };
}

/** urgency 0..1 — closer to 1 means a higher, shorter tone.
 *
 *  That sentence is also the leak, and it is an ACCEPTED CEILING, not an oversight. Both terms below
 *  are linear in urgency, so a single tick's pitch is an instantaneous readout of the fraction of the
 *  round elapsed — nobody has to count ticks, and two of them solve for the deadline. Everything
 *  gh#151 closed (the ticking screen, its announcements, the canvas drawing) is silent about the time
 *  left; this is not.
 *
 *  Owner ruling 2026-09-01 on gh#151 box 2: the tick sound is NOT a channel that leaks the remaining
 *  time — it IS the game. The accelerating, rising tick is timebomb's tension mechanic and the round's
 *  own copy advertises it. Box 2 is closed with this recorded as an accepted ceiling. Changing it is
 *  an owner decision, and it would mean changing the frequency and duration terms here, not only the
 *  tick spacing in tickIntervalMs (src/games/timebomb.ts). */
export function tick(ctx: AudioContext, urgency: number): void {
  const u = Math.min(1, Math.max(0, urgency));
  const freq = 440 + u * 660;
  const duration = 0.15 - u * 0.1;
  playTone(ctx, freq, Math.max(0.03, duration), 0.2);
}

export function boom(ctx: AudioContext): void {
  playTone(ctx, 80, 0.6, 0.5);
}
