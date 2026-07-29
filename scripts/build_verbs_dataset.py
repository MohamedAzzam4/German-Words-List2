import sqlite3
import os
import tempfile
import zipfile
import re
import json

apkg_path = r"C:\Users\LOQ\Downloads\2000_Common_verbs_with_pronunciation_and_examples.apkg"
output_dir = r"d:\Programming\Antigravity-Projects\German-Words-List2-V2\content\generated\verbs"
output_file = os.path.join(output_dir, "top_verbs_2000.json")

os.makedirs(output_dir, exist_ok=True)

SEPARABLE_PREFIXES = [
    'ab', 'an', 'auf', 'aus', 'bei', 'ein', 'fest', 'fort', 'her', 'hin',
    'los', 'mit', 'nach', 'vor', 'weg', 'weiter', 'zu', 'zurück', 'zusammen'
]

PREFIX_MEANINGS = {
    'an': 'toward / at / initiate contact',
    'ab': 'away / off / decline',
    'auf': 'up / open / onto',
    'aus': 'out / off / complete',
    'bei': 'alongside / assist',
    'ein': 'in / inside / into',
    'mit': 'with / along / participate',
    'nach': 'after / behind / emulate',
    'vor': 'before / forward / in front',
    'zu': 'closed / towards / add',
    'weg': 'away / off',
    'zurück': 'back / return',
    'zusammen': 'together / joint'
}

def clean_html(text):
    if not text:
        return ''
    text = re.sub(r'\[sound:.*?\]', '', text)
    text = text.replace('<br>', '\n').replace('<br/>', '\n').replace('<br />', '\n')
    text = re.sub(r'<.*?>', '', text)
    text = text.replace('\xa0', ' ').replace('&nbsp;', ' ')
    text = text.replace('–', '-').replace('—', '-').replace('\x96', '-')
    return text.strip()

def parse_verb_forms(forms_raw, infinitive):
    cleaned = clean_html(forms_raw).strip('() ')
    parts = [p.strip() for p in re.split(r'[·\-\/]', cleaned) if p.strip()]

    pres_3rd = parts[0] if len(parts) >= 1 else infinitive
    past_3rd = parts[1] if len(parts) >= 2 else infinitive
    
    auxiliary = 'haben'
    participle = infinitive

    if len(parts) >= 3:
        part_full = parts[2]
        if part_full.startswith('ist '):
            auxiliary = 'sein'
            participle = part_full[4:].strip()
        elif part_full.startswith('hat '):
            auxiliary = 'haben'
            participle = part_full[4:].strip()
        else:
            participle = part_full

    return pres_3rd, past_3rd, participle, auxiliary

def detect_prefix_info(infinitive, meaning):
    for pref in sorted(SEPARABLE_PREFIXES, key=len, reverse=True):
        if infinitive.startswith(pref) and len(infinitive) > len(pref) + 2:
            root = infinitive[len(pref):]
            pref_meaning = PREFIX_MEANINGS.get(pref, f"{pref}- prefix")
            return {
                'hasPrefix': True,
                'prefix': f"{pref}-",
                'isSeparable': True,
                'rootVerb': root,
                'prefixMeaning': pref_meaning,
                'rootMeaning': f"base verb '{root}'",
                'combinedLogic': f"{pref}- ({pref_meaning}) + {root} → {meaning}"
            }
    return {
        'hasPrefix': False,
        'prefix': '',
        'isSeparable': False,
        'rootVerb': infinitive,
        'prefixMeaning': '',
        'rootMeaning': meaning,
        'combinedLogic': f"Base verb '{infinitive}' → {meaning}"
    }

def generate_conjugations(infinitive, pres_3rd, past_3rd, participle, auxiliary, pref_info):
    is_sep = pref_info['isSeparable']
    pref = pref_info['prefix'].rstrip('-') if is_sep else ''

    def build_pres():
        if is_sep and pres_3rd.endswith(' ' + pref):
            base = pres_3rd[:-len(' ' + pref)].strip()
            tail = ' ' + pref
        else:
            base = pres_3rd
            tail = ''

        stem = infinitive[:-2] if infinitive.endswith('en') else infinitive[:-1]

        return {
            "ich": f"{stem}e{tail}",
            "du": f"{base[:-1] if base.endswith('t') else base}st{tail}" if not base.endswith('st') else f"{base}{tail}",
            "er_sie_es": f"{base}{tail}",
            "wir": f"{infinitive}",
            "ihr": f"{stem}t{tail}",
            "sie_Sie": f"{infinitive}"
        }

    def build_past():
        if is_sep and past_3rd.endswith(' ' + pref):
            base = past_3rd[:-len(' ' + pref)].strip()
            tail = ' ' + pref
        else:
            base = past_3rd
            tail = ''

        return {
            "ich": f"{base}{tail}",
            "du": f"{base}st{tail}",
            "er_sie_es": f"{base}{tail}",
            "wir": f"{base}en{tail}",
            "ihr": f"{base}t{tail}",
            "sie_Sie": f"{base}en{tail}"
        }

    def build_future():
        return {
            "ich": f"werde {infinitive}",
            "du": f"wirst {infinitive}",
            "er_sie_es": f"wird {infinitive}",
            "wir": f"werden {infinitive}",
            "ihr": f"werdet {infinitive}",
            "sie_Sie": f"werden {infinitive}"
        }

    return {
        'auxiliary': auxiliary,
        'participle': participle,
        'present3rd': pres_3rd,
        'past3rd': past_3rd,
        'present': build_pres(),
        'past': build_past(),
        'future': build_future()
    }

