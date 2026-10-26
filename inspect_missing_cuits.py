import os
import json
import re
import pypdfium2 as pdfium
import winocr

folder = r"C:\Users\cript\Downloads\drive-download-20261025T121822Z-1-001"
targets = [
    '19538', '20418', '21039', '22079', '22484', '22509', '22672', '22724', '8757'
]

for t in targets:
    fnames = [f for f in os.listdir(folder) if f.startswith(t) and f.endswith('.pdf')]
    for fn in fnames:
        doc = pdfium.PdfDocument(os.path.join(folder, fn))
        print("=" * 60)
        print("FILE:", fn)
        for p in range(min(len(doc), 3)):
            img = doc[p].render(scale=2).to_pil()
            res = winocr.recognize_pil_sync(img, lang='es')
            txt = res['text']
            for line in txt.split('\n'):
                if any(k in line.upper() for k in ['CUIT', 'RAZON', 'CONTRATO', 'FECHA', '20-', '30-', '27-', '33-']):
                    print(f"  P{p+1}:", line[:100])
