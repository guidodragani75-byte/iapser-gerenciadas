import os
import json
import re
import pypdfium2 as pdfium
import winocr

folder = r"C:\Users\cript\Downloads\drive-download-20261025T121822Z-1-001"
with open('analisis_105_pdfs.json', 'r', encoding='utf-8') as f:
    records = json.load(f)

# Also create dictionary for CUIT propagation across the same contract / company
company_cuits = {
    '19101': '30-67245842-7', # Municipalidad de Cutral Co
    '13398': '30-99906900-9', # Municipalidad de Plaza Huincul
    '20418': '30-99927486-9', # Municipalidad de Aluminé
    '22108': '30-71516632-3', # Surcala SRL
    '22845': '30-71851708-3', # Quimica del Oeste SAS
    '21039': '23-20691302-9', # Osses Parra Jose Luis
    '19538': '30-71595463-6', # Cia de Servicios Los Andes SA
    '22079': '30-68168113-9', # Parroquia Santa Lucia
    '22724': '30-71825980-7', # GVL Servicios SRL
    '22260': '30-70898220-9', # Soluciones Ambientales SA
    '22051': '30-71076096-5', # Grupo MR SRL
    '22379': '30-59988414-5', # Perfil SRL
    '22580': '33-71804231-9', # Cedeser SAS
    '22851': '30-71154884-6', # Aberturas SRL
    '20436': '30-67713437-9', # Parroquia Ntra Sra del Rosario de Andacollo
    '20240': '30-71012259-4', # Caleras Masut SRL
    '20186': '30-54622438-0', # La Cabaña SA
    '20175': '20-32544716-9', # Lander Ulises David
    '22564': '30-71726634-6', # Cafrathela SA
    '22732': '33-70803159-9', # Valida SA
    '19439': '30-54634367-3', # Transportes Automotores 20 de Junio SA
    '22219': '30-71081847-5', # M y M Ginestar SA
}

# Propagate known CUITs
for r in records:
    c_m = re.match(r'^(\d+)', r['nombre_archivo'])
    if c_m and c_m.group(1) in company_cuits:
        if not r.get('cuit') or len(r['cuit']) < 11:
            r['cuit'] = company_cuits[c_m.group(1)]

def parse_date_tokens(text):
    # Try finding DD/MM/YYYY or DD-MM-YYYY
    # Exclude 01/01/2026, 31/12/2026, 28/05/2026 (common renewal/contract dates)
    blacklist = {'01/01/2026', '31/12/2026', '28/05/2026', '28/05/2024', '01/01/2024', '31/12/2024'}
    
    # 1. Look for labeled dates first: FECHA: DD/MM/YYYY
    labeled = re.findall(r'(?:FECHA|CONSTANCIA DE CAPACITACI[OÓ]N)[\s\S]{0,50}?([0-3]?[0-9][\s\/\-\.][0-1]?[0-9][\s\/\-\.](?:20)?2[4-6])', text, re.IGNORECASE)
    for l in labeled:
        clean = re.sub(r'[\s\.\-]', '/', l.strip())
        parts = clean.split('/')
        if len(parts) == 3:
            d, m, y = parts
            if len(y) == 2: y = "20" + y
            cand = f"{d.zfill(2)}/{m.zfill(2)}/{y}"
            if cand not in blacklist:
                return cand
                
    # 2. Look for any date in text with 2026 or 2024 or 2025
    matches = re.findall(r'\b([0-3]?[0-9][\/\-\.][0-1]?[0-9][\/\-\.](?:20)?2[4-6])\b', text)
    for m in matches:
        clean = re.sub(r'[\s\.\-]', '/', m.strip())
        parts = clean.split('/')
        if len(parts) == 3:
            d, m, y = parts
            if len(y) == 2: y = "20" + y
            cand = f"{d.zfill(2)}/{m.zfill(2)}/{y}"
            if cand not in blacklist:
                return cand
    return ""

updated_fechas = 0
for idx, r in enumerate(records):
    if not r.get('fecha_visita'):
        fname = r['nombre_archivo']
        fpath = os.path.join(folder, fname)
        if not os.path.exists(fpath): continue
        try:
            doc = pdfium.PdfDocument(fpath)
            # Scan ALL pages for this document
            found_date = ""
            for p in range(len(doc)):
                img = doc[p].render(scale=2).to_pil()
                res = winocr.recognize_pil_sync(img, lang='es')
                t = res['text']
                cand = parse_date_tokens(t)
                if cand:
                    found_date = cand
                    break
            if found_date:
                r['fecha_visita'] = found_date
                updated_fechas += 1
                print(f"[{idx+1}] {fname[:35]} -> Fecha: {found_date}")
        except Exception as e:
            pass

print(f"\nTotal dates updated: {updated_fechas}")
print(f"Remaining without date: {sum(1 for r in records if not r.get('fecha_visita'))}")
print(f"Remaining without CUIT: {sum(1 for r in records if not r.get('cuit'))}")

# Save results
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
