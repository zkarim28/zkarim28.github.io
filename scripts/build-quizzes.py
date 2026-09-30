#!/usr/bin/env python3
"""Collate the ECE 6765 quizzes into one data file and one Markdown file.

Reads the quiz sources from the zk67 course repo and writes:
  assets/quiz/quizzes.js      data for quiz.html (window.QUIZ_DATA)
  assets/quiz/<figures>       any figures the quizzes reference
  <zk67>/all-quizzes.md       every quiz in one document

Usage: python3 scripts/build-quizzes.py [path/to/zk67]
"""
import datetime
import hashlib
import json
import re
import shutil
import sys
from pathlib import Path

SITE = Path(__file__).resolve().parent.parent
SRC = Path(sys.argv[1]).expanduser() if len(sys.argv) > 1 else Path.home() / 'Documents/ece6765/zk67'
OUT_DIR = SITE / 'assets/quiz'
MD_OUT = SRC / 'all-quizzes.md'

ANSWER_SECTIONS = re.compile(r'^(Answers|Lecture Quiz Answers|Explanations|Answers at a glance)\b')
OPTION = re.compile(r'^-\s+(?:([a-d])\)\s+)?(.*)$')
LETTER = re.compile(r'^([a-d])(?:\)\s*|$)(.*)$', re.S)


def clean(s):
    s = re.sub(r'\s+', ' ', s).replace('\\times', '×').strip()
    return s.rstrip('}').strip()  # topic-quiz-1 has stray LaTeX braces


def paragraphs(lines):
    out, cur = [], []
    for line in lines + ['']:
        if line.strip():
            cur.append(line)
        elif cur:
            out.append(clean(' '.join(cur)))
            cur = []
    return out


LIST_ITEM = re.compile(r'^(\s*)(?:-|\d+\.)\s+')


def blocks(lines):
    """Like paragraphs(), but keeps bulleted/numbered lists as one block of '- item' lines (two levels deep)."""
    out, cur, is_list = [], [], False
    for line in lines + ['']:
        m = LIST_ITEM.match(line)
        if not line.strip() or (m and cur and not is_list):
            if cur:
                out.append('\n'.join(cur) if is_list else clean(' '.join(cur)))
            cur, is_list = [], False
            if not line.strip():
                continue
        if m:
            is_list = True
            cur.append(('  ' if len(m.group(1)) >= 2 else '') + clean(line))
        elif is_list:
            cur[-1] += ' ' + clean(line)
        else:
            cur.append(line)
    return out


# ---------------------------------------------------------------- parsing

def parse_quiz_file(path):
    """Split a quiz Markdown file into title, preamble, sections of raw question blocks, and answer lines."""
    title, pre, sections, answers = None, [], [], []
    q, in_answers = None, False
    for line in path.read_text().splitlines():
        if line.startswith('## '):
            head, q = line[3:].strip(), None
            in_answers = bool(ANSWER_SECTIONS.match(head))
            if not in_answers:
                sections.append({'title': None if head == 'Questions' else head, 'note': [], 'qs': []})
            continue
        if in_answers:
            answers.append(line)
        elif line.startswith('# '):
            title = line[2:].strip()
        elif line.startswith('### '):
            if not sections:
                sections.append({'title': None, 'note': [], 'qs': []})
            q = {'head': line[4:].strip(), 'lines': []}
            sections[-1]['qs'].append(q)
        elif q:
            q['lines'].append(line)
        else:
            (sections[-1]['note'] if sections else pre).append(line)
    return title, pre, sections, answers


def parse_question(block):
    m = re.match(r'(\d+)\.\s+(.*)', block['head'])
    key, text = (m.group(1), [m.group(2)]) if m else (block['head'], [])
    opts, ans, expl, state, image = [], None, [], 'text', None
    for line in block['lines']:
        mi = re.match(r'!\[(.*?)\]\((.*?)\)\s*$', line.strip()) if state == 'text' else None
        if mi:
            image = (mi.group(1), mi.group(2))
        elif state == 'expl':
            expl.append(line)
        elif line.startswith('**Answer:**'):
            ans, state = line[len('**Answer:**'):].strip(), 'expl'
        elif OPTION.match(line):
            opts.append(OPTION.match(line).group(2))
            state = 'opts'
        elif state == 'opts' and line.startswith(' ') and line.strip():
            opts[-1] += ' ' + line.strip()
        elif state == 'text':
            text.append(line)
    return key, clean(' '.join(text)), [clean(o) for o in opts], ans, paragraphs(expl), image


