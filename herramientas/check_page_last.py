import os
import json
import pypdfium2 as pdfium
import winocr

folder = r"C:\Users\cript\Downloads\drive-download-20261025T121822Z-1-001"
with open('analisis_105_pdfs.json', 'r', encoding='utf-8') as f:
    records = json.load(f)

no_date = [r for r in records if not r.get('fecha_visita')]

for r in no_date[:5]:
    fname = r['nombre_archivo']
    fpath = os.path.join(folder, fname)
    doc = pdfium.PdfDocument(fpath)
    print("=" * 60)
    print("FILE:", fname)
    # Check last page
    p_last = len(doc) - 1
    img = doc[p_last].render(scale=2).to_pil()
    res = winocr.recognize_pil_sync(img, lang='es')
    print(f"Page {p_last+1} text:\n", res['text'][:500])
