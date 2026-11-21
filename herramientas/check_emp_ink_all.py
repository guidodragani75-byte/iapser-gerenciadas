import os
import pypdfium2 as pdfium
import numpy as np

folder = r"C:\Users\cript\Downloads\drive-download-20261025T121822Z-1-001"
pdf_files = sorted([f for f in os.listdir(folder) if f.lower().endswith('.pdf')])

results = []

for idx, fname in enumerate(pdf_files):
    fpath = os.path.join(folder, fname)
    doc = pdfium.PdfDocument(fpath)
    
    # Check all pages (up to 3)
    p1_emp_ink = 0
    p2_emp_ink = 0
    p3_emp_ink = 0
    
    for p_no in range(min(len(doc), 3)):
        img = doc[p_no].render(scale=2).to_pil()
        w, h = img.size
        
        # Crop strictly inside the Empresa signing box (above the horizontal line)
        # Empirical coordinates:
        # x: 0.55*w to 0.95*w
        # y: 0.84*h to 0.915*h
        emp_box = img.crop((int(0.55 * w), int(0.84 * h), int(0.95 * w), int(0.915 * h)))
        arr = np.array(emp_box.convert('L'))
        
        # Pen ink is typically < 150
        ink_pixels = np.sum(arr < 150)
        
        if p_no == 0: p1_emp_ink = ink_pixels
        elif p_no == 1: p2_emp_ink = ink_pixels
        elif p_no == 2: p3_emp_ink = ink_pixels

    total_emp_ink = p1_emp_ink + p2_emp_ink + p3_emp_ink
    max_emp_ink = max(p1_emp_ink, p2_emp_ink, p3_emp_ink)
    
    results.append({
        'idx': idx + 1,
        'fname': fname,
        'pages': len(doc),
        'p1': p1_emp_ink,
        'p2': p2_emp_ink,
        'p3': p3_emp_ink,
        'max_ink': max_emp_ink,
        'total_ink': total_emp_ink
    })

results.sort(key=lambda x: x['total_ink'])

print("=== 25 FILES WITH LOWEST TOTAL EMPRESA INK ===")
for r in results[:25]:
    print(f"[{r['idx']:3d}] total={r['total_ink']:4d} (p1={r['p1']:3d}, p2={r['p2']:3d}, p3={r['p3']:3d}) pages={r['pages']} | {r['fname']}")