def parse_answer_list(lines):
    """'- **key:** answer' lines, with indented continuation lines."""
    out, key = {}, None
    for line in lines:
        m = re.match(r'^-\s+\*\*(.+?):\*\*\s*(.*)', line)
        if m:
            key = m.group(1)
            out[key] = m.group(2)
        elif key and line.startswith(' ') and line.strip():
            out[key] += ' ' + line.strip()
    return out


def parse_answer_key(path):
    """'### N. question' blocks, each with '**Answer:** ...' followed by an explanation."""
    out = {}
    for block in re.split(r'\n### ', path.read_text())[1:]:
        head, _, body = block.partition('\n')
        m = re.search(r'\*\*Answer:\*\*\s*(.*)', body)
        out[head.split('.')[0]] = (m.group(1).strip(), paragraphs(body[m.end():].splitlines()))
    return out


def resolve(ans, opts, where):
    """Return (index of the correct option, any trailing explanation in the answer string)."""
    ans = clean(ans)
    m = LETTER.match(ans)
    if m:
        idx, rest = 'abcd'.index(m.group(1)), m.group(2).strip()
        opt = opts[idx]
        extra = rest[len(opt):].lstrip(' —-').strip() if rest.lower().startswith(opt.lower()) else ''
        return idx, extra
    for i, o in enumerate(opts):
        if o.lower() == ans.lower():
            return i, ''
    for i, o in enumerate(opts):
        if o.lower().startswith(ans.lower()) or ans.lower().startswith(o.lower()):
            return i, ''
    raise ValueError(f'{where}: cannot match answer {ans!r} to options {opts}')


def load(meta, path, key_file=None):
    path = SRC / path
    _, _, raw_sections, answer_lines = parse_quiz_file(path)
    listed = parse_answer_list(answer_lines)
    keyed = parse_answer_key(SRC / key_file) if key_file else {}
    sections = []

    def site_image(alt, rel):
        src = path.parent / rel
        site_name = f"{meta['id']}-{src.name}"
        OUT_DIR.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(src, OUT_DIR / site_name)
        return {'alt': alt, 'src': f'assets/quiz/{site_name}', 'md': str(src.relative_to(SRC))}

    for s in raw_sections:
        note, image = [], None
        for line in s['note']:
            mi = re.match(r'!\[(.*?)\]\((.*?)\)', line.strip())
            if mi:
                image = site_image(mi.group(1), mi.group(2))
            else:
                note.append(line)
        questions = []
        for block in s['qs']:
            key, text, opts, ans, expl, qimg = parse_question(block)
            if ans is None:
                ans = listed.get(key) or keyed[key][0]
            if not expl and key in keyed:
                expl = keyed[key][1]
            idx, extra = resolve(ans, opts, f'{path.name} Q{key}')
            if extra and not expl:
                expl = [extra]
            q = {'text': text, 'options': opts, 'answer': idx, 'explanation': expl}
            if qimg:
                q['image'] = site_image(*qimg)
            questions.append(q)
        sections.append({'title': s['title'], 'note': paragraphs(note), 'image': image, 'questions': questions})
    return {**meta, 'origin': str(path.relative_to(SRC)) + (f' + {key_file}' if key_file else ''), 'sections': sections}


# ---------------------------------------------------------------- Paper Quiz 2 (released as PDFs)

LEISERSON = ('Charles E. Leiserson et al., "There\'s Plenty of Room at the Top: What Will Drive Computer '
             'Performance After Moore\'s Law?," *Science* 368, eaam9744, 2020.')
TF = ['TRUE', 'FALSE']
RETRO = ('Retrospective check from 2026: parts of the vision clearly came through, especially the growth of '
         'accelerators and domain-specific AI hardware, but "all" is too strong. Semiconductor scaling and packaging '
         'also continued to advance, and Top-level gains remain uneven rather than a fully realized, universal '
         'replacement for Moore\'s law.')


