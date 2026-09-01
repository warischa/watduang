// Purely synthesized sound — OscillatorNode + GainNode only, no audio files, no dependency

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
