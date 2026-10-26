import os
import json
import re
import pypdfium2 as pdfium
import winocr

folder = r"C:\Users\cript\Downloads\drive-download-20261025T121822Z-1-001"
with open('analisis_105_pdfs.json', 'r', encoding='utf-8') as f:
    records = json.load(f)

def clean_date_str(s):
    if not s: return ""
    s = s.replace('-', '/').replace('.', '/').replace(' ', '')
    m = re.search(r'([0-3]?[0-9])/([0-1]?[0-9])/(20)?([2-3][0-9])', s)
    if m:
        d, mes, _, y = m.groups()
        return f"{d.zfill(2)}/{mes.zfill(2)}/20{y}"
    return ""

found_new = 0
for idx, r in enumerate(records):
    if not r.get('fecha_visita'):
        fname = r['nombre_archivo']
        fpath = os.path.join(folder, fname)
        if not os.path.exists(fpath): continue
        doc = pdfium.PdfDocument(fpath)
        
        # Check all pages, focusing on regex for date
        cand_date = ""
        for p in range(len(doc)):
            img = doc[p].render(scale=2).to_pil()
            res = winocr.recognize_pil_sync(img, lang='es')
            txt = res['text']
            
            # Find any DD-MM-YYYY or DD/MM/YYYY pattern
            dates = re.findall(r'\b([0-3]?[0-9][\s\-\/\.][0-1]?[0-9][\s\-\/\.](?:20)?2[4-7])\b', txt)
            for d in dates:
                cd = clean_date_str(d)
                if cd and cd not in ['01/01/2026', '31/12/2026', '28/05/2026', '28/05/2024']:
                    cand_date = cd
                    break
            if cand_date: break
            
        if cand_date:
            r['fecha_visita'] = cand_date
            found_new += 1
            print(f"[{idx+1}] {fname[:35]} -> Fecha: {cand_date}")

print(f"\nFound new dates: {found_new}")
print(f"Total still missing: {sum(1 for r in records if not r.get('fecha_visita'))}")

# Save
with open('analisis_105_pdfs.json', 'w', encoding='utf-8') as out_j:
    json.dump(records, out_j, indent=2, ensure_ascii=False)

import csv
with open('analisis_105_pdfs.csv', 'w', newline='', encoding='utf-8-sig') as out_c:
    writer = csv.DictWriter(out_c, fieldnames=[
        "nombre_archivo", "cuit", "rs", "nro_establecimiento",
        "fecha_visita", "resultado", "observacion_fallida", "link_doc"
    ])
    writer.writeheader()
    writer.writerows(records)