def mcq(text, options, answer, explanation):
    return {'text': text, 'options': options, 'answer': answer, 'explanation': [explanation]}


PAPER_QUIZ_2 = {
    'origin': 'paper-quiz/2/quiz-paper2-A.pdf, quiz-paper2-B.pdf + answer-key.md',
    'sections': [
        {'title': 'Version A', 'note': [LEISERSON], 'image': None, 'questions': [
            mcq('In the paper\'s terminology, what is the "Bottom" of the computing stack?',
                ['Software, algorithms, and hardware architecture.',
                 'Semiconductor physics and silicon-fabrication technology.',
                 'Application domains such as machine learning and security.',
                 'Large reusable components such as browsers and databases.'], 1,
                'Abstract and introduction: the paper uses "Bottom" for semiconductor physics and silicon-fabrication '
                'technology, contrasting it with the "Top" of software, algorithms, and hardware architecture.'),
            mcq('What problem motivates the paper\'s search for performance gains at the "Top"?',
                ['Clock speeds will keep rising, but software cannot use them.',
                 'Transistor miniaturization is stalling, so Moore\'s-law-style gains are no longer a reliable performance source.',
                 'Algorithms have stopped improving for all important problems.',
                 'General-purpose processors have become too cheap to justify specialization.'], 1,
                'Introduction and conclusion: miniaturization is reaching practical and economic limits, so Bottom '
                'improvements will no longer provide the predictable broad-based gains society received from Moore\'s law.'),
            mcq('What does the matrix-multiplication example mainly illustrate?',
                ['Python is unusable for numerical programs after Moore\'s law.',
                 'Changing languages alone gives essentially all available speedup.',
                 'Performance engineering can reveal large gains by removing bloat and tailoring software to hardware.',
                 'Matrix multiplication no longer benefits from hardware advances.'], 2,
                'Software section and Table 1: the 4096-by-4096 matrix-multiplication example moves from naive Python to '
                'optimized AVX code, showing the value of removing bloat and tailoring code to parallelism, locality, '
                'vectorization, and special instructions.'),
            mcq('Which three areas make up the paper\'s main opportunity at the "Top"?',
                ['Software performance engineering, algorithms, and hardware streamlining.',
                 'New lithography, new materials, and new fabrication plants.',
                 'More DRAM capacity, larger disks, and faster networks.',
                 'Serial performance, branch prediction, and deeper pipelines.'], 0,
                'Abstract, review summary, and conclusion: the paper\'s Top consists of software performance '
                'engineering, algorithm development, and hardware streamlining.'),
            mcq('The paper argues that hardware streamlining is most useful when an application has enough parallelism '
                'and locality to keep the added computing engines productive.', TF, 0,
                'Hardware architecture section: streamlining mainly provides area for more parallel circuitry, so the '
                'greatest benefit accrues to applications with ample parallelism; locality is also needed to avoid '
                'becoming memory bound.'),
            mcq('The paper was published in 2020. Looking back from 2026, all of its predictions and visions have fully '
                'come through.', TF, 1, RETRO),
        ]},
        {'title': 'Version B', 'note': [LEISERSON], 'image': None, 'questions': [
            mcq('Until roughly 2004, what made transistor scaling especially powerful for computer performance?',
                ['New transistors were smaller, faster, and more energy efficient.',
                 'DRAM latency fell faster than processor cycle time.',
                 'Software bloat disappeared as chips became denser.',
                 'GPUs replaced CPUs as the standard general-purpose processor.'], 0,
                'Introduction: until about 2004, new transistors were not only smaller, but also faster and more energy efficient.'),
            mcq('Why are changes at the "Top" harder to exploit than transistor scaling at the "Bottom"?',
                ['The Top has only one layer, so it has no room for specialization.',
                 'Many Top-level parts depend on each other, so improving one part can force other parts to adapt.',
                 'Software and algorithms cannot affect measured performance.',
                 'Hardware architecture is independent of software interfaces.'], 1,
                'Introduction: Top-level layers often depend on one another, so a performance-motivated change in one '
                'part can require other parts to adapt or tolerate the change.'),
            mcq('What gap does the paper identify between algorithm design and modern hardware?',
                ['Algorithms usually assume quantum computers are already available.',
                 'Most algorithms are still designed for a serial random-access machine, which misses parallelism, '
                 'vector units, and cache hierarchy effects.',
                 'Algorithmic models are too detailed for architects to implement.',
                 'Autotuning has eliminated the need for human algorithm designers.'], 1,
                'Algorithms section: many algorithms still assume the serial random-access machine model and therefore '
                'miss modern hardware features such as parallel cores, vector units, and caches. Existing models often '
                'cover only one feature at a time.'),
            mcq('What are the two hardware-streamlining strategies the paper expects to dominate?',
                ['Deeper branch predictors and larger reorder buffers.',
                 'Processor simplification and domain specialization.',
                 'Faster clocks and higher supply voltages.',
                 'Mandatory GPUs and larger instruction sets.'], 1,
                'Hardware architecture section: after embracing parallelism, the two dominant streamlining strategies '
                'are processor simplification and domain specialization.'),
            mcq('Big system components are promising because a single owner can coordinate large internal changes, '
                'pool costs and benefits, and preserve the external interface.', TF, 0,
                'Big components section: web browsers, databases, operating systems, microprocessors, GPUs, compilers, '
                'and similar components give a single owner enough control to coordinate large internal changes, pool '
                'costs and benefits, and interact with the outside world through a stable interface.'),
            mcq('The paper was published in 2020. Looking back from 2026, all of its predictions and visions have fully '
                'come through.', TF, 1, RETRO),
        ]},
    ],
}


