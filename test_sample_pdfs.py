import os
import json
import pdfplumber
import pypdfium2 as pdfium
import winocr

folder = r"C:\Users\cript\Downloads\drive-download-20261025T121822Z-1-001"
pdfs = sorted([f for f in os.listdir(folder) if f.lower().endswith('.pdf')])

print(f"Total PDFs: {len(pdfs)}")

for i in [0, 5, 10, 20, 40, 60, 80, 100]:
    if i >= len(pdfs): continue
    fname = pdfs[i]
    fpath = os.path.join(folder, fname)
    print(f"\n--- [{i+1}] {fname} ---")
    
    # Try pdfplumber first
    plumber_text = ""
    with pdfplumber.open(fpath) as p:
        for page in p.pages[:2]:
            t = page.extract_text()
            if t: plumber_text += t + " "
    
    if len(plumber_text.strip()) > 30:
        print(f"PLUMBER ({len(plumber_text)} chars):", plumber_text[:300].replace('\n', ' '))
    else:
        # OCR page 1
        doc = pdfium.PdfDocument(fpath)
        img = doc[0].render(scale=2).to_pil()
        res = winocr.recognize_pil_sync(img, lang='es')
        ocr_text = res['text']
        print(f"OCR ({len(ocr_text)} chars):", ocr_text[:300].replace('\n', ' '))
