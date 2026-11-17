# The SRD 5.2.1 Gameplay Toolbox's traps, poisons, contagions and curses: a 12pt heading, an italic subtitle, then text
# with bold run-in labels ("Trigger.", "Effect.", "Countermeasures.").
import pymupdf, re, json, sys
sys.path.insert(0, '.')
doc = pymupdf.open(sys.argv[1]); OUT = sys.argv[2]
exec(open(__import__('os').path.join(__import__('os').path.dirname(__file__), 'parse_items.py')).read().split('start = next(')[0].split("doc = pymupdf.open(sys.argv[1]); OUT = sys.argv[2]")[1])  # join_spans, fix, lines, dehyphen
out = []; cur = None; lab = None
for pg in range(180, 202):
    for col, y, x, sp in lines(pg):
        f0, s0 = sp[0]['font'], sp[0]['size']; text = fix(join_spans(sp)).strip()
        if 'SemiBold' in f0 and s0 >= 11.5:
            if cur is not None and not cur['sub'] and not cur['text'] and abs(s0 - 12) < 0.5: cur['name'] += ' ' + text; continue
            cur = {'name': text, 'sub': '', 'text': '', 'parts': {}} if abs(s0 - 12) < 0.5 else None
            if cur: out.append(cur)
            lab = None; continue
        if cur is None: continue
        if not cur['sub'] and not cur['text'] and all('Italic' in s['font'] for s in sp): cur['sub'] = text; continue
        if 'Bold' in f0 and text.split(' ')[0].endswith('.'):
            lab = fix(sp[0]['text']).strip().rstrip('.')
            rest = fix(join_spans(sp[1:])).strip()
            cur['parts'][lab] = rest; cur['text'] += ('\n' if cur['text'] else '') + text; continue
        cur['text'] = dehyphen(cur['text'], text) if cur['text'] and not cur['text'].endswith('\n') else cur['text'] + text
        if lab: cur['parts'][lab] = dehyphen(cur['parts'][lab], text) if cur['parts'][lab] else text
out = [h for h in out if h['sub'] and re.search(r'Trap|Poison|Contagion|Curse|Hazard', h['sub'])]
json.dump(out, open(OUT, 'w'), indent=0)
from collections import Counter
print(len(out), Counter(re.sub(r'\s*\(.*', '', h['sub']) for h in out))
for h in out[:3] + [h for h in out if 'Trap' in h['sub']][:2]: print(json.dumps(h)[:500])
