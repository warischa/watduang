// เสียงสังเคราะห์ล้วน — OscillatorNode + GainNode เท่านั้น ไม่มีไฟล์เสียง ไม่มี dependency

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

/** urgency 0..1 — ยิ่งใกล้ 1 เสียงยิ่งสูง สั้นลง */
export function tick(ctx: AudioContext, urgency: number): void {
  const u = Math.min(1, Math.max(0, urgency));
  const freq = 440 + u * 660;
  const duration = 0.15 - u * 0.1;
  playTone(ctx, freq, Math.max(0.03, duration), 0.2);
}

export function boom(ctx: AudioContext): void {
  playTone(ctx, 80, 0.6, 0.5);
}
