import os
import pypdfium2 as pdfium
import winocr

folder = r"C:\Users\cript\Downloads\drive-download-20261025T121822Z-1-001"
samples = ['20175', '20184', '20240']

for s in samples:
    fn = [f for f in os.listdir(folder) if f.startswith(s)][0]
    print("=" * 60)
    print("FILE:", fn)
    doc = pdfium.PdfDocument(os.path.join(folder, fn))
    for p in range(len(doc)):
        img = doc[p].render(scale=2).to_pil()
        res = winocr.recognize_pil_sync(img, lang='es')
        txt = res['text']
        print(f"--- Page {p+1} ({len(txt)} chars) ---")
        lines = [l.strip() for l in txt.split('\n') if l.strip()]
        for l in lines[:10]:
            print(" ", l[:100])
