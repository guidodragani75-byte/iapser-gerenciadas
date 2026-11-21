import json
import re

with open('audit_reception_raw.json', 'r', encoding='utf-8') as f:
    data = json.load(f)

# Let's inspect distribution of pages and check cases with pages == 3
pages_3 = [d for d in data if d['pages'] == 3]
print(f'Total files with exactly 3 pages: {len(pages_3)}')

for d in pages_3:
    idx = d['idx']
    fn = d['fname']
    obs = ' '.join(d['obs_lines'])
    d1 = d['dark1']
    d3 = d['dark3']
    print(f'[{idx}] {fn} | Dark1: {d1}, Dark3: {d3} | Obs: {obs[:80]}')
