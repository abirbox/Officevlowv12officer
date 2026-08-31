// Short two-note alert chime generated with the Web Audio API — no asset file
// or dependency needed. Fails silently if the browser blocks audio (e.g. no
// user gesture yet).
let ctx;

export function playAlertChime() {
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    if (!ctx) ctx = new AC();
    if (ctx.state === 'suspended') ctx.resume();

    const now = ctx.currentTime;
    // A5 -> D6, a quick rising "ding-dong".
    const notes = [
      [880.0, 0.0],
      [1174.66, 0.16],
    ];
    notes.forEach(([freq, t]) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, now + t);
      gain.gain.exponentialRampToValueAtTime(0.28, now + t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + t + 0.38);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + t);
      osc.stop(now + t + 0.4);
    });
  } catch {
    /* audio unavailable / blocked — ignore */
  }
}
