import os
import pypdfium2 as pdfium
import numpy as np
from PIL import Image

folder = r"C:\Users\cript\Downloads\drive-download-20261025T121822Z-1-001"
pdf_files = sorted([f for f in os.listdir(folder) if f.lower().endswith('.pdf')])

# Let's write a script to check for each PDF:
# Is there an employer signature on ANY page?
# The employer signature box is on the bottom right of pages 1, 2, 3.
# Let's crop just the blank area inside the box, EXCLUDING the printed line and the text "Firma y aclaracion por la Empresa".

print(f"Total PDFs: {len(pdf_files)}")

results = []
for idx, fname in enumerate(pdf_files):
    fpath = os.path.join(folder, fname)
    doc = pdfium.PdfDocument(fpath)
    
    # We will check page 1 and page 3 (or page 2)
    # The signature box is located at:
    # x: 0.55 to 0.95 of width
    # y: 0.84 to 0.91 of height (ABOVE the printed line 'Firma y aclaracion...')
    
    signs = []
    for p_no in range(min(len(doc), 3)):
        img = doc[p_no].render(scale=2).to_pil()
        w, h = img.size
        
        # Crop specifically the blank signing area inside the box above the line
        box = img.crop((int(0.55 * w), int(0.835 * h), int(0.95 * w), int(0.905 * h)))
        arr = np.array(box.convert('L'))
        
        # Dark pixels (ink)
        # Threshold: pure paper is > 240, scan noise is 200-240. Pen ink is < 160.
        ink_pixels = np.sum(arr < 160)
        ratio = ink_pixels / arr.size
        signs.append(ratio)
        
    max_sign = max(signs) if signs else 0
    results.append({
        'idx': idx + 1,
        'fname': fname,
        'pages': len(doc),
        'signs': [round(s, 4) for s in signs],
        'max_sign': round(max_sign, 4)
    })

# Sort by max_sign ascending
sorted_res = sorted(results, key=lambda x: x['max_sign'])
print("--- 20 LOWEST SIGNATURE SCORES ---")
for r in sorted_res[:20]:
    print(f"[{r['idx']}] max={r['max_sign']} signs={r['signs']} pages={r['pages']} | {r['fname']}")
