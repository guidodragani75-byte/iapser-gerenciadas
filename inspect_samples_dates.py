import os
import pypdfium2 as pdfium
import winocr

folder = r"C:\Users\cript\Downloads\drive-download-20261025T121822Z-1-001"
samples = ['16024', '16160', '1830']

for s in samples:
    fn = [f for f in os.listdir(folder) if f.startswith(s)][0]
    print("=" * 60)
    print("FILE:", fn)
    doc = pdfium.PdfDocument(os.path.join(folder, fn))
    print(f"Num pages: {len(doc)}")
    for p in range(len(doc)):
        img = doc[p].render(scale=2).to_pil()
        res = winocr.recognize_pil_sync(img, lang='es')
        txt = res['text']
        for line in txt.split('\n'):
            if any(k in line.upper() for k in ['FECHA', '2026', '2025', '2024', 'FIRM', 'ACLARAC']):
                print(f"  P{p+1}:", line[:100])
