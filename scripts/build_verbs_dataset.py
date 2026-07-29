import sqlite3
import os
import tempfile
import zipfile
import re
import json
import glob
from wordfreq import zipf_frequency

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

# Core A1 Verbs that MUST take priority in Decks 1 to 3
A1_CORE_VERBS = {
    'sein', 'haben', 'werden', 'können', 'müssen', 'wollen', 'sollen', 'dürfen', 'wissen',
    'kommen', 'gehen', 'machen', 'sehen', 'sagen', 'geben', 'finden', 'bleiben', 'stehen',
    'liegen', 'sitzen', 'bringen', 'denken', 'heißen', 'kennen', 'lassen', 'laufen', 'nehmen',
    'sprechen', 'tragen', 'verstehen', 'ziehen', 'arbeiten', 'essen', 'trinken', 'fahren',
    'kaufen', 'verkaufen', 'spielen', 'lernen', 'lesen', 'schreiben', 'schlafen', 'wohnen',
    'fliegen', 'kochen', 'schwimmen', 'duschen', 'waschen', 'putzen', 'ankommen', 'abfahren',
    'anfangen', 'aufhören', 'anrufen', 'bezahlen', 'kosten', 'suchen', 'brauchen', 'zahlen',
    'zeigen', 'treffen', 'fragen', 'danken', 'glauben', 'hoffen', 'versuchen', 'nennen',
    'schicken', 'bekommen', 'verlieren', 'gewinnen', 'fallen', 'halten', 'scheinen', 'beginnen',
    'vergessen', 'erinnern', 'fühlen', 'freuen', 'hören', 'helfen', 'wünschen', 'passen',
    'öffnen', 'schließen', 'aussehen', 'mitkommen', 'mitbringen', 'einladen'
}

HOMONYM_PENALTIES = {
    'regen': 3.5,     # Noun: der Regen (rain) vs Verb: sich regen (to stir)
    'rücken': 2.8,    # Noun: der Rücken (back) vs Verb: rücken (to shift/move)
    'modern': 4.0,    # Adj: modern (modern) vs Verb: modern (to rot/decay)
    'haaren': 3.5,    # Noun: die Haare (hair) vs Verb: haaren (to shed hair)
    'regeln': 2.0,    # Noun: die Regeln (rules) vs Verb: regeln (to regulate)
    'ebnen': 2.5,     # Adj: eben (flat) vs Verb: ebnen (to level)
    'einen': 3.5,     # Article: einen vs Verb: einen (to unite)
    'sondern': 3.5,   # Conjunction: sondern vs Verb: sondern (to segregate)
    'stunden': 3.5,   # Noun: Stunden (hours) vs Verb: stunden (to defer)
    'tagen': 3.5,     # Noun: Tagen (days) vs Verb: tagen (to convene)
    'morgen': 3.0,    # Adv/Noun: morgen (tomorrow) vs Verb: morgen
    'abend': 3.0,     # Noun: Abend (evening) vs Verb: abend
    'seiten': 3.0,    # Noun: Seiten (pages) vs Verb: seiten
    'sieben': 2.5,    # Number: sieben (seven) vs Verb: sieben (to sift)
    'grünen': 2.5,
    'langer': 2.5,
    'langen': 2.5,
    'kurzer': 2.5,
}

def clean_html(raw_html):
    if not raw_html:
        return ""
    clean = re.sub(r'\[sound:.*?\]', '', raw_html)
    clean = re.sub(r'<style.*?>.*?</style>', '', clean, flags=re.DOTALL)
    clean = re.sub(r'<script.*?>.*?</script>', '', clean, flags=re.DOTALL)
    clean = re.sub(r'<br\s*/?>', '\n', clean)
    clean = re.sub(r'<div>', '\n', clean)
    clean = re.sub(r'</?.*?>', '', clean)
    lines = [re.sub(r'\s+', ' ', l).strip() for l in clean.split('\n')]
    return '\n'.join([l for l in lines if l])

