/* Simulations for the chip / VLSI projects.
 * Every algorithm here is the real one (Smith-Waterman scoring, popcount tree, 6T read/write timing,
 * a 5-stage pipeline with hazard detection) so the animations show what the projects actually compute. */
(function (root) {
  "use strict";
  const Kit = root.SimKit, C = Kit.C, TAU = Kit.TAU, txt = Kit.txt, rr = Kit.rr, clamp = Kit.clamp, lerp = Kit.lerp;
  const mono = Kit.mono, sans = Kit.sans;
  const ease = (t) => t < 0 ? 0 : t > 1 ? 1 : t * t * (3 - 2 * t);

  /* =====================================================================================
   * DNA Local Alignment Score Accelerator (project-asic2)
   * ===================================================================================== */
  const BASES = ["A", "C", "G", "T"], BCOL = [C.teal, C.cyan, C.yellow, C.red];
  const COMP = [3, 2, 1, 0];

  /* Smith-Waterman exactly as on the page: +1 match, -1 mismatch, -2 gap, floored at 0. Rows follow b, columns follow a. */
  function swMatrix(a, b) {
    const n = a.length, H = [];
    for (let i = 0; i <= n; i++) H.push(new Array(n + 1).fill(0));
    let best = 0, bi = 0, bj = 0;
    for (let i = 1; i <= n; i++) for (let j = 1; j <= n; j++) {
      const d = H[i - 1][j - 1] + (a[j - 1] === b[i - 1] ? 1 : -1);
      const v = Math.max(0, d, H[i - 1][j] - 2, H[i][j - 1] - 2);
      H[i][j] = v;
      if (v > best) { best = v; bi = i; bj = j; }
    }
    return { H: H, best: best, bi: bi, bj: bj };
  }
  /* 8x8 tiles of the 16x16 matrix, anti-diagonal by anti-diagonal: the PEs on one anti-diagonal are independent. */
  function swSchedule() {
    const out = [], tiles = [[0, 0], [0, 1], [1, 0], [1, 1]];
    tiles.forEach(function (tl, ti) {
      for (let d = 0; d < 15; d++) {
        const cells = [];
        for (let r = 0; r < 8; r++) { const c = d - r; if (c >= 0 && c < 8) cells.push([tl[0] * 8 + r, tl[1] * 8 + c]); }
        out.push({ tile: ti, d: d, cells: cells });
      }
    });
    return out;
  }
  Kit.lib.sw = { swMatrix: swMatrix, swSchedule: swSchedule };

  const HEAT = (function () {
    const st = [[12, 26, 58], [0, 110, 190], [0, 212, 255], [255, 244, 180]], out = [];
    for (let v = 0; v <= 16; v++) {
      if (v === 0) { out.push("#0b1530"); continue; }
      const t = Math.min(1, v / 16) * 3, k = Math.min(2, Math.floor(t)), f = t - k;
      const c = st[k].map(function (x, i) { return Math.round(x + (st[k + 1][i] - x) * f); });
      out.push("rgb(" + c.join(",") + ")");
    }
    return out;
  })();

  function dnaPair(s) {
    const n = 16, a = [], b = [], sim = (s.ctl.sim == null ? 70 : s.ctl.sim) / 100;
    for (let i = 0; i < n; i++) a.push((s.rnd() * 4) | 0);
    const shift = [0, 0, 0, 1, -1][(s.rnd() * 5) | 0];
    for (let i = 0; i < n; i++) b.push(s.rnd() < sim ? a[clamp(i + shift, 0, n - 1)] : (s.rnd() * 4) | 0);
    s.a = a; s.b = b; s.sw = swMatrix(a, b); s.sched = swSchedule();
    s.done = []; for (let i = 0; i < n; i++) s.done.push(new Array(n).fill(-1));
    s.phase = 0; s.tm = 0; s.stepF = 0; s.lastStep = 0; s.flash = 0; s.pe = new Array(64).fill(0);
  }

  Kit.register("project-asic2.html", {
    name: "DNA Local Alignment Accelerator",
    tagline: "Two 16-base sequences stream into an 8×8 systolic array. Each anti-diagonal of the Smith-Waterman matrix is scored in one cycle.",
    note: "Scoring is the real Smith-Waterman rule from the page (+1 match, −1 mismatch, −2 gap, floor 0). The animation shows the tiled anti-diagonal wavefront; the taped-out chip finishes in a fixed 77 cycles including overhead.",
    W: 640, H: 400,
    controls: [
      { id: "sim", label: "Sequence similarity", min: 0, max: 100, step: 5, value: 70, fmt: function (v) { return v + "%"; } },
      { id: "speed", label: "Speed", min: 0.5, max: 3, step: 0.25, value: 1, fmt: function (v) { return v + "×"; } }
    ],
    buttons: [{ label: "New DNA pair", act: function (s) { dnaPair(s); } }],
    stats: [{ id: "tile", label: "tile" }, { id: "step", label: "wavefront step" }, { id: "max", label: "max score" }],
    onCtl: function (s, id) { if (id === "sim") dnaPair(s); },
    setup: function (s) { dnaPair(s); },
    tick: function (s, dt) {
      const sp = s.ctl.speed || 1; dt *= sp; s.tm += dt;
      for (let i = 0; i < 64; i++) s.pe[i] = Math.max(0, s.pe[i] - dt * 4);
      if (s.phase === 0) {
        if (s.tm > 1.7) { s.phase = 1; s.tm = 0; }
      } else if (s.phase === 1) {
        s.stepF += dt * 26;
        const idx = Math.min(60, Math.floor(s.stepF));
        while (s.lastStep < idx) {
          const st = s.sched[s.lastStep];
          st.cells.forEach(function (c) { s.done[c[0]][c[1]] = s.t; s.pe[(c[0] % 8) * 8 + (c[1] % 8)] = 1; });
          s.lastStep++;
        }
        if (idx >= 60) { s.phase = 2; s.tm = 0; s.flash = 1; }
      } else {
        s.flash = Math.max(0, 1 - s.tm * 0.5);
        if (s.tm > 2.8) dnaPair(s);
      }
      const cur = Math.min(59, s.lastStep);
      s.stat("tile", s.phase === 0 ? "–" : (s.sched[cur].tile + 1) + "/4");
      s.stat("step", s.lastStep + "/60");
      s.stat("max", s.phase === 2 ? "" + s.sw.best : "…");
    },
    draw: function (g, s) {
      const MX = 216, MY = 88, CS = 17;
      const ph = s.t * 1.3;
      // ---- helices
      [[52, s.a, "SEQ 1"], [128, s.b, "SEQ 2"]].forEach(function (h) {
        const hx = h[0], seq = h[1];
        txt(g, h[2], hx, 62, { size: 9, color: C.mute, align: "center", weight: 600 });
        for (let pass = 0; pass < 2; pass++) {
          g.strokeStyle = pass ? "rgba(0,212,255,.7)" : "rgba(139,92,246,.7)"; g.lineWidth = 2; g.beginPath();
          for (let y = 78; y <= 352; y += 3) {
            const x = hx + 13 * Math.sin(y * 0.055 + ph + pass * Math.PI);
            y === 78 ? g.moveTo(x, y) : g.lineTo(x, y);
          }
          g.stroke();
        }
        for (let i = 0; i < 16; i++) {
          const y = 96 + i * 16.5, a1 = y * 0.055 + ph, x1 = hx + 13 * Math.sin(a1), x2 = hx - 13 * Math.sin(a1);
          const gr = g.createLinearGradient(x1, 0, x2, 0);
          gr.addColorStop(0, BCOL[seq[i]]); gr.addColorStop(0.5, BCOL[seq[i]]); gr.addColorStop(0.5, BCOL[COMP[seq[i]]]); gr.addColorStop(1, BCOL[COMP[seq[i]]]);
          g.strokeStyle = gr; g.lineWidth = 2.4; g.beginPath(); g.moveTo(x1, y); g.lineTo(x2, y); g.stroke();
        }
      });
      txt(g, "A=00  C=01  G=10  T=11", 90, 382, { size: 8.5, color: C.dim, align: "center" });
      // ---- headers (letters fly in from the helices)
      for (let i = 0; i < 16; i++) {
        const t = s.phase === 0 ? ease((s.tm - i * 0.06) / 0.5) : 1;
        [[s.a, 52, MX + i * CS + CS / 2, MY - 10], [s.b, 128, MX - 10, MY + i * CS + CS / 2]].forEach(function (p) {
          const x0 = p[1], y0 = 96 + i * 16.5, x1 = p[2], y1 = p[3];
          const x = lerp(x0, x1, t), y = lerp(y0, y1, t) - Math.sin(t * Math.PI) * 26;
          if (t <= 0) return;
          g.fillStyle = BCOL[p[0][i]]; g.beginPath(); g.arc(x, y, t < 1 ? 5.4 : 0, 0, TAU); g.fill();
          txt(g, BASES[p[0][i]], x, y + 0.5, { size: 10, weight: 700, color: t < 1 ? "#04101f" : BCOL[p[0][i]], align: "center" });
        });
      }
      // ---- matrix
      const act = {}; if (s.phase === 1 && s.lastStep > 0) s.sched[s.lastStep - 1].cells.forEach(function (c) { act[c[0] * 16 + c[1]] = 1; });
      for (let i = 0; i < 16; i++) for (let j = 0; j < 16; j++) {
        const x = MX + j * CS, y = MY + i * CS, d = s.done[i][j];
        if (d < 0) { g.strokeStyle = "rgba(30,58,95,.55)"; g.lineWidth = 1; g.strokeRect(x + 1.5, y + 1.5, CS - 3, CS - 3); continue; }
        const v = s.sw.H[i + 1][j + 1];
        g.fillStyle = HEAT[Math.min(16, v)]; rr(g, x + 1, y + 1, CS - 2, CS - 2, 3); g.fill();
        if (act[i * 16 + j]) { g.strokeStyle = "#fff"; g.lineWidth = 1.6; rr(g, x + 1, y + 1, CS - 2, CS - 2, 3); g.stroke(); }
        if (v > 0) txt(g, "" + v, x + CS / 2, y + CS / 2 + 0.5, { size: 8, color: v > 9 ? "#04101f" : "#e2e8f0", align: "center", weight: 600 });
      }
      // tile frames
      const curTile = s.phase === 1 ? s.sched[Math.min(59, s.lastStep)].tile : -1;
      for (let t = 0; t < 4; t++) {
        const tx = MX + (t % 2) * 8 * CS, ty = MY + ((t / 2) | 0) * 8 * CS;
        g.strokeStyle = t === curTile ? C.cyan : "rgba(0,212,255,.25)"; g.lineWidth = t === curTile ? 2 : 1;
        g.strokeRect(tx + 0.5, ty + 0.5, 8 * CS - 1, 8 * CS - 1);
        if (t !== curTile) txt(g, "" + (t + 1), tx + 6, ty + 7, { size: 8, color: "rgba(148,163,184,.5)" });
      }
      // max cell flash
      if (s.phase === 2) {
        const x = MX + (s.sw.bj - 1) * CS, y = MY + (s.sw.bi - 1) * CS, p = 0.5 + 0.5 * Math.sin(s.t * 9);
        g.strokeStyle = "rgba(255,244,180," + (0.5 + 0.5 * p) + ")"; g.lineWidth = 2.5; rr(g, x - 1, y - 1, CS + 2, CS + 2, 4); g.stroke();
        // score pulse travelling out of the array
        const u = clamp(s.tm / 0.9, 0, 1), sx = x + CS / 2, sy = y + CS / 2, ex = 556, ey = 262;
        if (u < 1) { g.fillStyle = "#fff"; g.beginPath(); g.arc(lerp(sx, ex, ease(u)), lerp(sy, ey, ease(u)) - Math.sin(u * Math.PI) * 30, 4, 0, TAU); g.fill(); }
      }
      // ---- PE array
      txt(g, "8×8 SYSTOLIC ARRAY", 560, 78, { size: 9, color: C.mute, align: "center", weight: 600 });
      for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
        const v = s.pe[r * 8 + c];
        g.fillStyle = v > 0 ? "rgba(0,212,255," + (0.25 + 0.75 * v) + ")" : "#101b36";
        rr(g, 512 + c * 12, 88 + r * 12, 10.5, 10.5, 2); g.fill();
      }
      txt(g, "64 PEs · active diagonal lights", 560, 192, { size: 7.5, color: C.dim, align: "center" });
      // ---- output
      g.strokeStyle = C.line; g.lineWidth = 1; rr(g, 512, 212, 112, 76, 8); g.stroke();
      txt(g, "MAX ALIGNMENT SCORE", 568, 226, { size: 8, color: C.mute, align: "center", weight: 600 });
      txt(g, s.phase === 2 ? "" + s.sw.best : "…", 568, 258, { size: 34, color: s.phase === 2 ? C.cyan : C.dim, align: "center", weight: 700 });
      txt(g, "chip: 77 cycles · 770 ns", 568, 308, { size: 9, color: C.tx, align: "center" });
      txt(g, "66× faster · 76× less energy", 568, 322, { size: 8, color: C.green, align: "center" });
      txt(g, "than the CPU baseline", 568, 334, { size: 8, color: C.dim, align: "center" });
      txt(g, "16 bp in → score out", 568, 366, { size: 8.5, color: C.cyan, align: "center" });
    }
  });

  /* =====================================================================================
   * Popcount (project-asic1)
   * ===================================================================================== */
  Kit.register("project-asic1.html", {
    name: "8-bit Popcount Chip",
    tagline: "Count the 1s in an 8-bit word with a tree of adders. Click a bit to flip it.",
    note: "Pure combinational popcount: 4 half-adder pairs, then two 2-bit adders, then one 3-bit adder. Stage delays are exaggerated so you can watch the sum travel.",
    W: 640, H: 400,
    controls: [{ id: "p", label: "Density of 1s (random)", min: 0, max: 100, step: 10, value: 50, fmt: function (v) { return v + "%"; } }],
    buttons: [{ label: "Randomize", act: function (s) { setBits(s, true); } }],
    stats: [{ id: "bits", label: "input" }, { id: "cnt", label: "number of 1s" }],
    touchNone: false,
    setup: function (s) {
      s.bits = [1, 0, 1, 1, 0, 0, 1, 0]; s.old = null; s.userT = -99; s.next = 1.2;
      s.chg = -9; s.prev = calc(s.bits);
    },
    down: function (s) {
      for (let i = 0; i < 8; i++) {
        const y = 52 + i * 40;
        if (s.ptr.x > 20 && s.ptr.x < 110 && s.ptr.y > y - 15 && s.ptr.y < y + 15) { s.userT = s.t; s.prev = calc(s.bits); s.bits[i] ^= 1; s.chg = s.t; break; }
      }
    },
    tick: function (s) {
      if (s.t > s.next && s.t - s.userT > 6) { setBits(s, true); s.next = s.t + 3; } else if (s.t > s.next) s.next = s.t + 1;
      s.stat("bits", s.bits.join("")); s.stat("cnt", "" + s.bits.reduce(function (a, b) { return a + b; }, 0));
    },
    draw: function (g, s) {
      const cur = calc(s.bits), prev = s.prev, age = s.t - s.chg;
      const lvl = [0.25, 0.65, 1.05, 1.3];
      const shown = function (L, k) { return age >= lvl[L] ? cur[L][k] : prev[L][k]; };
      const iy = []; for (let i = 0; i < 8; i++) iy.push(52 + i * 40);
      const nx = [200, 340, 470], ny = [[72, 152, 232, 312], [112, 272], [192]];
      // wires + pulses
      const wire = function (x0, y0, x1, y1, on, t0, t1) {
        g.strokeStyle = on ? "rgba(0,212,255,.85)" : "rgba(71,85,105,.55)"; g.lineWidth = on ? 2 : 1.2;
        const mx = (x0 + x1) / 2; g.beginPath(); g.moveTo(x0, y0); g.bezierCurveTo(mx, y0, mx, y1, x1, y1); g.stroke();
        if (on && age >= t0 && age < t1) {
          const u = (age - t0) / (t1 - t0), px = Kit.lerp(x0, x1, u), yy = (1 - u) * (1 - u) * (1 - u) * y0 + 3 * (1 - u) * (1 - u) * u * y0 + 3 * (1 - u) * u * u * y1 + u * u * u * y1;
          const bx = (1 - u) * (1 - u) * (1 - u) * x0 + 3 * (1 - u) * (1 - u) * u * mx + 3 * (1 - u) * u * u * mx + u * u * u * x1;
          g.fillStyle = "#fff"; g.beginPath(); g.arc(bx, yy, 3.2, 0, TAU); g.fill();
        }
      };
      for (let i = 0; i < 8; i++) wire(110, iy[i], nx[0] - 28, ny[0][i >> 1], s.bits[i] === 1, 0, 0.25);
      for (let k = 0; k < 4; k++) wire(nx[0] + 28, ny[0][k], nx[1] - 28, ny[1][k >> 1], shown(0, k) > 0, 0.25, 0.65);
      for (let k = 0; k < 2; k++) wire(nx[1] + 28, ny[1][k], nx[2] - 28, ny[2][0], shown(1, k) > 0, 0.65, 1.05);
      // inputs
      for (let i = 0; i < 8; i++) {
        const on = s.bits[i] === 1;
        g.fillStyle = on ? "rgba(0,212,255,.2)" : "#0f1a33"; g.strokeStyle = on ? C.cyan : C.line; g.lineWidth = 1.5;
        rr(g, 40, iy[i] - 14, 70, 28, 8); g.fill(); g.stroke();
        txt(g, "b" + (7 - i), 52, iy[i], { size: 9, color: C.mute });
        txt(g, "" + s.bits[i], 92, iy[i] + 1, { size: 16, color: on ? C.cyan : C.dim, weight: 700, align: "center" });
      }
      // adder nodes
      const node = function (x, y, v, lab, hot) {
        g.fillStyle = hot ? "rgba(139,92,246,.22)" : "#0f1a33"; g.strokeStyle = hot ? C.purple : C.line; g.lineWidth = 1.5;
        rr(g, x - 28, y - 16, 56, 32, 9); g.fill(); g.stroke();
        txt(g, lab, x, y - 6, { size: 7.5, color: C.dim, align: "center" });
        txt(g, "" + v, x, y + 6, { size: 14, color: hot ? "#d8c8ff" : C.tx, weight: 700, align: "center" });
      };
      for (let k = 0; k < 4; k++) node(nx[0], ny[0][k], shown(0, k), "ADD 1b+1b", shown(0, k) > 0);
      for (let k = 0; k < 2; k++) node(nx[1], ny[1][k], shown(1, k), "ADD 2b+2b", shown(1, k) > 0);
      node(nx[2], ny[2][0], shown(2, 0), "ADD 3b+3b", shown(2, 0) > 0);
      // output
      const out = age >= lvl[3] ? cur[2][0] : prev[2][0];
      wire(nx[2] + 28, ny[2][0], 515, 232, out > 0, 1.05, 1.3);
      txt(g, "POPCOUNT", 568, 150, { size: 9, color: C.mute, align: "center", weight: 600 });
      txt(g, "" + out, 568, 186, { size: 38, color: C.cyan, weight: 700, align: "center" });
      for (let b = 0; b < 4; b++) {
        const v = (out >> (3 - b)) & 1, x = 516 + b * 27;
        g.fillStyle = v ? "rgba(57,255,106,.25)" : "#0f1a33"; g.strokeStyle = v ? C.green : C.line; g.lineWidth = 1.5;
        rr(g, x, 218, 24, 30, 6); g.fill(); g.stroke();
        txt(g, "" + v, x + 12, 234, { size: 13, color: v ? C.green : C.dim, align: "center", weight: 700 });
        txt(g, "" + (8 >> b), x + 12, 258, { size: 8, color: C.dim, align: "center" });
      }
      txt(g, "TSMC 180nm · DRC + LVS clean", 568, 300, { size: 8, color: C.dim, align: "center" });
      txt(g, "click a bit to flip it", 568, 316, { size: 8.5, color: C.cyan, align: "center" });
    }
  });
  function calc(bits) {
    const l1 = [], l2 = [], l3 = [];
    for (let k = 0; k < 4; k++) l1.push(bits[2 * k] + bits[2 * k + 1]);
    for (let k = 0; k < 2; k++) l2.push(l1[2 * k] + l1[2 * k + 1]);
    l3.push(l2[0] + l2[1]);
    return [l1, l2, l3];
  }
  function setBits(s, rand) {
    s.prev = calc(s.bits);
    const p = (s.ctl.p == null ? 50 : s.ctl.p) / 100;
    for (let i = 0; i < 8; i++) s.bits[i] = s.rnd() < p ? 1 : 0;
    s.chg = s.t;
  }
  Kit.lib.popcount = { calc: calc };

  /* =====================================================================================
   * 6T SRAM array (project-sram)
   * ===================================================================================== */
  Kit.register("project-sram.html", {
    name: "32×32 6T SRAM",
    tagline: "Watch one 600 ps cycle: precharge, word line, bit-line development, sense amplifier.",
    note: "Voltages are an idealized model of the cycle described on the page (precharge, WL on, differential sensing). The 600 ps cycle time and 14.2 fJ/bit read energy are the post-layout results.",
    W: 640, H: 400,
    controls: [
      { id: "mode", label: "Operation", type: "seg", options: ["READ", "WRITE", "AUTO"], value: 2 },
      { id: "speed", label: "Speed", min: 0.5, max: 3, step: 0.25, value: 1, fmt: function (v) { return v + "×"; } }
    ],
    stats: [{ id: "row", label: "row (word line)" }, { id: "op", label: "operation" }, { id: "word", label: "word out" }],
    setup: function (s) {
      s.cells = []; for (let r = 0; r < 32; r++) { const a = []; for (let c = 0; c < 32; c++) a.push(s.rnd() < 0.5 ? 1 : 0); s.cells.push(a); }
      s.col = 12; s.row = 9; s.u = 0; s.cycle = 0; s.op = "read"; s.bl = 1; s.blb = 1; s.nb = 0; s.b0 = 0; s.wrote = false; s.read = null;
      newCycle(s);
    },
    tick: function (s, dt) {
      const T = 3.0 / (s.ctl.speed || 1);
      s.u += dt / T;
      if (s.op === "write" && !s.wrote && s.u > 0.42) { s.wrote = true; for (let c = 0; c < 32; c++) s.cells[s.row][c] = s.word[c]; }
      if (s.op === "read" && !s.read && s.u > 0.7) s.read = s.cells[s.row].slice();
      if (s.u >= 1) { s.u = 0; s.cycle++; newCycle(s); }
      s.stat("row", "" + s.row); s.stat("op", s.op.toUpperCase());
      const w = s.op === "write" ? s.word : s.cells[s.row]; let h = 0; for (let c = 0; c < 32; c++) h = (h * 2 + w[c]) >>> 0;
      s.stat("word", "0x" + h.toString(16).toUpperCase().padStart(8, "0"));
    },
    draw: function (g, s) {
      const u = s.u, X0 = 32, Y0 = 92, CS = 7, wlOn = u > 0.22 && u < (s.op === "write" ? 0.7 : 0.86);
      txt(g, "32 × 32 ARRAY · 1 KB", X0, 62, { size: 9, color: C.mute, weight: 600 });
      // precharge strip
      g.fillStyle = u < 0.22 ? C.orange : "#14203c"; rr(g, X0, 74, 32 * CS - 1, 8, 3); g.fill();
      txt(g, "PRECHARGE", X0 + 32 * CS + 6, 78, { size: 7.5, color: u < 0.22 ? C.orange : C.dim });
      for (let r = 0; r < 32; r++) for (let c = 0; c < 32; c++) {
        g.fillStyle = s.cells[r][c] ? "#1a7391" : "#0e1a33"; g.fillRect(X0 + c * CS, Y0 + r * CS, CS - 1, CS - 1);
      }
      g.fillStyle = "rgba(0,212,255,.08)"; g.fillRect(X0 + s.col * CS - 1, Y0 - 1, CS + 1, 32 * CS + 1);
      if (wlOn) {
        g.fillStyle = "rgba(139,92,246,.55)"; g.fillRect(X0 - 8, Y0 + s.row * CS - 1, 32 * CS + 8, CS + 1);
        for (let c = 0; c < 32; c++) { g.fillStyle = s.cells[s.row][c] ? "#7ee8ff" : "#232f55"; g.fillRect(X0 + c * CS, Y0 + s.row * CS, CS - 1, CS - 1); }
      }
      txt(g, "WL" + s.row, X0 - 10, Y0 + s.row * CS + 3, { size: 7.5, color: C.purple, align: "right" });
      // sense amp strip
      const sensing = u > 0.62 && u < 0.9;
      for (let c = 0; c < 32; c++) {
        g.fillStyle = sensing ? (s.op === "write" ? C.orange : (s.cells[s.row][c] ? C.cyan : C.dim)) : "#14203c";
        g.fillRect(X0 + c * CS, Y0 + 32 * CS + 4, CS - 1, 7);
      }
      txt(g, s.op === "write" ? "WRITE DRIVERS" : "SENSE AMPS", X0, Y0 + 32 * CS + 22, { size: 7.5, color: sensing ? C.cyan : C.dim });
      // ---- scope
      const SX = 336, SY = 66, SW = 284, SH = 170;
      g.fillStyle = "#08101f"; rr(g, SX, SY, SW, SH, 8); g.fill(); g.strokeStyle = C.line; g.lineWidth = 1; g.stroke();
      [[0, 0.22, "PRECHARGE", C.orange], [0.22, 0.62, "WL ON", C.purple], [0.62, 0.9, s.op === "write" ? "HOLD" : "SENSE", C.cyan]].forEach(function (p) {
        g.fillStyle = p[3]; g.globalAlpha = 0.07; g.fillRect(SX + p[0] * SW, SY, (p[1] - p[0]) * SW, SH); g.globalAlpha = 1;
        txt(g, p[2], SX + (p[0] + p[1]) / 2 * SW, SY + 11, { size: 7.5, color: p[3], align: "center" });
      });
      g.strokeStyle = "rgba(148,163,184,.25)"; g.beginPath(); g.moveTo(SX, SY + 40); g.lineTo(SX + SW, SY + 40); g.stroke();
      txt(g, "VDD", SX - 4, SY + 40, { size: 7.5, color: C.dim, align: "right" });
      txt(g, "0", SX - 4, SY + 125, { size: 7.5, color: C.dim, align: "right" });
      const vy = function (v) { return SY + 125 - v * 85; };
      [["bl", C.cyan], ["blb", C.orange]].forEach(function (tr) {
        g.strokeStyle = tr[1]; g.lineWidth = 2; g.beginPath();
        for (let k = 0; k <= 140; k++) { const uu = k / 140 * u, v = volts(s, uu)[tr[0] === "bl" ? 0 : 1]; k ? g.lineTo(SX + uu * SW, vy(v)) : g.moveTo(SX + uu * SW, vy(v)); }
        g.stroke();
      });
      g.strokeStyle = C.purple; g.lineWidth = 1.5; g.beginPath(); g.moveTo(SX, SY + 158);
      const w0 = 0.22, w1 = s.op === "write" ? 0.7 : 0.86, wpts = [[w0, 158], [w0, 140], [w1, 140], [w1, 158], [1, 158]];
      let lastY = 158;
      for (let k = 0; k < wpts.length; k++) {
        if (wpts[k][0] <= u) { g.lineTo(SX + wpts[k][0] * SW, SY + wpts[k][1]); lastY = wpts[k][1]; }
        else { g.lineTo(SX + u * SW, SY + lastY); break; }
      }
      g.stroke();
      txt(g, "BL", SX + SW - 8, SY + 150, { size: 8, color: C.cyan, align: "right" }); txt(g, "BLB", SX + SW - 34, SY + 150, { size: 8, color: C.orange, align: "right" });
      txt(g, "WL", SX + 8, SY + 152, { size: 8, color: C.purple });
      txt(g, "0 ps", SX + 4, SY + SH + 10, { size: 7.5, color: C.dim }); txt(g, "600 ps", SX + SW, SY + SH + 10, { size: 7.5, color: C.dim, align: "right" });
      const vv = volts(s, u);
      // ---- bitcell
      const q = s.op === "write" && u > 0.42 ? s.nb : s.b0;
      const cx = 478, cy = 322;
      g.strokeStyle = C.line; g.lineWidth = 1; rr(g, 336, 262, SW, 120, 8); g.stroke();
      txt(g, "6T BITCELL (selected column)", 346, 274, { size: 8, color: C.mute, weight: 600 });
      const bw = function (x, v, col) { g.strokeStyle = col; g.globalAlpha = 0.25 + 0.75 * v; g.lineWidth = 3; g.beginPath(); g.moveTo(x, 284); g.lineTo(x, 372); g.stroke(); g.globalAlpha = 1; };
      bw(392, vv[0], C.cyan); bw(566, vv[1], C.orange);
      txt(g, "BL", 392, 378, { size: 8, color: C.cyan, align: "center" }); txt(g, "BLB", 566, 378, { size: 8, color: C.orange, align: "center" });
      g.strokeStyle = wlOn ? C.purple : "#232f55"; g.lineWidth = wlOn ? 3 : 1.5; g.beginPath(); g.moveTo(400, 296); g.lineTo(558, 296); g.stroke();
      txt(g, "WL", 478, 288, { size: 8, color: wlOn ? C.purple : C.dim, align: "center" });
      [[402, 392], [546, 566]].forEach(function (p) {
        g.fillStyle = wlOn ? "rgba(139,92,246,.5)" : "#0f1a33"; g.strokeStyle = wlOn ? C.purple : C.line; g.lineWidth = 1.5; rr(g, p[0], 308, 12, 12, 3); g.fill(); g.stroke();
        g.strokeStyle = "rgba(148,163,184,.4)"; g.lineWidth = 1.2; g.beginPath(); g.moveTo(p[1], 314); g.lineTo(p[1] > 480 ? 558 : 400, 314); g.stroke();
      });
      g.fillStyle = "#0f1a33"; g.strokeStyle = C.line; g.lineWidth = 1.5; rr(g, 424, 304, 108, 56, 8); g.fill(); g.stroke();
      [[446, q, "Q"], [510, 1 - q, "Q̄"]].forEach(function (n) {
        g.fillStyle = n[1] ? "rgba(57,255,106,.22)" : "#0b1530"; g.strokeStyle = n[1] ? C.green : C.line; g.beginPath(); g.arc(n[0], 332, 14, 0, TAU); g.fill(); g.stroke();
        txt(g, "" + n[1], n[0], 333, { size: 13, color: n[1] ? C.green : C.dim, weight: 700, align: "center" }); txt(g, n[2], n[0], 352, { size: 8, color: C.dim, align: "center" });
      });
      txt(g, "cross-coupled inverters", 478, 316, { size: 7, color: C.dim, align: "center" });
      txt(g, "cycle 600 ps · read energy 14.2 fJ/bit", 478, 391, { size: 8, color: C.mute, align: "center" });
    }
  });
  function newCycle(s) {
    const m = s.ctl.mode == null ? 2 : s.ctl.mode;
    s.op = m === 0 ? "read" : m === 1 ? "write" : (s.cycle % 3 === 2 ? "write" : "read");
    s.row = (s.rnd() * 32) | 0; s.wrote = false; s.read = null;
    s.word = []; for (let c = 0; c < 32; c++) s.word.push(s.rnd() < 0.5 ? 1 : 0);
    s.b0 = s.cells[s.row][s.col]; s.nb = s.word[s.col];
    s.prevBL = s.endBL == null ? 1 : s.endBL; s.prevBLB = s.endBLB == null ? 1 : s.endBLB;
    const v = volts(s, 0.999); s.endBL = v[0]; s.endBLB = v[1];
  }
  /* idealized bit-line voltages (0..1 V) at fractional cycle position u */
  function volts(s, u) {
    const pBL = s.prevBL == null ? 1 : s.prevBL, pBLB = s.prevBLB == null ? 1 : s.prevBLB;
    if (u < 0.22) { const e = ease(u / 0.22); return [lerp(pBL, 1, e), lerp(pBLB, 1, e)]; }
    if (s.op === "write") {
      const p = 1 - Math.exp(-(u - 0.22) / 0.05), r = u > 0.7 ? 1 - ease((u - 0.7) / 0.2) : 1;
      return [lerp(1, s.nb, p * r + (1 - r) * 0), lerp(1, 1 - s.nb, p * r)];
    }
    const dv = 0.34 * (1 - Math.exp(-(u - 0.22) / 0.12)), hi = 1, lo = 1 - Math.min(dv, 0.34);
    let bl = s.b0 ? hi : lo, blb = s.b0 ? lo : hi;
    if (u > 0.62) { const k = 1 - Math.exp(-(u - 0.62) / 0.05); if (s.b0) blb = lo * (1 - k); else bl = lo * (1 - k); }
    return [bl, blb];
  }

  /* =====================================================================================
   * 4-bit ALU with dynamic logic (project-alu)
   * ===================================================================================== */
  const OPS = ["ADD", "SUB", "MUL", "AND", "OR", "XOR", "SLL", "SRL", "G", "GEQ"];
  function aluCalc(op, a, b) {
    switch (op) {
      case 0: { const r = a + b; return { r: r & 15, c: (r >> 4) & 1, w: 4 }; }
      case 1: { const r = a - b; return { r: r & 15, c: r < 0 ? 1 : 0, w: 4 }; }
      case 2: return { r: a * b, c: 0, w: 8 };
      case 3: return { r: a & b, c: 0, w: 4 };
      case 4: return { r: a | b, c: 0, w: 4 };
      case 5: return { r: a ^ b, c: 0, w: 4 };
      case 6: return { r: (a << (b & 3)) & 15, c: 0, w: 4 };
      case 7: return { r: a >> (b & 3), c: 0, w: 4 };
      case 8: return { r: a > b ? 1 : 0, c: 0, w: 1 };
      default: return { r: a >= b ? 1 : 0, c: 0, w: 1 };
    }
  }
  Kit.lib.alu = { aluCalc: aluCalc };
  const bin = (v, n) => v.toString(2).padStart(n, "0");

  Kit.register("project-alu.html", {
    name: "4-bit Dynamic-Logic ALU",
    tagline: "Ten operations. Dynamic nodes precharge, then evaluate: for ADD and SUB the carry ripples slice by slice.",
    note: "Behavioral model of the 10 operations (shift amount = B[1:0]). The precharge / evaluate rhythm and the ripple-carry chain mirror the dynamic-logic adder described on the page.",
    W: 640, H: 400,
    controls: [
      { id: "op", label: "Operation", type: "seg", options: OPS, value: 0 },
      { id: "auto", label: "auto-cycle operations", type: "check", value: true },
      { id: "speed", label: "Speed", min: 0.5, max: 3, step: 0.25, value: 1, fmt: function (v) { return v + "×"; } }
    ],
    buttons: [{ label: "Randomize A / B", act: function (s) { aluRand(s); } }],
    stats: [{ id: "expr", label: "A op B" }, { id: "res", label: "result" }],
    onCtl: function (s, id, v) { if (id === "op") { s.setCtl("auto", false); s.tm = 0; } },
    setup: function (s) { s.A = 5; s.B = 3; s.tm = 0; s.cyc = 0; },
    down: function (s) {
      for (let k = 0; k < 4; k++) {
        const x = 360 - k * 70;
        if (s.ptr.x > x - 15 && s.ptr.x < x + 15) {
          if (s.ptr.y > 60 && s.ptr.y < 90) { s.A ^= 1 << k; s.tm = 0; s.setCtl("auto", false); }
          if (s.ptr.y > 98 && s.ptr.y < 128) { s.B ^= 1 << k; s.tm = 0; s.setCtl("auto", false); }
        }
      }
    },
    tick: function (s, dt) {
      const T = 3.4 / (s.ctl.speed || 1); s.tm += dt;
      if (s.tm > T) {
        s.tm = 0; s.cyc++;
        if (s.ctl.auto) { s.setCtl("op", (s.ctl.op + 1) % 10); aluRand(s); }
      }
      const o = aluCalc(s.ctl.op, s.A, s.B);
      s.stat("expr", bin(s.A, 4) + " " + OPS[s.ctl.op] + " " + bin(s.B, 4));
      s.stat("res", bin(o.r, o.w) + " (" + o.r + ")");
    },
    draw: function (g, s) {
      const op = s.ctl.op, A = s.A, B = s.B, o = aluCalc(op, A, B), T = 3.4 / (s.ctl.speed || 1), u = s.tm / T;
      const pre = u < 0.26, ev = clamp((u - 0.26) / 0.5, 0, 1);
      // clock strip
      txt(g, "CLK", 452, 64, { size: 8, color: C.dim });
      g.strokeStyle = C.cyan; g.lineWidth = 1.5; g.beginPath(); g.moveTo(480, 74); g.lineTo(480 + 0.26 * 150, 74); g.lineTo(480 + 0.26 * 150, 56); g.lineTo(630, 56); g.stroke();
      g.fillStyle = "#fff"; g.beginPath(); g.arc(480 + u * 150, pre ? 74 : 56, 3, 0, TAU); g.fill();
      txt(g, "PRECHARGE", 480 + 0.13 * 150, 88, { size: 7.5, color: C.orange, align: "center" });
      txt(g, "EVALUATE", 480 + 0.63 * 150, 88, { size: 7.5, color: C.cyan, align: "center" });
      // operand rows
      txt(g, "A", 100, 76, { size: 12, color: C.tx, weight: 700, align: "center" }); txt(g, "B", 100, 113, { size: 12, color: C.tx, weight: 700, align: "center" });
      const cin = op === 1 ? 1 : 0, bb = op === 1 ? (~B) & 15 : B;
      const carries = [cin], sums = [];
      for (let k = 0; k < 4; k++) { const a = (A >> k) & 1, b = (bb >> k) & 1, c = carries[k]; sums.push(a ^ b ^ c); carries.push((a & b) | (c & (a ^ b))); }
      const addop = op <= 1, resolved = function (k) { return !pre && ev * 4.4 >= k + 1; };
      for (let k = 3; k >= 0; k--) {
        const x = 360 - k * 70, a = (A >> k) & 1, b = (B >> k) & 1;
        [[A, 75, a], [B, 113, b]].forEach(function (p) {
          g.fillStyle = p[2] ? "rgba(0,212,255,.22)" : "#0f1a33"; g.strokeStyle = p[2] ? C.cyan : C.line; g.lineWidth = 1.5; rr(g, x - 15, p[1] - 15, 30, 30, 7); g.fill(); g.stroke();
          txt(g, "" + p[2], x, p[1] + 1, { size: 14, color: p[2] ? C.cyan : C.dim, weight: 700, align: "center" });
        });
        g.strokeStyle = "rgba(148,163,184,.3)"; g.lineWidth = 1; g.beginPath(); g.moveTo(x, 128); g.lineTo(x, 150); g.stroke();
        // slice
        const done = resolved(k), isRes = op <= 1 ? done : !pre && ev > 0.2 + (3 - k) * 0.05;
        g.fillStyle = "#0e1830"; g.strokeStyle = pre ? C.orange : (done || !addop ? C.cyan : C.line); g.lineWidth = 1.6; rr(g, x - 28, 150, 56, 150, 10); g.fill(); g.stroke();
        const lab = op <= 1 ? "FA" : op === 2 ? "×" : op >= 8 ? "CMP" : op >= 6 ? "MUX" : OPS[op];
        txt(g, lab, x, 178, { size: 13, color: C.tx, weight: 700, align: "center" });
        txt(g, "bit " + k, x, 193, { size: 8, color: C.dim, align: "center" });
        g.fillStyle = pre ? C.orange : (isRes ? "#10b981" : "#475569"); g.beginPath(); g.arc(x, 214, 6, 0, TAU); g.fill();
        txt(g, pre ? "precharged" : (isRes ? "evaluated" : "evaluating"), x, 232, { size: 7, color: C.dim, align: "center" });
        if (addop) {
          const lit = resolved(k) && carries[k + 1];
          txt(g, "c" + (k + 1), x - 34, 262, { size: 7.5, color: lit ? C.yellow : C.dim, align: "center" });
          if (k < 3) {
            g.strokeStyle = lit ? C.yellow : "rgba(71,85,105,.6)"; g.lineWidth = lit ? 3 : 1.5; g.beginPath(); g.moveTo(x - 28, 262); g.lineTo(x - 42, 262); g.stroke();
          }
          if (resolved(k) && ev * 4.4 < k + 1.6) { g.fillStyle = C.yellow; g.globalAlpha = 0.6; g.beginPath(); g.arc(x - 34, 262, 7, 0, TAU); g.fill(); g.globalAlpha = 1; }
        }
      }
      if (addop) {
        txt(g, op === 1 ? "Cin = 1 (A + ~B + 1)" : "Cin = 0", 410, 262, { size: 8, color: C.dim });
        g.strokeStyle = "rgba(71,85,105,.6)"; g.lineWidth = 1.5; g.beginPath(); g.moveTo(388, 262); g.lineTo(404, 262); g.stroke();
      }
      // result
      const rw = o.w, cell = rw === 8 ? 31 : 38;
      const rx = rw === 4 ? function (k) { return 360 - k * 70; } : rw === 8 ? function (k) { return 400 - k * 36 + 2; } : function (k) { return 360; };
      for (let k = 0; k < rw; k++) {
        const v = (o.r >> k) & 1, shown = pre ? false : (op <= 1 ? resolved(k) : ev > 0.25 + (rw === 4 ? (3 - k) * 0.05 : 0));
        const x = rx(k), y = 330;
        g.fillStyle = shown && v ? "rgba(57,255,106,.22)" : "#0f1a33"; g.strokeStyle = shown ? (v ? C.green : C.dim) : C.line; g.lineWidth = 1.5;
        rr(g, x - cell / 2 + 3, y - 15, cell - 6, 30, 7); g.fill(); g.stroke();
        txt(g, shown ? "" + v : "·", x, y + 1, { size: 14, color: v && shown ? C.green : C.dim, weight: 700, align: "center" });
        g.strokeStyle = "rgba(148,163,184,.25)"; g.lineWidth = 1; g.beginPath(); g.moveTo(x, 300); g.lineTo(x, 315); g.stroke();
      }
      txt(g, "RESULT", 100, 330, { size: 9, color: C.mute, align: "center", weight: 600 });
      if (addop) { txt(g, op === 1 ? "borrow" : "carry-out", 455, 330, { size: 8, color: C.dim }); txt(g, "" + (resolved(3) ? o.c : "·"), 455, 345, { size: 13, color: o.c && resolved(3) ? C.yellow : C.dim, weight: 700 }); }
      txt(g, "A " + OPS[op] + " B = " + o.r + (rw === 8 ? "  (8-bit product)" : ""), 320, 376, { size: 11, color: C.tx, align: "center", weight: 600 });
      txt(g, "click an input bit to flip it", 320, 392, { size: 8, color: C.dim, align: "center" });
    }
  });
  function aluRand(s) { s.A = (s.rnd() * 16) | 0; s.B = (s.rnd() * 16) | 0; s.tm = 0; }

  /* =====================================================================================
   * 5-stage pipelined RISC-V core (project-mcp)
   * ===================================================================================== */
  const PROG = [
    { t: "add x1,x2,x3", d: 1, s: [2, 3] },
    { t: "sub x4,x1,x5", d: 4, s: [1, 5] },
    { t: "lw  x6,0(x4)", d: 6, s: [4], ld: true },
    { t: "add x7,x6,x1", d: 7, s: [6, 1] },
    { t: "and x8,x7,x2", d: 8, s: [7, 2] },
    { t: "sw  x8,4(x4)", d: 0, s: [8, 4], mem: true },
    { t: "beq x8,x0,top", d: 0, s: [8], br: true },
    { t: "or  x9,x3,x5", d: 9, s: [3, 5], wp: true },
    { t: "xor x10,x9,x1", d: 10, s: [9, 1], wp: true }
  ];
  function Pipe(bypass) { this.bypass = bypass; this.cyc = 0; this.pc = 0; this.id = 0; this.st = [null, null, null, null, null]; this.retired = 0; this.rows = []; this.arcs = []; this.iter = 0; }
  Pipe.prototype.fetch = function () {
    const p = PROG[this.pc], ins = { id: this.id++, idx: this.pc, p: p, wrong: !!p.wp, cells: [] };
    this.pc = (this.pc + 1) % PROG.length; this.rows.push(ins); if (this.rows.length > 30) this.rows.shift();
    if (ins.idx === 0) this.iter++;
    return ins;
  };
  Pipe.prototype.step = function () {
    const c = ++this.cyc, st = this.st, IF = st[0], ID = st[1], EX = st[2], MEM = st[3], WB = st[4];
    let stall = false;
    const live = function (e) { return e && !e.wrong; };
    if (live(ID)) {
      const hit = function (e) { return live(e) && e.p.d > 0 && ID.p.s.indexOf(e.p.d) >= 0; };
      stall = this.bypass ? (hit(EX) && EX.p.ld) : (hit(EX) || hit(MEM));
      if (!stall && this.bypass) {
        if (hit(EX)) this.arcs.push({ f: EX, fc: c, t: ID, tc: c + 1 });
        else if (hit(MEM)) this.arcs.push({ f: MEM, fc: c, t: ID, tc: c + 1 });
      }
    }
    const names = ["IF", "ID", "EX", "MEM", "WB"], taken = EX && EX.p.br;
    for (let i = 0; i < 5; i++) if (st[i]) {
      const e = st[i];
      if (taken && i < 2) e.cells.push([c, "X", 0]); else e.cells.push([c, names[i], (stall && i < 2) ? 1 : 0]);
    }
    if (WB && !WB.wrong) this.retired++;
    const n = [null, null, null, null, null];
    n[4] = MEM; n[3] = EX;
    if (taken) { this.pc = 0; n[2] = null; n[1] = null; n[0] = this.fetch(); }
    else if (stall) { n[2] = null; n[1] = ID; n[0] = IF; }
    else { n[2] = ID; n[1] = IF; n[0] = this.fetch(); }
    this.st = n;
  };
  Pipe.cpi = function (bypass, cycles) { const p = new Pipe(bypass); p.st[0] = p.fetch(); for (let i = 0; i < cycles; i++) p.step(); return p.cyc / Math.max(1, p.retired); };
  Kit.lib.pipe = { Pipe: Pipe, PROG: PROG };

  const STC = { IF: C.purple, ID: "#3b82f6", EX: C.cyan, MEM: C.teal, WB: C.yellow, X: C.red };
  Kit.register("project-mcp.html", {
    name: "Pipelined RISC-V Core", warm: 600,
    tagline: "A real 5-stage pipeline with hazard detection. Toggle bypassing and watch stalls appear.",
    note: "A small loop (add → sub → lw → add → and → sw → beq) runs through a cycle-accurate model: RAW hazards are bypassed when bypassing is on, a load-use hazard costs one stall, and the taken branch flushes two instructions. CPI numbers are for this loop only.",
    W: 640, H: 400,
    controls: [
      { id: "bypass", label: "bypassing (forwarding) on", type: "check", value: true },
      { id: "speed", label: "Speed", min: 0.5, max: 3, step: 0.25, value: 1, fmt: function (v) { return v + "×"; } }
    ],
    stats: [{ id: "cyc", label: "cycles" }, { id: "ret", label: "instructions retired" }, { id: "cpi", label: "live CPI" }],
    onCtl: function (s, id) { if (id === "bypass") resetPipe(s); },
    setup: function (s) {
      s.cpiOn = Pipe.cpi(true, 700); s.cpiOff = Pipe.cpi(false, 700); resetPipe(s);
    },
    tick: function (s, dt) {
      s.acc += dt * 2.4 * (s.ctl.speed || 1);
      while (s.acc >= 1) { s.acc -= 1; s.p.step(); }
      s.stat("cyc", "" + s.p.cyc); s.stat("ret", "" + s.p.retired); s.stat("cpi", s.p.retired ? (s.p.cyc / s.p.retired).toFixed(2) : "–");
    },
    draw: function (g, s) {
      const p = s.p, X0 = 150, CW = 27, NC = 17, RH = 24, Y0 = 64, frac = s.acc;
      const c0 = p.cyc - NC + 1;
      txt(g, "INSTRUCTION", 10, 46, { size: 8, color: C.dim, weight: 600 }); txt(g, "cycle →", X0 + NC * CW, 46, { size: 8, color: C.dim, align: "right" });
      const rows = p.rows.slice(-10), rowY = {};
      rows.forEach(function (r, i) {
        const y = Y0 + i * RH; rowY[r.id] = y;
        txt(g, r.p.t, 10, y + RH / 2 - 1, { size: 9.5, color: r.p.wp ? C.dim : C.tx });
        g.strokeStyle = "rgba(30,58,95,.35)"; g.lineWidth = 1; g.beginPath(); g.moveTo(X0, y + RH); g.lineTo(X0 + NC * CW, y + RH); g.stroke();
        r.cells.forEach(function (cl) {
          const col = cl[0] - c0 + 0 - frac; if (col < -1 || col > NC) return;
          const x = X0 + col * CW + 1;
          if (x < X0 - 1) return;
          g.fillStyle = STC[cl[1]]; g.globalAlpha = cl[1] === "X" ? 0.7 : 0.9; rr(g, x, y + 2, CW - 2, RH - 4, 5); g.fill(); g.globalAlpha = 1;
          if (cl[2]) { g.fillStyle = "rgba(255,138,61,.8)"; g.fillRect(x + 3, y + RH - 7, CW - 8, 2.5); }
          txt(g, cl[1] === "X" ? "✕" : cl[1], x + (CW - 2) / 2, y + RH / 2, { size: 8.5, color: "#04101f", weight: 700, align: "center" });
        });
      });
      // bypass arcs
      p.arcs = p.arcs.filter(function (a) { return a.tc >= c0 - 2; });
      p.arcs.forEach(function (a) {
        const fy = rowY[a.f.id], ty = rowY[a.t.id]; if (fy == null || ty == null) return;
        const fx = X0 + (a.fc - c0 - frac) * CW + CW / 2, tx = X0 + (a.tc - c0 - frac) * CW + CW / 2;
        if (tx > X0 + NC * CW + 4 || fx < X0) return;
        g.strokeStyle = C.yellow; g.lineWidth = 1.6; g.beginPath(); g.moveTo(fx, fy + RH - 4); g.quadraticCurveTo(fx + 2, ty + 4, tx - 3, ty + RH / 2 + 3); g.stroke();
        g.fillStyle = C.yellow; g.beginPath(); g.arc(tx - 3, ty + RH / 2 + 3, 2.6, 0, TAU); g.fill();
      });
      // legend
      let lx = X0;
      ["IF", "ID", "EX", "MEM", "WB"].forEach(function (n) { g.fillStyle = STC[n]; rr(g, lx, 312, 12, 10, 3); g.fill(); txt(g, n, lx + 16, 317, { size: 8, color: C.mute }); lx += 44; });
      g.fillStyle = "rgba(255,138,61,.8)"; g.fillRect(lx, 316, 12, 3); txt(g, "stall", lx + 16, 317, { size: 8, color: C.mute }); lx += 48;
      g.fillStyle = STC.X; rr(g, lx, 312, 12, 10, 3); g.fill(); txt(g, "flush", lx + 16, 317, { size: 8, color: C.mute }); lx += 52;
      g.strokeStyle = C.yellow; g.lineWidth = 1.6; g.beginPath(); g.moveTo(lx, 319); g.lineTo(lx + 14, 313); g.stroke(); txt(g, "bypass", lx + 19, 317, { size: 8, color: C.mute });
      // CPI comparison
      const bar = function (y, label, cpi, on, col) {
        txt(g, label, 10, y + 6, { size: 9, color: on ? C.tx : C.dim, weight: on ? 700 : 400 });
        g.fillStyle = "#0f1a33"; rr(g, 150, y, 400, 12, 6); g.fill();
        g.fillStyle = col; g.globalAlpha = on ? 1 : 0.4; rr(g, 150, y, Math.max(8, 400 * cpi / 3.2), 12, 6); g.fill(); g.globalAlpha = 1;
        txt(g, "CPI " + cpi.toFixed(2), 558, y + 6, { size: 10, color: on ? col : C.dim, weight: 700 });
      };
      bar(342, "bypassing ON", s.cpiOn, s.ctl.bypass, C.green);
      bar(364, "stall-only", s.cpiOff, !s.ctl.bypass, C.orange);
      txt(g, (100 * (1 - s.cpiOn / s.cpiOff)).toFixed(0) + "% fewer cycles with bypassing on this loop", 150, 391, { size: 8.5, color: C.mute });
      // caches
      const hitI = p.st[0] != null;
      g.fillStyle = hitI ? C.green : "#14203c"; g.beginPath(); g.arc(588, 391, 4, 0, TAU); g.fill(); txt(g, "I$", 596, 391, { size: 8, color: C.dim });
      const m = p.st[3], dAcc = m && (m.p.ld || m.p.mem);
      g.fillStyle = dAcc ? (p.iter <= 1 ? C.orange : C.green) : "#14203c"; g.beginPath(); g.arc(614, 391, 4, 0, TAU); g.fill(); txt(g, "D$", 622, 391, { size: 8, color: C.dim });
    }
  });
  function resetPipe(s) { s.p = new Pipe(!!s.ctl.bypass); s.p.st[0] = s.p.fetch(); s.acc = 0; }
})(typeof window !== "undefined" ? window : globalThis);
