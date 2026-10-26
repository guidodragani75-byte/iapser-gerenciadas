import json
import re

with open('all_pdfs_list.json', 'r', encoding='utf-8') as f:
    files = json.load(f)

print(f"Total PDFs: {len(files)}")
for i, f in enumerate(files):
    name = f['name']
    print(f"[{i+1:3d}] {name}")
