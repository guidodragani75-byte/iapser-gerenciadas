import os
import json
import pypdfium2 as pdfium
import winocr

folder = r"C:\Users\cript\Downloads\drive-download-20261025T121822Z-1-001"
with open('analisis_105_pdfs.json', 'r', encoding='utf-8') as f:
    records = json.load(f)

no_date = [r for r in records if not r.get('fecha_visita')]
print(f"Total without date: {len(no_date)}")

for r in no_date[:5]:
    fname = r['nombre_archivo']
    fpath = os.path.join(folder, fname)
    doc = pdfium.PdfDocument(fpath)
    print("=" * 60)
    print("FILE:", fname)
    img1 = doc[0].render(scale=2).to_pil()
    w, h = img1.size
    crop = img1.crop((int(w * 0.45), 0, w, int(h * 0.15)))
    res = winocr.recognize_pil_sync(crop, lang='es')
    print("Top Right Box (Date Area):\n", res['text'])
