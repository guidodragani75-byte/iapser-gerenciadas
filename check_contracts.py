import json
import csv

with open('all_pdfs_list.json', 'r', encoding='utf-8') as f:
    drive_files = json.load(f)

# Load master sheet rows from planilla_iapser_raw.csv
contracts = {}
with open('planilla_iapser_raw.csv', 'r', encoding='utf-8', errors='ignore') as f:
    reader = csv.DictReader(f)
    for r in reader:
        c = r['Contrato IAPART'].strip()
        if c not in contracts:
            contracts[c] = []
        contracts[c].append(r)

print(f"Total unique contracts in CSV: {len(contracts)}")

# Check matching
found_count = 0
not_found = []
for f in drive_files:
    fname = f['name']
    # extract leading number: e.g. "22211 - AGRO IND..."
    parts = fname.split(' - ')
    c_num = parts[0].strip()
    if c_num in contracts:
        found_count += 1
    else:
        not_found.append((c_num, fname))

print(f"Matched by contract number: {found_count} / {len(drive_files)}")
if not_found:
    print("Not found by contract number:")
    for c, fn in not_found:
        print(f"  {c} -> {fn}")