# ---------------------------------------------------------------- Prelim study guide

PRELIM_QID = re.compile(r'^\*\*(\d+\.\d+)\*\*\s*(.*)')
PRELIM_EID = re.compile(r'^\*\*(\d+\.\d+)(.*?)\*\*\s*(.*)')
PRELIM_OPT = re.compile(r'^-\s+\(([a-d])\)\s+(.*)')


def copy_asset(src, prefix):
    name = f'{prefix}-{src.name}'
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(src, OUT_DIR / name)
    return {'src': f'assets/quiz/{name}', 'md': str(src.relative_to(SRC))}


def parse_prelim(folder, prefix):
    """Split a prelim study guide into its parts: {'1': [sections], '2': [sections]}, plus the 'About' blocks."""
    parts, about, part, sec, q = {}, [], None, None, None
    for line in (folder / f'{prefix}-study-guide.md').read_text().splitlines():
        if line.startswith('## '):
            m = re.match(r'## Part (\d)', line)
            part, q = (m.group(1) if m else None), None
            sec = None
            if line.startswith('## About'):
                part = 'about'
            continue
        if part == 'about':
            about.append(line)
            continue
        if part is None:
            continue
        if line.startswith('### ') or sec is None:
            sec = {'title': line[4:].strip() if line.startswith('### ') else None, 'note': [], 'qs': []}
            parts.setdefault(part, []).append(sec)
            if line.startswith('### '):
                continue
        if line.strip() == '---':
            q = None
        elif PRELIM_QID.match(line):
            m = PRELIM_QID.match(line)
            q = {'id': m.group(1), 'lines': [m.group(2)]}
            sec['qs'].append(q)
        else:
            (q['lines'] if q else sec['note']).append(line)

    explained, key = {}, None
    for line in (folder / f'{prefix}-study-guide-explanations.md').read_text().splitlines():
        m = PRELIM_EID.match(line)
        if m:
            key = m.group(1)
            explained[key] = {'head': m.group(2).strip(), 'lines': [m.group(3)]}
        elif line.startswith('#') or line.strip() == '---':
            key = None
        elif key:
            explained[key]['lines'].append(line)
    return parts, blocks(about), explained


