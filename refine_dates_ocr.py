import os
import json
import re
import pypdfium2 as pdfium
import winocr

folder = r"C:\Users\cript\Downloads\drive-download-20261025T121822Z-1-001"
with open('analisis_105_pdfs.json', 'r', encoding='utf-8') as f:
    records = json.load(f)

print(f"Loaded {len(records)} records. Missing dates: {sum(1 for r in records if not r.get('fecha_visita'))}")

# For records missing date or CUIT, let's OCR page 1 and page 3 header/footer
def clean_date_str(s):
    if not s: return ""
    s = s.replace('-', '/').replace('.', '/').replace(' ', '')
    m = re.search(r'([0-3]?[0-9])/([0-1]?[0-9])/(20)?([2-3][0-9])', s)
    if m:
        d, mes, _, y = m.groups()
        return f"{d.zfill(2)}/{mes.zfill(2)}/20{y}"
    return ""

updated_count = 0
for idx, r in enumerate(records):
    if not r.get('fecha_visita') or not r.get('cuit'):
        fname = r['nombre_archivo']
        fpath = os.path.join(folder, fname)
        if not os.path.exists(fpath): continue
        
        try:
            doc = pdfium.PdfDocument(fpath)
            
            # Check Page 1
            img1 = doc[0].render(scale=2).to_pil()
            w, h = img1.size
            
            # Header crop page 1 (contains CUIT and Fecha)
            crop_hdr = img1.crop((0, 0, w, int(h * 0.35)))
            res_hdr = winocr.recognize_pil_sync(crop_hdr, lang='es')
            text_hdr = res_hdr['text']
            
            # Look for CUIT if missing
            if not r.get('cuit'):
                m_cuit = re.search(r'\b(20|23|24|27|30|33|34)[-]?([0-9]{8})[-]?([0-9])\b', text_hdr)
                if m_cuit:
                    raw_c = "".join(m_cuit.groups())
                    r['cuit'] = f"{raw_c[:2]}-{raw_c[2:10]}-{raw_c[10]}"
            
            # Look for Fecha in Header
            if not r.get('fecha_visita'):
                # Fecha: DD/MM/YY
                m_f = re.search(r'Fecha[\s:]*([0-3]?[0-9][\s\/\-\.][0-1]?[0-9][\s\/\-\.](?:20)?[2-3][0-9])', text_hdr, re.IGNORECASE)
                if m_f:
                    fd = clean_date_str(m_f.group(1))
                    if fd and fd not in ['01/01/2026', '31/12/2026', '28/05/2026']: # 28/05/2026 is often renewal date
                        r['fecha_visita'] = fd
                        
            # If still missing fecha, check Page 3 (Observations / signature date)
            if not r.get('fecha_visita') and len(doc) >= 3:
                img3 = doc[2].render(scale=2).to_pil()
                w3, h3 = img3.size
                # Header crop page 3
                crop_hdr3 = img3.crop((0, 0, w3, int(h3 * 0.35)))
                res_hdr3 = winocr.recognize_pil_sync(crop_hdr3, lang='es')
                m_f3 = re.search(r'Fecha[\s:]*([0-3]?[0-9][\s\/\-\.][0-1]?[0-9][\s\/\-\.](?:20)?[2-3][0-9])', res_hdr3['text'], re.IGNORECASE)
                if m_f3:
                    fd = clean_date_str(m_f3.group(1))
                    if fd and fd not in ['01/01/2026', '31/12/2026', '28/05/2026']:
                        r['fecha_visita'] = fd
                
                # If still missing, check anywhere in page 3
                if not r.get('fecha_visita'):
                    res_p3 = winocr.recognize_pil_sync(img3, lang='es')
                    all_p3_dates = re.findall(r'\b([0-3]?[0-9][\/\-\.][0-1]?[0-9][\/\-\.](?:20)?2[4-6])\b', res_p3['text'])
                    for apd in all_p3_dates:
                        cd = clean_date_str(apd)
                        if cd and cd not in ['01/01/2026', '31/12/2026', '28/05/2026']:
                            r['fecha_visita'] = cd
                            break

            if r.get('fecha_visita'):
                updated_count += 1
                print(f"[{idx+1}] {fname[:35]} -> Fecha: {r['fecha_visita']} | CUIT: {r['cuit']}")
        except Exception as e:
            pass

print(f"\nUpdated {updated_count} records. Missing dates remaining: {sum(1 for r in records if not r.get('fecha_visita'))}")

# Save updated JSON and CSV
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
