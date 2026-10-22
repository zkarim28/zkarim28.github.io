/* Zarif Karim — portfolio v2 (home page behaviour) */
(function () {
  "use strict";
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const fine = matchMedia("(pointer: fine)").matches;

  /* ---------- header, progress, spotlight ---------- */
  const top = $("#top"), bar = $("#progress");
  const secs = $$("main section[id]");
  const links = $$("#nav a");
  function onScroll() {
    const y = scrollY, max = document.documentElement.scrollHeight - innerHeight;
    bar.style.width = (max > 0 ? (y / max) * 100 : 0) + "%";
    top.classList.toggle("solid", y > 40);
    let cur = "";
    secs.forEach(s => { if (y + innerHeight * 0.35 >= s.offsetTop) cur = s.id; });
    links.forEach(a => a.classList.toggle("on", a.hash === "#" + cur));
  }
  addEventListener("scroll", onScroll, { passive: true }); onScroll();
  $("#menu").onclick = () => $("#nav").classList.toggle("open");
  links.forEach(a => a.addEventListener("click", () => $("#nav").classList.remove("open")));
  if (fine) addEventListener("pointermove", e => {
    document.documentElement.style.setProperty("--sx", e.clientX + "px");
    document.documentElement.style.setProperty("--sy", e.clientY + "px");
    $("#spot").style.setProperty("--sx", e.clientX + "px"); $("#spot").style.setProperty("--sy", e.clientY + "px");
  }, { passive: true });

  /* ---------- reveal on scroll ---------- */
  const io = "IntersectionObserver" in window ? new IntersectionObserver(es => es.forEach(e => {
    if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); }
  }), { threshold: 0.12 }) : null;
  const watch = (n) => io ? io.observe(n) : n.classList.add("in");
  $$(".reveal").forEach(watch);

  /* ---------- hero: live simulation carousel ---------- */
  const SIM = window.SimKit;
  const HERO = ["project-asic2.html", "project-fpga-final.html", "project-fpga2.html", "project-galton.html", "project-fpga1.html", "project-fpga3.html", "project-asic1.html",
    "project-sram.html", "project-mcp.html", "project-birdsong.html", "project-alu.html", "project-vu.html", "project-ikiwiki.html", "project-midi.html", "project-riffMIDI.html"].filter(h => SIM && SIM.reg[h]);
  const freeze = (inst) => { for (let i = 0; i < 150; i++) inst.step(1 / 60); inst.draw(); inst.pause(); };
  if (SIM && HERO.length) {
    const stage = $("#hsStage"), cv = $("#heroCanvas"), dots = $("#hsDots"), prog = $("#hsProg"), card = $("#heroSim");
    const DUR = 11;
    let cur = -1, inst = null, tProg = 0, hold = false, vis = true, lastT = 0;
    HERO.forEach((h, i) => { const b = el("button"); b.type = "button"; b.setAttribute("aria-label", SIM.reg[h].name); b.onclick = () => go(i); dots.appendChild(b); });
    let want = 0, swapping = false;
    function go(i) {
      want = (i + HERO.length) % HERO.length; if (want === cur || swapping) return;
      const swap = () => {
        if (inst) inst.destroy();
        cur = want; const h = HERO[cur], spec = SIM.reg[h];
        inst = SIM.mount(cv, h, { ambient: true, aspect: true });
        if (reduce) freeze(inst);
        $("#hsName").textContent = spec.name; $("#hsTag").textContent = spec.tagline; $("#hsCount").textContent = (cur + 1) + " / " + HERO.length;
        $("#hsOpen").href = h + "#sim";
        $$("button", dots).forEach((b, k) => b.classList.toggle("on", k === cur));
        tProg = 0; swapping = false; stage.classList.remove("swap");
      };
      if (inst) { swapping = true; stage.classList.add("swap"); setTimeout(swap, 230); } else swap();
    }
    $("#hsPrev").onclick = () => go(want - 1); $("#hsNext").onclick = () => go(want + 1);
    stage.addEventListener("click", e => { if (!e.target.closest(".hs-open")) location.href = HERO[cur] + "#sim"; });
    stage.style.cursor = "pointer";
    card.addEventListener("pointerenter", () => hold = true); card.addEventListener("pointerleave", () => hold = false);
    card.addEventListener("focusin", () => hold = true); card.addEventListener("focusout", () => hold = false);
    if ("IntersectionObserver" in window) new IntersectionObserver(es => { vis = es[0].isIntersecting; }, { threshold: 0.15 }).observe(card);
    go(0);
    if (!reduce) requestAnimationFrame(function loop(t) {
      requestAnimationFrame(loop);
      const dt = Math.min(0.1, (t - (lastT || t)) / 1000); lastT = t;
      if (hold || !vis || document.hidden) return;
      tProg += dt; prog.style.width = Math.min(100, tProg / DUR * 100) + "%";
      if (tProg >= DUR) go(want + 1);
    });
  }

  const roles = ["Zarif Karim", "an engineer", "a musician", "a creator"];
  const typed = $("#typed");
  if (reduce) typed.textContent = roles[0];
  else {
    let ri = 0, ci = 0, del = false;
    (function tick() {
      const w = roles[ri];
      typed.textContent = w.slice(0, ci);
      if (!del && ci === w.length) { del = true; return setTimeout(tick, 1600); }
      if (del && ci === 0) { del = false; ri = (ri + 1) % roles.length; }
      ci += del ? -1 : 1;
      setTimeout(tick, del ? 30 : 70);
    })();
  }

  function count(b) {
    const to = +b.dataset.count, suf = b.dataset.suffix || "", t0 = performance.now(), d = 1400;
    (function f(t) {
      const p = Math.max(0, Math.min((t - t0) / d, 1)), e = 1 - Math.pow(1 - p, 3);
      b.textContent = Math.round(to * e).toLocaleString() + suf;
      if (p < 1) requestAnimationFrame(f);
    })(t0);
  }
  const cio = io && new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { count(e.target); cio.unobserve(e.target); } }), { threshold: 0.6 });
  $$("[data-count]").forEach(b => { if (reduce || !cio) b.textContent = (+b.dataset.count).toLocaleString() + (b.dataset.suffix || ""); else cio.observe(b); });

  /* about photo tilt */
  const photo = $("#photo");
  if (fine && !reduce) {
    photo.addEventListener("pointermove", e => {
      const r = photo.getBoundingClientRect(), x = (e.clientX - r.left) / r.width - .5, y = (e.clientY - r.top) / r.height - .5;
      photo.style.transform = `perspective(700px) rotateY(${x * 14}deg) rotateX(${-y * 14}deg)`;
    });
    photo.addEventListener("pointerleave", () => photo.style.transform = "");
  }

  /* ---------- projects ---------- */
  const P = window.PROJECTS || [];
  const CATS = { all: "All", chips: "Chips & VLSI", fpga: "FPGA", embedded: "Embedded", music: "Music & Software" };
  const catName = { chips: "Chips & VLSI", fpga: "FPGA", embedded: "Embedded", music: "Music & Software" };
  const grid = $("#grid"), filters = $("#filters");

  function pills(host, map, counts, onPick, first) {
    host.innerHTML = "";
    Object.entries(map).forEach(([k, label]) => {
      const b = el("button", "pill" + (k === first ? " on" : ""), label + (counts ? ` <em>${counts[k]}</em>` : ""));
      b.setAttribute("role", "tab"); b.dataset.k = k;
      b.onclick = () => { $$(".pill", host).forEach(x => x.classList.toggle("on", x === b)); onPick(k); };
      host.appendChild(b);
    });
  }
  const pc = { all: P.length }; P.forEach(p => pc[p.cat] = (pc[p.cat] || 0) + 1);
  pills(filters, CATS, pc, k => {
    $$(".ptile", grid).forEach((c, i) => {
      const show = k === "all" || P[i].cat === k;
      c.classList.toggle("hide", !show);
      if (show) { c.style.animation = "none"; c.offsetHeight; c.style.animation = "chipin .45s both"; c.style.animationDelay = (i % 6) * 40 + "ms"; }
    });
  }, "all");

  /* one tile per project: photo on the left, its live simulation on the right */
  const esc = (x) => String(x).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
  P.forEach((p, i) => {
    const spec = SIM && SIM.reg[p.href];
    const t = el("article", "ptile reveal");
    t.innerHTML = `<div class="pt-media">
        <button type="button" class="pt-img" aria-label="Quick look: ${esc(p.title)}"><img src="${p.img}" alt="${esc(p.alt)}" loading="lazy"><span class="pt-hint">Quick look</span></button>
        ${spec ? `<a class="pt-sim" href="${p.href}#sim" aria-label="Open the ${esc(spec.name)} simulation"><canvas aria-hidden="true"></canvas><span class="pt-live"><i></i>live</span><span class="pt-over">${esc(spec.tagline)}</span><span class="pt-hint">Play with it</span></a>` : ""}
      </div>
      <div class="pt-cap"><span class="badge ${p.cat}">${catName[p.cat]}</span><h3><a href="${p.href}">${esc(p.title)}</a></h3>
        <div class="hooks">${p.hook.map((h, j) => `<span class="hook${j === 0 && p.featured ? " hot" : ""}">${esc(h)}</span>`).join("")}</div></div>`;
    const img = $("img", t);
    img.addEventListener("load", () => { if (img.naturalWidth / img.naturalHeight > 1.75) img.style.objectFit = "contain"; });   // keep wide diagrams / two-up covers whole
    $(".pt-img", t).onclick = () => openModal(i);
    grid.appendChild(t); watch(t);
    if (spec) {
      let m = null, timer = 0;
      const mount = () => { if (m) return; clearTimeout(timer); m = SIM.mount($("canvas", t), p.href, { ambient: true, aspect: true }); if (reduce) freeze(m); };
      timer = setTimeout(mount, 2500 + i * 90);   // fallback so every tile comes alive even if it is never scrolled to
      if ("IntersectionObserver" in window) { const lo = new IntersectionObserver(es => { if (es[0].isIntersecting) { mount(); lo.disconnect(); } }, { rootMargin: "300px" }); lo.observe(t); }
    }
  });

  /* modal */
  const modal = $("#modal"); let mi = 0, lastFocus = null;
  function visibleIdx() { return P.map((p, i) => i).filter(i => !$$(".ptile", grid)[i].classList.contains("hide")); }
  function fillModal(i) {
    const p = P[i]; mi = i;
    $("#mImg").src = p.img; $("#mImg").alt = p.alt;
    const cat = $("#mCat"); cat.textContent = catName[p.cat]; cat.className = "badge " + p.cat;
    $("#mTitle").textContent = p.title;
    $("#mHooks").innerHTML = p.hook.map(h => `<span class="hook">${h}</span>`).join("");
    $("#mFacts").innerHTML = p.facts.filter(f => !/report/i.test(f[0])).slice(0, 5).map(f => `<dt>${f[0]}</dt><dd>${f[1]}</dd>`).join("");
    $("#mTags").innerHTML = p.tags.map(t => `<span>${t}</span>`).join("");
    $("#mOpen").href = p.href;
  }
  function openModal(i) { lastFocus = document.activeElement; fillModal(i); modal.hidden = false; document.body.style.overflow = "hidden"; $("#mClose").focus(); }
  function closeModal() { modal.hidden = true; document.body.style.overflow = ""; if (lastFocus) lastFocus.focus(); }
  function step(d) { const v = visibleIdx(), k = v.indexOf(mi); fillModal(v[(k + d + v.length) % v.length]); }
  $("#mClose").onclick = closeModal;
  $("#mPrev").onclick = () => step(-1); $("#mNext").onclick = () => step(1);
  modal.addEventListener("click", e => { if (e.target === modal) closeModal(); });
  addEventListener("keydown", e => {
    if (modal.hidden) return;
    if (e.key === "Escape") closeModal();
    if (e.key === "ArrowLeft") step(-1);
    if (e.key === "ArrowRight") step(1);
  });

  /* ---------- skills ---------- */
  const DEV = "https://raw.githubusercontent.com/devicons/devicon/master/icons/";
  const SK = {
    lang: ["Languages", [
      ["Python", "OOP, Data Science, PyGame", DEV + "python/python-original.svg"],
      ["C++", "FSMs, Arduino, JUCE audio plugins", DEV + "cplusplus/cplusplus-original.svg"],
      ["C", "Embedded Systems", DEV + "c/c-original.svg"],
      ["Assembly", "Embedded Systems", "assets/img/asm.png"],
      ["Verilog HDL", "Digital Logic + Teaching Assistant", "assets/img/fpga.png"]]],
    lib: ["Libraries", [
      ["JUCE", "C++", "assets/img/juce.png"],
      ["NumPy", "Python", "https://cdn.jsdelivr.net/gh/devicons/devicon/icons/numpy/numpy-original.svg"],
      ["Matplotlib", "Python", "https://upload.wikimedia.org/wikipedia/commons/0/01/Created_with_Matplotlib-logo.svg"]]],
    tool: ["Tools", [
      ["FPGAs", "Intel Cyclone-V", "assets/img/fpga.png"],
      ["Cadence Virtuoso", "Schematic & Layout", "assets/img/Cadence-Logo.jpg"],
      ["Quartus Prime", "", "assets/img/quartus.png"],
      ["ModelSim", "", "assets/img/modelsim.png"],
      ["LTspice", "Circuit Analysis", "assets/img/LTspice.jpg"],
      ["Microcontrollers", "FRDM-KL46Z · Arduino Mega 2560", "assets/img/frdm.png"],
      ["Oscilloscopes", "", "assets/img/oscilloscope.jpg"],
      ["Digital Multi Meters", "", "assets/img/DMM.jpg"],
      ["Soldering", "", "assets/img/Soldering.jpg"],
      ["LabTracer", "", "assets/img/LabTracer.png"],
      ["Git", "", "assets/img/git.png"],
      ["Confluence", "", "assets/img/confluence.png"]]],
  };
  const skTabs = $("#skillTabs"), skHost = $("#skillChips");
  function showSkills(k) {
    skHost.innerHTML = "";
    SK[k][1].forEach((s, i) => {
      const c = el("div", "chip", `<img src="${s[2]}" alt="" loading="lazy"><div><b>${s[0]}</b>${s[1] ? `<small>${s[1]}</small>` : ""}</div>`);
      c.style.animationDelay = i * 45 + "ms"; skHost.appendChild(c);
    });
  }
  pills(skTabs, Object.fromEntries(Object.entries(SK).map(([k, v]) => [k, v[0]])), null, showSkills, "lang"); showSkills("lang");

  /* ---------- experience ---------- */
  const EXP = [
    { role: "Hardware Engineering Intern (Physical Design)", org: "IBM", when: "May 2026 – Aug. 2026", where: "Poughkeepsie, NY",
      metrics: [["10×", "fewer hours placing voltage level translators by hand"], ["Python", "dual-power regions for a z-Mainframe chip"]],
      more: ["Reduced voltage level translator manual placement time by 10x fewer hours", "Co-scripted dual-power region creation in Python for z-Mainframe chip", "Collaborated with a partner to learn and grow in physical chip design"] },
    { role: "Teaching Assistant (Digital Logic)", org: "Cornell University", when: "Jan. 2024 – Present", where: "Ithaca, NY",
      metrics: [["100+", "students supported"], ["Verilog", "debugging with simulation traces"]],
      more: ["Support 100+ students in digital logic, RTL design, static timing analysis, pipelines, hazards, caches, and FPGA prototyping", "Debug Verilog HDL code in labs, identifying errors with simulation traces", "Create rubrics emphasizing test coverage, correctness, and code quality"] },
    { role: "Electrical Engineering Intern", org: "Mobile Communications America", when: "Jun. 2025 – Dec. 2025", where: "Arlington, TX",
      metrics: [["100+", "data points benchmarked"], ["100,000+", "sq. ft. of in-building RF coverage"], ["19", "states of engineers reviewed results"]],
      more: ["Perform system-level validation of large in-building wireless RF systems, benchmarking 100+ data points across 100,000+ sq. ft. for stakeholders", "Conduct CAD-based signal propagation system verification with RF heatmaps, presenting results to engineers across 19 states for review", "Produced coverage maps for Coors Brewery factory (CO), pinpointing gaps in signal strength to inform fire marshals and system design choices"] },
  ];
  const tl = $("#timeline");
  EXP.forEach(x => {
    const n = el("div", "tl reveal", `<div class="tl-head"><h3>${x.org} <span>— ${x.role}</span></h3><div class="tl-meta">${x.when} · ${x.where}</div></div>
      <div class="metrics">${x.metrics.map(m => `<div class="metric"><b>${m[0]}</b><span>${m[1]}</span></div>`).join("")}</div>
      <button class="more" aria-expanded="false">Details <i class="bi bi-chevron-down"></i></button>
      <ul>${x.more.map(m => `<li>${m}</li>`).join("")}</ul>`);
    const b = $(".more", n), ul = $("ul", n);
    b.onclick = () => { const o = ul.classList.toggle("open"); b.setAttribute("aria-expanded", o); };
    tl.appendChild(n); watch(n);
  });

  /* ---------- courses ---------- */
  const C = window.COURSES || [];
  const AREAS = { all: "All", hw: "Hardware & Systems", sw: "Software & Data", sig: "Circuits & Signals", math: "Math" };
  const cc = { all: C.length }; C.forEach(c => cc[c.area] = (cc[c.area] || 0) + 1);
  const cg = $("#courseGrid"), cd = $("#courseDetail");
  function showCourse(c, node) {
    $$(".course", cg).forEach(x => x.classList.toggle("on", x === node));
    cd.innerHTML = `<div class="code">${c.code}</div><h4>${c.title}</h4>` +
      (c.desc ? `<p>${c.desc}</p>` : "") + (c.link ? `<p><a href="${c.link}" target="_blank" rel="noopener">View certificate <i class="bi bi-box-arrow-up-right"></i></a></p>` : "");
  }
  C.forEach(c => {
    const b = el("button", "course", `<b>${c.code}</b><span>${c.title}</span>`); b.type = "button";
    b.onclick = () => showCourse(c, b); cg.appendChild(b);
  });
  pills($("#courseTabs"), AREAS, cc, k => {
    $$(".course", cg).forEach((n, i) => n.classList.toggle("hide", !(k === "all" || C[i].area === k)));
    const first = $$(".course", cg).find(n => !n.classList.contains("hide")); if (first) first.click();
  }, "all");
  if (C.length) $(".course", cg).click();

  /* ---------- music & dance ---------- */
  const S = window.SONGS || [];
  const kinds = ["Vocals Included", "Instrumentals", "Lofi"];
  const MT = { "Vocals Included": "Vocals", Instrumentals: "Instrumentals", Lofi: "Lofi", video: "Videos" };
  const songsEl = $("#songs"), vidsEl = $("#videos");
  const hue = s => { let h = 0; for (const ch of s) h = (h * 31 + ch.charCodeAt(0)) % 360; return h; };
  S.forEach(s => {
    const n = el("div", "song"); n.dataset.kind = s.kind; n.style.setProperty("--h", hue(s.title));
    n.innerHTML = `<button type="button" aria-label="Play ${s.title}"><small>${s.kind}</small><b>${s.title}</b>
      <span class="eq"><i></i><i></i><i></i><i></i></span><span class="play"><i class="bi bi-play-fill"></i></span></button>`;
    $("button", n).onclick = () => {
      n.innerHTML = `<iframe allow="autoplay" loading="lazy" src="${s.src.replace("auto_play=false", "auto_play=true")}"></iframe>`;
    };
    songsEl.appendChild(n);
  });
  const VIDS = [["C6yi6qV6NN4", "Halo — Beyoncé"], ["xkqAu5M1Oi4", "Grenade — Bruno Mars"], ["G3O0anzOG1I", "Everlong — Foo Fighters"],
    ["ZY8Tk5I8Zl0", "Wedding Dances Pt. 1"], ["lyPVwDO6bmg", "Wedding Dances Pt. 2"], ["8sfOqXlICxI", "Wedding Dances Pt. 3 (Chaleya Duet)"]];
  VIDS.forEach(([id, t]) => {
    const a = el("a", "vid", `<img src="https://img.youtube.com/vi/${id}/hqdefault.jpg" alt="${t}" loading="lazy"><div class="pl"><i class="bi bi-play-circle-fill"></i></div><span>${t}</span>`);
    a.href = "https://www.youtube.com/watch?v=" + id; a.target = "_blank"; a.rel = "noopener"; vidsEl.appendChild(a);
  });
  function showMusic(k) {
    const isVid = k === "video";
    songsEl.style.display = isVid ? "none" : ""; vidsEl.style.display = isVid ? "" : "none";
    $$(".song", songsEl).forEach(n => n.classList.toggle("hide", n.dataset.kind !== k));
  }
  pills($("#musicTabs"), MT, null, showMusic, "Vocals Included"); showMusic("Vocals Included");

  /* ---------- contact ---------- */
  const toast = $("#toast");
  $("#copyMail").onclick = () => {
    const done = () => { toast.textContent = "Email copied"; toast.classList.add("show"); setTimeout(() => toast.classList.remove("show"), 1800); };
    (navigator.clipboard ? navigator.clipboard.writeText("zk67@cornell.edu") : Promise.reject()).then(done, () => { location.href = "mailto:zk67@cornell.edu"; });
  };
})();
