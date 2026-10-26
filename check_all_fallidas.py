import os
import json
import re
import pdfplumber
import pypdfium2 as pdfium
import winocr

folder = r"C:\Users\cript\Downloads\drive-download-20261025T121822Z-1-001"
local_files = sorted([f for f in os.listdir(folder) if f.lower().endswith('.pdf')])

fallidas_detected = []

keywords = [
    'FALLIDA', 'VISITA FALLIDA', 'NO SE PUDO', 'NO SE REALIZO', 'NO SE REALIZÓ',
    'CERRADO', 'SIN ACTIVIDAD', 'OBRA FINALIZADA', 'NO PERMITIERON', 'IMPEDIMENTO',
    'NO SE ENCONTRO', 'NO SE ENCONTRÓ', 'LOCAL VACIO', 'LOCAL VACÍO', 'DESHABITADO'
]

for idx, fname in enumerate(local_files):
    fpath = os.path.join(folder, fname)
    # read text
    txt = ""
    try:
        with pdfplumber.open(fpath) as p:
            for page in p.pages:
                t = page.extract_text()
                if t: txt += t + " "
    except Exception:
        pass
        
    doc = pdfium.PdfDocument(fpath)
    for p in range(len(doc)):
        img = doc[p].render(scale=1.5).to_pil()
        res = winocr.recognize_pil_sync(img, lang='es')
        txt += " " + res['text']
        
    full_corpus = fname + " " + txt
    
    matches = []
    for kw in keywords:
        if kw in full_corpus.upper():
            # grab surrounding 100 chars
            pos = full_corpus.upper().find(kw)
            snippet = full_corpus[max(0, pos-40):min(len(full_corpus), pos+100)].replace('\n', ' ')
            matches.append((kw, snippet))
            
    if matches:
        print("="*60)
        print(f"[{idx+1}] POTENTIAL FALLIDA: {fname}")
        for kw, snip in matches:
            print(f"  [{kw}]: {snip}")
        fallidas_detected.append((fname, matches))

print(f"\nTotal potential fallidas detected: {len(fallidas_detected)}")
