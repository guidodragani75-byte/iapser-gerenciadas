import os
import pypdfium2 as pdfium
import numpy as np
from PIL import Image

folder = r"C:\Users\cript\Downloads\drive-download-20261025T121822Z-1-001"
pdf_files = sorted([f for f in os.listdir(folder) if f.lower().endswith('.pdf')])

# Let's inspect the actual visual difference between ART box and Empresa box.
# For each document, on page 1 and page 3:
# ART box: [0.08*w to 0.45*w, 0.835*h to 0.905*h]
# Empresa box: [0.55*w to 0.95*w, 0.835*h to 0.905*h]

candidates = [56, 57, 48, 95, 93, 55, 65, 20, 81, 53, 31, 1, 72, 21, 47, 52, 36, 49, 50, 46, 5, 23, 24, 103, 104]

for idx in candidates:
    fn = pdf_files[idx - 1]
    doc = pdfium.PdfDocument(os.path.join(folder, fn))
    
    # Check page 3 (or page 1)
    p = doc[min(2, len(doc)-1)]
    img = p.render(scale=2).to_pil()
    w, h = img.size
    
    art_box = img.crop((int(0.08 * w), int(0.835 * h), int(0.45 * w), int(0.905 * h)))
    emp_box = img.crop((int(0.55 * w), int(0.835 * h), int(0.95 * w), int(0.905 * h)))
    
    art_arr = np.array(art_box.convert('L'))
    emp_arr = np.array(emp_box.convert('L'))
    
    art_ink = np.sum(art_arr < 150)
    emp_ink = np.sum(emp_arr < 150)
    
    print(f"[{idx:3d}] ART ink: {art_ink:4d} | EMP ink: {emp_ink:4d} | ratio: {emp_ink/(art_ink+1):.2f} | {fn}")
