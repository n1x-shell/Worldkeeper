# Read the SRD 5.2.1 PDF's stat blocks and magic items in reading order (left column, then right), by font.
import pymupdf, re, json, sys
doc = pymupdf.open(sys.argv[1]); OUT = sys.argv[2]
def page_lines(pg):
    """Each text line on a page as (column, y, x, spans), left column first."""
    d = doc[pg].get_text('dict'); mid = doc[pg].rect.width / 2; rows = []
    for b in d['blocks']:
        for l in b.get('lines', []):
            sp = [s for s in l['spans'] if s['text'].strip()]
            if not sp: continue
            x0, y0 = sp[0]['bbox'][0], sp[0]['bbox'][1]
            if y0 > 735 or (sp[0]['size'] >= 25): continue  # footer, chapter title
            rows.append((0 if x0 < mid - 10 else 1, round(y0), x0, sp))
    rows.sort(key=lambda r: (r[0], r[1], r[2]))
    return rows
def find_page(text, start=0):
    for i in range(start, doc.page_count):
        if text in doc[i].get_text(): return i
def dehyphen(a, b):
    """Join two lines of running text."""
    if a.endswith('-') and b[:1].islower():
        last = re.split(r'\s', a)[-1]
        return a + b if (re.search(r'\d', last) or last.count('-') > 1) else a[:-1] + b
    return a + ' ' + b
def join_spans(sp):
    """A line's spans, with a space where the font changes between words ("Attack Roll:" + "+5")."""
    out = ''
    for s_ in sp:
        t = s_['text']
        if out and t and not out[-1].isspace() and not t[0].isspace() and t[0] not in '.,;:)' and (out[-1] in ':;,' or (out[-1].isalnum() and (t[0].isalnum() or t[0] in '+(-'))) and not ('SC700' in s_['font']): out += ' '
        out += t
    return out
fix = lambda s: s.replace('’', "'").replace('‘', "'").replace('“', '"').replace('”', '"').replace('−', '-').replace('­', '')

# ---------------------------------------------------------------- creatures
mon_start = find_page('Monsters A–Z', 250)
creatures = []; cur = None; section = None; entry = None; label = None; ab = []
LABELS = {'AC', 'Initiative', 'HP', 'Speed', 'Skills', 'Senses', 'Languages', 'CR', 'Resistances', 'Immunities', 'Vulnerabilities', 'Gear'}
SECTIONS = {'Traits': 'traits', 'Actions': 'actions', 'Bonus Actions': 'bonus', 'Reactions': 'reactions', 'Legendary Actions': 'legendary'}
def close_entry():
    global entry
    if cur is not None and entry is not None and section:
        entry['text'] = re.sub(r' *\n *', '\n', entry['text']).strip(); cur[section].append(entry)
    entry = None
last_x = {}
for pg in range(mon_start, doc.page_count):
    for col, y, x, sp in page_lines(pg):
        f0, s0 = sp[0]['font'], sp[0]['size']; text = fix(join_spans(sp)).strip()
        if 'SemiBold' in f0 and 'SC700' not in f0 and abs(s0 - 14.8) < 0.5:  # a stat block begins
            close_entry()
            cur = {'name': text, 'meta': '', 'fields': {}, 'ab': [], 'traits': [], 'actions': [], 'bonus': [], 'reactions': [], 'legendary': []}
            creatures.append(cur); section = None; label = None; continue
        if cur is None: continue
        if 'SemiBold' in f0 and s0 > 15: close_entry(); section = None; continue  # a group heading ("Dragons")
        if f0 == 'GillSans' and abs(s0 - 12) < 0.5 and text in SECTIONS:
            close_entry(); section = SECTIONS[text]; label = None; continue
        if section is None:
            if not cur['meta'] and 'Italic' in f0: cur['meta'] = text; continue
            if 'SC700' in f0 or (f0 == 'GillSans' and s0 > 9):  # the ability table: cells with their position
                for s in sp:
                    t = fix(s['text']).strip()
                    if re.fullmatch(r'[+-]?\d+', t): cur['ab'].append((s['origin'][1], s['bbox'][0], int(t)))
                continue
            if f0 == 'GillSans': continue  # MOD SAVE
            # header fields: "AC 17 Initiative +7 (17)" on one line, labels in bold
            for s in sp:
                t = fix(s['text']).strip()
                if 'Bold' in s['font'] and t in LABELS: label = t; cur['fields'][label] = ''
                elif label: cur['fields'][label] = (cur['fields'][label] + ' ' + t).strip()
            continue
        # running text of a section
        if 'BoldItalic' in f0:
            close_entry()
            name = fix(sp[0]['text']).strip().rstrip('.')
            rest = fix(join_spans(sp[1:])).strip()
            entry = {'name': name, 'text': rest}; last_x[col] = x; continue
        if section == 'legendary' and entry is None and 'Italic' in f0 and abs(s0 - 9) < 0.3:
            entry = {'name': '', 'text': text}; continue
        if entry is None: continue
        if x > (last_x.get(col, x)) + 4 and entry['text']: entry['text'] += '\n' + text  # an indented new paragraph
        else: entry['text'] = dehyphen(entry['text'], text) if entry['text'] else text
        last_x[col] = min(last_x.get(col, x), x)
close_entry()
for c in creatures:
    cells = sorted(c.pop('ab'))
    rows = []
    for y, x, v in cells:  # rows of the table (Str Dex Con, then Int Wis Cha), each read left to right
        if rows and abs(rows[-1][0] - y) < 4: rows[-1][1].append((x, v))
        else: rows.append([y, [(x, v)]])
    vals = [v for _, r in rows for _, v in sorted(r)]
    trip = [vals[i * 3:i * 3 + 3] for i in range(len(vals) // 3)]
    # Str, Dex, Con on the first row; Int, Wis, Cha on the second
    c['abilities'] = trip
json.dump({'creatures': creatures}, open(OUT, 'w'), indent=0)
print('creatures', len(creatures), 'first', creatures[0]['name'], 'last', creatures[-1]['name'])
bad = [c['name'] for c in creatures if len(c['abilities']) != 6 or not c['fields'].get('HP') or any(a[1] != (a[0] - 10) // 2 for a in c['abilities'])]
print('incomplete', len(bad), bad[:20])
