import os
import pypdfium2 as pdfium
import winocr
from PIL import Image

folder = r"C:\Users\cript\Downloads\drive-download-20261025T121822Z-1-001"
scratch = r"C:\Users\cript\.gemini\antigravity\brain\365abf10-ca3f-47ca-ac6a-794c844ec6f0\scratch\suspicious"
os.makedirs(scratch, exist_ok=True)

# Indices to inspect deeply
indices = [1, 5, 23, 24, 36, 46, 47, 48, 50, 52, 53, 56, 57, 103, 104]

pdf_files = sorted([f for f in os.listdir(folder) if f.lower().endswith('.pdf')])

for idx in indices:
    fname = pdf_files[idx - 1]
    fpath = os.path.join(folder, fname)
    doc = pdfium.PdfDocument(fpath)
    
    # Save entire page 3
    p3_idx = 2 if len(doc) >= 3 else len(doc) - 1
    p3 = doc[p3_idx].render(scale=2).to_pil()
    p3.save(os.path.join(scratch, f"{idx}_p3.png"))
    
    # If page 4 exists, save it
    if len(doc) >= 4:
        p4 = doc[3].render(scale=2).to_pil()
        p4.save(os.path.join(scratch, f"{idx}_p4.png"))
        
    print(f"Saved visual renders for [{idx}] {fname} (Pages: {len(doc)})")
