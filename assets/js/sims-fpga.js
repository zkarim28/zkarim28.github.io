/* Simulations for the FPGA projects: Lorenz ODE solver, Mandelbrot, 2D-wave-equation drum, and a real AES-128 pipeline. */
(function (root) {
  "use strict";
  const Kit = root.SimKit, C = Kit.C, TAU = Kit.TAU, txt = Kit.txt, rr = Kit.rr, clamp = Kit.clamp, lerp = Kit.lerp;

  /* =====================================================================================
   * Lorenz ODE solver (project-fpga1)
   * ===================================================================================== */
  function lorenzStep(p, sg, rho, beta, dt) {
    const dx = sg * (p[1] - p[0]), dy = p[0] * (rho - p[2]) - p[1], dz = p[0] * p[1] - beta * p[2];
    p[0] += dx * dt; p[1] += dy * dt; p[2] += dz * dt;           // forward Euler, as in the hardware core
  }
  Kit.lib.lorenzStep = lorenzStep;
  const LCOL = [C.red, C.green, C.cyan];
  function lorenzInit(s) {
    s.tr = [[1, 1, 1], [1.001, 1, 1], [1, 1.001, 1]]; s.trail = [[], [], []];
    for (let i = 0; i < 300; i++) s.tr.forEach(function (p) { lorenzStep(p, s.ctl.sg, s.ctl.rho, s.ctl.beta, 0.006); });
    for (let k = 0; k < 520; k++) s.tr.forEach(function (p, i) {
      for (let j = 0; j < 6; j++) lorenzStep(p, s.ctl.sg, s.ctl.rho, s.ctl.beta, 0.006);
      s.trail[i].push([p[0], p[1], p[2]]);
    });
  }
  Kit.register("project-fpga1.html", {
    name: "Lorenz Attractor Solver",
    tagline: "Three trajectories start 0.001 apart. Chaos pulls them to completely different paths.",
    note: "Forward-Euler integration of the Lorenz equations, one step per tick, exactly the scheme the FPGA core uses (the hardware does it in fixed point; this demo uses floating point). Change σ, ρ, β like the HPS software does.",
    W: 640, H: 400,
    controls: [
      { id: "sg", label: "σ (sigma)", min: 1, max: 20, step: 0.5, value: 10, fmt: function (v) { return v.toFixed(1); } },
      { id: "rho", label: "ρ (rho)", min: 0, max: 50, step: 0.5, value: 28, fmt: function (v) { return v.toFixed(1); } },
      { id: "beta", label: "β (beta)", min: 0.5, max: 6, step: 0.1, value: 2.7, fmt: function (v) { return v.toFixed(1); } },
      { id: "proj", label: "Projection", type: "seg", options: ["x–z", "x–y", "y–z"], value: 0 }
    ],
    buttons: [{ label: "Restart trajectories", act: function (s) { lorenzInit(s); } }],
    stats: [{ id: "xyz", label: "red (x, y, z)" }, { id: "sep", label: "red ↔ green gap" }],
    setup: function (s) { lorenzInit(s); },
    tick: function (s) {
      const sg = s.ctl.sg, rho = s.ctl.rho, beta = s.ctl.beta;
      for (let k = 0; k < 6; k++) s.tr.forEach(function (p, i) {
        lorenzStep(p, sg, rho, beta, 0.006);
        if (!isFinite(p[0] + p[1] + p[2]) || Math.abs(p[0]) > 400) { p[0] = 1 + i * 0.001; p[1] = 1; p[2] = 1; }
      });
      s.tr.forEach(function (p, i) { const t = s.trail[i]; t.push([p[0], p[1], p[2]]); if (t.length > 640) t.shift(); });
      const a = s.tr[0], b = s.tr[1];
      s.sep = Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
      s.stat("xyz", a[0].toFixed(1) + ", " + a[1].toFixed(1) + ", " + a[2].toFixed(1)); s.stat("sep", s.sep < 0.01 ? s.sep.toExponential(1) : s.sep.toFixed(2));
    },
    draw: function (g, s) {
      const sg = s.ctl.sg, rho = s.ctl.rho, beta = s.ctl.beta, pj = s.ctl.proj;
      const xs = 300 / (1.6 * Math.sqrt(Math.max(0, beta * (rho - 1))) + 6), zs = 330 / (1.75 * Math.max(rho, 8) + 2), ys = xs * 0.72;
      const map = function (p) {
        if (pj === 0) return [320 + p[0] * xs, 380 - p[2] * zs];
        if (pj === 1) return [320 + p[0] * xs, 205 - p[1] * ys];
        return [320 + p[1] * ys * 1.3, 380 - p[2] * zs];
      };
      g.strokeStyle = "rgba(30,58,95,.5)"; g.lineWidth = 1; g.beginPath(); g.moveTo(320, 20); g.lineTo(320, 392); g.moveTo(20, pj === 1 ? 205 : 380); g.lineTo(620, pj === 1 ? 205 : 380); g.stroke();
      txt(g, ["x →   ↑ z", "x →   ↑ y", "y →   ↑ z"][pj], 626, 392, { size: 8, color: C.dim, align: "right" });
      s.trail.forEach(function (tr, i) {
        const pts = tr.map(map);
        for (let b = 0; b < 5; b++) {
          const a = Math.floor(pts.length * b / 5), z = Math.floor(pts.length * (b + 1) / 5) + 1;
          g.strokeStyle = LCOL[i]; g.globalAlpha = 0.08 + 0.2 * b; g.lineWidth = 1.2 + b * 0.18; g.beginPath();
          for (let k = a; k < Math.min(z, pts.length); k++) k === a ? g.moveTo(pts[k][0], pts[k][1]) : g.lineTo(pts[k][0], pts[k][1]);
          g.stroke();
        }
        g.globalAlpha = 1;
        const h = map(s.tr[i]); g.fillStyle = LCOL[i]; g.shadowColor = LCOL[i]; g.shadowBlur = 10; g.beginPath(); g.arc(h[0], h[1], 3.4, 0, TAU); g.fill(); g.shadowBlur = 0;
      });
      const e = [["dx/dt", "σ(y − x)"], ["dy/dt", "x(ρ − z) − y"], ["dz/dt", "xy − βz"]];
      e.forEach(function (q, i) { txt(g, q[0] + " = " + q[1], 14, 20 + i * 15, { size: 9.5, color: C.tx }); });
      txt(g, "σ=" + sg.toFixed(1) + "  ρ=" + rho.toFixed(1) + "  β=" + beta.toFixed(1), 14, 70, { size: 9, color: C.cyan });
      // divergence meter
      const mx = 470;
      const frac = clamp((Math.log10(Math.max(s.sep, 1e-3)) + 3) / (Math.log10(40) + 3), 0, 1);
      txt(g, "red ↔ green separation", mx, 26, { size: 8.5, color: C.mute });
      g.fillStyle = "#0f1a33"; rr(g, mx, 34, 150, 8, 4); g.fill(); g.fillStyle = C.orange; rr(g, mx, 34, Math.max(5, 150 * frac), 8, 4); g.fill();
      txt(g, "0.001", mx, 52, { size: 7.5, color: C.dim }); txt(g, "chaos →", mx + 150, 52, { size: 7.5, color: C.dim, align: "right" });
    }
  });

  /* =====================================================================================
   * Mandelbrot (project-fpga2)
   * ===================================================================================== */
  const MW = 320, MH = 200;
  const PAL = (function () {
    /* cosine palette (cyclic, so iteration bands blend): deep blue -> violet -> cyan -> amber */
    const out = new Uint8Array(256 * 3), A = [0.42, 0.38, 0.55], B = [0.38, 0.36, 0.45], D = [0.62, 0.30, 0.0];
    for (let i = 0; i < 256; i++) for (let c = 0; c < 3; c++) out[i * 3 + c] = clamp((A[c] + B[c] * Math.cos(TAU * (i / 256 + D[c]))) * 255, 0, 255);
    return out;
  })();
  function mandelIter(cr, ci, max) {
    let zr = 0, zi = 0, n = 0;
    while (n < max && zr * zr + zi * zi <= 4) { const t = zr * zr - zi * zi + cr; zi = 2 * zr * zi + ci; zr = t; n++; }
    return n;
  }
  /* smooth (fractional) escape count: removes the flat bands of the plain integer count */
  function mandelSmooth(cr, ci, max) {
    let zr = 0, zi = 0, n = 0, m2 = 0;
    while (n < max) { m2 = zr * zr + zi * zi; if (m2 > 65536) break; const t = zr * zr - zi * zi + cr; zi = 2 * zr * zi + ci; zr = t; n++; }
    return n >= max ? -1 : n + 1 - Math.log2(Math.log2(m2) / 2);
  }
  Kit.lib.mandelIter = mandelIter; Kit.lib.mandelSmooth = mandelSmooth;
  function mandelRestart(s) { s.scan = 0; s.hold = 0; s.complete = false; }
  /* seed the new view with a magnified copy of the old image, so each zoom sharpens instead of popping */
  function mandelPreview(s, o, n) {
    if (!s.tmp) { s.tmp = document.createElement("canvas"); s.tmp.width = MW; s.tmp.height = MH; s.tg = s.tmp.getContext("2d"); }
    const k = MW / o.w, sx = ((n.cx - n.w / 2) - (o.cx - o.w / 2)) * k, sy = ((n.cy - n.w * 0.3125) - (o.cy - o.w * 0.3125)) * k, sw = n.w * k, sh = n.w * k * (MH / MW) / 0.625 * 0.625;
    s.tg.imageSmoothingEnabled = true; s.tg.fillStyle = "#060a14"; s.tg.fillRect(0, 0, MW, MH);
    s.tg.drawImage(s.cv, sx, sy, sw, sh, 0, 0, MW, MH);
    const im = s.tg.getImageData(0, 0, MW, MH); s.img.data.set(im.data); s.cx.putImageData(s.img, 0, 0);
  }
  Kit.register("project-fpga2.html", {
    name: "Parallel Mandelbrot Renderer",
    tagline: "Each compute unit owns a pixel and iterates z → z² + c until it escapes. More units, faster frames. Click to zoom.",
    note: "Real escape-time Mandelbrot at 320×200. The slider is the number of pixels finished per step, the way the FPGA's parallel compute units multiply throughput. Auto-zoom dives toward Seahorse Valley.",
    W: 640, H: 400, touchNone: false, warm: 95,
    controls: [
      { id: "units", label: "Parallel compute units", min: 1, max: 64, step: 1, value: 16 },
      { id: "iter", label: "Base max iterations", min: 30, max: 300, step: 10, value: 100 },
      { id: "auto", label: "auto-zoom", type: "check", value: true }
    ],
    buttons: [{ label: "Reset view", act: function (s) { s.view = { cx: -0.5, cy: 0, w: 3.5, z: 1 }; mandelRestart(s); } }],
    stats: [{ id: "zoom", label: "zoom" }, { id: "it", label: "max iterations" }, { id: "pct", label: "pixels done" }],
    setup: function (s) {
      s.cv = document.createElement("canvas"); s.cv.width = MW; s.cv.height = MH; s.cx = s.cv.getContext("2d");
      s.img = s.cx.createImageData(MW, MH); for (let i = 3; i < s.img.data.length; i += 4) s.img.data[i] = 255;
      s.view = { cx: -0.5, cy: 0, w: 3.5, z: 1 }; mandelRestart(s);
    },
    down: function (s) {
      const px = (s.ptr.x - 0) / 640, py = s.ptr.y / 400; if (px < 0 || px > 1 || py < 0 || py > 1) return;
      const v = s.view, o = { cx: v.cx, cy: v.cy, w: v.w }; v.cx += (px - 0.5) * v.w; v.cy += (py - 0.5) * v.w * 0.625; v.w /= 3; v.z *= 3; mandelPreview(s, o, v); mandelRestart(s); s.setCtl("auto", false);
    },
    tick: function (s, dt) {
      const v = s.view, max = Math.round(s.ctl.iter + 22 * Math.log2(v.z)), per = s.ctl.units * 48, d = s.img.data, N = MW * MH;
      s.max = max;
      if (!s.complete) {
        const end = Math.min(N, s.scan + per);
        for (let p = s.scan; p < end; p++) {
          const i = p % MW, j = (p / MW) | 0;
          const mu = mandelSmooth(v.cx + (i / MW - 0.5) * v.w, v.cy + (j / MH - 0.5) * v.w * 0.625, max);
          const o = p * 4;
          if (mu < 0) { d[o] = 6; d[o + 1] = 10; d[o + 2] = 20; } else { const k = (Math.floor(mu * 3) & 255) * 3; d[o] = PAL[k]; d[o + 1] = PAL[k + 1]; d[o + 2] = PAL[k + 2]; }
        }
        s.scan = end; s.cx.putImageData(s.img, 0, 0);
        if (end >= N) { s.complete = true; s.hold = 0; }
      } else {
        s.hold += dt;
        if (s.ctl.auto && s.hold > 0.7) {
          if (v.z > 3000) s.view = { cx: -0.5, cy: 0, w: 3.5, z: 1 };
          else { const o = { cx: v.cx, cy: v.cy, w: v.w }; v.cx += (-0.743643887037151 - v.cx) * (1 - 1 / 2.2); v.cy += (0.13182590420533 - v.cy) * (1 - 1 / 2.2); v.w /= 2.2; v.z *= 2.2; mandelPreview(s, o, v); }
          mandelRestart(s);
        }
      }
      s.stat("zoom", v.z < 100 ? v.z.toFixed(1) + "×" : Math.round(v.z) + "×"); s.stat("it", "" + max); s.stat("pct", Math.round(100 * s.scan / N) + "%");
    },
    draw: function (g, s) {
      g.imageSmoothingEnabled = false; g.drawImage(s.cv, 0, 0, 640, 400);
      if (!s.complete) {
        const y = ((s.scan / MW) | 0) * 2, x = (s.scan % MW) * 2, len = s.ctl.units * 2;
        g.fillStyle = "rgba(255,255,255,.9)"; g.fillRect(x, y, len, 2.5);
        g.fillStyle = "rgba(0,212,255,.18)"; g.fillRect(0, y, 640, 2);
      }
      g.fillStyle = "rgba(6,10,20,.72)"; rr(g, 10, 10, 200, 28, 8); g.fill();
      txt(g, s.ctl.units + " compute units · " + s.ctl.units + " px / step", 20, 24, { size: 9, color: C.cyan });
    }
  });

  /* =====================================================================================
   * Drum: 2D wave equation (project-fpga3)
   * ===================================================================================== */
  const DN = 44;
  function waveStep(u, up, un, n, c2, damp, mask) {
    for (let j = 1; j < n - 1; j++) for (let i = 1; i < n - 1; i++) {
      const k = j * n + i; if (!mask[k]) { un[k] = 0; continue; }
      const lap = u[k - 1] + u[k + 1] + u[k - n] + u[k + n] - 4 * u[k];
      un[k] = u[k] + (1 - damp) * (u[k] - up[k]) + c2 * lap;
    }
  }
  function drumMask(n) { const m = new Uint8Array(n * n), c = (n - 1) / 2, R = n / 2 - 1.5; for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) m[j * n + i] = (i - c) * (i - c) + (j - c) * (j - c) <= R * R ? 1 : 0; return m; }
  function strike(u, up, n, fx, fy, amp) {
    const cx = fx * (n - 1), cy = fy * (n - 1), sg = n / 20;
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) { const r2 = (i - cx) * (i - cx) + (j - cy) * (j - cy); up[j * n + i] -= amp * Math.exp(-r2 / (2 * sg * sg)); }
  }
  Kit.lib.wave = { waveStep: waveStep, drumMask: drumMask, strike: strike };
  function drumBuffer(c2, fx, fy) {
    const n = 22, mask = drumMask(n), len = 17640, SR = 22050;
    let u = new Float32Array(n * n), up = new Float32Array(n * n), un = new Float32Array(n * n);
    strike(u, up, n, fx, fy, 1);
    const ac = Kit.audio(); if (!ac) return null;
    const buf = ac.createBuffer(1, len, SR), d = buf.getChannelData(0), mid = ((n / 2) | 0) * n + ((n / 2) | 0), pick = (((n * 0.62) | 0) * n + ((n * 0.45) | 0));
    let peak = 0.0001;
    for (let t = 0; t < len; t++) {
      waveStep(u, up, un, n, c2, 0.00022, mask); const tmp = up; up = u; u = un; un = tmp;
      d[t] = u[mid] + 0.7 * u[pick]; peak = Math.max(peak, Math.abs(d[t]));
    }
    for (let t = 0; t < len; t++) d[t] = d[t] / peak * 0.8 * Math.min(1, t / 60) * Math.min(1, (len - t) / 800);
    return buf;
  }
  function drumStrike(s, fx, fy, audible) {
    strike(s.u, s.up, DN, fx, fy, 0.9); s.energy = 1;
    if (audible && s.ctl.sound) {
      const ac = Kit.audio(), b = drumBuffer(s.ctl.tension, fx, fy);
      if (ac && b) { const src = ac.createBufferSource(); src.buffer = b; const gn = ac.createGain(); gn.gain.value = 0.6; src.connect(gn); gn.connect(ac.destination); src.start(); }
    }
  }
  Kit.register("project-fpga3.html", {
    name: "Drum Synthesizer", warm: 70,
    tagline: "A drumhead modeled as a 2D wave equation, updated in parallel. Click the drum to strike it.",
    note: "Real 2D wave equation on a 44×44 grid with a fixed circular boundary. The scope shows the center point, which is what the FPGA sends to the audio DAC. Turn on sound to hear a coarser version of the same simulation.",
    W: 640, H: 400,
    controls: [
      { id: "tension", label: "Tension", min: 0.15, max: 0.48, step: 0.01, value: 0.4, fmt: function (v) { return v.toFixed(2); } },
      { id: "damp", label: "Damping", min: 0.0004, max: 0.012, step: 0.0002, value: 0.0018, fmt: function (v) { return v.toFixed(4); } },
      { id: "sound", label: "sound on (click the drum)", type: "check", value: false }
    ],
    buttons: [{ label: "Strike center", act: function (s) { s.userT = s.t; drumStrike(s, 0.5, 0.5, true); } }, { label: "Strike random", act: function (s) { s.userT = s.t; drumStrike(s, 0.25 + s.rnd() * 0.5, 0.25 + s.rnd() * 0.5, true); } }],
    stats: [{ id: "e", label: "membrane energy" }, { id: "c", label: "center displacement" }],
    onCtl: function (s, id, v) { if (id === "sound" && v) Kit.audio(); },
    setup: function (s) {
      s.u = new Float32Array(DN * DN); s.up = new Float32Array(DN * DN); s.un = new Float32Array(DN * DN); s.mask = drumMask(DN);
      s.hist = new Float32Array(240); s.energy = 0; s.userT = -99; s.next = 0.5; s.mid = ((DN / 2) | 0) * DN + ((DN / 2) | 0);
    },
    down: function (s) {
      const fx = (s.ptr.x - 20) / 352, fy = (s.ptr.y - 24) / 352;
      if (fx < 0 || fx > 1 || fy < 0 || fy > 1) return;
      s.userT = s.t; drumStrike(s, fx, fy, true);
    },
    tick: function (s, dt) {
      if (s.t > s.next && s.t - s.userT > 5) { drumStrike(s, 0.3 + s.rnd() * 0.4, 0.3 + s.rnd() * 0.4, false); s.next = s.t + 2.4 + s.rnd() * 1.2; }
      for (let k = 0; k < 3; k++) {
        waveStep(s.u, s.up, s.un, DN, s.ctl.tension, s.ctl.damp, s.mask);
        const t = s.up; s.up = s.u; s.u = s.un; s.un = t;
        s.hist.copyWithin(0, 1); s.hist[239] = s.u[s.mid];
      }
      let e = 0; for (let k = 0; k < s.u.length; k++) e += s.u[k] * s.u[k]; s.energy = e; s.emax = Math.max(e, (s.emax || 0) * 0.998);
      s.stat("e", e.toFixed(2)); s.stat("c", s.u[s.mid].toFixed(3));
    },
    draw: function (g, s) {
      const CS = 8, X0 = 20, Y0 = 24;
      let m = 0.0001; for (let k = 0; k < s.u.length; k++) { const a = Math.abs(s.u[k]); if (a > m) m = a; }
      const gain = 1 / Math.max(0.25, m);
      for (let j = 0; j < DN; j++) for (let i = 0; i < DN; i++) {
        const k = j * DN + i; if (!s.mask[k]) continue;
        const v = clamp(s.u[k] * gain * 1.6, -1, 1);
        g.fillStyle = v >= 0 ? "rgba(255,138,61," + (0.06 + 0.94 * v) + ")" : "rgba(0,212,255," + (0.06 - 0.94 * v) + ")";
        g.fillRect(X0 + i * CS, Y0 + j * CS, CS - 0.6, CS - 0.6);
      }
      g.strokeStyle = "rgba(226,232,240,.5)"; g.lineWidth = 2.5; g.beginPath(); g.arc(X0 + DN * CS / 2, Y0 + DN * CS / 2, (DN / 2 - 1) * CS + 3, 0, TAU); g.stroke();
      g.fillStyle = C.yellow; g.beginPath(); g.arc(X0 + (DN / 2) * CS, Y0 + (DN / 2) * CS, 3, 0, TAU); g.fill();
      // scope
      g.fillStyle = "#08101f"; rr(g, 396, 54, 232, 150, 8); g.fill(); g.strokeStyle = C.line; g.lineWidth = 1; g.stroke();
      txt(g, "CENTER SAMPLE → AUDIO DAC", 406, 68, { size: 8.5, color: C.mute, weight: 600 });
      g.strokeStyle = "rgba(148,163,184,.25)"; g.beginPath(); g.moveTo(402, 135); g.lineTo(622, 135); g.stroke();
      g.strokeStyle = C.yellow; g.lineWidth = 1.5; g.beginPath();
      let hp = 0.05; for (let k = 0; k < 240; k++) hp = Math.max(hp, Math.abs(s.hist[k]));
      for (let k = 0; k < 240; k++) { const x = 400 + k * 0.92, y = 135 - s.hist[k] / hp * 54; k ? g.lineTo(x, y) : g.moveTo(x, y); }
      g.stroke();
      // energy bar
      txt(g, "membrane energy (fades after a strike)", 396, 226, { size: 8.5, color: C.mute });
      g.fillStyle = "#0f1a33"; rr(g, 396, 234, 232, 8, 4); g.fill(); g.fillStyle = C.orange; rr(g, 396, 234, Math.max(4, 232 * Math.min(1, s.energy / Math.max(0.5, s.emax))), 8, 4); g.fill();
      txt(g, "u(t+1) = 2u − u(t−1) + c²∇²u", 396, 268, { size: 10, color: C.tx });
      txt(g, "each grid point updated from its 4 neighbours", 396, 284, { size: 8, color: C.dim });
      txt(g, "grid in on-chip M10K RAM, pipelined update", 396, 297, { size: 8, color: C.dim });
      txt(g, "click the drum to strike", 396, 330, { size: 9.5, color: C.cyan });
      txt(g, "orange = up · cyan = down", 396, 346, { size: 8, color: C.dim });
    }
  });

  /* =====================================================================================
   * AES-128 pipeline (project-fpga-final): real cipher, bytes and all
   * ===================================================================================== */
  const SB = new Uint8Array(256), ISB = new Uint8Array(256);
  (function () {
    const rot = function (x, n) { return ((x << n) | (x >> (8 - n))) & 255; };
    let p = 1, q = 1;
    do {
      p = (p ^ ((p << 1) & 255) ^ ((p & 0x80) ? 0x1b : 0)) & 255;
      q ^= (q << 1) & 255; q ^= (q << 2) & 255; q ^= (q << 4) & 255; if (q & 0x80) q ^= 0x09; q &= 255;
      const x = q ^ rot(q, 1) ^ rot(q, 2) ^ rot(q, 3) ^ rot(q, 4);
      SB[p] = (x ^ 0x63) & 255;
    } while (p !== 1);
    SB[0] = 0x63; for (let i = 0; i < 256; i++) ISB[SB[i]] = i;
  })();
  const xt = function (a) { return ((a << 1) ^ ((a & 0x80) ? 0x1b : 0)) & 255; };
  const gm = function (a, b) { let r = 0; while (b) { if (b & 1) r ^= a; a = xt(a); b >>= 1; } return r; };
  function expandKey(key) {
    const w = new Uint8Array(176); for (let i = 0; i < 16; i++) w[i] = key[i];
    let rc = 1;
    for (let i = 16; i < 176; i += 4) {
      let t = [w[i - 4], w[i - 3], w[i - 2], w[i - 1]];
      if (i % 16 === 0) { t = [SB[t[1]] ^ rc, SB[t[2]], SB[t[3]], SB[t[0]]]; rc = xt(rc); }
      for (let j = 0; j < 4; j++) w[i + j] = w[i - 16 + j] ^ t[j];
    }
    return w;
  }
  const ark = function (s, w, r) { return s.map(function (b, i) { return b ^ w[16 * r + i]; }); };
  const subB = function (s) { return s.map(function (b) { return SB[b]; }); };
  const isubB = function (s) { return s.map(function (b) { return ISB[b]; }); };
  const shiftR = function (s) { const o = new Array(16); for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) o[r + 4 * c] = s[r + 4 * ((c + r) % 4)]; return o; };
  const ishiftR = function (s) { const o = new Array(16); for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) o[r + 4 * ((c + r) % 4)] = s[r + 4 * c]; return o; };
  const mixC = function (s, m) {
    const o = new Array(16);
    for (let c = 0; c < 4; c++) { const a = s.slice(4 * c, 4 * c + 4); for (let r = 0; r < 4; r++) o[4 * c + r] = gm(a[0], m[(4 - r) % 4]) ^ gm(a[1], m[(5 - r) % 4]) ^ gm(a[2], m[(6 - r) % 4]) ^ gm(a[3], m[(7 - r) % 4]); }
    return o;
  };
  const MIX = [2, 3, 1, 1], IMIX = [14, 11, 13, 9];
  /* 11 snapshots: after the initial AddRoundKey, after rounds 1-9, after the final round (no MixColumns) */
  function encStates(blk, w) {
    let s = ark(Array.from(blk), w, 0); const out = [s];
    for (let r = 1; r <= 10; r++) { s = shiftR(subB(s)); if (r < 10) s = mixC(s, MIX); s = ark(s, w, r); out.push(s); }
    return out;
  }
  function decStates(blk, w) {
    let s = ark(Array.from(blk), w, 10); const out = [s];
    for (let r = 9; r >= 0; r--) { s = isubB(ishiftR(s)); s = ark(s, w, r); if (r > 0) s = mixC(s, IMIX); out.push(s); }
    return out;
  }
  Kit.lib.aes = { expandKey: expandKey, encStates: encStates, decStates: decStates };

  /* a 64x40 RGB565 test picture with big flat regions, so ECB's weakness shows */
  function makePicture() {
    const W = 64, H = 40, px = new Uint16Array(W * H);
    const p565 = function (r, g, b) { return ((r >> 3) << 11) | ((g >> 2) << 5) | (b >> 3); };
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      let c = p565(179, 27, 27);
      const dx = x - 32, dy = y - 20, rr2 = dx * dx + dy * dy;
      if (rr2 < 17 * 17 && rr2 > 14 * 14) c = p565(245, 245, 245);
      else if (rr2 <= 14 * 14) {
        c = p565(250, 250, 245);
        const kx = (x - 31) / 10.5, ky = (y - 21) / 8;
        if (kx * kx + ky * ky < 1) c = p565(120, 176, 40);
        if (kx * kx + ky * ky < 0.22 && kx > -0.2) c = p565(190, 215, 90);
        if ((x - 36) * (x - 36) + (y - 17) * (y - 17) < 2.5) c = p565(40, 30, 20);
        if (y > 26 && y < 29 && Math.abs(x - 26) < 3) c = p565(120, 80, 40);
      }
      px[y * W + x] = c;
    }
    return { W: W, H: H, px: px };
  }
  const picBlocks = function (pic) { const n = pic.px.length / 8, out = []; for (let b = 0; b < n; b++) { const blk = new Uint8Array(16); for (let i = 0; i < 8; i++) { const v = pic.px[b * 8 + i]; blk[2 * i] = v & 255; blk[2 * i + 1] = v >> 8; } out.push(blk); } return out; };
  Kit.lib.aesPicture = { makePicture: makePicture, picBlocks: picBlocks };
  const randKey = function (s) { const k = new Uint8Array(16); for (let i = 0; i < 16; i++) k[i] = (s.rnd() * 256) | 0; return k; };
  const hex = function (a) { let o = ""; for (let i = 0; i < a.length; i++) o += Kit.hex(a[i]); return o; };

  function aesLoad(s) {
    s.pic = s.pic || makePicture(); s.plain = s.plain || picBlocks(s.pic);
    s.w = expandKey(s.key); s.dec = s.ctl.mode === 1; s.cache = {};
    s.cipher = s.plain.map(function (b) { return Uint8Array.from(encStates(b, s.w)[10]); });
    s.input = s.dec ? s.cipher : s.plain; s.nb = s.input.length; s.bi = 0; s.revealed = 0; s.hold = 0;
    s.outImg.data.fill(0); for (let i = 3; i < s.outImg.data.length; i += 4) s.outImg.data[i] = 255;
    s.outCx.putImageData(s.outImg, 0, 0);
  }
  function writeBlock(img, blk, b) {
    for (let i = 0; i < 8; i++) {
      const v = blk[2 * i] | (blk[2 * i + 1] << 8), o = (b * 8 + i) * 4;
      img.data[o] = ((v >> 11) & 31) * 255 / 31; img.data[o + 1] = ((v >> 5) & 63) * 255 / 63; img.data[o + 2] = (v & 31) * 255 / 31; img.data[o + 3] = 255;
    }
  }
  Kit.register("project-fpga-final.html", {
    name: "AES-128 Pipeline",
    tagline: "A real picture, 8 pixels per 128-bit block, flows through the 10-round pipeline. Flat regions stay faintly visible: that's ECB mode.",
    note: "Genuine AES-128 on every byte (checked against the NIST FIPS-197 example). One block enters per clock; the 11 boxes show the actual 4×4 state after each stage. Decrypt mode runs the inverse cipher on the ciphertext.",
    W: 640, H: 400,
    controls: [
      { id: "mode", label: "Mode", type: "seg", options: ["Encrypt", "Decrypt"], value: 0 },
      { id: "speed", label: "Speed", min: 0.5, max: 4, step: 0.25, value: 1, fmt: function (v) { return v + "×"; } }
    ],
    buttons: [{ label: "New random key", act: function (s) { s.key = randKey(s); aesLoad(s); } }],
    stats: [{ id: "blk", label: "blocks done" }, { id: "key", label: "key (first 4 bytes)" }],
    onCtl: function (s, id) { if (id === "mode") aesLoad(s); },
    setup: function (s) {
      s.key = Uint8Array.from([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]);
      s.pic = makePicture(); s.plain = picBlocks(s.pic);
      s.pcv = document.createElement("canvas"); s.pcv.width = 64; s.pcv.height = 40; s.pcx = s.pcv.getContext("2d"); s.pimg = s.pcx.createImageData(64, 40);
      s.outCv = document.createElement("canvas"); s.outCv.width = 64; s.outCv.height = 40; s.outCx = s.outCv.getContext("2d"); s.outImg = s.outCx.createImageData(64, 40);
      s.plain.forEach(function (b, i) { writeBlock(s.pimg, b, i); }); s.pcx.putImageData(s.pimg, 0, 0);
      aesLoad(s);
    },
    tick: function (s, dt) {
      if (s.bi < s.nb + 11) s.bi += dt * 55 * (s.ctl.speed || 1);
      else { s.hold += dt; if (s.hold > 2.4) { s.key = randKey(s); aesLoad(s); } }
      const done = Math.min(s.nb, Math.max(0, Math.floor(s.bi) - 10));
      while (s.revealed < done) {
        const id = s.revealed, out = s.dec ? s.plain[id] : s.cipher[id];
        writeBlock(s.outImg, out, id); s.revealed++;
      }
      s.outCx.putImageData(s.outImg, 0, 0);
      s.stat("blk", s.revealed + "/" + s.nb); s.stat("key", hex(s.key.slice(0, 4)));
    },
    draw: function (g, s) {
      const names = s.dec ? ["ARK10", "R9⁻¹", "R8⁻¹", "R7⁻¹", "R6⁻¹", "R5⁻¹", "R4⁻¹", "R3⁻¹", "R2⁻¹", "R1⁻¹", "ARK0"] : ["ARK0", "R1", "R2", "R3", "R4", "R5", "R6", "R7", "R8", "R9", "R10"];
      const lead = Math.floor(s.bi);
      for (let k = 0; k < 11; k++) {
        const x = 14 + k * 56.2, id = lead - k, on = id >= 0 && id < s.nb;
        g.fillStyle = "#0b1530"; g.strokeStyle = on ? "rgba(0,212,255,.45)" : C.line; g.lineWidth = 1.2; rr(g, x, 26, 52, 82, 8); g.fill(); g.stroke();
        txt(g, names[k], x + 26, 38, { size: 8.5, color: on ? C.cyan : C.dim, align: "center", weight: 600 });
        if (!on) continue;
        let st = s.cache[id]; if (!st) st = s.cache[id] = (s.dec ? decStates(s.cipher[id], s.w) : encStates(s.plain[id], s.w));
        const state = st[k];
        for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) {
          const b = state[r + 4 * c]; g.fillStyle = "hsl(" + ((b / 256) * 300 + 200) % 360 + ",70%," + (28 + (b % 32)) + "%)"; g.fillRect(x + 6 + c * 10.5, 46 + r * 10.5, 9.5, 9.5);
        }
        txt(g, "#" + id, x + 26, 98, { size: 7.5, color: C.dim, align: "center" });
      }
      txt(g, "each round: SubBytes · ShiftRows · MixColumns · AddRoundKey  (final round skips MixColumns)", 320, 122, { size: 8.5, color: C.dim, align: "center" });
      txt(g, "KEY " + hex(s.key), 320, 138, { size: 8.5, color: C.mute, align: "center" });
      const eid = clamp(lead - 10, 0, s.nb - 1);
      txt(g, "block #" + eid + "   in " + hex(s.input[eid]) + "  →  out " + hex(s.dec ? s.plain[eid] : s.cipher[eid]), 320, 152, { size: 7.5, color: C.dim, align: "center" });
      // images
      g.imageSmoothingEnabled = false;
      const lx = 40, rx = 400, iy = 184, iw = 200, ih = 125;
      g.drawImage(s.outCv, 0, 0, 64, 40, rx, iy, iw, ih);
      // left image: plaintext (encrypt) or ciphertext (decrypt)
      if (s.dec) {
        if (!s.cipCv) { s.cipCv = document.createElement("canvas"); s.cipCv.width = 64; s.cipCv.height = 40; s.cipCx = s.cipCv.getContext("2d"); s.cipImg = s.cipCx.createImageData(64, 40); }
        if (s.cipKey !== s.cipher) { s.cipKey = s.cipher; s.cipher.forEach(function (b, i) { writeBlock(s.cipImg, b, i); }); s.cipCx.putImageData(s.cipImg, 0, 0); }
        g.drawImage(s.cipCv, 0, 0, 64, 40, lx, iy, iw, ih);
      } else g.drawImage(s.pcv, 0, 0, 64, 40, lx, iy, iw, ih);
      g.strokeStyle = C.line; g.lineWidth = 1; g.strokeRect(lx - 0.5, iy - 0.5, iw + 1, ih + 1); g.strokeRect(rx - 0.5, iy - 0.5, iw + 1, ih + 1);
      txt(g, s.dec ? "CIPHERTEXT (input)" : "PLAINTEXT (RGB565 image)", lx, iy - 9, { size: 8.5, color: C.mute, weight: 600 });
      txt(g, s.dec ? "RECOVERED PLAINTEXT" : "CIPHERTEXT (ECB mode)", rx, iy - 9, { size: 8.5, color: C.mute, weight: 600 });
      // block cursor
      const cb = clamp(lead, 0, s.nb - 1), bx = (cb % 8) * 8 * (iw / 64), by = Math.floor(cb / 8) * (ih / 40);
      g.fillStyle = "rgba(255,255,255,.9)"; g.fillRect(lx + bx, iy + by, 8 * (iw / 64), Math.max(2, ih / 40));
      // middle
      g.strokeStyle = C.cyan; g.lineWidth = 2; g.beginPath(); g.moveTo(262, iy + 62); g.lineTo(378, iy + 62); g.lineTo(370, iy + 56); g.moveTo(378, iy + 62); g.lineTo(370, iy + 68); g.stroke();
      txt(g, "AES-128", 320, iy + 46, { size: 12, color: C.cyan, align: "center", weight: 700 });
      txt(g, "1 block / clock", 320, iy + 82, { size: 8.5, color: C.mute, align: "center" });
      g.fillStyle = "#0f1a33"; rr(g, 40, 330, 560, 8, 4); g.fill(); g.fillStyle = C.cyan; rr(g, 40, 330, Math.max(6, 560 * s.revealed / s.nb), 8, 4); g.fill();
      txt(g, s.dec ? "decryption is a combinational datapath on the chip" : "same plaintext block → same ciphertext block, so flat areas keep their outline", 320, 354, { size: 8.5, color: C.dim, align: "center" });
      txt(g, "FPGA: 4.5× faster encrypt · 3.6× faster decrypt than ARM software", 320, 372, { size: 9, color: C.green, align: "center" });
    }
  });
})(typeof window !== "undefined" ? window : globalThis);
