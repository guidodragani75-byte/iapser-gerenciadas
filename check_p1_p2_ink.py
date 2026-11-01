import os
import pypdfium2 as pdfium
import numpy as np

folder = r"C:\Users\cript\Downloads\drive-download-20261025T121822Z-1-001"
pdf_files = sorted([f for f in os.listdir(folder) if f.lower().endswith('.pdf')])

candidates = [57, 47, 50, 1, 56, 36, 5, 104, 53, 46, 103, 23, 81, 24, 95, 65, 55, 93, 20, 52, 48]

print("=== CHECKING PAGE 1 EMPRESA BOX FOR ALL 21 CANDIDATES ===")

for idx in candidates:
    fn = pdf_files[idx - 1]
    doc = pdfium.PdfDocument(os.path.join(folder, fn))
    
    p1 = doc[0]
    img = p1.render(scale=2).to_pil()
    w, h = img.size
    
    art_box = img.crop((int(0.08 * w), int(0.835 * h), int(0.45 * w), int(0.905 * h)))
    emp_box = img.crop((int(0.55 * w), int(0.835 * h), int(0.95 * w), int(0.905 * h)))
    
    art_ink = np.sum(np.array(art_box.convert('L')) < 150)
    emp_ink = np.sum(np.array(emp_box.convert('L')) < 150)
    
    # Also check Page 2 if len >= 2
    emp_ink_p2 = 0
    if len(doc) >= 2:
        p2 = doc[1].render(scale=2).to_pil()
        emp_box2 = p2.crop((int(0.55 * w), int(0.835 * h), int(0.95 * w), int(0.905 * h)))
        emp_ink_p2 = np.sum(np.array(emp_box2.convert('L')) < 150)
        
    print(f"[{idx:3d}] P1: ART={art_ink:4d}, EMP={emp_ink:4d} | P2 EMP={emp_ink_p2:4d} | {fn}")
