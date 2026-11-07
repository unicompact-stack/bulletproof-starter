#!/usr/bin/env python3
# Собирает всю читальню в ОДИН html-файл: ни сервера, ни интернета, ни сборки.
import re, json, html, pathlib, datetime

ROOT = pathlib.Path(__file__).resolve().parent.parent
LIB = ROOT / 'library'

# ---------- markdown -> html ----------

def inline(t):
    t = html.escape(t)
    t = re.sub(r'`([^`]+)`', r'<code>\1</code>', t)
    t = re.sub(r'\*\*([^*]+)\*\*', r'<strong>\1</strong>', t)
    t = re.sub(r'(?<!\*)\*([^*\n]+)\*(?!\*)', r'<em>\1</em>', t)
    t = re.sub(r'~~([^~]+)~~', r'<del>\1</del>', t)
    t = re.sub(r'\[([^\]]+)\]\(([^)]+)\)',
               r'<a href="\2" target="_blank" rel="noopener">\1</a>', t)
    t = t.replace('&lt;br/&gt;', '<br>').replace('&lt;br&gt;', '<br>')
    return t


def mermaid_to_html(code):
    """Схему рисуем блоками и стрелками — без библиотек и без интернета."""
    nodes, edges = {}, []
    for ln in code.splitlines():
        ln = ln.strip()
        if not ln or ln.startswith(('flowchart', 'graph', '%%')):
            continue
        for nid, lab in re.findall(r'([A-Za-z_]\w*)\s*[\[\{\(]+\s*"?(.*?)"?\s*[\]\}\)]+', ln):
            nodes[nid] = lab
        m = re.match(r'([A-Za-z_]\w*).*?(-->|-\.->|---)\s*(?:\|(.*?)\|)?\s*([A-Za-z_]\w*)', ln)
        if m:
            edges.append((m.group(1), m.group(2), (m.group(3) or '').strip(), m.group(4)))
    if not edges:
        return '<pre class="plain">' + html.escape(code) + '</pre>'
    out = ['<div class="scheme">']
    for a, kind, lab, b in edges:
        la = inline(nodes.get(a, a))
        lb = inline(nodes.get(b, b))
        dashed = ' dashed' if kind == '-.->' else ''
        out.append(f'<div class="edge{dashed}">')
        out.append(f'<span class="box">{la}</span>')
        arrow = f'<span class="arrow">→</span>'
        if lab:
            arrow = f'<span class="arrow">—<span class="lab">{inline(lab)}</span>→</span>'
        out.append(arrow)
        out.append(f'<span class="box">{lb}</span>')
        out.append('</div>')
    out.append('</div>')
    return '\n'.join(out)


def md(text):
    lines = text.split('\n')
    out, i = [], 0
    while i < len(lines):
        ln = lines[i]
        if ln.strip().startswith('```'):
            lang = ln.strip().strip('`').strip()
            buf = []
            i += 1
            while i < len(lines) and not lines[i].strip().startswith('```'):
                buf.append(lines[i]); i += 1
            i += 1
            body = '\n'.join(buf)
            out.append(mermaid_to_html(body) if lang == 'mermaid'
                       else '<pre class="plain">' + html.escape(body) + '</pre>')
            continue
        if ln.startswith('|') and i + 1 < len(lines) and re.match(r'^\|[\s:|-]+\|$', lines[i + 1].strip()):
            head = [c.strip() for c in ln.strip().strip('|').split('|')]
            i += 2
            rows = []
            while i < len(lines) and lines[i].startswith('|'):
                rows.append([c.strip() for c in lines[i].strip().strip('|').split('|')]); i += 1
            out.append('<table><thead><tr>' + ''.join(f'<th>{inline(c)}</th>' for c in head)
                       + '</tr></thead><tbody>'
                       + ''.join('<tr>' + ''.join(f'<td>{inline(c)}</td>' for c in r) + '</tr>' for r in rows)
                       + '</tbody></table>')
            continue
        m = re.match(r'^(#{1,4})\s+(.*)', ln)
        if m:
            lvl = len(m.group(1))
            out.append(f'<h{lvl}>{inline(m.group(2))}</h{lvl}>'); i += 1; continue
        if re.match(r'^\s*[-*]\s+', ln):
            items = []
            while i < len(lines) and re.match(r'^\s*[-*]\s+', lines[i]):
                items.append(re.sub(r'^\s*[-*]\s+', '', lines[i])); i += 1
            out.append('<ul>' + ''.join(f'<li>{inline(x)}</li>' for x in items) + '</ul>'); continue
        if re.match(r'^\s*\d+\.\s+', ln):
            items = []
            while i < len(lines) and re.match(r'^\s*\d+\.\s+', lines[i]):
                items.append(re.sub(r'^\s*\d+\.\s+', '', lines[i])); i += 1
            out.append('<ol>' + ''.join(f'<li>{inline(x)}</li>' for x in items) + '</ol>'); continue
        if ln.strip() == '' or ln.strip() == '---':
            i += 1; continue
        para = []
        while i < len(lines) and lines[i].strip() and not lines[i].startswith(('|', '#', '```')) \
                and not re.match(r'^\s*([-*]|\d+\.)\s+', lines[i]) and lines[i].strip() != '---':
            para.append(lines[i].strip()); i += 1
        if para:
            out.append('<p>' + inline(' '.join(para)) + '</p>')
    return '\n'.join(out)


