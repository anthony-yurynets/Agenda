#!/usr/bin/env python3
"""Builds public/amc/: one JSON file per AMC test plus an index, for the mock
review on the AMC Prep page. Standard library only.

Sources
- AMC 10 (2000-2025, 53 tests): github.com/liyong03/amc10-atlas, scraped from
  the AoPS wiki. Statement HTML (with AoPS diagram images), answer key, and a
  topic label + one-line key idea per problem.
- AMC 12 (2000-2025, no 2021): huggingface.co/datasets/edev2000/amc12-full.
  LaTeX statements and answer keys, no diagrams. An AMC 12 problem that's
  also on the AMC 10 that year takes the AMC 10 entry's HTML, diagrams and
  topic. Those shared problems also cross-check the two answer keys; any
  disagreement is printed.
- Tests (or problems) neither dataset has: scripts/amc_extra.json. The four
  2021 AMC 12s were parsed from archived AoPS wiki pages on web.archive.org
  (the live wiki blocks scripts); the 2026 AMC 10A/12A and 2025 AMC 12A #25
  come from wiki.randommath.com via scripts/scrape_randommath.py, with their
  diagrams in public/amc/img/ and topics labelled by hand. Matched to the AMC 10 the same way.

Run: python3 scripts/build_amc_problems.py
"""
import html
import json
import os
import re
import sys
import urllib.request

ATLAS = 'https://raw.githubusercontent.com/liyong03/amc10-atlas/HEAD/data/amc10'
AMC12 = 'https://datasets-server.huggingface.co/rows?dataset=edev2000/amc12-full&config=default&split=train'
OUT = os.path.join(os.path.dirname(__file__), '..', 'public', 'amc')
EXTRA = os.path.join(os.path.dirname(__file__), 'amc_extra.json')

# The page's four topics (src/lib/amc.js TOPICS).
PREFIX = {'alg': 'algebra', 'cp': 'counting', 'nt': 'number_theory', 'geo': 'geometry'}
MISC = {'misc-calendar-clock': 'number_theory', 'misc-logic': 'counting', 'misc-games': 'counting', 'misc-process-simulation': 'counting', 'misc-magic-squares': 'counting'}


def get(url):
    req = urllib.request.Request(url, headers={'User-Agent': 'agenda-amc-build'})
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.load(r)


def topic_of(c):
    if not c:
        return None
    for label in [c['primary'], *c.get('secondary', [])]:
        pre = label.split('-')[0]
        if pre in PREFIX:
            return PREFIX[pre]
    return MISC.get(c['primary'], 'algebra')


def norm(s):
    """Comparable statement text: no tags, math delimiters, spacing or choices."""
    s = re.sub(r'<[^>]+>', ' ', s)
    s = html.unescape(s)
    s = re.split(r'\\textbf\{\s*\(A\)', s)[0]
    s = re.sub(r'[\s$\\{}~,.]+', '', s).lower()
    return s[:160]


def tex_to_html(q):
    paras = [p.strip() for p in re.split(r'\n\s*\n', q) if p.strip()]
    return ''.join(f'<p>{html.escape(p, quote=False)}</p>' for p in paras)


def test_meta(year, level, fall=False):
    """level: '10A', '10B', '10' (2000-01), '10P' (2002 practice), '12A' …"""
    tid = f"{year}{'F' if fall else ''}-{level}"
    label = f"AMC {level} {'Fall ' if fall else ''}{year}"
    page = f"{year}_{'Fall_' if fall else ''}AMC_{level}_Problems"
    return tid, label, page