def prelim_question(q, exp, folder, prefix, graded):
    text, opts, image, files = [], [], None, []
    for line in q['lines']:
        mi = re.match(r'!\[(.*?)\]\((.*?)\)', line.strip())
        mo = PRELIM_OPT.match(line) if graded else None
        if mi:
            image = {'alt': mi.group(1), **copy_asset(folder / mi.group(2), prefix)}
        elif mo:
            opts.append(clean(mo.group(2)))
        else:
            text.append(line)
    text = '\n\n'.join(blocks(text))
    for name in re.findall(r'`([\w.-]+\.(?:csv|txt|json))`', text):
        if (folder / name).exists():
            files.append({'name': name, **copy_asset(folder / name, prefix)})
    head = exp['head'].lstrip(' —').strip()
    if graded:
        letter = re.search(r'\(([a-d])\)', head)
        if not opts:
            opts = ['TRUE', 'FALSE']
            answer = 0 if head.lower().startswith('true') else 1
        else:
            answer = 'abcd'.index(letter.group(1))
        explanation = blocks(exp['lines'])
    else:
        answer = None
        explanation = blocks([f'**{head}** {exp["lines"][0]}'] + exp['lines'][1:])
    out = {'label': q['id'], 'text': text, 'options': opts, 'answer': answer, 'explanation': explanation}
    if not graded:
        out['open'] = True
    if image:
        out['image'] = image
    if files:
        out['files'] = files
    return out


def prelim(num):
    folder, prefix = SRC / 'prelim' / str(num), f'prelim{num}'
    parts, about, explained = parse_prelim(folder, prefix)
    origin = f'prelim/{num}/{prefix}-study-guide.md + {prefix}-study-guide-explanations.md'

    def sections(part, graded):
        return [{'title': s['title'], 'note': paragraphs(s['note']), 'image': None,
                 'questions': [prelim_question(q, explained[q['id']], folder, prefix, graded) for q in s['qs']]}
                for s in parts[part] if s['qs']]

    covers = ('Topics 1 through 3.2 plus the six assigned papers: Horowitz, Leiserson, Web Search for a Planet, '
              'Transformer Inference, Roofline, The Tail at Scale.')
    return [
        {'id': f'prelim-{num}-exam', 'official': True, 'kind': 'exam', 'title': f'Prelim {num}: Sample Exam',
         'subtitle': 'Study guide Part 2 · exam format (T/F + multiple choice)', 'covers': covers,
         'about': about, 'origin': origin, 'sections': sections('2', True)},
        {'id': f'prelim-{num}-concepts', 'official': True, 'kind': 'exam', 'open': True,
         'title': f'Prelim {num}: Concept Review',
         'subtitle': 'Study guide Part 1 · open-ended, self-graded', 'covers': covers,
         'about': about, 'origin': origin, 'sections': sections('1', False)},
    ]


# ---------------------------------------------------------------- catalogue

