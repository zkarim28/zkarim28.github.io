/* Project page upgrade layer: glance tiles, tabbed write-up, highlighted numbers,
 * gallery captions + lightbox, progress bar, prev/next. Works on the existing
 * project-*.html markup; needs assets/js/projects-data.js for tiles + prev/next. */
(function () {
  "use strict";
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const el = (t, c, h) => { const e = document.createElement(t); if (c) e.className = c; if (h != null) e.innerHTML = h; return e; };
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;

  function init() {
    const det = $(".portfolio-details");
    if (!det) return;
    document.body.classList.add("pui");

    const P = window.PROJECTS || [];
    const page = location.pathname.split("/").pop() || "";
    const at = P.findIndex(p => p.href === page), me = P[at];

    /* progress bar */
    const bar = el("div"); bar.id = "pui-progress"; document.body.appendChild(bar);
    const onScroll = () => { const m = document.documentElement.scrollHeight - innerHeight; bar.style.width = (m > 0 ? scrollY / m * 100 : 0) + "%"; };
    addEventListener("scroll", onScroll, { passive: true }); onScroll();

    /* at-a-glance tiles (page-sourced hook chips) */
    if (me && me.hook && me.hook.length) {
      const g = el("div", "pui-glance");
      me.hook.forEach((h, i) => g.appendChild(el("div", "pui-tile", `<small>${i === 0 ? "at a glance" : "&nbsp;"}</small>${h}`)));
      const bc = $(".breadcrumbs"); if (bc) bc.after(g);
    }

    /* live simulation: canvas + generated controls, placed above the write-up */
    const SIM = window.SimKit, sspec = SIM && SIM.reg[page];
    if (sspec) {
      const demo = el("div", "pui-demo"); demo.id = "sim";
      demo.innerHTML = `<div class="pui-demo-head"><span class="pui-live"><i></i> live simulation</span><h3>${sspec.name}</h3><p>${sspec.tagline}</p></div>
        <div class="pui-demo-body"><div class="pui-stage"><canvas aria-label="${sspec.name} simulation"></canvas></div>
        <div class="pui-side"><div class="sk-panel"></div><p class="pui-note">${sspec.note || ""}</p></div></div>`;
      const anchor = $(".proj-section") ? ($(".proj-section").closest(".row") || $(".proj-section").parentElement) : null;
      if (anchor) anchor.before(demo); else det.querySelector(".container").appendChild(demo);
      const inst = SIM.mount($("canvas", demo), page, {});
      SIM.panel($(".sk-panel", demo), inst);
      if (reduce) { for (let i = 0; i < 150; i++) inst.step(1 / 60); inst.draw(); inst.pause(); }
      if (location.hash === "#sim") setTimeout(() => demo.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" }), 350);
    }

    /* tabbed write-up */
    const secs = $$(".proj-section");
    if (secs.length > 1) {
      const host = secs[0].parentElement;
      host.classList.add("pui-tabbed");
      const bar2 = el("div", "pui-tabbar"), tabs = el("div", "pui-tabs"), all = el("button", "pui-all", "show all");
      tabs.setAttribute("role", "tablist"); all.type = "button";
      const show = i => {
        host.classList.remove("pui-expanded"); all.textContent = "show all";
        secs.forEach((s, j) => s.classList.toggle("on", j === i));
        $$(".pui-tab", tabs).forEach((t, j) => { t.classList.toggle("on", j === i); t.setAttribute("aria-selected", j === i); });
        const t = $$(".pui-tab", tabs)[i];   // centre the active tab inside the strip only (never scroll the page)
        if (t) tabs.scrollTo({ left: t.offsetLeft - (tabs.clientWidth - t.offsetWidth) / 2, behavior: reduce ? "auto" : "smooth" });
      };
      secs.forEach((s, i) => {
        const h = $("h3", s), b = el("button", "pui-tab", h ? h.textContent : "Part " + (i + 1));
        b.type = "button"; b.setAttribute("role", "tab"); b.onclick = () => show(i); tabs.appendChild(b);
      });
      all.onclick = () => {
        const open = host.classList.toggle("pui-expanded");
        all.textContent = open ? "tabs" : "show all";
        if (open) { secs.forEach(s => s.classList.add("on")); $$(".pui-tab", tabs).forEach(t => t.classList.remove("on")); }
        else show(0);
      };
      bar2.append(tabs, all); secs[0].before(bar2); show(0);
      tabs.addEventListener("keydown", e => {
        const ts = $$(".pui-tab", tabs), i = ts.indexOf(document.activeElement);
        if (i < 0) return;
        if (e.key === "ArrowRight") { ts[(i + 1) % ts.length].focus(); ts[(i + 1) % ts.length].click(); }
        if (e.key === "ArrowLeft") { ts[(i - 1 + ts.length) % ts.length].focus(); ts[(i - 1 + ts.length) % ts.length].click(); }
      });
    }

    /* highlight the numbers that matter */
    const NUM = /(\d[\d,]*(?:\.\d+)?\s?(?:GHz|MHz|kHz|Hz|µs|ns|ps|ms|fps|KB|MB|GB|kB|bytes?|bits?|mV|V|W|mW|µW|nm|µm|mm|fJ\/bit|fJ|pJ|×|x|%)(?![A-Za-z0-9])|\b\d{1,3}(?:,\d{3})+\b)/g;
    $$(".proj-section p, .proj-section li").forEach(node => {
      const w = document.createTreeWalker(node, NodeFilter.SHOW_TEXT, null), hits = [];
      let n; while ((n = w.nextNode())) { if (n.parentElement.closest("a, mark, code, sub, sup")) continue; NUM.lastIndex = 0; if (NUM.test(n.nodeValue)) hits.push(n); }
      hits.forEach(t => {
        const f = document.createDocumentFragment(); let last = 0; const s = t.nodeValue; NUM.lastIndex = 0; let m;
        while ((m = NUM.exec(s))) {
          f.appendChild(document.createTextNode(s.slice(last, m.index)));
          const mk = el("mark", "num"); mk.textContent = m[0]; f.appendChild(mk); last = m.index + m[0].length;
        }
        f.appendChild(document.createTextNode(s.slice(last))); t.replaceWith(f);
      });
    });

    /* gallery: live caption + lightbox */
    const slider = $(".portfolio-details-slider");
    if (slider) {
      const cap = el("div", "pui-cap"); slider.after(cap);
      const altOf = s => { const i = $("img", s) || $("iframe", s) || $("video", s); return i ? (i.getAttribute("alt") || i.getAttribute("title") || "") : ""; };
      const hook = () => {
        const sw = slider.swiper;
        if (!sw) return false;
        const upd = () => { const a = sw.slides[sw.activeIndex]; cap.textContent = a ? altOf(a) : ""; };
        sw.on("slideChange", upd); upd(); return true;
      };
      let tries = 0; const iv = setInterval(() => { if (hook() || ++tries > 20) clearInterval(iv); }, 150);

      const zoom = el("div", "pui-zoom"); zoom.hidden = true;
      zoom.innerHTML = `<button class="pz-x" aria-label="Close">✕</button><button class="pz-prev" aria-label="Previous">‹</button><img alt=""><p></p><button class="pz-next" aria-label="Next">›</button>`;
      document.body.appendChild(zoom);
      let list = [], zi = 0;
      const fill = () => { const im = list[zi]; $("img", zoom).src = im.currentSrc || im.src; $("p", zoom).textContent = im.alt || ""; };
      const open = img => {
        const seen = new Set(); list = [];
        $$(".swiper-slide img", slider).forEach(im => { const k = im.closest(".swiper-slide").getAttribute("data-swiper-slide-index") ?? im.src; if (!seen.has(k)) { seen.add(k); list.push(im); } });
        zi = Math.max(0, list.findIndex(im => im.src === img.src)); fill(); zoom.hidden = false; document.body.style.overflow = "hidden";
      };
      const close = () => { zoom.hidden = true; document.body.style.overflow = ""; };
      const go = d => { zi = (zi + d + list.length) % list.length; fill(); };
      slider.addEventListener("click", e => { if (e.target.tagName === "IMG") open(e.target); });
      $(".pz-x", zoom).onclick = close; $(".pz-prev", zoom).onclick = () => go(-1); $(".pz-next", zoom).onclick = () => go(1);
      zoom.addEventListener("click", e => { if (e.target === zoom) close(); });
      addEventListener("keydown", e => { if (zoom.hidden) return; if (e.key === "Escape") close(); if (e.key === "ArrowLeft") go(-1); if (e.key === "ArrowRight") go(1); });
    }

    /* prev / next project */
    if (at >= 0 && P.length > 1) {
      const pv = P[(at - 1 + P.length) % P.length], nx = P[(at + 1) % P.length];
      const box = el("div", "pui-next");
      box.innerHTML = `<a class="pv" href="${pv.href}"><img src="${pv.img}" alt=""><div><small>← previous</small><b>${pv.title}</b></div></a>
        <a class="nx" href="${nx.href}"><img src="${nx.img}" alt=""><div><small>next →</small><b>${nx.title}</b></div></a>`;
      const foot = $("#footer"); if (foot) foot.before(box);
    }
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
})();
