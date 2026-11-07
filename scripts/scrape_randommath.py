"""Scrapes tests from the Random Math Wiki (wiki.randommath.com) for tests the
other datasets don't have yet. Problems come from the test's page, answers
from the last \\textbf{(X)} in each problem's solution page, and diagrams are
downloaded so the app doesn't hotlink them. Output goes to a scratch folder;
copy the entries into scripts/amc_extra.json and the images into public/amc/img/.

usage: python3 scripts/scrape_randommath.py <outdir> <path>...
  e.g. amc10/2026/part-a   or a single problem: amc12/2025/part-a/problem-25
Writes <outdir>/rm.json ({path: [{n, answer, html, choices}]}) and <outdir>/img/."""
import html, json, os, re, sys, time, urllib.request

BASE = 'https://wiki.randommath.com'
UA = {'User-Agent': 'agenda-amc-build (personal study app)'}


def get(url, binary=False):
    time.sleep(0.4)
    with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=60) as r:
        b = r.read()
    return b if binary else b.decode('utf-8', 'ignore')


def content(page):
    m = re.search(r'<template slot="contents"><div>(.*?)</div></template>', page, re.S)
    return m.group(1)


def tex(span):
    """KaTeX span → $TeX$ (the TeX source follows the MathML inside <math>)."""
    m = re.search(r'<math[^>]*>(.*?)</math>', span, re.S)
    inner = m.group(1)
    i = inner.rfind('</')
    src = html.unescape(inner[inner.index('>', i) + 1:]).strip()
    return src


def delatex(h):
    # Display math first, then inline.
    def disp(m):
        return f' $${tex(m.group(0))}$$ '
    out, i = [], 0
    # KaTeX spans nest; walk them by matching the katex-mathml part and skipping the katex-html part.
    pat = re.compile(r'<span class="katex-display"><span class="katex">|<span class="katex">')
    while True:
        m = pat.search(h, i)
        if not m:
            out.append(h[i:])
            break
        out.append(h[i:m.start()])
        display = 'katex-display' in m.group(0)
        end_math = h.index('</math>', m.end())
        src = tex(h[m.start():end_math + 7])
        # Skip to the end of this katex span: count span depth from m.start().
        depth, j = 0, m.start()
        for t in re.finditer(r'<span\b|</span>', h[m.start():]):
            depth += 1 if t.group(0) != '</span>' else -1
            if depth == 0:
                j = m.start() + t.end()
                break
        esc = html.escape(src, quote=False)
        out.append(f'$${esc}$$' if display else f'${esc}$')
        i = j
    return ''.join(out)


def blocks(c):
    """Problem N → (statement html, {letter: choice html}) from the test's index page."""
    parts = re.split(r'<p><b[^>]*>Problem (\d+):</b>', c)
    res = {}
    for k in range(1, len(parts), 2):
        n, body = int(parts[k]), parts[k + 1]
        body = re.split(r'<p><b[^>]*>Solution', body)[0]
        stmt, _, choices = body.partition('<b style="color:#b4321e; font-size:18px;">Answer Choices:</b>')
        res[n] = (stmt, choices)
    return res


def clean(h, images, slug):
    h = delatex(h)

    def img(m):
        src = re.search(r'src="([^"]+)"', m.group(0)).group(1)
        remote = src if src.startswith('http') else BASE + src
        local = f'{slug}-{os.path.basename(src)}'
        images.append((remote, local))
        return f'<img src="/amc/img/{local}" class="diagram" alt="diagram" loading="lazy">'

    h = re.sub(r'<img[^>]*>', img, h)
    h = re.sub(r'<(/?)(p|br|ul|ol|li|center|i|b|u|sub|sup|table|tr|td|th|tbody)\b[^>]*>', r'<\1\2>', h)
    h = re.sub(r'<(?!/?(p|br|ul|ol|li|center|i|b|u|sub|sup|table|tr|td|th|tbody|img)\b)[^>]+>', '', h)
    h = re.sub(r'(<br>\s*)+', '<br>', h)
    h = re.sub(r'<p>\s*(<br>\s*)*</p>', '', h)
    return h.strip()


def choices_html(ch):
    ch = re.sub(r'</?p>', ' ', ch)
    items = re.split(r'(?:<br>\s*)*\b([A-E])\.\s', ch)
    got = {items[k]: items[k + 1].strip() for k in range(1, len(items), 2)}
    got = {k: re.sub(r'(<br>\s*)+$', '', v).strip() for k, v in got.items()}
    return '<p>' + ' &nbsp;&nbsp; '.join(f'<b>({k})</b> {got[k]}' for k in 'ABCDE' if k in got) + '</p>', len(got)


def answer(page):
    sol = content(page).split('Solution:', 1)[-1]
    srcs = [tex(s) for s in re.findall(r'<math[^>]*>.*?</math>', sol, re.S)]
    letters = re.findall(r'\\textbf\{\s*\(([A-E])\)', ' '.join(srcs))
    if not letters:
        letters = re.findall(r'\b(?:answer is|is)\s*\(?([A-E])\)', re.sub(r'<[^>]+>', ' ', sol))
    return letters[-1] if letters else ''


def main():
    out_dir, paths = sys.argv[1], sys.argv[2:]
    os.makedirs(f'{out_dir}/img', exist_ok=True)
    result = {}
    for path in paths:
        single = re.search(r'/problem-(\d+)$', path)
        test_path = path[: single.start()] if single else path
        slug = test_path.replace('/', '-').replace('part-', '')
        index = blocks(content(get(f'{BASE}/{test_path}/')))
        ns = [int(single.group(1))] if single else sorted(index)
        entries = []
        for n in ns:
            images = []
            stmt, ch = index[n]
            ch_html, count = choices_html(clean(ch, images, slug))
            stmt = re.sub(r'<p>\s*$', '', stmt.strip())
            body = '<p>' + clean(stmt, images, slug) + ch_html
            ans = answer(get(f'{BASE}/{test_path}/problem-{n}'))
            for remote, local in images:
                p = f'{out_dir}/img/{local}'
                if not os.path.exists(p):
                    open(p, 'wb').write(get(remote, binary=True))
            entries.append({'n': n, 'answer': ans, 'html': body, 'choices': count})
            print(path, n, ans or '??', count, len(images), file=sys.stderr)
        result[path] = entries
    json.dump(result, open(f'{out_dir}/rm.json', 'w'), ensure_ascii=False, indent=1)


if __name__ == '__main__':
    main()