def quizzes():
    return [
        # Official: released by course staff (Mohammad Alian) into the zk67 repo.
        *prelim(1),
        load({'id': 'combo-1', 'official': True, 'kind': 'combo', 'title': 'Combo Quiz 1',
              'subtitle': 'Topic Quiz 2 + Paper Quiz 3',
              'covers': 'Datacenter case study, chiplets and the data-delivery gap, the WSC software stack; '
                        'Austin et al., "All About Transformer Inference".'},
             'combo-quiz/1/combo-quiz-1.md'),
        load({'id': 'combo-2', 'official': True, 'kind': 'combo', 'title': 'Combo Quiz 2',
              'subtitle': 'Topic Quiz 3 + Paper Quiz 4',
              'covers': 'Web search, provisioning, AI workloads; Williams, Waterman & Patterson, "Roofline".'},
             'combo-quiz/2/combo-quiz-2.md'),
        load({'id': 'combo-3', 'official': True, 'kind': 'combo', 'title': 'Combo Quiz 3',
              'subtitle': 'Topic Quiz 4 + Paper Quiz 5',
              'covers': 'Transformer inference: MoE, serving metrics, serving optimisations; '
                        'Dean & Barroso, "The Tail at Scale".'},
             'combo-quiz/3/combo-quiz-3.md'),
        load({'id': 'topic-1', 'official': True, 'kind': 'topic', 'title': 'Topic Quiz 1',
              'subtitle': 'Warehouse-scale computers (Topic 1)',
              'covers': 'WSCs, PUE, the power wall, flash vs DRAM, tail latency, TPUs, microsecond stalls, '
                        'datacenter tax, chiplets, disaggregation.'},
             'topic-quiz/1/topic-quiz-1.md'),
        load({'id': 'topic-5', 'official': True, 'kind': 'topic', 'title': 'Topic Quiz 5',
              'subtitle': 'Topic 2 (RAG) + Topic 3 (performance)',
              'covers': 'Retrieval-augmented generation: embeddings, vector search, cost of retrieved context; '
                        'throughput under a latency objective, tail latency, fan-out. Lecture only, no paper section.'},
             'topic-quiz/5/topic-quiz-5.md'),
        {'id': 'paper-2', 'official': True, 'kind': 'paper', 'title': 'Paper Quiz 2',
         'subtitle': 'Versions A and B',
         'covers': 'Leiserson et al., "There\'s Plenty of Room at the Top" (Science 2020).', **PAPER_QUIZ_2},

        # Self-made practice quizzes: never released by staff.
        load({'id': 'practice-tail', 'official': False, 'kind': 'practice', 'title': 'Practice: The Tail at Scale',
              'subtitle': 'Paper 6 + Topic 2 serving supplement',
              'covers': 'Hedged/tied requests, micro-partitions, canaries; training, transformers, MoE, batching, '
                        'paged KV cache, speculative decoding, parallelism.'},
             'paper-quiz/3/quiz-paper6.md', 'paper-quiz/3/answer-key.md'),
        load({'id': 'practice-lecture', 'official': False, 'kind': 'practice',
              'title': 'Practice: RAG, Tails & Latency Numbers',
              'subtitle': 'End of Topic 2 / start of Topic 3',
              'covers': 'RAG, cosine similarity, IVF/HNSW/PQ, sources of variability, loaded vs unloaded latency, '
                        'the latency-numbers table.'},
             'paper-quiz/3/quiz-lecture-notes.md'),
        load({'id': 'practice-profiling', 'official': False, 'kind': 'practice',
              'title': 'Practice: Profiling Hyperscale Big Data',
              'subtitle': 'Paper 7, Gonzalez et al., ISCA \'23',
              'covers': 'Spanner/BigTable/BigQuery time breakdowns, datacenter and system taxes, IPC/MPKI, '
                        'accelerator limit studies, chained acceleration.'},
             'paper-quiz/4/quiz-paper7.md', 'paper-quiz/4/answer-key.md'),
        load({'id': 'practice-energy', 'official': False, 'kind': 'practice',
              'title': 'Practice: The Case for Energy-Proportional Computing',
              'subtitle': 'Paper 8, Barroso & Hölzle, IEEE Computer 2007',
              'covers': 'Server utilization and idle power, efficiency vs utilization, dynamic range by component, '
                        'active vs inactive low-power modes, the 90%-dynamic-range payoff. '
                        '6 multiple choice + 6 true/false, with the paper\'s figures.'},
             'paper-quiz/5/quiz-paper8.md', 'paper-quiz/5/answer-key.md'),
    ]


# ---------------------------------------------------------------- Markdown

GROUPS = [
    ('exam', True, 'Prelim 1 exam prep (released study guide)'),
    ('combo', True, 'Combo quizzes (topic quiz + paper quiz, same sitting)'),
    ('topic', True, 'Topic quizzes'),
    ('paper', True, 'Paper quizzes'),
    ('practice', False, None),
]
BADGE = {True: '🏫 OFFICIAL', False: '✍️ SELF-MADE'}


def count(z):
    return sum(len(s['questions']) for s in z['sections'])


