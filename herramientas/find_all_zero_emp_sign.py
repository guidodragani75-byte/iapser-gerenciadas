import os
import pypdfium2 as pdfium
import numpy as np

folder = r"C:\Users\cript\Downloads\drive-download-20261025T121822Z-1-001"
pdf_files = sorted([f for f in os.listdir(folder) if f.lower().endswith('.pdf')])

results = []

for idx, fname in enumerate(pdf_files):
    fpath = os.path.join(folder, fname)
    doc = pdfium.PdfDocument(fpath)
    
    inks = []
    for p_no in range(min(len(doc), 3)):
        p = doc[p_no]
        img = p.render(scale=2).to_pil()
        w, h = img.size
        emp_box = img.crop((int(0.55 * w), int(0.835 * h), int(0.95 * w), int(0.905 * h)))
        ink = np.sum(np.array(emp_box.convert('L')) < 150)
        inks.append(int(ink))
        
    max_ink = max(inks) if inks else 0
    results.append({
        'idx': idx + 1,
        'fname': fname,
        'pages': len(doc),
        'inks': inks,
        'max_ink': max_ink
    })

results.sort(key=lambda x: x['max_ink'])

print("=== ALL FILES WITH MAX EMP INK < 1600 (ALL PAGES) ===")
zero_emp_files = [r for r in results if r['max_ink'] < 1600]
print(f"Total files: {len(zero_emp_files)}")
for r in zero_emp_files:
    print(f"[{r['idx']:3d}] max_ink={r['max_ink']:4d} inks={r['inks']} pages={r['pages']} | {r['fname']}")
