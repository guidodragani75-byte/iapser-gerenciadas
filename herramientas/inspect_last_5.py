import os
import pypdfium2 as pdfium
import winocr
import re

folder = r"C:\Users\cript\Downloads\drive-download-20261025T121822Z-1-001"
check_files = [
    '22484', '22509', '22672', '22724', '8757'
]

for cf in check_files:
    matched = [f for f in os.listdir(folder) if f.startswith(cf) and f.endswith('.pdf')]
    for fn in matched:
        print("="*60)
        print("FILE:", fn)
        doc = pdfium.PdfDocument(os.path.join(folder, fn))
        full = ""
        for p in range(len(doc)):
            img = doc[p].render(scale=2).to_pil()
            res = winocr.recognize_pil_sync(img, lang='es')
            full += f"\n--- Page {p+1} ---\n" + res['text']
        print(full[:1500])