def markdown(qs):
    today = datetime.date.today().isoformat()
    total = sum(count(z) for z in qs)
    out = [
        '# ECE 6765 — All Quizzes',
        '',
        f'Every quiz from the course in one place: {len(qs)} quizzes, {total} questions. '
        'Answers are folded under each question so you can test yourself first.',
        '',
        '| Badge | Meaning |',
        '|---|---|',
        '| 🏫 **OFFICIAL** | Released by course staff into this repo (an in-class quiz with its official answers). |',
        '| ✍️ **SELF-MADE** | A practice quiz I wrote myself. Not from class, so treat the answers with more care. |',
        '',
        f'*Generated {today} by `scripts/build-quizzes.py` in the zkarim28.github.io repo. Edit the source quizzes, '
        'not this file, then rerun the script. It also feeds the interactive version at `quiz.html`.*',
        '',
        '## Contents',
        '',
        '| Quiz | Source | Covers | Qs |',
        '|---|---|---|---|',
    ]
    for z in qs:
        out.append(f"| [{z['title']}](#{z['id']}) — {z['subtitle']} | {BADGE[z['official']]} | {z['covers']} | {count(z)} |")
    out += ['', 'There is no Paper Quiz 1 in the repo, so it is not included.', '']

    out += ['---', '', '## 🏫 Official quizzes', '']
    for kind, official, heading in GROUPS:
        group = [z for z in qs if z['kind'] == kind and z['official'] == official]
        if not official:
            out += ['---', '', '## ✍️ Self-made practice quizzes', '',
                    '> These are my own practice quizzes, written from the papers and my lecture notes. '
                    'None of them came from class.', '']
        elif heading:
            out += [f'### {heading}', '']
        if group and group[0].get('about'):
            out += ['**About the prelim** (from the study guide):', '']
            for b in group[0]['about']:
                out += [b, '']
        for z in group:
            out += quiz_markdown(z)
    return '\n'.join(out).rstrip() + '\n'


def quiz_markdown(z):
    out = [f'<a id="{z["id"]}"></a>', '', f"#### {z['title']} — {z['subtitle']} · {BADGE[z['official']]}", '',
           f"> **Covers:** {z['covers']}  ", f"> **Source:** `{z['origin']}`", '']
    n = 0
    for s in z['sections']:
        if s['title']:
            out += [f"##### {s['title']}", '']
        for p in s['note']:
            out += [p, '']
        if s['image']:
            out += [f"![{s['image']['alt']}]({s['image']['md']})", '']
        for q in s['questions']:
            n += 1
            out += [f"**{q.get('label', n)}{'' if 'label' in q else '.'}** {q['text']}", '']
            if q.get('image'):
                out += [f"![{q['image']['alt']}]({q['image']['md']})", '']
            for f in q.get('files', []):
                out += [f"📎 Data file: [{f['name']}]({f['md']})", '']
            if q.get('open'):
                out += ['<details><summary>Explanation</summary>', '']
            else:
                out += [f"- **{'ABCD'[i]}.** {o}" for i, o in enumerate(q['options'])]
                out += ['', '<details><summary>Answer</summary>', '',
                        f"**{'ABCD'[q['answer']]}. {q['options'][q['answer']]}**", '']
            for p in q['explanation']:
                out += [p, '']
            out += ['</details>', '']
    return out


# ---------------------------------------------------------------- main

def stamp_versions():
    """Point quiz.html at ?v=<content hash> URLs so browsers fetch fresh quiz files after every rebuild."""
    page = SITE / 'quiz.html'
    html = page.read_text()
    for name in ('quizzes.js', 'quiz.js', 'quiz.css'):
        digest = hashlib.sha1((OUT_DIR / name).read_bytes()).hexdigest()[:10]
        html = re.sub(rf'assets/quiz/{re.escape(name)}(\?v=[0-9a-f]+)?"', f'assets/quiz/{name}?v={digest}"', html)
    page.write_text(html)


def main():
    qs = quizzes()
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    data = {'generated': datetime.date.today().isoformat(), 'quizzes': qs}
    (OUT_DIR / 'quizzes.js').write_text(
        '// Generated by scripts/build-quizzes.py — do not edit by hand.\n'
        f'window.QUIZ_DATA = {json.dumps(data, ensure_ascii=False, indent=1)};\n')
    MD_OUT.write_text(markdown(qs))
    stamp_versions()
    for z in qs:
        print(f"{'official' if z['official'] else 'self    '}  {z['id']:<20} {count(z):>3} questions")
    print(f'wrote {OUT_DIR / "quizzes.js"}\nwrote {MD_OUT}')


if __name__ == '__main__':
    main()