def parse_examples_structured(raw_back):
    clean_str = clean_html(raw_back)
    lines = [l.strip() for l in clean_str.split('\n') if l.strip()]
    if len(lines) <= 1:
        return {'de': '', 'en': '', 'full': ''}

    ex_lines = []
    for l in lines[1:]:
        if l.startswith('Examples:'):
            continue
        ex_lines.append(l)

    de_sentences = []
    en_sentences = []

    for idx, l in enumerate(ex_lines):
        clean_l = l.lstrip('•- ').strip()
        if not clean_l:
            continue
        if l.startswith('•') or l.startswith('-'):
            de_sentences.append(clean_l)
            if idx + 1 < len(ex_lines) and not ex_lines[idx+1].startswith('•') and not ex_lines[idx+1].startswith('-'):
                en_sentences.append(ex_lines[idx+1].lstrip('•- ').strip())

    if not de_sentences and ex_lines:
        de_sentences.append(ex_lines[0].lstrip('•- ').strip())
        if len(ex_lines) > 1:
            en_sentences.append(ex_lines[1].lstrip('•- ').strip())

    de_str = ' | '.join(de_sentences)
    en_str = ' | '.join(en_sentences)
    full_str = '\n'.join(ex_lines)

    return {
        'de': de_str,
        'en': en_str,
        'full': full_str
    }

def main():
    temp_dir = tempfile.mkdtemp()
    with zipfile.ZipFile(apkg_path, 'r') as zip_ref:
        zip_ref.extractall(temp_dir)

    db_path = os.path.join(temp_dir, 'collection.anki21')
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()

    cursor.execute("SELECT id, tags, flds FROM notes")
    notes = cursor.fetchall()
    print(f"Extracted {len(notes)} raw verb notes from Anki database.")

    verbs = []
    for idx, note in enumerate(notes):
        flds = note[2].split('\x1f')
        raw_front = clean_html(flds[0])
        raw_back = flds[1]

        parts = raw_front.split('\n')
        infinitive = parts[0].strip()
        forms_raw = parts[1].strip() if len(parts) > 1 else ''

        clean_back = clean_html(raw_back)
        back_lines = [l.strip() for l in clean_back.split('\n') if l.strip()]
        meaning = back_lines[0] if len(back_lines) > 0 else ''

        ex_struct = parse_examples_structured(raw_back)
        pref_info = detect_prefix_info(infinitive, meaning)
        pres_3rd, past_3rd, participle, auxiliary = parse_verb_forms(forms_raw, infinitive)
        conj = generate_conjugations(infinitive, pres_3rd, past_3rd, participle, auxiliary, pref_info)

        tags = [f"freq-{(idx+1):03d}"]
        if pref_info['isSeparable']:
            tags.append('separable')
        if pres_3rd != infinitive or past_3rd != infinitive:
            tags.append('irregular')

        verb_obj = {
            'id': f"v-{(idx+1):04d}-{infinitive}",
            'index': idx + 1,
            'infinitive': infinitive,
            'meaning': meaning,
            'tags': tags,
            'prefixInfo': pref_info,
            'conjugation': conj,
            'example': ex_struct['de'] or ex_struct['full'],
            'exampleDe': ex_struct['de'] or ex_struct['full'],
            'exampleEn': ex_struct['en'],
            'exampleFull': ex_struct['full'],
            'origins': {
                'prefix': pref_info['prefix'],
                'prefixMeaning': pref_info['prefixMeaning'],
                'rootVerb': pref_info['rootVerb'],
                'rootMeaning': pref_info['rootMeaning'],
                'combinedLogic': pref_info['combinedLogic']
            }
        }
        verbs.append(verb_obj)

    deck_size = 50
    decks = []
    for i in range(0, len(verbs), deck_size):
        deck_verbs = verbs[i:i + deck_size]
        deck_num = (i // deck_size) + 1
        start_idx = i + 1
        end_idx = min(i + deck_size, len(verbs))
        decks.append({
            'deckId': deck_num,
            'title': f"Deck {deck_num} (Verbs {start_idx}–{end_idx})",
            'count': len(deck_verbs),
            'verbs': deck_verbs
        })

    dataset = {
        'totalVerbs': len(verbs),
        'verbsPerDeck': deck_size,
        'totalDecks': len(decks),
        'decks': decks
    }

    with open(output_file, 'w', encoding='utf-8') as f:
        json.dump(dataset, f, ensure_ascii=False, indent=2)

    print(f"Successfully exported {len(verbs)} clean verbs across {len(decks)} decks to {output_file}!")

if __name__ == '__main__':
    main()
