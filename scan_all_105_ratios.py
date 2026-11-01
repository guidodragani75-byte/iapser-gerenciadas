import os
import pypdfium2 as pdfium
import numpy as np

folder = r"C:\Users\cript\Downloads\drive-download-20261025T121822Z-1-001"
pdf_files = sorted([f for f in os.listdir(folder) if f.lower().endswith('.pdf')])

results = []

for idx, fname in enumerate(pdf_files):
    fpath = os.path.join(folder, fname)
    doc = pdfium.PdfDocument(fpath)
    
    # Check page 3 or last page of form
    p_idx = min(2, len(doc)-1)
    p = doc[p_idx]
    img = p.render(scale=2).to_pil()
    w, h = img.size
    
    # ART box vs Empresa box
    art_box = img.crop((int(0.08 * w), int(0.835 * h), int(0.45 * w), int(0.905 * h)))
    emp_box = img.crop((int(0.55 * w), int(0.835 * h), int(0.95 * w), int(0.905 * h)))
    
    art_arr = np.array(art_box.convert('L'))
    emp_arr = np.array(emp_box.convert('L'))
    
    art_ink = np.sum(art_arr < 150)
    emp_ink = np.sum(emp_arr < 150)
    
    ratio = emp_ink / (art_ink + 1)
    
    results.append({
        'idx': idx + 1,
        'fname': fname,
        'pages': len(doc),
        'art_ink': int(art_ink),
        'emp_ink': int(emp_ink),
        'ratio': round(ratio, 3)
    })

results.sort(key=lambda x: x['ratio'])

print(f"Total PDFs: {len(results)}")
print("\n=== ALL FILES WITH RATIO < 0.35 ===")
for r in results:
    if r['ratio'] < 0.35:
        print(f"[{r['idx']:3d}] ratio={r['ratio']:.3f} (ART={r['art_ink']}, EMP={r['emp_ink']}) pages={r['pages']} | {r['fname']}")
