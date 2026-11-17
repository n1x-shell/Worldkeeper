# The built-in SRD 5.2.1 creatures and items: text and numbers from the SRD itself; from the 5etools data only facts the
# SRD prints elsewhere or as tables (a creature's environments, an item's price and weight, a generic item's base).
import json, re, sys, difflib
pdfc, pdfi, raw, outc, outi = sys.argv[1:6]
C = json.load(open(pdfc))['creatures']; I = json.load(open(pdfi)); R = json.load(open(raw))
rc = {c['name'].lower(): c for c in R['creatures']}; ri = {i['name'].lower().replace(' (*)', ''): i for i in R['items']}
num = lambda s: int(re.match(r'[+-]?\d+', s.replace('−', '-')).group(0)) if s and re.match(r'[+-]?\d+', s.replace('−', '-')) else None
AB = ['Str', 'Dex', 'Con', 'Int', 'Wis', 'Cha']
slug = lambda s: re.sub(r'[^a-z0-9]+', '-', s.lower()).strip('-')
out = []
for c in C:
    f = c['fields']; ab = c['abilities']
    sp = f.get('Speed', '')
    m = re.search(r'\s+(Str|Dex|Con|Int|Wis|Cha) (\d+) ([+-]\d+)$', sp)  # a table cell caught in the line above
    if m and len(ab) == 5:
        sp = sp[:m.start()]; ab.insert(AB.index(m.group(1)), [int(m.group(2)), int(m.group(3)), int(m.group(3))])
    cr = re.match(r'([\d/]+) \((?:XP ([\d,]+)|([\d,]+) XP)[^;]*; PB \+(\d+)\)', f.get('CR', ''))
    hp = re.match(r'(\d+)', f.get('HP', ''))
    if c['name'].lower() not in rc:  # a name the PDF ran together ("GrayOoze")
        near = difflib.get_close_matches(c['name'].lower(), list(rc), n=1, cutoff=0.9)
        if near: c['name'] = rc[near[0]]['name']
    meta5 = rc.get(c['name'].lower(), {})
    # A table the PDF laid out oddly: where the SRD's own modifiers don't fit its scores, the scores are the book's.
    if len(ab) != 6 or any(a[1] != (a[0] - 10) // 2 for a in ab):
        if meta5.get('ab'): ab = [[v, (v - 10) // 2, (v - 10) // 2] for v in meta5['ab']]
    for e in c['actions'] + c['bonus'] + c['traits']:
        if e['name'].startswith('Spellcasting'): e['text'] = re.sub(r'\s+(At Will:|\d+/Day(?: Each)?:)', r'\n\1', e['text'])
    clean = lambda t: t.replace(' ', ' ').strip()
    out.append({
        'id': f'srd:{slug(c["name"])}', 'name': c['name'], 'meta': c['meta'], 'kind': 'creature',
        'ac': num(f.get('AC', '')), 'hp': clean(f.get('HP', '')), 'hpAvg': int(hp.group(1)) if hp else None,
        'init': num(f.get('Initiative', '')), 'speed': clean(sp),
        'ab': [a[0] for a in ab] if len(ab) == 6 else None,
        'saves': ', '.join(f'{AB[i]} {a[2]:+d}' for i, a in enumerate(ab) if len(ab) == 6 and a[2] != a[1]),
        'skills': clean(f.get('Skills', '')), 'vuln': clean(f.get('Vulnerabilities', '')), 'res': clean(f.get('Resistances', '')),
        'imm': clean(f.get('Immunities', '')), 'gear': clean(f.get('Gear', '')), 'senses': clean(f.get('Senses', '')), 'languages': clean(f.get('Languages', '')),
        'cr': cr.group(1) if cr else None, 'xp': int((cr.group(2) or cr.group(3)).replace(',', '')) if cr else None, 'pb': int(cr.group(4)) if cr else None,
        **{k: [{'name': e['name'], 'text': clean(e['text'])} for e in c[k]] for k in ('traits', 'actions', 'bonus', 'reactions', 'legendary')},
        'environment': meta5.get('environment', []), 'source': 'SRD 5.2.1',
    })
items = []
RAR = ['common', 'uncommon', 'rare', 'very rare', 'legendary', 'artifact']
def parse_type(t):
    low = t.lower()
    found = [r for r in RAR if re.search(r'(?<!very )\b' + r + r'\b', low)]
    rarity = 'varies' if ('varies' in low or len(found) > 1) else (found[0] if found else '')
    att = re.search(r'\((requires attunement[^)]*)\)', t, re.I)
    kind = t.split(',')[0].strip()
    return kind, rarity, (att.group(1)[0].lower() + att.group(1)[1:]) if att else ''
srd_names = {i['name'].lower(): i for i in I['items']}
for it in I['items']:
    kind, rarity, att = parse_type(it['type'])
    r5 = ri.get(it['name'].lower(), {})
    items.append({'name': it['name'], 'type': kind, 'rarity': rarity, 'attunement': att, 'magic': True, 'value': r5.get('value'), 'weight': r5.get('weight'), 'text': it['text'].replace(' ', ' '), 'tables': [], 'source': 'SRD 5.2.1'})
# A kind the SRD tables under one entry ("Belt of Hill Giant Strength" under "Belt of Giant Strength"), for treasure.
heads = list(srd_names)
gear_text = {g['name'].lower(): g for g in I['gear']}
for gk, g in gear_text.items():
    if gk.startswith('potion'): srd_names[gk] = {'name': g['name'], 'type': 'Potion, Common', 'text': g['text']}; heads.append(gk)
for r5 in R['items']:
    n = r5['name'].replace(' (*)', ''); k = n.lower()
    if k in srd_names or not r5.get('magic'): continue
    STOP = {'or', 'of', 'the', 'a', 'and', 'any'}
    words = lambda x: set(re.findall(r'[a-z]+', x.replace('golems', 'golem').replace('potions', 'potion'))) - STOP
    cands = [h for h in heads if h != k and words(h) and (k.startswith(h + ',') or k.startswith(h + ' (') or words(h) <= words(k) or words(k) <= words(h))]
    if not cands: continue
    b = srd_names[max(cands, key=lambda h: (len(words(h) & words(k)), -len(words(h) ^ words(k)), len(h)))]; kind, _, att = parse_type(b['type'])
    extra = {'prefix': r5.get('prefix', ''), 'suffix': r5.get('suffix', '')} if (r5.get('prefix') or r5.get('suffix')) else {}
    items.append({'name': n, 'type': kind if not extra else 'Magic item (applies to a fitting weapon or armor)', 'rarity': r5['rarity'], 'attunement': att, 'magic': True, 'value': r5.get('value'), 'weight': r5.get('weight'), 'text': (f'One kind of {b["name"]}.\n\n' if b['name'].lower() != n.lower() else '') + b['text'], 'tables': [], 'source': 'SRD 5.2.1', **extra})
# Generic magic weapons and armor ("+1 Weapon", "Flame Tongue") fit a base item: keep their prefix for name matching.
for it in items:
    r5 = ri.get(it['name'].lower())
    if r5 and (r5.get('prefix') or r5.get('suffix')): it['prefix'] = r5.get('prefix', ''); it['suffix'] = r5.get('suffix', '')
for g in I['gear']:
    r5 = ri.get(g['name'].lower(), {})
    cost = re.match(r'([\d,]+) (CP|SP|EP|GP|PP)', g['cost'])
    val = int(cost.group(1).replace(',', '')) * {'CP': .01, 'SP': .1, 'EP': .5, 'GP': 1, 'PP': 10}[cost.group(2)] if cost else None
    items.append({'name': g['name'], 'type': r5.get('type') or 'Adventuring Gear', 'rarity': 'common' if g['name'].startswith('Potion of Healing') else '', 'attunement': '', 'magic': g['name'].startswith('Potion'), 'value': val, 'weight': r5.get('weight'), 'text': g['text'], 'tables': [], 'source': 'SRD 5.2.1'})
# Weapons and armor: their table rows (damage, properties, mastery, AC), written by the app.
have = {i['name'].lower() for i in items}
for r5 in R['items']:
    n = r5['name']
    if n.lower() in have or r5.get('magic') or not r5.get('text') or r5['type'] not in ('Melee Weapon', 'Ranged Weapon', 'Light Armor', 'Medium Armor', 'Heavy Armor', 'Shield'): continue
    stats = r5['text'].split('\n\n')[0]
    items.append({'name': n, 'type': r5['type'], 'rarity': '', 'attunement': '', 'magic': False, 'value': r5.get('value'), 'weight': r5.get('weight'), 'text': stats, 'tables': [], 'source': 'SRD 5.2.1'})
# Gear the SRD gives only as rows of its tables (mounts, vehicles, food, holy symbols, poisons): name, price, weight.
have = {i['name'].lower() for i in items}
for r5 in R['items']:
    n = r5['name'].replace(' (*)', '')
    if n.lower() in have or r5.get('magic') or r5.get('prefix'): continue
    items.append({'name': n, 'type': r5['type'], 'rarity': '', 'attunement': '', 'magic': False, 'value': r5.get('value'), 'weight': r5.get('weight'), 'text': '', 'tables': [], 'source': 'SRD 5.2.1'})
json.dump({'note': 'Creatures from the System Reference Document 5.2.1 by Wizards of the Coast LLC (CC-BY-4.0), read from the SRD itself.', 'creatures': out}, open(outc, 'w'), separators=(',', ':'))
json.dump({'note': 'Magic items, adventuring gear, weapons and armor from the System Reference Document 5.2.1 by Wizards of the Coast LLC (CC-BY-4.0), read from the SRD itself.', 'items': items}, open(outi, 'w'), separators=(',', ':'))
print('creatures', len(out), 'incomplete', [c['name'] for c in out if not c['ab'] or c['ac'] is None or c['cr'] is None or c['hpAvg'] is None or c['init'] is None])
print('items', len(items), 'magic', sum(1 for i in items if i['magic']), 'by rarity', {r: sum(1 for i in items if i['rarity'] == r) for r in RAR + ['varies', '']})
print('no environment', sum(1 for c in out if not c['environment']))

# ---------------------------------------------------------------- hazards: traps and contagions as hazard cards; poisons' text
H = json.load(open(sys.argv[6])) if len(sys.argv) > 7 else []
hazards = []
by_item = {i['name'].lower(): i for i in items}
for h in H:
    t = h['text'].replace(' ', ' ').strip()
    if 'Poison' in h['sub']:
        it = by_item.get(h['name'].lower())
        price = re.search(r'\(([\d,]+) GP\)', h['sub'])
        if it: it['text'] = t; it['type'] = re.sub(r'\s*\(.*', '', h['sub'])
        else: items.append({'name': h['name'], 'type': re.sub(r'\s*\(.*', '', h['sub']), 'rarity': '', 'attunement': '', 'magic': False, 'value': int(price.group(1).replace(',', '')) if price else None, 'weight': None, 'text': t, 'tables': [], 'source': 'SRD 5.2.1'})
        continue
    sub = h['sub']
    lead = re.match(r'^([^()]*\))\s*(?=Trigger:)', t)  # the subtitle wrapped: "... Nuisance Trap (Levels" + "17–20)"
    if lead: sub += ' ' + lead.group(1); t = t[lead.end():]
    # The duration runs until the description starts ("When a creature...", "This trap...", "A falling net...").
    m = re.match(r'Trigger: (.+?) Duration: (.+?)\s+((?:When|This|A|An|The|Each|If)\b.*)$', t, re.S)
    trig, dur, rest = (m.group(1), m.group(2), m.group(3)) if m else ('', '', t)
    hazards.append({'id': f'srd:{slug(h["name"])}', 'name': h['name'], 'meta': sub, 'kind': 'hazard', 'trigger': trig + (f' (duration: {dur})' if dur else ''), 'effect': rest.strip(), 'source': 'SRD 5.2.1'})
json.dump({'note': 'Traps and magical contagions from the System Reference Document 5.2.1 by Wizards of the Coast LLC (CC-BY-4.0), read from the SRD itself.', 'hazards': hazards}, open(sys.argv[7], 'w'), separators=(',', ':'))
json.dump({'note': 'Magic items, adventuring gear, poisons, weapons and armor from the System Reference Document 5.2.1 by Wizards of the Coast LLC (CC-BY-4.0), read from the SRD itself.', 'items': items}, open(outi, 'w'), separators=(',', ':'))
print('hazards', len(hazards), [h['name'] for h in hazards], 'poisons with text', sum(1 for i in items if 'Poison' in i['type'] and i['text']))