def detect_prefix_info(infinitive, meaning):
    for pref in sorted(SEPARABLE_PREFIXES, key=len, reverse=True):
        if infinitive.startswith(pref) and len(infinitive) > len(pref) + 2:
            return {
                'isSeparable': True,
                'prefix': pref,
                'prefixMeaning': PREFIX_MEANINGS.get(pref, 'separable prefix'),
                'rootVerb': infinitive[len(pref):],
                'rootMeaning': 'base verb meaning',
                'combinedLogic': f"Combines prefix '{pref}' ({PREFIX_MEANINGS.get(pref, 'prefix')}) + base '{infinitive[len(pref):]}'."
            }
    return {
        'isSeparable': False,
        'prefix': None,
        'prefixMeaning': None,
        'rootVerb': infinitive,
        'rootMeaning': meaning,
        'combinedLogic': f"Base verb '{infinitive}'."
    }

def parse_verb_forms(forms_raw, infinitive):
    forms_raw = re.sub(r'\[sound:.*?\]', '', forms_raw).strip()
    infinitive = re.sub(r'\[sound:.*?\]', '', infinitive).strip()

    pres_3rd = f"er/sie/es {infinitive}t"
    past_3rd = f"er/sie/es {infinitive}te"
    participle = f"ge{infinitive}t"
    auxiliary = "haben"

    if 'sein' in forms_raw.lower() or 'ist' in forms_raw.lower():
        auxiliary = "sein"

    matches = re.findall(r'([a-zA-ZäöüÄÖÜß]+)', forms_raw)
    for m in matches:
        m_lower = m.lower()
        if m_lower.startswith('ge') and len(m_lower) > 3:
            participle = m
        elif m_lower in ['ist', 'hat']:
            if m_lower == 'ist':
                auxiliary = 'sein'

    return pres_3rd, past_3rd, participle, auxiliary

def generate_conjugations(infinitive, pres_3rd, past_3rd, participle, auxiliary, pref_info):
    base = infinitive
    if base.endswith('en'):
        base = base[:-2]
    elif base.endswith('n'):
        base = base[:-1]

    tail = ""
    if pref_info['isSeparable'] and pref_info['prefix']:
        p = pref_info['prefix']
        if base.startswith(p):
            base = base[len(p):]
            tail = f" {p}"

    def build_pres():
        return {
            "ich": f"{base}e{tail}",
            "du": f"{base}st{tail}",
            "er_sie_es": f"{pres_3rd}",
            "wir": f"{base}en{tail}",
            "ihr": f"{base}t{tail}",
            "sie_Sie": f"{base}en{tail}"
        }

    def build_past():
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

def load_curriculum_words():
    words_set = set()
    pattern = r"d:\Programming\Antigravity-Projects\German-Words-List2-V2\content\generated\**\*.md"
    for filepath in glob.glob(pattern, recursive=True):
        with open(filepath, 'r', encoding='utf-8') as f:
            text = f.read()
            tokens = re.findall(r'[a-zA-ZäöüÄÖÜß]+', text)
            for tok in tokens:
                words_set.add(tok.lower())
    return words_set

