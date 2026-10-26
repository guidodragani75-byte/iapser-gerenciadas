import os
import json
import unicodedata

folder = r"C:\Users\cript\Downloads\drive-download-20261025T121822Z-1-001"
local_files = [f for f in os.listdir(folder) if f.lower().endswith('.pdf')]

with open('all_pdfs_list.json', 'r', encoding='utf-8') as f:
    drive_files = json.load(f)

print(f"Local PDFs: {len(local_files)}")
print(f"Drive PDFs: {len(drive_files)}")

def norm(s):
    # normalize unicode and replace common bad characters
    s = unicodedata.normalize('NFD', s)
    s = "".join(c for c in s if unicodedata.category(c) != 'Mn')
    s = s.replace('', '').replace(' ', '').replace('_', '').replace('-', '').replace('.', '').replace('(', '').replace(')', '').lower()
    return s

drive_map = {}
for df in drive_files:
    drive_map[norm(df['name'])] = df

matched = 0
unmatched = []
for lf in local_files:
    nlf = norm(lf)
    if nlf in drive_map:
        matched += 1
    else:
        # try prefix match
        found = False
        for k, v in drive_map.items():
            if nlf[:20] in k or k[:20] in nlf:
                matched += 1
                found = True
                break
        if not found:
            unmatched.append(lf)

print(f"Matched: {matched} / {len(local_files)}")
if unmatched:
    print("Unmatched:", unmatched)
