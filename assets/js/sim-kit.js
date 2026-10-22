/* sim-kit.js — tiny canvas-simulation framework shared by the home page and the project pages.
 *
 * A simulation is registered per project page:
 *   SimKit.register("project-x.html", { name, tagline, note, W, H, controls, buttons, stats,
 *                                        setup(s), tick(s, dt), draw(g, s), onCtl(s, id, v), key(s, k, down), ... })
 * SimKit.mount(canvas, href, { ambient }) runs it on a canvas (letterboxed to W x H logical px);
 * SimKit.panel(host, inst) builds the sliders / buttons / readouts from the spec.
 * One shared requestAnimationFrame loop drives every instance and skips off-screen ones.
 */
(function (root) {
  "use strict";
  const Kit = (root.SimKit = root.SimKit || {});
  Kit.reg = {}; Kit.order = []; Kit.lib = {};
  Kit.TAU = Math.PI * 2;
  Kit.C = {
    bg: "#060a14", panel: "#0b1224", card: "#101a30", line: "#1e3a5f",
    cyan: "#00d4ff", purple: "#8b5cf6", green: "#39ff6a", teal: "#10b981",
    orange: "#ff8a3d", red: "#ff4d6d", yellow: "#ffd24a", tx: "#e2e8f0", mute: "#94a3b8", dim: "#475569"
  };
  Kit.mono = (px, wt) => (wt || 400) + " " + px + "px 'JetBrains Mono', ui-monospace, Menlo, monospace";
  Kit.sans = (px, wt) => (wt || 400) + " " + px + "px Poppins, system-ui, sans-serif";
  Kit.clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  Kit.lerp = (a, b, t) => a + (b - a) * t;
  Kit.register = function (href, spec) { spec.href = href; Kit.reg[href] = spec; Kit.order.push(href); };
  Kit.rng = function (a) {
    return function () {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };
  Kit.rr = function (g, x, y, w, h, r) {
    g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
  };
  Kit.txt = function (g, str, x, y, o) {
    o = o || {};
    g.font = o.font || Kit.mono(o.size || 10, o.weight);
    g.fillStyle = o.color || Kit.C.mute; g.textAlign = o.align || "left"; g.textBaseline = o.base || "middle";
    g.fillText(str, x, y);
  };
  Kit.hex = (v, n) => v.toString(16).toUpperCase().padStart(n || 2, "0");

  /* WebAudio — created lazily, only ever from a user gesture */
  let AC = null;
  Kit.audio = function () {
    if (!AC) { const A = root.AudioContext || root.webkitAudioContext; if (!A) return null; AC = new A(); }
    if (AC.state === "suspended") AC.resume();
    return AC;
  };

  /* ---------- shared loop ---------- */
  const insts = [];
  let raf = 0, last = 0;
  function frame(now) {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - (last || now)) / 1000); last = now;
    if (typeof document !== "undefined" && document.hidden) return;
    for (let i = 0; i < insts.length; i++) {
      const it = insts[i];
      if (!it.running || !it.visible) continue;
      try { it.step(dt); it.draw(); } catch (e) { console.error("[sim " + it.spec.href + "]", e); it.running = false; }
    }
  }
  function ensureLoop() { if (!raf && typeof requestAnimationFrame !== "undefined") raf = requestAnimationFrame(frame); }

  /* ---------- mount ---------- */
  Kit.mount = function (canvas, href, opt) {
    const spec = Kit.reg[href]; if (!spec) return null;
    opt = opt || {};
    const it = { spec: spec, canvas: canvas, g: canvas.getContext("2d"), opt: opt, running: true, visible: true, dpr: 1, k: 1, ox: 0, oy: 0, cw: 1, ch: 1, _off: [], statEls: {}, ctlEls: {}, _dirty: false };
    const s = it.s = {
      W: spec.W || 640, H: spec.H || 400, t: 0, ambient: !!opt.ambient, ctl: {},
      ptr: { x: -1e3, y: -1e3, down: false, inside: false, pressed: false, released: false },
      keys: {}, statv: {}, rnd: Kit.rng((Math.random() * 1e9) | 0),
      stat: function (id, v) { if (s.statv[id] !== v) { s.statv[id] = v; it._dirty = true; } },
      setCtl: function (id, v) { s.ctl[id] = v; if (it.setCtlUI) it.setCtlUI(id, v); }
    };
    (spec.controls || []).forEach(function (c) { s.ctl[c.id] = c.value; });

    function resize() {
      const r = canvas.getBoundingClientRect();
      const w = Math.max(2, r.width), h = Math.max(2, r.height);
      it.dpr = Math.min(root.devicePixelRatio || 1, 2);
      canvas.width = Math.round(w * it.dpr); canvas.height = Math.round(h * it.dpr);
      it.cw = w; it.ch = h; it.k = Math.min(w / s.W, h / s.H);
      it.ox = (w - s.W * it.k) / 2; it.oy = (h - s.H * it.k) / 2;
      if (it.running) it.draw();
    }
    const off = function (fn) { it._off.push(fn); };
    const on = function (el, ev, fn, o) { el.addEventListener(ev, fn, o); off(function () { el.removeEventListener(ev, fn, o); }); };

    if (!opt.aspect) canvas.style.aspectRatio = s.W + " / " + s.H;
    if (root.ResizeObserver) { const ro = new ResizeObserver(resize); ro.observe(canvas); off(function () { ro.disconnect(); }); }
    else on(root, "resize", resize);
    if (root.IntersectionObserver) {
      const io = new IntersectionObserver(function (en) { it.visible = en[0].isIntersecting; }, { threshold: 0 });
      io.observe(canvas); off(function () { io.disconnect(); });
    }

    if (!s.ambient) {
      const pos = function (e) { const r = canvas.getBoundingClientRect(); s.ptr.x = (e.clientX - r.left - it.ox) / it.k; s.ptr.y = (e.clientY - r.top - it.oy) / it.k; };
      canvas.tabIndex = 0;
      canvas.style.touchAction = spec.touchNone ? "none" : "pan-y";
      canvas.style.outline = "none";
      on(canvas, "pointermove", function (e) { pos(e); s.ptr.inside = true; if (spec.move) spec.move(s); });
      on(canvas, "pointerdown", function (e) {
        pos(e); s.ptr.down = true; s.ptr.pressed = true; s.ptr.inside = true;
        if (canvas.setPointerCapture) { try { canvas.setPointerCapture(e.pointerId); } catch (x) { /* ignore */ } }
        canvas.focus({ preventScroll: true });
        if (spec.down) spec.down(s, it);
      });
      const up = function (e) { pos(e); s.ptr.down = false; s.ptr.released = true; if (spec.up) spec.up(s, it); };
      on(canvas, "pointerup", up); on(canvas, "pointercancel", up);
      on(canvas, "pointerleave", function () { s.ptr.inside = false; });
      on(canvas, "keydown", function (e) {
        if (e.metaKey || e.ctrlKey || e.altKey) return;
        if (!s.keys[e.key]) { s.keys[e.key] = true; if (spec.key && spec.key(s, e.key, true, it)) e.preventDefault(); }
        else if (spec.key && ("" + e.key).length === 1) e.preventDefault();
      });
      on(canvas, "keyup", function (e) { s.keys[e.key] = false; if (spec.key) spec.key(s, e.key, false, it); });
      on(canvas, "blur", function () { Object.keys(s.keys).forEach(function (k) { if (s.keys[k]) { s.keys[k] = false; if (spec.key) spec.key(s, k, false, it); } }); });
    }

    it.step = function (dt) {
      s.t += dt; spec.tick(s, dt, it);
      s.ptr.pressed = s.ptr.released = false;
    };
    it.draw = function () {
      const g = it.g, d = it.dpr;
      g.setTransform(d, 0, 0, d, 0, 0);
      g.fillStyle = Kit.C.bg; g.fillRect(0, 0, it.cw, it.ch);
      g.save(); g.translate(it.ox, it.oy); g.scale(it.k, it.k);
      g.beginPath(); g.rect(0, 0, s.W, s.H); g.clip();
      spec.draw(g, s);
      g.restore();
      if (it._dirty) { it._dirty = false; for (const id in it.statEls) { const v = s.statv[id]; if (v !== undefined && it.statEls[id].textContent !== v) it.statEls[id].textContent = v; } }
    };
    it.reset = function () { s.t = 0; spec.setup(s, it); resize(); };
    it.pause = function () { it.running = false; if (it.setRunUI) it.setRunUI(); };
    it.play = function () { it.running = true; if (it.setRunUI) it.setRunUI(); };
    it.destroy = function () {
      it.running = false; const i = insts.indexOf(it); if (i >= 0) insts.splice(i, 1);
      it._off.forEach(function (f) { f(); }); it._off.length = 0;
      if (spec.destroy) spec.destroy(s, it);
    };

    spec.setup(s, it);
    for (let w = 0; w < (spec.warm || 0); w++) { s.t += 1 / 60; spec.tick(s, 1 / 60, it); }   // pre-roll so the first frame is never empty
    insts.push(it);
    resize();
    ensureLoop();
    return it;
  };

  /* ---------- control panel ---------- */
  Kit.panel = function (host, it) {
    const spec = it.spec, s = it.s;
    const mk = function (tag, cls, html) { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
    host.innerHTML = "";
    const refresh = function () { if (!it.running) it.draw(); };   // keep a paused sim in sync with its controls
    const ctl = mk("div", "sk-ctl");
    (spec.controls || []).forEach(function (c) {
      if (c.type === "check") {
        const l = mk("label", "sk-chk"), i = mk("input"); i.type = "checkbox"; i.checked = !!c.value;
        l.appendChild(i); l.appendChild(document.createTextNode(" " + c.label));
        i.onchange = function () { s.ctl[c.id] = i.checked; if (spec.onCtl) spec.onCtl(s, c.id, i.checked, it); refresh(); };
        it.ctlEls[c.id] = { set: function (v) { i.checked = !!v; } };
        ctl.appendChild(l);
      } else if (c.type === "seg") {
        const w = mk("div", "sk-seg"); if (c.label) w.appendChild(mk("span", "sk-seglabel", c.label));
        const row = mk("div", "sk-segrow"), bs = [];
        c.options.forEach(function (o, k) {
          const b = mk("button", "sk-segbtn" + (k === c.value ? " on" : ""), o); b.type = "button";
          b.onclick = function () { s.ctl[c.id] = k; bs.forEach(function (x, j) { x.classList.toggle("on", j === k); }); if (spec.onCtl) spec.onCtl(s, c.id, k, it); refresh(); };
          bs.push(b); row.appendChild(b);
        });
        it.ctlEls[c.id] = { set: function (v) { bs.forEach(function (x, j) { x.classList.toggle("on", j === v); }); } };
        w.appendChild(row); ctl.appendChild(w);
      } else {
        const l = mk("label", "sk-rng"), fmt = c.fmt || function (v) { return v; };
        const val = mk("b", "", "" + fmt(c.value));
        const top = mk("span", "", ""); top.appendChild(document.createTextNode(c.label)); top.appendChild(val);
        const r = mk("input"); r.type = "range"; r.min = c.min; r.max = c.max; r.step = c.step; r.value = c.value;
        r.oninput = function () { const v = parseFloat(r.value); s.ctl[c.id] = v; val.textContent = fmt(v); if (spec.onCtl) spec.onCtl(s, c.id, v, it); refresh(); };
        it.ctlEls[c.id] = { set: function (v) { r.value = v; val.textContent = fmt(v); } };
        l.appendChild(top); l.appendChild(r); ctl.appendChild(l);
      }
    });
    {
      const row = mk("div", "sk-btns"); ctl.appendChild(row);
      const pb = mk("button", "sk-btn sk-ghost", ""); pb.type = "button";
      it.setRunUI = function () { pb.textContent = it.running ? "⏸ Pause" : "▶ Play"; };
      pb.onclick = function () { if (it.running) it.pause(); else it.play(); };
      it.setRunUI(); row.appendChild(pb);
      (spec.buttons || []).forEach(function (b) {
        const e = mk("button", "sk-btn", b.label); e.type = "button";
        e.onclick = function () { b.act(s, it, e); refresh(); };
        row.appendChild(e);
      });
    }
    host.appendChild(ctl);
    if (spec.stats && spec.stats.length) {
      const st = mk("div", "sk-stats");
      spec.stats.forEach(function (d) {
        const cell = mk("div", "", "<b>–</b><small>" + d.label + "</small>");
        it.statEls[d.id] = cell.firstChild; st.appendChild(cell);
      });
      host.appendChild(st);
      it._dirty = true;
    }
    it.setCtlUI = function (id, v) { if (it.ctlEls[id]) it.ctlEls[id].set(v); };
  };

  Kit.names = function () { return Kit.order.slice(); };
})(typeof window !== "undefined" ? window : globalThis);
