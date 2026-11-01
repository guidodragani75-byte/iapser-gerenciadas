import json

with open('reception_full_audit.json', 'r', encoding='utf-8') as f:
    data = json.load(f)

print(f"Total files audited: {len(data)}")

# Let's inspect cases with photo_pages
print("=== FILES WITH PHOTO / EXTRA PAGES (num_pages >= 4) ===")
for d in data:
    if d['pages'] >= 4:
        print(f"[{d['idx']}] {d['fname']} (Pages: {d['pages']})")
        for p_no, txt in d['photo_pages']:
            print(f"   P{p_no}: {txt[:120]}")

# Let's inspect cases where Entrevistado has actual text vs empty
# Let's inspect cases where max_emp_sign is low (< 0.025)
print("\n=== CASES WITH LOW EMPRESA SIGNATURE (< 0.025) ===")
low_signs = [d for d in data if d['max_emp_sign'] < 0.025]
for d in low_signs:
    print(f"[{d['idx']}] max={d['max_emp_sign']} | Entrevistado: '{d['entrevistado']}' | Obs: '{d['obs'][:60]}' | {d['fname']}")