def main():
    curriculum_words = load_curriculum_words()
    print(f"Loaded {len(curriculum_words)} curriculum tokens for frequency boosting.")

    temp_dir = tempfile.mkdtemp()
    with zipfile.ZipFile(apkg_path, 'r') as zip_ref:
        zip_ref.extractall(temp_dir)

    db_path = os.path.join(temp_dir, 'collection.anki21')
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()

    cursor.execute("SELECT id, tags, flds FROM notes")
    notes = cursor.fetchall()
    print(f"Extracted ALL {len(notes)} raw verb notes from Anki database.")

    raw_verbs = []
    for idx, note in enumerate(notes):
        flds = note[2].split('\x1f')
        raw_front = clean_html(flds[0])
        raw_back = flds[1]

        parts = raw_front.split('\n')
        infinitive = clean_html(parts[0]).strip()
        forms_raw = clean_html(parts[1]).strip() if len(parts) > 1 else ''

        clean_back = clean_html(raw_back)
        back_lines = [l.strip() for l in clean_back.split('\n') if l.strip()]
        meaning = back_lines[0] if len(back_lines) > 0 else ''

        ex_struct = parse_examples_structured(raw_back)
        pref_info = detect_prefix_info(infinitive, meaning)
        pres_3rd, past_3rd, participle, auxiliary = parse_verb_forms(forms_raw, infinitive)
        conj = generate_conjugations(infinitive, pres_3rd, past_3rd, participle, auxiliary, pref_info)

        inf_lower = infinitive.lower()
        zipf = zipf_frequency(inf_lower, 'de')
        score = zipf

        if inf_lower in HOMONYM_PENALTIES:
            score -= HOMONYM_PENALTIES[inf_lower]

        if inf_lower in A1_CORE_VERBS:
            score += 4.0
        elif inf_lower in curriculum_words:
            score += 1.5

        raw_verbs.append({
            'infinitive': infinitive,
            'meaning': meaning,
            'pres_3rd': pres_3rd,
            'past_3rd': past_3rd,
            'participle': participle,
            'auxiliary': auxiliary,
            'pref_info': pref_info,
            'conj': conj,
            'ex_struct': ex_struct,
            'zipf': zipf,
            'score': score
        })

    # Sort ALL 1796 verbs descending by score (NO DELETIONS - rare ones go to the very end!)
    raw_verbs.sort(key=lambda x: x['score'], reverse=True)

    # Group into 50-verb decks
    DECK_SIZE = 50
    decks = []
    total = len(raw_verbs)
    deck_count = (total + DECK_SIZE - 1) // DECK_SIZE

    for d_idx in range(deck_count):
        start = d_idx * DECK_SIZE
        end = min(start + DECK_SIZE, total)
        deck_verbs = []

        for v_idx in range(start, end):
            item = raw_verbs[v_idx]
            global_rank = v_idx + 1

            # Stable ID based on clean infinitive (e.g. v_werden)
            verb_id = f"v_{item['infinitive'].lower()}"

            tags = [f"freq-{global_rank:03d}"]
            if item['pref_info']['isSeparable']:
                tags.append('separable')

            is_irregular = (item['conj']['present3rd'] != f"er/sie/es {item['infinitive']}t") or \
                           (item['conj']['past3rd'] != f"er/sie/es {item['infinitive']}te") or \
                           (not item['participle'].endswith('t'))
            if is_irregular:
                tags.append('irregular')

            deck_verbs.append({
                'id': verb_id,
                'index': global_rank,
                'infinitive': item['infinitive'],
                'meaning': item['meaning'],
                'prefixInfo': item['pref_info'],
                'conjugation': item['conj'],
                'exampleDe': item['ex_struct']['de'],
                'exampleEn': item['ex_struct']['en'],
                'exampleFull': item['ex_struct']['full'],
                'origins': {
                    'prefix': item['pref_info']['prefix'],
                    'prefixMeaning': item['pref_info']['prefixMeaning'],
                    'rootVerb': item['pref_info']['rootVerb'],
                    'rootMeaning': item['pref_info']['rootMeaning'],
                    'combinedLogic': item['pref_info']['combinedLogic']
                },
                'tags': tags
            })

        decks.append({
            'deckId': d_idx + 1,
            'title': f"Deck {d_idx + 1} (Verbs {start + 1}–{end})",
            'count': len(deck_verbs),
            'verbs': deck_verbs
        })

    final_payload = {
        'totalVerbs': total,
        'totalDecks': deck_count,
        'deckSize': DECK_SIZE,
        'decks': decks
    }

    with open(output_file, 'w', encoding='utf-8') as f:
        json.dump(final_payload, f, ensure_ascii=False, indent=2)

    print(f"SUCCESS: Exported {total} verbs across {deck_count} decks to {output_file}.")

if __name__ == '__main__':
    main()