# ---------- данные ----------

def parse_article(p):
    raw = p.read_text(encoding='utf-8')
    _, fm, body = raw.split('---', 2)
    meta = {}
    for ln in fm.strip().split('\n'):
        if ':' in ln:
            k, v = ln.split(':', 1)
            meta[k.strip()] = v.strip()
    body = re.sub(r'^\s*#\s+.*\n', '', body.lstrip(), count=1)
    srcs = [s.strip() for s in meta.get('sources', '').strip('[]').split(',') if s.strip()]
    return {
        'id': meta.get('id', ''), 'title': meta.get('title', ''),
        'topic': meta.get('topic', ''), 'reading': meta.get('reading_time', ''),
        'updated': meta.get('updated', ''), 'sources': srcs,
        'html': md(body), 'text': re.sub(r'\s+', ' ', body).lower(),
    }

articles = sorted((parse_article(p) for p in LIB.glob('articles/A-*.md')), key=lambda a: a['id'])

topics = []
for m in re.finditer(r'^## (T-\d\d)\.\s*(.+?)$\n+(.+?)(?=\n\n|\Z)',
                     (LIB / 'TOPICS.md').read_text(encoding='utf-8'), re.M | re.S):
    topics.append({'id': m.group(1), 'title': m.group(2).strip(),
                   'desc': re.sub(r'\s+', ' ', m.group(3)).strip()})

sources = []
for ln in (LIB / 'sources.md').read_text(encoding='utf-8').split('\n'):
    if re.match(r'^\|\s*S-\d{3}\s*\|', ln):
        c = [x.strip() for x in ln.strip().strip('|').split('|')]
        if len(c) >= 10:
            sources.append({'id': c[0], 'title': c[1], 'author': c[2], 'year': c[3],
                            'kind': c[4], 'link': c[5], 'access': c[6],
                            'score': c[7], 'status': c[8], 'lessons': c[9]})

notes = {}
for p in LIB.glob('notes/S-*.md'):
    notes[p.stem] = md(re.sub(r'^\s*#\s+.*\n', '', p.read_text(encoding='utf-8').lstrip(), count=1))

path_md = md(re.sub(r'^\s*#\s+.*\n', '', (LIB / 'PATH.md').read_text(encoding='utf-8').lstrip(), count=1))

data = {'articles': articles, 'topics': topics, 'sources': sources, 'notes': notes, 'path': path_md,
        'built': datetime.datetime.now().strftime('%d.%m.%Y')}

TPL = (pathlib.Path(__file__).parent / 'shell.html').read_text(encoding='utf-8')
out = TPL.replace('/*__DATA__*/', json.dumps(data, ensure_ascii=False))
dest = ROOT / 'Читальня.html'
dest.write_text(out, encoding='utf-8')
print(f'{dest}  —  {dest.stat().st_size//1024} КБ')
print(f'статей {len(articles)}, источников {len(sources)}, тем {len(topics)}, карточек {len(notes)}')
