import os
import glob
import json
import pdfplumber
import pypdf

folder = r"C:\Users\cript\Downloads\drive-download-20261025T121822Z-1-001"
pdfs = [f for f in os.listdir(folder) if f.lower().endswith('.pdf')]
print(f"Total PDFs found: {len(pdfs)}")

# Test extracting first 3 PDFs
for fname in pdfs[:3]:
    fpath = os.path.join(folder, fname)
    print("=" * 60)
    print("FILE:", fname)
    try:
        with pdfplumber.open(fpath) as pdf:
            print(f"Num pages: {len(pdf.pages)}")
            for p_idx, page in enumerate(pdf.pages[:2]):
                txt = page.extract_text()
                print(f"--- Page {p_idx+1} ---")
                print(txt[:600] if txt else "[No text / Image only]")
    except Exception as e:
        print("Error reading:", e)
