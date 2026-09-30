(() => {
  'use strict';

  const DATA = window.QUIZ_DATA;
  const app = document.getElementById('app');
  const LETTERS = 'ABCDEFGH';
  const KINDS = [
    ['exam', true, 'Prelim 1 exam prep', 'the released study guide · Topics 1–3.2 + papers 1–6 · open notes'],
    ['combo', true, 'Combo quizzes', 'topic quiz + paper quiz, same sitting'],
    ['topic', true, 'Topic quizzes', 'lecture material'],
    ['paper', true, 'Paper quizzes', 'assigned readings'],
    ['practice', false, 'Self-made practice', 'written by me, not from class'],
  ];

  // ---------------------------------------------------------------- storage (per-viewer conveniences only)
  const store = {
    get(k, d) { try { const v = localStorage.getItem('ece6765:' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem('ece6765:' + k, JSON.stringify(v)); } catch { /* private mode */ } },
  };
  const settings = Object.assign({ shuffleQ: false, shuffleO: false, filter: 'all', mixSrc: 'official', mixN: '20' }, store.get('settings', {}));
  const saveSettings = () => store.set('settings', settings);
  const scores = store.get('scores', {});

  // ---------------------------------------------------------------- data
  const quizzes = DATA.quizzes;
  const byId = Object.fromEntries(quizzes.map(z => [z.id, z]));
  for (const z of quizzes) {
    z.all = [];
    for (const s of z.sections) for (const q of s.questions) {
      q.quiz = z; q.section = s; q.n = q.label || z.all.length + 1;
      z.all.push(q);
    }
  }
  const totalQs = quizzes.reduce((a, z) => a + z.all.length, 0);

  // ---------------------------------------------------------------- helpers
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  function md(s) {
    const codes = [];
    let h = esc(s).replace(/`([^`]+)`/g, (_, c) => `\u0000${codes.push(c) - 1}\u0000`);
    h = h.replace(/&lt;(https?:\/\/[^\s&]+)&gt;/g, '<a href="$1" target="_blank" rel="noopener">$1</a>');
    h = h.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
    h = h.replace(/\^(\([^()]*\)|[\w.]+)/g, (_, e) => `<sup>${e.replace(/^\((.*)\)$/, '$1')}</sup>`);
    h = h.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    h = h.replace(/(^|[^*\w])\*(?!\s)(.+?)\*(?!\w)/g, '$1<em>$2</em>');
    return h.replace(/\u0000(\d+)\u0000/g, (_, i) => `<code>${codes[i]}</code>`);
  }
  // One block: a paragraph, or '- item' / '1. item' lines with at most one nested level ('  - item').
  function block(b) {
    const lines = b.split('\n');
    if (!/^(- |\d+\. )/.test(lines[0])) return `<p>${md(b)}</p>`;
    const tag = l => (/^\s*\d+\. /.test(l) ? 'ol' : 'ul');
    const item = l => md(l.replace(/^\s*(?:- |\d+\. )/, ''));
    let html = `<${tag(lines[0])}>`, sub = null;
    for (const l of lines) {
      const nested = l.startsWith('  ');
      if (nested && !sub) { sub = tag(l); html = html.replace(/<\/li>$/, '') + `<${sub}>`; }
      else if (!nested && sub) { html += `</${sub}></li>`; sub = null; }
      html += `<li>${item(l)}</li>`;
    }
    return html + (sub ? `</${sub}></li>` : '') + `</${tag(lines[0])}>`;
  }
  const rich = text => text.split('\n\n').map(block).join('');
  const badge = official => official
    ? '<span class="badge off" title="Released by course staff">🏫 Official</span>'
    : '<span class="badge self" title="Practice quiz I wrote myself">✍️ Self-made</span>';
  const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const isTF = q => q.options.length === 2 && q.options[0] === 'TRUE';
  const paras = list => list.map(block).join('');
  const figure = img => img ? `<div class="figure"><img src="${esc(img.src)}" alt="${esc(img.alt)}"></div>` : '';
  const sectionImage = s => figure(s.image);
  const extras = q => figure(q.image) + (q.files || []).map(f =>
    `<p class="file">📎 Data file: <a href="${esc(f.src)}" download>${esc(f.name)}</a></p>`).join('');
  const isRight = it => (it.q.open ? it.pick === 'got' : it.pick === it.q.answer);
  const pct = (a, b) => Math.round((100 * a) / b);

  // ---------------------------------------------------------------- routing
  let run = null;
  let view = '';

  function route() {
    const [, name, id] = location.hash.replace(/^#\/?/, '#/').split('/');
    if (name === 'quiz' && byId[id]) {
      if (!run || run.key !== 'quiz:' + id || run.shuffled !== settings.shuffleQ) startQuiz(byId[id]); else renderRun();
    } else if (name === 'shuffle' && byId[id]) {
      if (!run || run.key !== 'quiz:' + id || !run.shuffled) startQuiz(byId[id], byId[id].all, true); else renderRun();
    } else if (name === 'mix' && run && run.key === 'mix') {
      renderRun();
    } else if (name === 'browse' && byId[id]) {
      renderBrowse(byId[id]);
    } else {
      renderHome();
    }
    window.scrollTo(0, 0);
  }

  // ---------------------------------------------------------------- home
  function renderHome() {
    view = 'home';
    const f = settings.filter;
    const shown = z => f === 'all' || (f === 'official') === z.official;
    const officialCount = quizzes.filter(z => z.official).length;
    const groups = KINDS.map(([kind, official, title, sub]) => {
      const list = quizzes.filter(z => z.kind === kind && z.official === official && shown(z));
      if (!list.length) return '';
      return `<section class="group"><h2>${title} <small>${sub}</small></h2><div class="cards">${list.map(card).join('')}</div></section>`;
    }).join('');

    app.innerHTML = `
      <section class="hero">
        <p class="eyebrow">Modern Datacenter Architecture · Fall 2026</p>
        <h1>ECE 6765 Quiz Bank</h1>
        <p class="lede">Every quiz from the course, playable. Pick a quiz, answer one question at a time, and read the explanation after each answer.
          Anything marked ${badge(true)} was released by course staff (in-class quizzes and the prelim study guide); ${badge(false)} ones are practice sets I wrote.</p>
        <div class="stats">
          <div><strong>${quizzes.length}</strong><span>Quizzes</span></div>
          <div><strong>${totalQs}</strong><span>Questions</span></div>
          <div><strong>${officialCount}</strong><span>Official</span></div>
          <div><strong>${quizzes.length - officialCount}</strong><span>Self-made</span></div>
        </div>
      </section>

      <section class="panel mix" aria-labelledby="mix-title">
        <div><h2 id="mix-title">Mixed practice</h2><p>A random set of questions drawn from across every quiz.</p></div>
        <div class="mix-row">
          <label class="field">Questions from
            <select id="mix-src">
              <option value="official">Official quizzes only</option>
              <option value="self">Self-made only</option>
              <option value="all">Everything</option>
            </select></label>
          <label class="field">How many
            <select id="mix-n"><option>10</option><option>20</option><option>40</option><option value="all">All</option></select></label>
          <button class="btn" data-action="mix">Start mixed practice →</button>
        </div>
        <div class="toggles">
          <label><input type="checkbox" id="shuffle-q" ${settings.shuffleQ ? 'checked' : ''}> Always shuffle question order when starting a quiz</label>
          <label><input type="checkbox" id="shuffle-o" ${settings.shuffleO ? 'checked' : ''}> Shuffle answer choices</label>
        </div>
      </section>

      <div class="filters" role="group" aria-label="Filter quizzes">
        ${[['all', 'All'], ['official', '🏫 Official'], ['self', '✍️ Self-made']].map(([v, l]) =>
          `<button class="chip" data-action="filter" data-f="${v}" aria-pressed="${f === v}">${l}</button>`).join('')}
      </div>
      ${groups}`;

    app.querySelector('#mix-src').value = settings.mixSrc;
    app.querySelector('#mix-n').value = settings.mixN;
  }

  function card(z) {
    const s = scores[z.id];
    const best = s ? ` · Best <b>${s.best}/${s.total}</b>` : '';
    return `<article class="panel card">
      <div>${badge(z.official)}</div>
      <h3>${esc(z.title)}</h3>
      <p class="sub">${esc(z.subtitle)}</p>
      <p class="covers">${md(z.covers)}</p>
      <div class="card-foot">
        <span class="meta">${z.all.length} ${z.open ? 'prompts' : 'questions'}${best}</span>
        <span class="actions"><a class="btn ghost" href="#/browse/${z.id}">Browse</a><a class="btn ghost" href="#/shuffle/${z.id}" title="Start with the questions in a random order">🔀 Shuffle</a><a class="btn" href="#/quiz/${z.id}">Start</a></span>
      </div>
    </article>`;
  }

  // ---------------------------------------------------------------- runs
  function makeRun(key, title, official, questions, { shuffleQ, quizId = null } = {}) {
    const qs = shuffleQ ? shuffle(questions.slice()) : questions.slice();
    run = {
      key, title, official, quizId, full: quizId != null && questions.length === byId[quizId].all.length,
      items: qs.map(q => {
        const order = q.options.map((_, i) => i);
        if (settings.shuffleO && !isTF(q)) shuffle(order);
        return { q, order, pick: null };
      }),
      i: 0, done: false,
    };
  }

  function startQuiz(z, questions = z.all, shuffled = settings.shuffleQ) {
    makeRun('quiz:' + z.id, z.title, z.official, questions, { shuffleQ: shuffled, quizId: z.id });
    run.shuffled = shuffled;
    renderRun();
  }

  // Restart the current quiz with its questions in a fresh random order.
  function reshuffle() {
    const z = byId[run.quizId];
    const answered = run.items.filter(it => it.pick != null).length;
    if (answered && !run.done && !confirm('Restart this quiz in a new random order? Your answers so far will be cleared.')) return;
    startQuiz(z, z.all, true);
    if (location.hash !== '#/shuffle/' + z.id) location.hash = '#/shuffle/' + z.id;
    window.scrollTo(0, 0);
  }

  function startMix() {
    const src = settings.mixSrc;
    const pool = quizzes.filter(z => src === 'all' || (src === 'official') === z.official).flatMap(z => z.all).filter(q => !q.open);
    const n = settings.mixN === 'all' ? pool.length : Math.min(+settings.mixN, pool.length);
    const title = { official: 'Mixed practice · official', self: 'Mixed practice · self-made', all: 'Mixed practice · everything' }[src];
    makeRun('mix', title, src === 'official' ? true : src === 'self' ? false : null, shuffle(pool.slice()).slice(0, n));
    if (location.hash === '#/mix') renderRun(); else location.hash = '#/mix';
  }

  function renderRun() {
    if (run.done) return renderResults();
    view = 'run';
    const { items, i } = run;
    const item = items[i];
    const { q, order, pick } = item;
    const answered = pick != null;
    const right = items.filter(isRight).length;
    const done = items.filter(it => it.pick != null).length;
    const s = q.section;
    const origin = run.key === 'mix'
      ? `${badge(q.quiz.official)} <span>${esc(q.quiz.title)}${s.title ? ' · ' + esc(s.title) : ''} · Q${q.n}</span>`
      : [s.title && esc(s.title), q.label && `Question ${esc(q.label)}`].filter(Boolean).map(t => `<span>${t}</span>`).join('<span>·</span>');

    if (q.open) return renderOpen(item, origin, right, done);
    const opts = order.map((oi, k) => {
      let cls = 'opt';
      if (answered) {
        if (oi === q.answer) cls += ' correct';
        else if (oi === pick) cls += ' wrong';
        else cls += ' dim';
      }
      return `<li><button class="${cls}" data-action="pick" data-oi="${oi}" ${answered ? 'disabled' : ''}>
        <kbd>${isTF(q) ? q.options[oi][0] : LETTERS[k]}</kbd><span>${md(q.options[oi])}</span></button></li>`;
    }).join('');

    let feedback = '';
    if (answered) {
      const ok = pick === q.answer;
      const letter = isTF(q) ? '' : LETTERS[order.indexOf(q.answer)] + '. ';
      feedback = `<div class="feedback" role="status">
        <p class="verdict ${ok ? 'ok' : 'bad'}">${ok ? '✓ Correct' : `✗ Not quite. The answer is ${letter}${md(q.options[q.answer])}`}</p>
        ${q.explanation.length ? paras(q.explanation) : '<p><em>No explanation was given for this one.</em></p>'}
      </div>`;
    }
    const last = i === items.length - 1;

    app.innerHTML = `
      <section class="run">
        <div class="run-head">
          <a class="back" href="#/">← All quizzes</a>
          <div class="run-title">${run.official == null ? '' : badge(run.official)}<h1>${esc(run.title)}</h1></div>
          ${runMeta(right, done)}
        </div>
        <article class="panel qcard">
          ${origin ? `<p class="qsection">${origin}</p>` : ''}
          ${s.note.map(n => `<p class="qnote">${md(n)}</p>`).join('')}
          ${sectionImage(s)}
          <div class="qtext">${rich(q.text)}</div>
          ${extras(q)}
          <ol class="opts">${opts}</ol>
          ${feedback}
          <div class="qfoot">
            <span class="hint">${answered ? 'Press <kbd>Enter</kbd> to continue' : `Press <kbd>1</kbd>–<kbd>${order.length}</kbd> to answer`}</span>
            <span>
              ${i > 0 ? '<button class="btn ghost" data-action="prev">← Back</button>' : ''}
              <button class="btn" data-action="next" ${answered ? '' : 'disabled'}>${last ? 'See results' : 'Next →'}</button>
            </span>
          </div>
        </article>
      </section>`;
    if (answered) app.querySelector('[data-action="next"]').focus({ preventScroll: true });
  }

  function runMeta(right, done) {
    const shuf = run.quizId != null && run.full
      ? `<button class="shuf" data-action="reshuffle" title="Restart with the questions in a new random order">🔀 ${run.shuffled ? 'Reshuffle' : 'Shuffle'}</button>` : '';
    return `<div class="run-meta"><span>Question ${run.i + 1} of ${run.items.length}${run.shuffled ? ' · shuffled' : ''}</span>${shuf}<span>Score ${right} / ${done}</span></div>
      <div class="bar"><i style="width:${pct(done, run.items.length)}%"></i></div>`;
  }

  // Open-ended prompt: think, reveal the explanation, then grade yourself.
  function renderOpen(item, origin, right, done) {
    const { q, pick: pk } = item;
    const last = run.i === run.items.length - 1;
    let body;
    if (!item.revealed) {
      body = `<div class="qfoot"><span class="hint">Answer it in a few sentences first, then press <kbd>Space</kbd></span>
        <span>${run.i > 0 ? '<button class="btn ghost" data-action="prev">← Back</button> ' : ''}<button class="btn" data-action="reveal">Reveal explanation</button></span></div>`;
    } else {
      body = `<div class="feedback">${paras(q.explanation)}</div>
        <div class="selfgrade" role="group" aria-label="Grade yourself">
          <span>How did you do?</span>
          <button class="btn ghost ${pk === 'got' ? 'on-ok' : ''}" data-action="grade" data-g="got">✓ Got it <kbd>Y</kbd></button>
          <button class="btn ghost ${pk === 'miss' ? 'on-bad' : ''}" data-action="grade" data-g="miss">✗ Missed it <kbd>N</kbd></button>
        </div>
        <div class="qfoot"><span class="hint">${pk ? 'Press <kbd>Enter</kbd> to continue' : 'Grade yourself to continue'}</span>
          <span>${run.i > 0 ? '<button class="btn ghost" data-action="prev">← Back</button> ' : ''}<button class="btn" data-action="next" ${pk ? '' : 'disabled'}>${last ? 'See results' : 'Next →'}</button></span></div>`;
    }
    app.innerHTML = `
      <section class="run">
        <div class="run-head">
          <a class="back" href="#/">← All quizzes</a>
          <div class="run-title">${run.official == null ? '' : badge(run.official)}<h1>${esc(run.title)}</h1></div>
          ${runMeta(right, done)}
        </div>
        <article class="panel qcard">
          ${origin ? `<p class="qsection">${origin}</p>` : ''}
          <div class="qtext">${rich(q.text)}</div>
          ${extras(q)}
          ${body}
        </article>
      </section>`;
    const sel = pk ? '[data-action="next"]' : item.revealed ? null : '[data-action="reveal"]';
    const focus = sel && app.querySelector(sel);
    if (focus) focus.focus({ preventScroll: true });
  }

  function pick(oi) {
    const item = run.items[run.i];
    if (item.pick != null) return;
    item.pick = oi;
    renderRun();
  }

  function next() {
    if (run.items[run.i].pick == null) return;
    if (run.i < run.items.length - 1) run.i++;
    else finish();
    renderRun();
    window.scrollTo(0, 0);
  }

  function finish() {
    run.done = true;
    const right = run.items.filter(isRight).length;
    if (run.full) {
      const prev = scores[run.quizId];
      if (!prev || right > prev.best) scores[run.quizId] = { best: right, total: run.items.length };
      store.set('scores', scores);
    }
  }

  // ---------------------------------------------------------------- results
  function renderResults() {
    view = 'results';
    const right = run.items.filter(isRight).length;
    const total = run.items.length;
    const missed = total - right;
    const p = pct(right, total);
    const msg = p === 100 ? 'Perfect run.' : p >= 80 ? 'Strong. Review the misses below.' : p >= 50 ? 'Getting there. The misses are worth a second read.' : 'Worth another pass after re-reading the explanations.';

    const review = run.items.map((it, k) => {
      const { q, pick: pk } = it;
      const ok = isRight(it);
      const src = run.key === 'mix' ? `<p class="src">${esc(q.quiz.title)} · Q${q.n}</p>` : '';
      return `<li class="${ok ? 'ok' : 'bad'}"><details class="panel" ${ok ? '' : 'open'}>
        <summary><span class="mark">${ok ? '✓' : '✗'} ${k + 1}.</span>${md(q.text.split('\n\n')[0])}</summary>
        <div class="ans">${src}
          ${q.open ? `<p class="${ok ? 'right' : 'yours'}">You marked this ${ok ? 'as got it' : 'as missed'}.</p>` : `
          ${ok ? '' : `<p class="yours">Your answer: ${md(q.options[pk])}</p>`}
          <p class="right">Correct: ${md(q.options[q.answer])}</p>`}
          ${paras(q.explanation)}
        </div></details></li>`;
    }).join('');

    app.innerHTML = `
      <a class="back" href="#/">← All quizzes</a>
      <section class="panel score">
        <p class="eyebrow">${esc(run.title)}</p>
        <p class="big">${right} / ${total}</p>
        <p class="pct">${p}% · ${msg}</p>
        <div class="actions">
          ${missed ? `<button class="btn" data-action="retry-missed">Retry the ${missed} missed</button>` : ''}
          <button class="btn ${missed ? 'ghost' : ''}" data-action="retake">${run.key === 'mix' ? 'New mixed set' : 'Retake quiz'}</button>
          ${run.key === 'mix' ? '' : '<button class="btn ghost" data-action="reshuffle">🔀 Retake shuffled</button>'}
          <a class="btn ghost" href="#/">All quizzes</a>
        </div>
      </section>
      <h2 class="section-title">Review</h2>
      <ol class="review">${review}</ol>`;
  }

  // ---------------------------------------------------------------- browse
  function renderBrowse(z) {
    view = 'browse';
    const body = z.sections.map(s => `
      ${s.title ? `<h2 class="section-title">${esc(s.title)}</h2>` : ''}
      ${s.note.map(n => `<p class="qnote">${md(n)}</p>`).join('')}
      ${sectionImage(s)}
      ${s.questions.map(q => `
        <article class="panel bq">
          <div class="qtext"><span class="qn">${q.label ? q.n : q.n + '.'}</span>${rich(q.text)}</div>
          ${extras(q)}
          ${q.open ? '' : `<ol>${q.options.map((o, i) => `<li class="${i === q.answer ? 'is-answer' : ''}"><b>${LETTERS[i]}</b><span>${md(o)}</span></li>`).join('')}</ol>`}
          <details data-reveal><summary>${q.open ? 'Show explanation' : 'Show answer'}</summary>
            ${q.open ? '' : `<p><strong>${LETTERS[q.answer]}. ${md(q.options[q.answer])}</strong></p>`}${paras(q.explanation)}
          </details>
        </article>`).join('')}`).join('');

    app.innerHTML = `
      <a class="back" href="#/">← All quizzes</a>
      <div class="browse-head">
        <div>${badge(z.official)}<h1>${esc(z.title)}</h1><p class="qnote">${esc(z.subtitle)} · ${z.all.length} questions · source <code>${esc(z.origin)}</code></p>
          ${z.about ? `<div class="about">${paras(z.about)}</div>` : ''}</div>
        <div class="actions"><button class="btn ghost" data-action="reveal-all">Reveal all</button> <a class="btn" href="#/quiz/${z.id}">Take this quiz</a></div>
      </div>
      ${body}`;
  }

  function syncReveal(d) { d.closest('.bq').classList.toggle('revealed', d.open); }

  // ---------------------------------------------------------------- events
  app.addEventListener('click', e => {
    const el = e.target.closest('[data-action]');
    if (!el) return;
    const a = el.dataset.action;
    if (a === 'pick') pick(+el.dataset.oi);
    else if (a === 'next') next();
    else if (a === 'reveal') { run.items[run.i].revealed = true; renderRun(); }
    else if (a === 'grade') { run.items[run.i].pick = el.dataset.g; renderRun(); }
    else if (a === 'prev') { run.i--; renderRun(); }
    else if (a === 'filter') { settings.filter = el.dataset.f; saveSettings(); renderHome(); }
    else if (a === 'mix') startMix();
    else if (a === 'reshuffle') reshuffle();
    else if (a === 'retake') {
      if (run.key === 'mix') startMix(); else startQuiz(byId[run.quizId], byId[run.quizId].all, !!run.shuffled);
    } else if (a === 'retry-missed') {
      const missed = run.items.filter(it => !isRight(it)).map(it => it.q);
      if (run.key === 'mix') { makeRun('mix', run.title + ' · missed', run.official, missed); renderRun(); }
      else { const z = byId[run.quizId]; makeRun('quiz:' + z.id, z.title + ' · missed', z.official, missed, { quizId: z.id }); renderRun(); }
      window.scrollTo(0, 0);
    } else if (a === 'reveal-all') {
      const all = [...app.querySelectorAll('details[data-reveal]')];
      const open = !all.every(d => d.open);
      all.forEach(d => { d.open = open; syncReveal(d); });
      el.textContent = open ? 'Hide all' : 'Reveal all';
    }
  });

  app.addEventListener('toggle', e => { if (e.target.matches('details[data-reveal]')) syncReveal(e.target); }, true);

  app.addEventListener('change', e => {
    const t = e.target;
    if (t.id === 'shuffle-q') settings.shuffleQ = t.checked;
    else if (t.id === 'shuffle-o') settings.shuffleO = t.checked;
    else if (t.id === 'mix-src') settings.mixSrc = t.value;
    else if (t.id === 'mix-n') settings.mixN = t.value;
    else return;
    saveSettings();
  });

  document.addEventListener('keydown', e => {
    if (view !== 'run' || e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.target.matches('input, select, textarea')) return;
    const item = run.items[run.i];
    if (item.q.open) return openKeys(e, item);
    const n = item.order.length;
    const key = e.key.toLowerCase();
    let k = -1;
    if (/^[1-9]$/.test(key)) k = +key - 1;
    else if (/^[a-h]$/.test(key) && !isTF(item.q)) k = LETTERS.indexOf(key.toUpperCase());
    else if (isTF(item.q) && (key === 't' || key === 'f')) k = key === 't' ? 0 : 1;
    if (k >= 0 && k < n && item.pick == null) { e.preventDefault(); pick(item.order[k]); return; }
    if ((e.key === 'Enter' || e.key === 'ArrowRight') && item.pick != null) {
      if (e.key === 'Enter' && e.target.matches('button, a')) return; // let the focused control handle it
      e.preventDefault(); next();
    } else if (e.key === 'ArrowLeft' && run.i > 0) { run.i--; renderRun(); }
  });

  function openKeys(e, item) {
    const key = e.key.toLowerCase();
    if (!item.revealed && (key === ' ' || (key === 'enter' && !e.target.matches('button, a')))) {
      e.preventDefault(); item.revealed = true; renderRun();
    } else if (item.revealed && (key === 'y' || key === 'n')) {
      item.pick = key === 'y' ? 'got' : 'miss'; renderRun();
    } else if ((key === 'enter' || key === 'arrowright') && item.pick) {
      if (key === 'enter' && e.target.matches('button, a')) return;
      e.preventDefault(); next();
    } else if (key === 'arrowleft' && run.i > 0) { run.i--; renderRun(); }
  }

  document.getElementById('theme').addEventListener('click', () => {
    const root = document.documentElement;
    const dark = root.dataset.theme ? root.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
    root.dataset.theme = dark ? 'light' : 'dark';
    store.set('theme', root.dataset.theme);
  });

  document.getElementById('generated').textContent = `Updated ${DATA.generated}`;
  window.addEventListener('hashchange', route);
  route();
})();
