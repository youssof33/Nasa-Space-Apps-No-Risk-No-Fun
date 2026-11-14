/* ==========================================================================
   MISSION CONTROL — audio. All synthesised, no sound files.
   ========================================================================== */
window.Audio3 = (function () {
  let ctx = null, master = null, muted = false;

  function boot() {
    if (ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.22;
    master.connect(ctx.destination);
  }

  function resume() { if (ctx && ctx.state === "suspended") ctx.resume(); }

  function tone(freq, dur, type, gain, slideTo) {
    if (!ctx || muted) return;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type || "sine";
    o.frequency.setValueAtTime(freq, ctx.currentTime);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, ctx.currentTime + dur);
    g.gain.setValueAtTime(0, ctx.currentTime);
    g.gain.linearRampToValueAtTime(gain == null ? 0.5 : gain, ctx.currentTime + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + dur);
    o.connect(g); g.connect(master);
    o.start(); o.stop(ctx.currentTime + dur + 0.02);
  }

  function noise(dur, gain, filterHz) {
    if (!ctx || muted) return;
    const n = Math.floor(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, n, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const f = ctx.createBiquadFilter();
    f.type = "lowpass"; f.frequency.value = filterHz || 900;
    const g = ctx.createGain();
    g.gain.value = gain == null ? 0.4 : gain;
    src.connect(f); f.connect(g); g.connect(master);
    src.start();
  }

  const api = {
    boot, resume,
    get muted() { return muted; },
    toggle() { muted = !muted; return muted; },
    click() { tone(520, 0.05, "square", 0.10); },
    select() { tone(680, 0.09, "triangle", 0.16, 900); },
    deny() { tone(150, 0.18, "sawtooth", 0.14, 90); },
    tick() { tone(1200, 0.03, "square", 0.05); },
    launch() {
      noise(1.6, 0.5, 420);
      tone(60, 1.8, "sawtooth", 0.20, 140);
      setTimeout(() => tone(220, 0.5, "triangle", 0.12, 440), 900);
      setTimeout(() => tone(330, 0.6, "triangle", 0.12, 660), 1300);
    },
    success() {
      [523.25, 659.25, 783.99, 1046.5].forEach((f, i) =>
        setTimeout(() => tone(f, 0.55, "sine", 0.16), i * 110));
    },
    fail() {
      [392, 349.23, 293.66, 233.08].forEach((f, i) =>
        setTimeout(() => tone(f, 0.5, "sawtooth", 0.10), i * 130));
    },
  };
  return api;
})();