def main():
    problems = get(f'{ATLAS}/problems.json')
    classes = get(f'{ATLAS}/classification.json')
    tests = {}

    def add(tid, label, page, year, entry):
        t = tests.setdefault(tid, {'id': tid, 'label': label, 'page': page, 'year': year, 'problems': []})
        t['problems'].append(entry)

    by_text = {}
    for p in problems:
        m = re.match(r'(\d{4})_(Fall_)?AMC_(10[ABP]?)$', p['test'])
        if not m:
            sys.exit(f"unexpected test {p['test']}")
        year, fall, level = int(m[1]), bool(m[2]), m[3]
        tid, label, page = test_meta(year, level, fall)
        c = classes.get(p['id'])
        entry = {'n': p['num'], 'answer': p['answer'], 'topic': topic_of(c), 'hint': (c or {}).get('key_idea', ''), 'html': p['html']}
        add(tid, label, page, year, entry)
        by_text.setdefault((year, norm(p['html'])), entry)

    rows, offset = [], 0
    while True:
        page = get(f'{AMC12}&offset={offset}&length=100')
        rows += [r['row'] for r in page['rows']]
        offset += 100
        if offset >= page['num_rows_total']:
            break

    shared, mismatches = 0, []
    for r in rows:
        m = re.match(r'(\d{4})([AB])-P(\d+)$', r['problem_id'])
        if not m:
            sys.exit(f"unexpected id {r['problem_id']}")
        year, form, n = int(m[1]), m[2], int(m[3])
        # 2000 and 2001 had a single AMC 12.
        level = '12' if year < 2002 else f'12{form}'
        tid, label, page = test_meta(year, level)
        answer = ''.join(re.findall(r'\b[A-E]\b', r['answer'])) or r['answer']
        twin = by_text.get((year, norm(r['question'])))
        if twin:
            shared += 1
            if twin['answer'] != answer:
                mismatches.append(f"{label} #{n}: AMC 12 key {answer}, AMC 10 key {twin['answer']}")
            entry = {**twin, 'n': n, 'answer': answer}
        else:
            entry = {'n': n, 'answer': answer, 'topic': None, 'hint': '', 'html': tex_to_html(r['question'])}
        add(tid, label, page, year, entry)

    with open(EXTRA) as f:
        extra = json.load(f)['tests']
    # AMC 10s first, so an extra AMC 12 can match an extra AMC 10 of its year.
    for name, entries in sorted(extra.items(), key=lambda kv: '_AMC_12' in kv[0]):
        m = re.match(r'(\d{4})_(Fall_)?AMC_(1[02][AB]?)$', name)
        year, fall, level = int(m[1]), bool(m[2]), m[3]
        tid, label, page = test_meta(year, level, fall)
        have = {e['n'] for e in tests.get(tid, {}).get('problems', [])}
        for e in entries:
            # A test a dataset already has only takes the problems it's missing.
            if e['n'] in have:
                sys.exit(f"{label} #{e['n']} is in a dataset already; drop it from amc_extra.json")
            twin = by_text.get((year, norm(e['html'])))
            if twin:
                shared += 1
                if twin['answer'] != e['answer']:
                    mismatches.append(f"{label} #{e['n']}: AoPS key {e['answer']}, AMC 10 key {twin['answer']}")
            entry = {'n': e['n'], 'answer': e['answer'], 'topic': e.get('topic') or (twin and twin['topic']), 'hint': e.get('hint') or (twin['hint'] if twin else ''), 'html': e['html']}
            add(tid, label, page, year, entry)
            if level.startswith('10'):
                by_text.setdefault((year, norm(e['html'])), entry)

    os.makedirs(OUT, exist_ok=True)
    index = []
    for t in sorted(tests.values(), key=lambda t: (-t['year'], t['id'])):
        t['problems'].sort(key=lambda e: e['n'])
        with open(os.path.join(OUT, f"{t['id']}.json"), 'w') as f:
            json.dump({'id': t['id'], 'label': t['label'], 'page': t['page'], 'problems': t['problems']}, f, separators=(',', ':'), ensure_ascii=False)
        index.append({'id': t['id'], 'label': t['label'], 'count': len(t['problems'])})
    with open(os.path.join(OUT, 'index.json'), 'w') as f:
        json.dump(index, f, separators=(',', ':'))

    print(f'{len(index)} tests, {sum(t["count"] for t in index)} problems; {shared} AMC 12 problems matched to the AMC 10')
    for t in index:
        if t['count'] != 25:
            print(f"  {t['label']}: {t['count']} problems")
    for line in mismatches:
        print('  key mismatch:', line)


if __name__ == '__main__':
    main()
