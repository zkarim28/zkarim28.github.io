/* Simulations for the embedded / music projects: Galton board, birdsong DDS, VU meter, gyro game, MIDI visualizer, RiffMIDI. */
(function (root) {
  "use strict";
  const Kit = root.SimKit, C = Kit.C, TAU = Kit.TAU, txt = Kit.txt, rr = Kit.rr, clamp = Kit.clamp, lerp = Kit.lerp;
  const ease = function (t) { return t < 0 ? 0 : t > 1 ? 1 : t * t * (3 - 2 * t); };
  const NOTE = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
  const noteName = function (m) { return NOTE[m % 12] + (Math.floor(m / 12) - 1); };
  const mtof = function (m) { return 440 * Math.pow(2, (m - 69) / 12); };

  /* tiny polyphonic WebAudio voice helper (only ever created from user gestures) */
  function Voices(kind) { this.v = {}; this.kind = kind || "triangle"; this.bend = 0; }
  Voices.prototype.on = function (m, vel, pluck) {
    const ac = Kit.audio(); if (!ac) return; this.off(m, true);
    const o = ac.createOscillator(), gn = ac.createGain(), lp = ac.createBiquadFilter(), t = ac.currentTime;
    o.type = this.kind; o.frequency.value = mtof(m); o.detune.value = this.bend * 200;
    lp.type = "lowpass"; lp.frequency.value = pluck ? 2400 : 5000;
    const peak = 0.05 + 0.2 * (vel / 127);
    gn.gain.setValueAtTime(0.0001, t); gn.gain.linearRampToValueAtTime(peak, t + 0.01);
    if (pluck) { gn.gain.exponentialRampToValueAtTime(peak * 0.25, t + 0.35); lp.frequency.setValueAtTime(2400, t); lp.frequency.exponentialRampToValueAtTime(500, t + 0.6); }
    o.connect(lp); lp.connect(gn); gn.connect(ac.destination); o.start();
    this.v[m] = { o: o, g: gn };
  };
  Voices.prototype.off = function (m, quick) {
    const x = this.v[m]; if (!x) return; const ac = Kit.audio(), t = ac.currentTime;
    x.g.gain.cancelScheduledValues(t); x.g.gain.setValueAtTime(Math.max(x.g.gain.value, 0.0001), t); x.g.gain.exponentialRampToValueAtTime(0.0001, t + (quick ? 0.02 : 0.18));
    x.o.stop(t + 0.25); delete this.v[m];
  };
  Voices.prototype.setBend = function (b) { this.bend = b; for (const m in this.v) this.v[m].o.detune.value = b * 200; };
  Voices.prototype.stopAll = function () { for (const m in this.v) this.off(+m, true); };

  /* =====================================================================================
   * Digital Galton board (project-galton)
   * ===================================================================================== */
  const G = { ROWS: 16, PR: 6, BR: 4, VS: 19, HS: 38, TX: 320, TY: 100 };
  G.BOT = G.TY + (G.ROWS - 1) * G.VS; G.BIN = G.BOT + G.PR + G.BR; G.LEFT = G.TX - (G.ROWS - 1) * G.HS / 2; G.B0 = G.LEFT - G.HS / 2; G.NB = G.ROWS + 1;
  const IDEAL = (function () { const c = [1]; for (let i = 0; i < G.ROWS; i++) for (let j = i + 1; j > 0; j--) c[j] = (c[j] || 0) + c[j - 1]; return c.map(function (v) { return v / Math.pow(2, G.ROWS); }); })();
  const PEGS = []; for (let r = 0; r < G.ROWS; r++) for (let c = 0; c <= r; c++) PEGS.push([G.TX - r * G.HS / 2 + c * G.HS, G.TY + r * G.VS]);
  function nearestPeg(x, y) {
    const row = Math.floor((y - G.TY + G.VS / 2) / G.VS); if (row < 0 || row >= G.ROWS) return -1;
    const xi = x - (G.TX - row * G.HS / 2) + G.HS / 2; if (xi < 0) return -1;
    const col = Math.floor(xi / G.HS); if (col > row) return -1;
    return (row * (row + 1)) / 2 + col;
  }
  function galtonSpawn(s, b, stagger) {
    b.x = G.TX + (s.rnd() - 0.5); b.y = G.TY - 50 - s.rnd() * 120 - (stagger ? s.rnd() * 260 : 0);
    b.vx = (s.rnd() - 0.5) * 0.5; b.vy = 0; b.last = -1; b.binned = false; return b;
  }
  function galtonBalls(s) {
    const n = s.ambient ? 200 : Math.round(s.ctl.balls);
    while (s.balls.length < n) s.balls.push(galtonSpawn(s, {}, true));
    if (s.balls.length > n) s.balls.length = n;
  }
  function galtonReset(s) { s.bins = new Array(G.NB).fill(0); s.fallen = 0; s.balls = []; galtonBalls(s); }
  Kit.lib.galton = { PEGS: PEGS, nearestPeg: nearestPeg, IDEAL: IDEAL };
  Kit.register("project-galton.html", {
    name: "Digital Galton Board",
    tagline: "A browser version of the Pico 2 board: 16 rows, 136 pegs, same sizes and bounce rule. Change the physics and watch the bell curve.",
    note: "Same geometry and collision rule as the VGA board (reflect about the peg normal, lose energy only on a new peg). Raise bounciness to 1.0 and the bell curve falls apart, just like on the hardware.",
    W: 640, H: 480,
    controls: [
      { id: "balls", label: "Balls", min: 50, max: 2000, step: 50, value: 600 },
      { id: "bounce", label: "Bounciness", min: 0, max: 1, step: 0.05, value: 0.3, fmt: function (v) { return v.toFixed(2); } },
      { id: "grav", label: "Gravity", min: 0.05, max: 1, step: 0.05, value: 0.37, fmt: function (v) { return v.toFixed(2); } },
      { id: "speed", label: "Speed", min: 1, max: 4, step: 1, value: 1, fmt: function (v) { return v + "×"; } },
      { id: "ideal", label: "show ideal bell curve", type: "check", value: false }
    ],
    buttons: [{ label: "Reset", act: function (s) { galtonReset(s); } }],
    stats: [{ id: "n", label: "balls landed" }, { id: "mean", label: "mean bin (ideal 8)" }, { id: "sd", label: "std dev (ideal 2)" }],
    onCtl: function (s, id) { if (id === "balls") galtonBalls(s); else if (id === "bounce" || id === "grav") galtonReset(s); },
    setup: function (s) { galtonReset(s); if (s.ambient) for (let i = 0; i < 400; i++) galtonStep(s); },
    tick: function (s, dt) {
      s.acc = (s.acc || 0) + dt * 60 * (s.ctl.speed || 1); let n = 0;
      while (s.acc >= 1 && n < 8) { galtonStep(s); s.acc -= 1; n++; } if (n === 8) s.acc = 0;
      if ((s.frame = (s.frame || 0) + 1) % 10 === 0) {
        let n2 = 0, m = 0; for (let k = 0; k < G.NB; k++) { n2 += s.bins[k]; m += k * s.bins[k]; }
        const mean = n2 ? m / n2 : 0; let v = 0; for (let k = 0; k < G.NB; k++) v += s.bins[k] * (k - mean) * (k - mean);
        s.stat("n", n2.toLocaleString()); s.stat("mean", n2 ? mean.toFixed(2) : "–"); s.stat("sd", n2 ? Math.sqrt(v / n2).toFixed(2) : "–");
      }
    },
    draw: function (g, s) {
      const amb = s.ambient;
      g.lineWidth = 1.5; g.strokeStyle = amb ? "rgba(226,232,240,.35)" : "rgba(226,232,240,.78)"; g.beginPath();
      for (let i = 0; i < PEGS.length; i++) { g.moveTo(PEGS[i][0] + G.PR, PEGS[i][1]); g.arc(PEGS[i][0], PEGS[i][1], G.PR, 0, TAU); }
      g.stroke();
      g.lineWidth = 1.4; g.strokeStyle = "rgba(0,212,255,.85)"; g.beginPath();
      for (let i = 0; i < s.balls.length; i++) { const b = s.balls[i]; if (b.y > G.BIN || b.y < -20) continue; g.moveTo(b.x + G.BR, b.y); g.arc(b.x, b.y, G.BR, 0, TAU); }
      g.stroke();
      let max = 0, total = 0; for (let k = 0; k < G.NB; k++) { total += s.bins[k]; if (s.bins[k] > max) max = s.bins[k]; }
      if (total) {
        const exp = IDEAL.map(function (p) { return p * total; }), top = Math.max(max, Math.max.apply(null, exp), 1), hh = 62;
        g.fillStyle = "#39ff6a"; for (let k = 0; k < G.NB; k++) { const h = s.bins[k] / top * hh; g.fillRect(G.B0 + k * G.HS - 17, 474 - h, 34, h); }
        if (s.ctl.ideal) {
          g.strokeStyle = C.orange; g.fillStyle = C.orange; g.lineWidth = 2; g.beginPath();
          for (let k = 0; k < G.NB; k++) { const x = G.B0 + k * G.HS, y = 474 - exp[k] / top * hh; k ? g.lineTo(x, y) : g.moveTo(x, y); }
          g.stroke();
          for (let k = 0; k < G.NB; k++) { g.beginPath(); g.arc(G.B0 + k * G.HS, 474 - exp[k] / top * hh, 3, 0, TAU); g.fill(); }
        }
      }
      if (!amb) txt(g, "16,900 balls at 60 fps on the real board", 12, 14, { size: 9, color: C.dim });
    }
  });
  function galtonStep(s) {
    const gr = s.ctl.grav, bn = s.ctl.bounce, bs = s.balls, rr2 = (G.PR + G.BR) * (G.PR + G.BR);
    for (let i = 0; i < bs.length; i++) {
      const b = bs[i];
      if (b.y > G.BIN) { b.x += b.vx; b.y += b.vy; }
      else {
        const sp = Math.max(Math.abs(b.vx), Math.abs(b.vy)), steps = ((sp / 4) | 0) + 1, sx = b.vx / steps, sy = b.vy / steps;
        for (let k = 0; k < steps; k++) {
          b.x += sx; b.y += sy; const pk = nearestPeg(b.x, b.y); if (pk < 0) continue;
          const pg = PEGS[pk], dx = b.x - pg[0], dy = b.y - pg[1], d2 = dx * dx + dy * dy;
          if (d2 < rr2 && d2 > 0) {
            const d = Math.sqrt(d2), nx = dx / d, ny = dy / d, vn = nx * b.vx + ny * b.vy;
            b.x = pg[0] + nx * (G.PR + G.BR + 1); b.y = pg[1] + ny * (G.PR + G.BR + 1);
            if (vn < 0) { b.vx -= 2 * vn * nx; b.vy -= 2 * vn * ny; if (pk !== b.last) { b.vx *= bn; b.vy *= bn; b.last = pk; } }
          }
        }
      }
      if (!b.binned && b.y > G.BIN) { const xi = b.x - G.LEFT; let bin = xi < 0 ? 0 : Math.floor(xi / G.HS) + 1; if (bin > G.NB - 1) bin = G.NB - 1; s.bins[bin]++; s.fallen++; b.binned = true; }
      if (b.y > 490) { galtonSpawn(s, b, false); continue; }
      b.vy += gr;
    }
  }

  /* =====================================================================================
   * Birdsong synthesizer: DDS (project-birdsong)
   * ===================================================================================== */
  const FS = 50000, TWO32 = 4294967296, LUT = new Int16Array(256);
  for (let i = 0; i < 256; i++) LUT[i] = Math.round(2047 * Math.sin(i / 256 * TAU));
  /* one DDS sample, exactly as the ISR does it: 32-bit phase accumulator, top 8 bits index a 256-entry sine table */
  function ddsSample(st, fout, vol) {
    const N = Math.round(fout / FS * TWO32);
    st.phase = (st.phase + N) % TWO32; st.idx = Math.floor(st.phase / 16777216); st.N = N;
    return 2048 + Math.round(LUT[st.idx] * vol);
  }
  Kit.lib.dds = { ddsSample: ddsSample, LUT: LUT };
  const SONG = [[4200, 2300, 0.3, 0.1], [4300, 2350, 0.3, 0.1], [4100, 2250, 0.32, 0.5], [2200, 3700, 0.14, 0.05], [2300, 3800, 0.14, 0.4], [3500, 3500, 0.05, 0.05], [3600, 3500, 0.05, 0.05], [3500, 3400, 0.05, 0.05], [3500, 3600, 0.05, 1.0]];
  Kit.register("project-birdsong.html", {
    name: "Birdsong Synthesizer (DDS)", warm: 200,
    tagline: "A 32-bit phase accumulator steps through a sine table 50,000 times a second. Drag in the spectrogram to play it like the slide pot.",
    note: "The DDS math is the page's: N = (Fout / Fs) · 2³², top 8 bits index a 256-entry sine table, 12-bit DAC codes. The sound toggle plays a clean sine at the same pitch (the real sample stream is shown in the scope).",
    W: 640, H: 400, touchNone: true,
    controls: [
      { id: "src", label: "Source", type: "seg", options: ["Bird song", "Live (slider)"], value: 0 },
      { id: "freq", label: "Slider frequency", min: 200, max: 10000, step: 50, value: 3000, fmt: function (v) { return (v / 1000).toFixed(2) + " kHz"; } },
      { id: "vol", label: "Volume", min: 0, max: 1, step: 0.05, value: 0.9, fmt: function (v) { return Math.round(v * 100) + "%"; } },
      { id: "sound", label: "play sound", type: "check", value: false }
    ],
    buttons: [{ label: "● Record 3 s", act: function (s) { s.rec = []; s.recT = 3; s.src = "live"; s.setCtl("src", 1); } }, { label: "▶ Play recording", act: function (s) { if (s.rec && s.rec.length) { s.src = "play"; s.pi = 0; } } }],
    stats: [{ id: "f", label: "Fout" }, { id: "N", label: "phase increment N" }, { id: "dac", label: "DAC code (12-bit)" }],
    onCtl: function (s, id, v) {
      if (id === "src") s.src = v === 0 ? "song" : "live";
      if (id === "freq") { s.src = "live"; s.liveT = s.t; s.setCtl("src", 1); }
      if (id === "sound" && v) Kit.audio();
    },
    setup: function (s) {
      s.st = { phase: 0, idx: 0, N: 0 }; s.src = "song"; s.f = 0; s.amp = 0; s.fh = new Float32Array(296); s.ah = new Float32Array(296);
      s.scope = new Float32Array(120); s.wp = 0; s.liveT = -99; s.seg = 0; s.sg = 0; s.rec = null; s.recT = 0; s.pi = 0; s.last = 0; s.osc = null; s.dac = 2048;
    },
    down: function (s) { dragFreq(s); },
    move: function (s) { if (s.ptr.down) dragFreq(s); },
    up: function (s) { s.drag = false; },
    destroy: function (s) { killOsc(s); },
    tick: function (s, dt) {
      let f = 0, a = 0;
      if (s.src === "song") {
        const sg = SONG[s.seg]; s.sg += dt;
        if (s.sg < sg[2]) { const u = s.sg / sg[2]; f = lerp(sg[0], sg[1], ease(u)) * (1 + 0.01 * Math.sin(s.t * 60)); a = Math.sqrt(Math.sin(Math.PI * u)); }
        else if (s.sg > sg[2] + sg[3]) { s.sg = 0; s.seg = (s.seg + 1) % SONG.length; }
      } else if (s.src === "live") {
        if (s.drag) s.liveT = s.t;
        if (s.t - s.liveT < 0.8) { f = s.ctl.freq; a = 1; }
        if (s.recT > 0) { s.recT -= dt; s.rec.push([f, a]); if (s.recT <= 0) s.recT = 0; }
      } else if (s.src === "play") {
        const q = s.rec[Math.floor(s.pi)]; if (q) { f = q[0]; a = q[1]; s.pi += dt * 60; } else { s.src = s.ctl.src === 0 ? "song" : "live"; }
      }
      s.f = f; s.amp = a * s.ctl.vol;
      const n = Math.min(1200, Math.round(FS * dt));
      for (let i = 0; i < n; i++) { const v = f > 0 ? ddsSample(s.st, f, s.amp) : (s.st.N = 0, 2048); s.dac = v; s.scope[s.wp % 120] = v; s.wp++; }
      s.fh.copyWithin(0, 1); s.ah.copyWithin(0, 1); s.fh[295] = f; s.ah[295] = s.amp;
      s.stat("f", f > 0 ? Math.round(f) + " Hz" : "silent"); s.stat("N", f > 0 ? "0x" + Kit.hex(s.st.N >>> 0, 8) : "0"); s.stat("dac", "" + s.dac);
      // optional audio
      if (s.ctl.sound) {
        if (!s.osc) { const ac = Kit.audio(); if (ac) { const o = ac.createOscillator(), gn = ac.createGain(); o.type = "sine"; gn.gain.value = 0; o.connect(gn); gn.connect(ac.destination); o.start(); s.osc = { o: o, g: gn, ac: ac }; } }
        if (s.osc) { const t = s.osc.ac.currentTime; if (f > 0) s.osc.o.frequency.setTargetAtTime(f, t, 0.01); s.osc.g.gain.setTargetAtTime(f > 0 ? 0.12 * s.amp : 0, t, 0.015); }
      } else killOsc(s);
    },
    draw: function (g, s) {
      const cx = 92, cy = 108, R = 58, st = s.st, ang = (st.phase / TWO32) * TAU - Math.PI / 2;
      txt(g, "PHASE ACCUMULATOR", cx, 24, { size: 8.5, color: C.mute, align: "center", weight: 600 });
      g.fillStyle = "#08101f"; g.beginPath(); g.arc(cx, cy, R + 14, 0, TAU); g.fill(); g.strokeStyle = C.line; g.lineWidth = 1; g.stroke();
      for (let i = 0; i < 256; i += 2) {
        const a = i / 256 * TAU - Math.PI / 2, r = R + 7 * Math.sin(i / 256 * TAU * 1);
        const lit = Math.abs(((i - st.idx + 384) % 256) - 128) > 120 || i === st.idx;
        g.fillStyle = lit ? C.yellow : "rgba(0,212,255,.55)"; g.beginPath(); g.arc(cx + Math.cos(a) * r, cy + Math.sin(a) * r, lit ? 2.6 : 1.3, 0, TAU); g.fill();
      }
      if (s.f > 0) { g.strokeStyle = C.orange; g.lineWidth = 2.2; g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + Math.cos(ang) * (R - 4), cy + Math.sin(ang) * (R - 4)); g.stroke(); }
      g.fillStyle = C.orange; g.beginPath(); g.arc(cx, cy, 3, 0, TAU); g.fill();
      txt(g, "256-entry sine table", cx, cy + R + 28, { size: 8, color: C.dim, align: "center" });
      // registers
      const rx = 190;
      txt(g, "N = (Fout / Fs) · 2³²", rx, 36, { size: 10, color: C.tx });
      txt(g, "Fs = 50 kHz", rx, 52, { size: 9, color: C.dim });
      txt(g, "Fout = " + (s.f > 0 ? Math.round(s.f) : 0) + " Hz", rx, 78, { size: 11, color: C.cyan, weight: 700 });
      txt(g, "N     = 0x" + Kit.hex(st.N >>> 0, 8), rx, 98, { size: 9, color: C.mute });
      txt(g, "phase = 0x" + Kit.hex(Math.floor(st.phase) >>> 0, 8), rx, 112, { size: 9, color: C.mute });
      txt(g, "index = phase >> 24 = " + st.idx, rx, 126, { size: 9, color: C.mute });
      txt(g, "DAC   = " + s.dac + " / 4095", rx, 140, { size: 9, color: C.green });
      txt(g, "→ SPI → MCP4822", rx, 160, { size: 8.5, color: C.dim });
      // scope
      g.fillStyle = "#08101f"; rr(g, 340, 24, 280, 150, 8); g.fill(); g.strokeStyle = C.line; g.lineWidth = 1; g.stroke();
      txt(g, "DAC OUTPUT · last 2.4 ms of samples", 350, 38, { size: 8, color: C.mute });
      g.strokeStyle = "rgba(148,163,184,.25)"; g.beginPath(); g.moveTo(346, 108); g.lineTo(614, 108); g.stroke();
      g.strokeStyle = C.green; g.lineWidth = 1.6; g.beginPath();
      for (let k = 0; k < 120; k++) { const v = s.scope[(s.wp + k) % 120] || 2048, x = 348 + k * 2.2, y = 108 - (v - 2048) / 2048 * 58; k ? g.lineTo(x, y) : g.moveTo(x, y); }
      g.stroke();
      // spectrogram
      const SX = 40, SY = 204, SW = 580, SH = 168;
      g.fillStyle = "#07101f"; rr(g, SX, SY, SW, SH, 8); g.fill(); g.strokeStyle = C.line; g.lineWidth = 1; g.stroke();
      for (let k = 0; k <= 5; k++) { const y = SY + SH - k / 5 * SH; g.strokeStyle = "rgba(148,163,184,.12)"; g.beginPath(); g.moveTo(SX, y); g.lineTo(SX + SW, y); g.stroke(); txt(g, k * 2 + "k", SX - 6, y, { size: 7.5, color: C.dim, align: "right" }); }
      g.lineWidth = 3; g.lineCap = "round";
      for (let k = 1; k < 296; k++) {
        const f0 = s.fh[k - 1], f1 = s.fh[k]; if (f1 <= 0 || f0 <= 0) continue;
        const x0 = SX + (k - 1) / 295 * SW, x1 = SX + k / 295 * SW, y0 = SY + SH - clamp(f0 / 10000, 0, 1) * SH, y1 = SY + SH - clamp(f1 / 10000, 0, 1) * SH;
        g.strokeStyle = "rgba(255," + Math.round(120 + 100 * s.ah[k]) + ",60," + (0.25 + 0.75 * s.ah[k]) + ")"; g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
      }
      g.lineCap = "butt";
      txt(g, s.recT > 0 ? "● REC" : s.src === "play" ? "▶ PLAYBACK" : s.src === "song" ? "bird-song chirps (illustrative)" : "drag here: slide pot → frequency", SX + 10, SY + 14, { size: 8.5, color: s.recT > 0 ? C.red : C.cyan });
      txt(g, "spectrogram · 0–10 kHz", SX + SW - 8, SY + SH - 8, { size: 7.5, color: C.dim, align: "right" });
    }
  });
  function dragFreq(s) {
    const y = s.ptr.y; if (y < 200 || y > 376) return;
    s.src = "live"; s.drag = true; s.liveT = s.t; s.setCtl("src", 1);
    s.setCtl("freq", clamp(Math.round((1 - (y - 204) / 168) * 10000 / 50) * 50, 200, 10000));
  }
  function killOsc(s) { if (s.osc) { try { s.osc.g.gain.value = 0; s.osc.o.stop(); } catch (e) { /* already stopped */ } s.osc = null; } }

  /* =====================================================================================
   * LED VU meter (project-vu)
   * ===================================================================================== */
  const NLED = 16;
  Kit.register("project-vu.html", {
    name: "LED VU Meter", warm: 150,
    tagline: "ADC samples → interrupt computes a rolling peak → peak-hold decay → LED bar, green to yellow to red.",
    note: "The signal chain and the peak-hold behavior are the ones on the page. Audio is synthesized here (a beat, a sweep, or near-silence) and sampled the way the ADC interrupt would. Lower the decay constant and the meter drops instantly; raise it and it falls smoothly. Sixteen LEDs are shown for illustration.",
    W: 640, H: 400,
    controls: [
      { id: "srcn", label: "Audio source", type: "seg", options: ["Beat", "Sweep", "Quiet"], value: 0 },
      { id: "vol", label: "Input level", min: 0.1, max: 1, step: 0.05, value: 0.85, fmt: function (v) { return Math.round(v * 100) + "%"; } },
      { id: "decay", label: "Peak-hold decay", min: 0.8, max: 0.99, step: 0.01, value: 0.95, fmt: function (v) { return v.toFixed(2); } }
    ],
    buttons: [{ label: "Hit!", act: function (s) { s.hit = 1; } }],
    stats: [{ id: "lv", label: "level" }, { id: "led", label: "LEDs lit" }],
    setup: function (s) { s.hist = []; for (let i = 0; i < 240; i++) s.hist.push([0, 0]); s.hold = 0; s.raw = 0; s.hit = 0; s.pulse = 0; },
    tick: function (s, dt) {
      const t = s.t, vol = s.ctl.vol, src = s.ctl.srcn;
      let env = 0.03;
      if (src === 0) { const b = t % 1.0, kick = Math.exp(-b * 6.5) * 0.95, sn = ((t + 0.5) % 1.0) < 0.5 ? 0 : Math.exp(-(((t + 0.5) % 1.0) - 0.5) * 9) * 0.6; env = 0.1 + kick + sn + 0.06 * Math.sin(t * 23); }
      else if (src === 1) env = 0.5 + 0.45 * Math.sin(t * 1.4);
      s.hit *= Math.exp(-dt * 6); env += s.hit;
      s.raw = clamp(env * vol, 0, 1);
      s.hist.shift(); s.hist.push([-s.raw * (0.45 + 0.55 * s.rnd()), s.raw * (0.45 + 0.55 * s.rnd())]);
      s.hold = Math.max(s.raw, s.hold * Math.pow(s.ctl.decay, dt * 60));
      s.pulse = (s.pulse + dt * 2.4) % 1;
      s.stat("lv", Math.round(s.hold * 100) + "%"); s.stat("led", "" + Math.round(s.hold * NLED));
    },
    draw: function (g, s) {
      const boxes = ["AUDIO IN", "ADC · continuous", "ISR · rolling peak", "peak-hold decay", "GPIO → LEDs"];
      boxes.forEach(function (b, i) {
        const x = 14 + i * 124;
        g.fillStyle = "#0f1a33"; g.strokeStyle = i === 2 ? C.cyan : C.line; g.lineWidth = 1.4; rr(g, x, 22, 106, 34, 8); g.fill(); g.stroke();
        txt(g, b, x + 53, 39, { size: 8.5, color: i === 2 ? C.cyan : C.tx, align: "center" });
        if (i < 4) {
          g.strokeStyle = "rgba(148,163,184,.4)"; g.beginPath(); g.moveTo(x + 108, 39); g.lineTo(x + 122, 39); g.stroke();
          g.fillStyle = C.cyan; g.beginPath(); g.arc(x + 108 + ((s.pulse + i * 0.2) % 1) * 14, 39, 2.4, 0, TAU); g.fill();
        }
      });
      // waveform
      g.fillStyle = "#07101f"; rr(g, 20, 74, 600, 130, 8); g.fill(); g.strokeStyle = C.line; g.lineWidth = 1; g.stroke();
      g.strokeStyle = "rgba(148,163,184,.25)"; g.beginPath(); g.moveTo(24, 139); g.lineTo(616, 139); g.stroke();
      g.fillStyle = "rgba(0,212,255,.75)";
      for (let k = 0; k < 240; k++) { const v = s.hist[k], x = 26 + k * 2.45; g.fillRect(x, 139 + v[0] * 58, 1.8, (v[1] - v[0]) * 58); }
      const hy = 139 - s.hold * 58; g.strokeStyle = C.orange; g.lineWidth = 1.5; g.setLineDash([5, 4]); g.beginPath(); g.moveTo(24, hy); g.lineTo(616, hy); g.stroke(); g.setLineDash([]);
      txt(g, "ADC samples", 30, 88, { size: 8, color: C.mute }); txt(g, "held peak", 610, hy - 7, { size: 8, color: C.orange, align: "right" });
      // LEDs
      const lit = Math.round(s.hold * NLED), rawLit = Math.round(s.raw * NLED);
      for (let i = 0; i < NLED; i++) {
        const col = i < 10 ? C.green : i < 14 ? C.yellow : C.red, x = 30 + i * 36.5, on = i < lit;
        g.fillStyle = on ? col : "#0e1830"; if (on) { g.shadowColor = col; g.shadowBlur = 14; }
        rr(g, x, 236, 30, 54, 7); g.fill(); g.shadowBlur = 0;
        g.strokeStyle = on ? col : C.line; g.lineWidth = 1.2; rr(g, x, 236, 30, 54, 7); g.stroke();
        if (i === rawLit - 1 && rawLit > 0) { g.fillStyle = "#fff"; g.beginPath(); g.arc(x + 15, 228, 3, 0, TAU); g.fill(); }
      }
      txt(g, "● instantaneous peak", 30, 312, { size: 8, color: C.mute });
      txt(g, "bar = held peak (decays by " + s.ctl.decay.toFixed(2) + " per frame)", 610, 312, { size: 8, color: C.mute, align: "right" });
      txt(g, "FRDM-KL46Z · ADC interrupt · C + ARM assembly", 320, 380, { size: 9, color: C.dim, align: "center" });
    }
  });

  /* =====================================================================================
   * i-kiwi-ki gyro survival game (project-ikiwiki)
   * ===================================================================================== */
  const GX = 196, GY = 24, GW = 434, GH = 360;
  function kiwiNew(s) {
    s.p = { x: GX + GW / 2, y: GY + GH / 2, vx: 0, vy: 0, r: 11 }; s.en = []; s.kw = []; s.fx = []; s.score = 0; s.lives = 3; s.inv = 0; s.spawn = 0.6; s.dead = false; s.overT = 0; s.age = 0; s.throwT = 0; s.tilt = [0, 0];
  }
  function kiwiNearest(s, maxd) {
    let best = null, bd = maxd || 1e9;
    s.en.forEach(function (e) { const d = Math.hypot(e.x - s.p.x, e.y - s.p.y); if (d < bd) { bd = d; best = e; } });
    return best;
  }
  function kiwiThrow(s) {
    const e = kiwiNearest(s, 330); if (!e) return;
    const dx = e.x - s.p.x, dy = e.y - s.p.y, d = Math.hypot(dx, dy) || 1;
    s.kw.push({ x: s.p.x, y: s.p.y, vx: dx / d * 330, vy: dy / d * 330, life: 1.3 });
  }
  Kit.register("project-ikiwiki.html", {
    name: "i-kiwi-ki: Tilt-Controlled Survival", warm: 300,
    tagline: "Tilt adds velocity over time, like the gyroscope controller. Move the mouse to tilt, click to throw a kiwi at the nearest enemy.",
    note: "The autopilot plays by default. Take over to feel the inertial control: more tilt means more acceleration, and the serial stream on the left is what the Arduino would send to Python.",
    W: 640, H: 400,
    controls: [{ id: "auto", label: "autopilot", type: "check", value: true }],
    buttons: [{ label: "Restart", act: function (s) { kiwiNew(s); } }],
    stats: [{ id: "score", label: "score" }, { id: "lives", label: "lives" }],
    onCtl: function (s) { if (s.dead) kiwiNew(s); },
    setup: function (s) { kiwiNew(s); s.board = [140, 90, 60]; s.ser = []; s.serT = 0; s.aiT = 0; },
    down: function (s) { if (s.dead) { kiwiNew(s); return; } if (s.ctl.auto) { s.setCtl("auto", false); } else kiwiThrow(s); },
    tick: function (s, dt) {
      if (s.dead) { s.overT += dt; if (s.overT > 2.6 && s.ctl.auto) kiwiNew(s); s.stat("score", "" + s.score); s.stat("lives", "0"); return; }
      const p = s.p; s.age += dt;
      let tx = 0, ty = 0;
      if (s.ctl.auto) {
        const e = kiwiNearest(s, 130);
        if (e) { const dx = p.x - e.x, dy = p.y - e.y, d = Math.hypot(dx, dy) || 1; tx = dx / d; ty = dy / d; }
        const cx = GX + GW / 2 - p.x, cy = GY + GH / 2 - p.y; tx += cx * 0.003 + 0.55 * Math.sin(s.t * 0.9); ty += cy * 0.003 + 0.45 * Math.cos(s.t * 0.65);
        s.throwT -= dt; if (s.throwT <= 0 && kiwiNearest(s, 240)) { kiwiThrow(s); s.throwT = 0.42; }
      } else if (s.ptr.inside) { tx = clamp((s.ptr.x - (GX + GW / 2)) / (GW / 2), -1, 1); ty = clamp((s.ptr.y - (GY + GH / 2)) / (GH / 2), -1, 1); }
      s.tilt[0] = lerp(s.tilt[0], clamp(tx, -1, 1), 0.2); s.tilt[1] = lerp(s.tilt[1], clamp(ty, -1, 1), 0.2);
      p.vx += s.tilt[0] * 560 * dt; p.vy += s.tilt[1] * 560 * dt;
      const fr = Math.exp(-1.5 * dt); p.vx *= fr; p.vy *= fr;
      p.x += p.vx * dt; p.y += p.vy * dt;
      if (p.x < GX + p.r) { p.x = GX + p.r; p.vx *= -0.4; } if (p.x > GX + GW - p.r) { p.x = GX + GW - p.r; p.vx *= -0.4; }
      if (p.y < GY + p.r) { p.y = GY + p.r; p.vy *= -0.4; } if (p.y > GY + GH - p.r) { p.y = GY + GH - p.r; p.vy *= -0.4; }
      s.inv = Math.max(0, s.inv - dt);
      s.spawn -= dt;
      if (s.spawn <= 0) {
        s.spawn = Math.max(0.4, 0.85 - s.age * 0.01);
        const side = (s.rnd() * 4) | 0, u = s.rnd();
        const x = side === 0 ? GX : side === 1 ? GX + GW : GX + u * GW, y = side === 2 ? GY : side === 3 ? GY + GH : GY + u * GH;
        s.en.push({ x: x, y: y, r: 10, sp: 34 + s.rnd() * 24 + s.age * 0.5 });
      }
      s.en.forEach(function (e) { const dx = p.x - e.x, dy = p.y - e.y, d = Math.hypot(dx, dy) || 1; e.x += dx / d * e.sp * dt; e.y += dy / d * e.sp * dt; });
      s.kw.forEach(function (k) { k.x += k.vx * dt; k.y += k.vy * dt; k.life -= dt; });
      s.kw = s.kw.filter(function (k) { return k.life > 0; });
      s.kw.forEach(function (k) {
        s.en.forEach(function (e) {
          if (!e.dead && !k.dead && Math.hypot(k.x - e.x, k.y - e.y) < e.r + 5) {
            e.dead = k.dead = true; s.score += 10; for (let i = 0; i < 8; i++) s.fx.push({ x: e.x, y: e.y, vx: (s.rnd() - 0.5) * 160, vy: (s.rnd() - 0.5) * 160, life: 0.5 });
          }
        });
      });
      s.kw = s.kw.filter(function (k) { return !k.dead; });
      s.en.forEach(function (e) {
        if (!e.dead && s.inv <= 0 && Math.hypot(p.x - e.x, p.y - e.y) < p.r + e.r - 2) {
          e.dead = true; s.lives--; s.inv = 1.1;
          if (s.lives <= 0) { s.dead = true; s.overT = 0; s.board.push(s.score); s.board.sort(function (a, b) { return b - a; }); s.board.length = 3; }
        }
      });
      s.en = s.en.filter(function (e) { return !e.dead; });
      s.fx.forEach(function (f) { f.x += f.vx * dt; f.y += f.vy * dt; f.life -= dt; }); s.fx = s.fx.filter(function (f) { return f.life > 0; });
      s.serT += dt; if (s.serT > 0.1) { s.serT = 0; s.ser.push((s.tilt[0] >= 0 ? "+" : "") + s.tilt[0].toFixed(2) + "," + (s.tilt[1] >= 0 ? "+" : "") + s.tilt[1].toFixed(2)); if (s.ser.length > 9) s.ser.shift(); }
      s.stat("score", "" + s.score); s.stat("lives", "" + s.lives);
    },
    draw: function (g, s) {
      // controller
      txt(g, "GYRO CONTROLLER", 95, 22, { size: 8.5, color: C.mute, align: "center", weight: 600 });
      g.fillStyle = "#08101f"; rr(g, 10, 32, 170, 150, 10); g.fill(); g.strokeStyle = C.line; g.lineWidth = 1; g.stroke();
      const roll = s.tilt[0] * 0.7, pitch = -s.tilt[1] * 0.7, cx = 95, cy = 108;
      const proj = function (x, y) { const x1 = x * Math.cos(roll), z1 = -x * Math.sin(roll), y2 = y * Math.cos(pitch) - z1 * Math.sin(pitch), z2 = y * Math.sin(pitch) + z1 * Math.cos(pitch), k = 1 / (1 - z2 / 260); return [cx + x1 * k, cy + y2 * k]; };
      const q = [proj(-56, -36), proj(56, -36), proj(56, 36), proj(-56, 36)];
      g.fillStyle = "rgba(0,212,255,.14)"; g.strokeStyle = C.cyan; g.lineWidth = 2; g.beginPath(); q.forEach(function (p, i) { i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1]); }); g.closePath(); g.fill(); g.stroke();
      const ch = proj(0, 0); g.fillStyle = C.orange; g.beginPath(); g.arc(ch[0] + s.tilt[0] * 14, ch[1] + s.tilt[1] * 14, 5, 0, TAU); g.fill();
      txt(g, "MPU6050 + Arduino", 95, 168, { size: 8, color: C.dim, align: "center" });
      // serial
      g.fillStyle = "#08101f"; rr(g, 10, 196, 170, 108, 10); g.fill(); g.strokeStyle = C.line; g.stroke();
      txt(g, "SERIAL → pySerial thread", 20, 210, { size: 8, color: C.mute, weight: 600 });
      s.ser.forEach(function (l, i) { txt(g, l, 22, 226 + i * 9.6, { size: 8, color: i === s.ser.length - 1 ? C.green : C.dim }); });
      txt(g, "LEADERBOARD (csv)", 20, 322, { size: 8, color: C.mute, weight: 600 });
      s.board.forEach(function (b, i) { txt(g, (i + 1) + ".  " + b, 22, 338 + i * 13, { size: 9, color: i === 0 ? C.yellow : C.dim }); });
      // arena
      g.fillStyle = "#0a1325"; rr(g, GX, GY, GW, GH, 12); g.fill(); g.strokeStyle = C.line; g.lineWidth = 1.2; g.stroke();
      s.fx.forEach(function (f) { g.fillStyle = "rgba(57,255,106," + f.life * 1.6 + ")"; g.fillRect(f.x - 1.5, f.y - 1.5, 3, 3); });
      s.en.forEach(function (e) { g.fillStyle = "#7c2d3a"; g.strokeStyle = C.red; g.lineWidth = 2; g.beginPath(); g.arc(e.x, e.y, e.r, 0, TAU); g.fill(); g.stroke(); g.fillStyle = "#fff"; g.fillRect(e.x - 4, e.y - 3, 2.5, 2.5); g.fillRect(e.x + 2, e.y - 3, 2.5, 2.5); });
      s.kw.forEach(function (k) { g.fillStyle = "#8bd13a"; g.beginPath(); g.ellipse(k.x, k.y, 5, 4, Math.atan2(k.vy, k.vx), 0, TAU); g.fill(); g.fillStyle = "#4a3320"; g.fillRect(k.x - 1, k.y - 1, 2, 2); });
      const p = s.p, blink = s.inv > 0 && Math.floor(s.t * 14) % 2 === 0;
      if (!blink) { g.fillStyle = "#a8d94a"; g.strokeStyle = "#e9ffb0"; g.lineWidth = 2; g.beginPath(); g.arc(p.x, p.y, p.r, 0, TAU); g.fill(); g.stroke(); g.fillStyle = "#3b2a18"; g.fillRect(p.x - 2, p.y - 2, 4, 4); g.strokeStyle = "#e9ffb0"; g.beginPath(); g.moveTo(p.x, p.y); g.lineTo(p.x + p.vx * 0.05, p.y + p.vy * 0.05); g.stroke(); }
      for (let i = 0; i < 3; i++) { g.fillStyle = i < s.lives ? "#a8d94a" : "#1a2440"; g.beginPath(); g.arc(GX + 18 + i * 20, GY + 16, 6, 0, TAU); g.fill(); }
      txt(g, "score " + s.score, GX + GW - 12, GY + 16, { size: 11, color: C.tx, align: "right", weight: 700 });
      if (s.dead) {
        g.fillStyle = "rgba(6,10,20,.75)"; g.fillRect(GX, GY, GW, GH);
        txt(g, "GAME OVER", GX + GW / 2, GY + GH / 2 - 10, { size: 26, color: C.red, align: "center", weight: 700 });
        txt(g, "score " + s.score, GX + GW / 2, GY + GH / 2 + 20, { size: 13, color: C.tx, align: "center" });
        if (!s.ctl.auto) txt(g, "click to play again", GX + GW / 2, GY + GH / 2 + 42, { size: 9, color: C.cyan, align: "center" });
      }
      if (!s.ctl.auto) txt(g, s.ptr.inside ? "tilt: mouse · throw: click" : "move the mouse over the arena", GX + GW / 2, GY + GH - 12, { size: 8.5, color: C.dim, align: "center" });
      else txt(g, "autopilot · click to take over", GX + GW / 2, GY + GH - 12, { size: 8.5, color: C.dim, align: "center" });
    }
  });

  /* =====================================================================================
   * MIDI visualizer (project-midi)
   * ===================================================================================== */
  const MKX = 20, MKW = 600, MKT = 318, MKH = 74, MLO = 48, MHI = 83;
  const WHITE = [0, 2, 4, 5, 7, 9, 11];
  const KEYS = (function () {
    const out = [], nw = 21, kw = MKW / nw; let wi = 0;
    for (let m = MLO; m <= MHI; m++) if (WHITE.indexOf(m % 12) >= 0) { out.push({ m: m, x: MKX + wi * kw, w: kw, black: false }); wi++; }
    for (let m = MLO; m <= MHI; m++) if (WHITE.indexOf(m % 12) < 0) { const left = out.filter(function (k) { return !k.black && k.m === m - 1; })[0]; out.push({ m: m, x: left.x + kw * 0.66, w: kw * 0.62, black: true }); }
    return out;
  })();
  const KEYMAP = { a: 60, w: 61, s: 62, e: 63, d: 64, f: 65, t: 66, g: 67, y: 68, h: 69, u: 70, j: 71, k: 72, o: 73, l: 74, p: 75, ";": 76 };
  const VST = [[40, 90, 230], [110, 195, 255], [255, 255, 255], [255, 226, 100]];
  function velColor(v) {
    const f = clamp(v / 127, 0, 1) * 3, k = Math.min(2, Math.floor(f)), t = f - k, a = VST[k], b = VST[k + 1];
    return "rgb(" + a.map(function (x, i) { return Math.round(x + (b[i] - x) * t); }).join(",") + ")";
  }
  function keyAt(x, y) {
    let hit = null;
    KEYS.forEach(function (k) { if (x >= k.x && x < k.x + k.w && y >= MKT && y <= MKT + (k.black ? MKH * 0.62 : MKH) && (!hit || k.black)) hit = k; });
    return hit;
  }
  function midiOn(s, m, vel, user) {
    if (s.held[m]) midiOff(s, m, user);
    const n = { m: m, t0: s.t, t1: null, vel: vel }; s.notes.push(n); s.held[m] = n; s.events++;
    if (user && s.ctl.sound) { s.voices.on(m, vel, false); }
  }
  function midiOff(s, m, user) { const n = s.held[m]; if (!n) return; n.t1 = s.t; delete s.held[m]; s.events++; if (s.voices) s.voices.off(m); }
  Kit.register("project-midi.html", {
    name: "MIDI Visualizer", warm: 380,
    tagline: "Notes stream upward from the keys; harder strikes glow brighter. Click the keys (lower on the key = harder) or use A–L on your keyboard.",
    note: "Same visual rules as the Java app: velocity maps soft = cool blue to hard = bright white / yellow, bars rise at a configurable scroll speed, and MIDI events pass through a queue so the paint loop never blocks. A melody plays itself until you take over.",
    W: 640, H: 400,
    controls: [
      { id: "speed", label: "Note scroll speed", min: 80, max: 320, step: 10, value: 170, fmt: function (v) { return v + " px/s"; } },
      { id: "sound", label: "play sound when I press keys", type: "check", value: true },
      { id: "auto", label: "play itself when idle", type: "check", value: true }
    ],
    stats: [{ id: "ev", label: "MIDI events" }, { id: "last", label: "last note · velocity" }],
    setup: function (s) {
      s.notes = []; s.held = {}; s.events = 0; s.userT = -99; s.nextA = 0.4; s.offs = []; s.voices = new Voices("triangle"); s.cur = null; s.lastTxt = "–"; s.q = 0; s.ai = 3;
    },
    destroy: function (s) { s.voices.stopAll(); },
    down: function (s) { const k = keyAt(s.ptr.x, s.ptr.y); if (k) { s.userT = s.t; s.cur = k.m; const vel = clamp(30 + 97 * ((s.ptr.y - MKT) / MKH), 20, 127); midiOn(s, k.m, vel, true); s.lastTxt = noteName(k.m) + " · " + Math.round(vel); } },
    move: function (s) {
      if (!s.ptr.down) return; const k = keyAt(s.ptr.x, s.ptr.y);
      if (k && k.m !== s.cur) { if (s.cur != null) midiOff(s, s.cur, true); s.cur = k.m; const vel = clamp(30 + 97 * ((s.ptr.y - MKT) / MKH), 20, 127); midiOn(s, k.m, vel, true); s.lastTxt = noteName(k.m) + " · " + Math.round(vel); }
    },
    up: function (s) { if (s.cur != null) midiOff(s, s.cur, true); s.cur = null; },
    key: function (s, k, down) {
      const m = KEYMAP[("" + k).toLowerCase()]; if (m == null) return false;
      s.userT = s.t; if (down) { midiOn(s, m, 96, true); s.lastTxt = noteName(m) + " · 96"; } else midiOff(s, m, true);
      return true;
    },
    tick: function (s, dt) {
      const idle = s.t - s.userT > 5;
      if (s.ctl.auto && idle) {
        s.offs = s.offs.filter(function (o) { if (s.t >= o.t) { midiOff(s, o.m, false); return false; } return true; });
        if (s.t >= s.nextA) {
          const sc = [48, 51, 53, 55, 58, 60, 63, 65, 67, 70, 72, 75, 77, 79, 82];
          s.ai = clamp(s.ai + [-2, -1, -1, 0, 1, 1, 2, 3][(s.rnd() * 8) | 0], 0, sc.length - 1);
          const dyn = 0.5 + 0.5 * Math.sin(s.t * 0.7), vel = Math.round(clamp(30 + dyn * 80 + s.rnd() * 22, 25, 127)), dur = 0.14 + s.rnd() * 0.5;
          midiOn(s, sc[s.ai], vel, false); s.offs.push({ t: s.t + dur, m: sc[s.ai] });
          if (s.rnd() < 0.18 && s.ai > 2) { midiOn(s, sc[s.ai - 2], clamp(vel - 10, 20, 127), false); s.offs.push({ t: s.t + dur, m: sc[s.ai - 2] }); }
          s.nextA = s.t + 0.12 + s.rnd() * 0.3;
        }
      }
      const sp = s.ctl.speed; s.notes = s.notes.filter(function (n) { return MKT - (s.t - n.t0) * sp > -20 || n.t1 == null; });
      s.q = Math.max(0, s.q - dt * 6); if (s.events !== s.evLast) { s.q = Math.min(6, s.q + Math.abs(s.events - (s.evLast || 0))); s.evLast = s.events; }
      s.stat("ev", "" + s.events); s.stat("last", s.lastTxt);
    },
    draw: function (g, s) {
      const sp = s.ctl.speed;
      for (let i = 0; i < 22; i++) { g.strokeStyle = "rgba(30,58,95,.28)"; g.beginPath(); g.moveTo(MKX + i * MKW / 21, 20); g.lineTo(MKX + i * MKW / 21, MKT); g.stroke(); }
      const bars = s.notes.slice().sort(function (a, b) { return a.vel - b.vel; });
      bars.forEach(function (n) {
        const k = KEYS.filter(function (q) { return q.m === n.m; })[0], top = MKT - (s.t - n.t0) * sp, bot = n.t1 == null ? MKT : MKT - (s.t - n.t1) * sp;
        if (bot < 14) return; const y0 = Math.max(14, top), col = velColor(n.vel), x = k.x + (k.black ? 1 : 2), w = k.w - (k.black ? 2 : 4);
        g.fillStyle = col; g.globalAlpha = 0.92; g.shadowColor = col; g.shadowBlur = 6 + n.vel / 12; rr(g, x, y0, w, Math.max(5, bot - y0), 4); g.fill(); g.shadowBlur = 0; g.globalAlpha = 1;
      });
      KEYS.filter(function (k) { return !k.black; }).forEach(function (k) {
        const n = s.held[k.m]; g.fillStyle = n ? velColor(n.vel) : "#e8edf5"; g.strokeStyle = "#0b1224"; g.lineWidth = 1.2; rr(g, k.x + 0.5, MKT, k.w - 1, MKH, 3); g.fill(); g.stroke();
        if (k.m % 12 === 0) txt(g, noteName(k.m), k.x + k.w / 2, MKT + MKH - 9, { size: 7.5, color: "#556", align: "center" });
      });
      KEYS.filter(function (k) { return k.black; }).forEach(function (k) {
        const n = s.held[k.m]; g.fillStyle = n ? velColor(n.vel) : "#0b1020"; g.strokeStyle = "#000"; g.lineWidth = 1; rr(g, k.x, MKT, k.w, MKH * 0.62, 3); g.fill(); g.stroke();
      });
      txt(g, "MIDI thread", 24, 9, { size: 8, color: C.dim });
      g.fillStyle = s.q > 0.3 ? C.cyan : "#243556"; g.beginPath(); g.arc(88, 9, 3, 0, TAU); g.fill();
      txt(g, "→ queue →", 98, 9, { size: 8, color: C.dim }); txt(g, "Swing repaint (fixed fps)", 158, 9, { size: 8, color: C.dim });
      txt(g, "soft", 560, 9, { size: 8, color: velColor(30) }); txt(g, "hard", 610, 9, { size: 8, color: velColor(120), align: "right" });
    }
  });

  /* =====================================================================================
   * RiffMIDI: Rockband guitar to MIDI (project-riffMIDI)
   * ===================================================================================== */
  const FRET = [{ c: "#39ff6a", n: 60 }, { c: "#ff4d6d", n: 63 }, { c: "#ffd24a", n: 65 }, { c: "#3b82f6", n: 67 }, { c: "#ff8a3d", n: 70 }];
  const OPEN = 48;
  function rlog(s, bytes, label) {
    s.log.push({ b: bytes.map(function (x) { return Kit.hex(x); }).join(" "), l: label, t: s.t }); if (s.log.length > 14) s.log.shift(); s.sent++;
  }
  function riffStrum(s, down, user) {
    if (down) {
      s.strum = true; s.snd = [];
      const frets = []; for (let i = 0; i < 5; i++) if (s.fret[i]) frets.push(FRET[i].n);
      const notes = frets.length ? frets : [OPEN];
      notes.forEach(function (n) { s.snd.push(n); rlog(s, [0x90, n, 100], "NOTE ON  " + noteName(n) + " vel 100"); s.ev.push({ m: n, t0: s.t, t1: null }); if (user && s.ctl.sound) s.voices.on(n, 100, true); });
    } else {
      s.strum = false;
      (s.snd || []).forEach(function (n) { rlog(s, [0x80, n, 0], "NOTE OFF " + noteName(n)); s.ev.forEach(function (e) { if (e.m === n && e.t1 == null) e.t1 = s.t; }); if (s.voices) s.voices.off(n); }); s.snd = [];
    }
  }
  function riffBend(s, v) {
    s.setCtl("tilt", v); const b = Math.round(8192 + v * 8191);
    rlog(s, [0xe0, b & 127, (b >> 7) & 127], "PITCH BEND " + (v >= 0 ? "+" : "") + v.toFixed(2)); if (s.voices) s.voices.setBend(v);
  }
  const RIFF = [[1], [1], [4], [1], [2], [8], [4], [17], [1], [1], [4], [1], [2], [8], [16], [0]];
  Kit.register("project-riffMIDI.html", {
    name: "RiffMIDI: Guitar → MIDI", warm: 260,
    tagline: "Hold fret buttons (keys 1–5 or click), strum with Space or the strum bar. Every action becomes a real MIDI message.",
    note: "Fret buttons choose the notes (an illustrative pentatonic mapping), the strum bar sends NoteOn / NoteOff, the whammy bar sends a modulation CC, and tilt sends pitch bend. The hex on the right is the actual MIDI byte stream for each action. A riff plays itself until you take over.",
    W: 640, H: 400,
    controls: [
      { id: "whammy", label: "Whammy bar → CC1", min: 0, max: 127, step: 1, value: 0 },
      { id: "tilt", label: "Tilt → pitch bend", min: -1, max: 1, step: 0.05, value: 0, fmt: function (v) { return (v >= 0 ? "+" : "") + v.toFixed(2); } },
      { id: "sound", label: "play sound when I strum", type: "check", value: true },
      { id: "auto", label: "play a riff when idle", type: "check", value: true }
    ],
    stats: [{ id: "sent", label: "MIDI messages sent" }, { id: "notes", label: "held notes" }],
    onCtl: function (s, id, v) {
      s.userT = s.t;
      if (id === "whammy") rlog(s, [0xb0, 1, Math.round(v)], "CC 1 (mod) " + Math.round(v));
      if (id === "tilt") { const b = Math.round(8192 + v * 8191); rlog(s, [0xe0, b & 127, (b >> 7) & 127], "PITCH BEND " + (v >= 0 ? "+" : "") + v.toFixed(2)); s.voices.setBend(v); }
    },
    setup: function (s) {
      s.fret = [false, false, false, false, false]; s.strum = false; s.log = []; s.sent = 0; s.ev = []; s.voices = new Voices("sawtooth"); s.userT = -99; s.ri = 0; s.rt = 0.5; s.snd = [];
    },
    destroy: function (s) { s.voices.stopAll(); },
    down: function (s) {
      const x = s.ptr.x, y = s.ptr.y; s.userT = s.t;
      for (let i = 0; i < 5; i++) if (Math.hypot(x - (70 + i * 50), y - 92) < 20) { s.fret[i] = !s.fret[i]; s.ptr.fi = i; return; }
      if (x > 60 && x < 310 && y > 150 && y < 196) { s.ptr.strumming = true; riffStrum(s, true, true); }
    },
    up: function (s) { if (s.ptr.strumming) { s.ptr.strumming = false; riffStrum(s, false, true); } },
    key: function (s, k, down) {
      const i = "12345".indexOf(k);
      if (i >= 0) { s.userT = s.t; s.fret[i] = down; return true; }
      if (k === " ") { s.userT = s.t; if (down) riffStrum(s, true, true); else riffStrum(s, false, true); return true; }
      return false;
    },
    tick: function (s, dt) {
      if (s.ctl.auto && s.t - s.userT > 5) {
        s.rt -= dt;
        if (s.rt <= 0) {
          if (s.strum) { riffStrum(s, false, false); s.rt = 0.12; }
          else { const m = RIFF[s.ri % RIFF.length][0]; for (let i = 0; i < 5; i++) s.fret[i] = !!(m & (1 << i)); riffStrum(s, true, false); s.ri++; s.rt = 0.2; if (s.ri % 8 === 0) riffBend(s, Math.round(Math.sin(s.t) * 6) / 10); }
        }
      }
      s.ev = s.ev.filter(function (e) { return s.t - (e.t1 || s.t) < 6; });
      s.stat("sent", "" + s.sent); s.stat("notes", "" + (s.snd ? s.snd.map(noteName).join(" ") : "") || "–");
    },
    draw: function (g, s) {
      // neck
      txt(g, "ROCK BAND GUITAR", 180, 26, { size: 8.5, color: C.mute, align: "center", weight: 600 });
      g.fillStyle = "#2a1c12"; g.strokeStyle = "#6b4a2a"; g.lineWidth = 2; rr(g, 30, 48, 300, 90, 12); g.fill(); g.stroke();
      for (let i = 0; i < 5; i++) {
        const x = 70 + i * 50, on = s.fret[i], c = FRET[i].c;
        g.fillStyle = on ? c : "#17120c"; g.strokeStyle = c; g.lineWidth = 2.5; if (on) { g.shadowColor = c; g.shadowBlur = 16; }
        g.beginPath(); g.arc(x, 92, 15, 0, TAU); g.fill(); g.stroke(); g.shadowBlur = 0;
        txt(g, "" + (i + 1), x, 92, { size: 11, color: on ? "#04101f" : c, align: "center", weight: 700 });
        txt(g, noteName(FRET[i].n), x, 124, { size: 8, color: C.dim, align: "center" });
      }
      // strum bar
      g.fillStyle = s.strum ? "#8fb6d6" : "#33415f"; g.strokeStyle = "#8fa0c0"; g.lineWidth = 2; rr(g, 60, 154, 250, 38, 8); g.fill(); g.stroke();
      txt(g, s.strum ? "STRUMMING" : "STRUM BAR  (space)", 185, 174, { size: 10, color: s.strum ? "#04101f" : C.tx, align: "center", weight: 600 });
      // whammy
      txt(g, "WHAMMY → CC1", 30, 218, { size: 8.5, color: C.mute, weight: 600 });
      g.fillStyle = "#0f1a33"; rr(g, 30, 228, 300, 10, 5); g.fill(); g.fillStyle = C.purple; rr(g, 30, 228, 300 * s.ctl.whammy / 127, 10, 5); g.fill();
      // tilt dial
      txt(g, "TILT → PITCH BEND", 30, 262, { size: 8.5, color: C.mute, weight: 600 });
      g.strokeStyle = C.line; g.lineWidth = 6; g.beginPath(); g.arc(110, 326, 46, Math.PI * 1.15, Math.PI * 1.85); g.stroke();
      const a = -Math.PI / 2 + s.ctl.tilt * 0.9; g.strokeStyle = C.orange; g.lineWidth = 3; g.beginPath(); g.moveTo(110, 326); g.lineTo(110 + Math.cos(a) * 44, 326 + Math.sin(a) * 44); g.stroke();
      g.fillStyle = C.orange; g.beginPath(); g.arc(110, 326, 4, 0, TAU); g.fill();
      txt(g, (s.ctl.tilt >= 0 ? "+" : "") + s.ctl.tilt.toFixed(2), 110, 358, { size: 10, color: C.orange, align: "center", weight: 700 });
      ["Arduino Mega", "Control Surface", "USB-MIDI"].forEach(function (b, i) {
        const x = 190 + (i % 1) * 0, y = 276 + i * 36; g.fillStyle = "#0f1a33"; g.strokeStyle = C.line; g.lineWidth = 1.2; rr(g, x, y, 140, 26, 7); g.fill(); g.stroke();
        txt(g, b, x + 70, y + 13, { size: 9, color: C.tx, align: "center" });
        if (i < 2) { g.strokeStyle = C.cyan; g.beginPath(); g.moveTo(x + 70, y + 26); g.lineTo(x + 70, y + 36); g.stroke(); }
      });
      // MIDI log
      g.fillStyle = "#07101f"; rr(g, 350, 26, 280, 206, 8); g.fill(); g.strokeStyle = C.line; g.lineWidth = 1; g.stroke();
      txt(g, "MIDI OUT (hex)", 362, 40, { size: 8.5, color: C.mute, weight: 600 });
      s.log.forEach(function (l, i) {
        const y = 56 + (i - (s.log.length - 1)) * 0 + i * 12.8, age = clamp(1 - (s.t - l.t) / 5, 0.35, 1);
        g.globalAlpha = age; txt(g, l.b, 362, y, { size: 8.5, color: C.green }); txt(g, l.l, 420, y, { size: 8, color: C.tx }); g.globalAlpha = 1;
      });
      // pitch roll
      g.fillStyle = "#07101f"; rr(g, 350, 244, 280, 142, 8); g.fill(); g.strokeStyle = C.line; g.stroke();
      txt(g, "NOTES SENT", 362, 258, { size: 8.5, color: C.mute, weight: 600 });
      s.ev.forEach(function (e) {
        const x1 = 622 - (s.t - e.t0) * 45, x0 = e.t1 == null ? 622 : 622 - (s.t - e.t1) * 45, y = 372 - (e.m - 46) * 4.2;
        if (x1 < 352) return; g.fillStyle = C.purple; g.globalAlpha = 0.85; rr(g, Math.max(352, x1), y - 3, Math.max(5, x0 - Math.max(352, x1)), 6, 3); g.fill(); g.globalAlpha = 1;
      });
    }
  });
})(typeof window !== "undefined" ? window : globalThis);
