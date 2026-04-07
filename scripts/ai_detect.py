from pdfminer.high_level import extract_text
import re, statistics

text = extract_text('paper/IEEE-conference-template-062824/paper.pdf')

# Layer 2: High-signal AI vocabulary
signals = [
    'delve','tapestry','nuanced','multifaceted','underscore','paramount','pivotal',
    'meticulous','holistic','robust','intricate','seamlessly','comprehensive',
    'stands as','serves as','crucial role','it is important to note','at its core',
    'in conclusion','in summary','furthermore','moreover','it should be noted',
    'plays a pivotal','marks a pivotal','testament to','vibrant','stunning',
    'nestled','notably','foster','facilitate','leverage','utilize','streamline'
]

print('=== LAYER 2: FLAGGED VOCABULARY ===')
found_vocab = []
for w in signals:
    count = len(re.findall(w, text, re.IGNORECASE))
    if count > 0:
        found_vocab.append((w, count))
        print(f'  FLAGGED {w!r}: {count}x')
if not found_vocab:
    print('  None found — PASS')

# Layer 3: Structural patterns
print('\n=== LAYER 3: STRUCTURAL PATTERNS ===')

# Em dash count
em = len(re.findall(r'\u2014', text))
print(f'Em dashes (—): {em}  {"FLAGGED (>15)" if em > 15 else "OK"}')

# Sentence length distribution (burstiness)
sentences = re.split(r'[.!?]+', text)
lengths = [len(s.split()) for s in sentences if len(s.split()) > 4]
if lengths:
    mean_len = statistics.mean(lengths)
    stdev_len = statistics.stdev(lengths)
    print(f'Sentence length — mean: {mean_len:.1f}, stdev: {stdev_len:.1f}')
    print(f'  {"LOW BURSTINESS (stdev < 7 = AI signal)" if stdev_len < 7 else "Good variation (stdev >= 7)"}')

# Tricolon structures
tricolons = re.findall(r'[A-Z][a-z\w]+,\s[a-z\w ]+,\s(?:and|or)\s[a-z\w ]+', text)
print(f'Tricolon-style lists (X, Y, and Z): {len(tricolons)}')
for t in tricolons[:4]:
    print(f'  > {t[:90]}')

# Negative parallelisms
neg_par = re.findall(r'not\b.{5,40};\s+it\b.{5,40}', text, re.IGNORECASE)
print(f'Negative parallelisms (not X; it Y): {len(neg_par)}')

# Layer 4: Content patterns
print('\n=== LAYER 4: CONTENT PATTERNS ===')
importance_puffery = re.findall(
    r'(important(?:ly)?|significant(?:ly)?|crucial(?:ly)?|critical(?:ly)?)', text, re.IGNORECASE
)
print(f'Importance/significance qualifiers: {len(importance_puffery)}')

# Hedging phrases
hedges = re.findall(
    r'(may not|might not|could|should be interpreted|it is worth noting|note that)', text, re.IGNORECASE
)
print(f'Hedging phrases: {len(hedges)}')

# Layer 7: Stylometric
print('\n=== LAYER 7: STYLOMETRIC ===')
first_person = len(re.findall(r'\b(I|we|our|my)\b', text))
print(f'First-person pronouns (I/we/our/my): {first_person}')

passive = len(re.findall(r'\b(is|are|was|were|be|been|being)\s+\w+ed\b', text))
print(f'Passive constructions (approx): {passive}')

# Specific Claude fingerprints (analytical structure, cautious qualifications)
qualifications = re.findall(
    r'(within this|interpreted within|should be treated as|may not generali[sz]|'
    r'outside the scope|identified as future work|uncharacteri[sz]ed|'
    r'results should)', text, re.IGNORECASE
)
print(f'Cautious academic qualifications: {len(qualifications)}')
for q in qualifications[:5]:
    print(f'  > {q}')

# Layer 8: Coherence — check for repeated concept cycling
print('\n=== LAYER 8: CONCEPT REPETITION ===')
key_phrase_repeats = []
for phrase in ['render isolation', 'surplus re-render', 'field-level', 'React.memo', 'granular']:
    c = len(re.findall(phrase, text, re.IGNORECASE))
    key_phrase_repeats.append((phrase, c))
    print(f'  {phrase!r}: {c}x')

print('\n=== SUMMARY ===')
print(f'Flagged vocabulary hits: {len(found_vocab)}')
print(f'Em dashes: {em}')
print(f'Sentence stdev: {stdev_len:.1f}')
print(f'First-person pronouns: {first_person}')
print(f'Tricolons: {len(tricolons)}')
print(f'Cautious qualifications: {len(qualifications)}')
