# The SRD 5.2.1's magic items (Magic Items A–Z) and adventuring gear, in reading order by font.
import pymupdf, re, json, sys
doc = pymupdf.open(sys.argv[1]); OUT = sys.argv[2]
def join_spans(sp):
    """A line's spans, with a space where the font changes between words ("Attack Roll:" + "+5")."""
    out = ''
    for s_ in sp:
        t = s_['text']
        if out and t and not out[-1].isspace() and not t[0].isspace() and t[0] not in '.,;:)' and (out[-1] in ':;,' or (out[-1].isalnum() and (t[0].isalnum() or t[0] in '+(-'))) and not ('SC700' in s_['font']): out += ' '
        out += t
    return out
fix = lambda s: s.replace('’', "'").replace('‘', "'").replace('“', '"').replace('”', '"').replace('−', '-').replace('­', '').replace(' ', ' ')
def lines(pg):
    d = doc[pg].get_text('dict'); mid = doc[pg].rect.width / 2; rows = []
    for b in d['blocks']:
        for l in b.get('lines', []):
            sp = [s for s in l['spans'] if s['text'].strip()]
            if not sp: continue
            x0, base = sp[0]['bbox'][0], sp[0]['origin'][1]
            if base > 740 or sp[0]['size'] >= 25: continue
            rows.append((0 if x0 < mid - 10 else 1, round(base), x0, sp))
    rows.sort(key=lambda r: (r[0], r[1], r[2])); return rows
def dehyphen(a, b):
    if a.endswith('-') and b[:1].islower():
        last = re.split(r'\s', a)[-1]
        return a + b if (re.search(r'\d', last) or last.count('-') > 1) else a[:-1] + b
    return a + ' ' + b
start = next(i for i in range(150, doc.page_count) if doc[i].get_text().lstrip().startswith('Magic Items A–Z') or '\nMagic Items A–Z\n' in doc[i].get_text())
end = next(i for i in range(start, doc.page_count) if 'Monsters A–Z' in doc[i].get_text() and i > start)
items = []; cur = None; row_y = None; lastx = {}
TYPE = re.compile(r'^(Wondrous Item|Armor|Weapon|Potion|Ring|Rod|Scroll|Staff|Wand|Shield)\b')
for pg in range(start, end + 1):
    for col, y, x, sp in lines(pg):
        f0, s0 = sp[0]['font'], sp[0]['size']; text = fix(join_spans(sp)).strip()
        if pg == end and 'Monsters A–Z' in text: break
        if 'SemiBold' in f0 and abs(s0 - 12) < 0.4:
            if cur is not None and not cur['type'] and not cur['text']: cur['name'] += ' ' + text; continue  # a heading on two lines
            cur = {'name': text, 'type': '', 'text': ''}; items.append(cur); row_y = None; continue
        if cur is None: continue
        if not cur['type'] and all('Italic' in s['font'] for s in sp) and TYPE.match(text):
            cur['type'] = text; continue
        if f0.startswith('GillSans'):  # a table: its title, then rows of cells
            if 'SemiBold' in f0 and s0 > 10: cur['text'] += '\n\n' + text + '\n'; row_y = None; continue
            cells = ' | '.join(fix(s['text']).strip() for s in sp)
            if row_y is not None and abs(y - row_y) < 3: cur['text'] += ' | ' + cells
            else: cur['text'] += '\n' + cells
            row_y = y; continue
        if row_y is not None: cur['text'] += '\n\n'; row_y = None
        if x > lastx.get(col, x) + 4 and cur['text'] and not cur['text'].endswith('\n'): cur['text'] += '\n' + text
        elif cur['text'] and not cur['text'].endswith('\n'): cur['text'] = dehyphen(cur['text'], text)
        else: cur['text'] += text
        lastx[col] = min(lastx.get(col, x), x)
for it in items:
    it['text'] = re.sub(r'\n{3,}', '\n\n', re.sub(r' *\n *', '\n', it['text'])).strip()
    # A type line that wraps: "Weapon (Any Melee Weapon), Rare (Requires" + "Attunement)"
    if it['type'].count('(') > it['type'].count(')'):
        m = re.match(r'^([^)]*\))\s*', it['text'])
        if m: it['type'] += ' ' + m.group(1); it['text'] = it['text'][m.end():]
    # ... or wraps between rarities: "Uncommon (+1), Rare" + "(+2), or Very Rare (+3)"
    m = re.match(r'^((?:\s*(?:\([^)]*\)|,|or|Very|Rare|Uncommon|Common|Legendary|Artifact|Varies)(?![a-z]))+)\s*', it['text'])
    if m and ('(' in m.group(1) or re.search(r'Rare|Uncommon|Legendary', m.group(1))) and it['type'].rstrip().endswith(('Rare', 'Uncommon', 'Common', 'Legendary', ',', 'or', 'Very')):
        it['type'] += ' ' + m.group(1).strip(); it['text'] = it['text'][m.end():]
    m = re.match(r'^(\(Requires Attunement[^)]*\))\s*', it['text'])
    if m: it['type'] += ' ' + m.group(1); it['text'] = it['text'][m.end():]
items = [i for i in items if i['type']]

# ---------------------------------------------------------------- gear: "Name (25 GP)" headings in the Equipment chapter
eq0 = next(i for i in range(20, doc.page_count) if re.search(r'Adventuring Gear', doc[i].get_text()) and re.search(r'\(\d+ [GS]P\)', doc[i].get_text()))
gear = []; g = None
HEAD = re.compile(r'^(.+?) \(([\d,]+ (?:CP|SP|EP|GP|PP)|Varies)\)$')
for pg in range(eq0 - 6, eq0 + 12):
    for col, y, x, sp in lines(pg):
        f0, s0 = sp[0]['font'], sp[0]['size']; text = fix(join_spans(sp)).strip()
        if 'SemiBold' in f0 and s0 >= 11.5:
            m = HEAD.match(text)
            g = {'name': m.group(1), 'cost': m.group(2), 'text': ''} if m else None
            if g: gear.append(g)
            continue
        if g is None: continue
        if 'SemiBold' in sp[0]['font'] and text.split(' ')[0].endswith(':') and g['text']: g['text'] += '\n' + text; continue
        g['text'] = dehyphen(g['text'], text) if g['text'] else text
gear = list({x['name']: x for x in gear}.values())
json.dump({'items': items, 'gear': gear}, open(OUT, 'w'), indent=0)
print('gear', len(gear), [x['name'] for x in gear[:8]])
print('magic items', len(items), [i['name'] for i in items[:4]], [i['name'] for i in items[-3:]])
print('no type', [i['name'] for i in items if not i['type']][:20])
