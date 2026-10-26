import os
import json
import re
import csv
import unicodedata
import pdfplumber
import pypdfium2 as pdfium
import winocr

folder = r"C:\Users\cript\Downloads\drive-download-20261025T121822Z-1-001"
local_files = sorted([f for f in os.listdir(folder) if f.lower().endswith('.pdf')])

with open('all_pdfs_list.json', 'r', encoding='utf-8') as f:
    drive_files = json.load(f)

def norm(s):
    s = unicodedata.normalize('NFD', s)
    s = "".join(c for c in s if unicodedata.category(c) != 'Mn')
    s = s.replace('', '').replace(' ', '').replace('_', '').replace('-', '').replace('.', '').replace('(', '').replace(')', '').lower()
    return s

drive_map = {}
for df in drive_files:
    drive_map[norm(df['name'])] = df

# Load planilla master
contracts_db = {}
if os.path.exists('planilla_iapser_raw.csv'):
    with open('planilla_iapser_raw.csv', 'r', encoding='utf-8', errors='ignore') as f:
        reader = csv.DictReader(f)
        for r in reader:
            c = r.get('Contrato IAPART', '').strip()
            if c:
                if c not in contracts_db:
                    contracts_db[c] = []
                contracts_db[c].append(r)

def get_drive_link(fname):
    nf = norm(fname)
    if nf in drive_map:
        return drive_map[nf].get('webViewLink', '')
    for k, v in drive_map.items():
        if nf[:25] in k or k[:25] in nf:
            return v.get('webViewLink', '')
    return ""

def clean_cuit(cuit_raw):
    digits = re.sub(r'\D', '', cuit_raw)
    if len(digits) == 11 and digits.startswith(('20', '23', '24', '27', '30', '33', '34')):
        return f"{digits[:2]}-{digits[2:10]}-{digits[10]}"
    return cuit_raw

def clean_date(d_str):
    if not d_str: return ""
    d_str = d_str.strip().replace('-', '/').replace('.', '/')
    m = re.match(r'^([0-3]?[0-9])/([0-1]?[0-9])/([0-9]{2,4})$', d_str)
    if m:
        d, mes, y = m.groups()
        if len(y) == 2:
            y = "20" + y
        return f"{d.zfill(2)}/{mes.zfill(2)}/{y}"
    return d_str

def parse_single_pdf(fname):
    fpath = os.path.join(folder, fname)
    link = get_drive_link(fname)

    # 1. Text extraction (plumber + winocr fallback/enrichment)
    text = ""
    try:
        with pdfplumber.open(fpath) as p:
            for page in p.pages[:3]:
                t = page.extract_text()
                if t: text += t + "\n"
    except Exception:
        pass

    # If text is minimal or missing CUIT, do OCR
    if len(text.strip()) < 300 or "CUIT" not in text.upper():
        try:
            doc = pdfium.PdfDocument(fpath)
            for p_no in range(min(len(doc), 3)):
                img = doc[p_no].render(scale=2).to_pil()
                res = winocr.recognize_pil_sync(img, lang='es')
                if res and res.get('text'):
                    text += f"\n--- OCR P{p_no+1} ---\n" + res['text']
        except Exception as e:
            pass

    corpus = fname + "\n" + text

    # Contract Number from filename
    c_m = re.match(r'^(\d+)\s*-\s*', fname)
    contrato = c_m.group(1) if c_m else ""

    # Master sheet lookup
    master_rows = contracts_db.get(contrato, [])

    # 2. Razón Social (RS)
    rs = ""
    # Try filename: e.g. "22211 - AGRO IND. CLNIA 25 DE MAYO DE RESP LIMITADA (..."
    rs_fn = re.match(r'^\d+\s*-\s*(?:[0-9]{11}\.\s*)?([^\(]+?)(?:\s*\(|$)', fname)
    if rs_fn:
        rs = rs_fn.group(1).strip()
        # Clean trailing dot
        if rs.endswith('.'): rs = rs[:-1].strip()

    # If RS is truncated or empty, check OCR or master
    rs_ocr = re.search(r'(?:Raz[oó]n\s+Social|Empresa|Empleador)[\s:]+([^\r\n]{3,60})', text, re.IGNORECASE)
    if rs_ocr and len(rs_ocr.group(1).strip()) > len(rs):
        candidate_rs = rs_ocr.group(1).strip()
        # Ensure not garbage
        if not any(k in candidate_rs.upper() for k in ['FECHA', 'CUIT', 'CONTRATO', 'IAPSER']):
            rs = candidate_rs
    if not rs and master_rows:
        rs = master_rows[0].get('Empleador', '').strip()

    # 3. Nro de Establecimiento
    estab = ""
    # First check filename: "EST. 2", "EST 1", "ESTABLECIMIENTO 3", "OBRA 1", "EST 0"
    est_fn = re.search(r'\b(?:EST\.?|ESTAB\.?|ESTABLECIMIENTO|OBRA)\s*([0-9]+)\b', fname, re.IGNORECASE)
    if est_fn:
        estab = est_fn.group(1)
    else:
        # Check OCR: "Nro. Est.: 2" or "CI: 2" or "ESTABL.: 1"
        est_ocr = re.search(r'\b(?:Nro\.?\s*Est\.?|ESTABL\.?|CI)[\s:]*([0-9]+)\b', text, re.IGNORECASE)
        if est_ocr:
            estab = est_ocr.group(1)
        elif master_rows:
            estab = master_rows[0].get('Nro Estab Intercambio', master_rows[0].get('Nro Estab IAPART', '1')).strip()
        else:
            estab = "1"

    # 4. CUIT
    cuit = ""
    # Search CUIT in text
    cuit_ocr = re.search(r'(?:CUIT|C\.U\.I\.T\.?)[\s:]*([0-9]{2}[-\s]?[0-9]{8}[-\s]?[0-9])', text, re.IGNORECASE)
    if cuit_ocr:
        cuit = clean_cuit(cuit_ocr.group(1))
    else:
        # Any 11-digit CUIT pattern in text
        cuits = re.findall(r'\b(20|23|24|27|30|33|34)[-]?([0-9]{8})[-]?([0-9])\b', text)
        if cuits:
            cuit = clean_cuit("".join(cuits[0]))
        else:
            # Check filename: e.g. "20984 - 20284545568. FREDES..."
            cuit_fn = re.search(r'\b(20|23|24|27|30|33|34)[0-9]{9}\b', fname)
            if cuit_fn:
                cuit = clean_cuit(cuit_fn.group(0))
            elif master_rows:
                # Find matching establishment or first
                matching_m = [m for m in master_rows if m.get('Nro Estab Intercambio') == estab or m.get('Nro Estab IAPART') == estab]
                cuit = clean_cuit(matching_m[0].get('Cuit') if matching_m else master_rows[0].get('Cuit', ''))

    # 5. Fecha de Visita
    fecha = ""
    # Specific date patterns in text:
    # Pattern A: "Fecha: DD/MM/YYYY" or "Fecha: DD-MM-YYYY" or "Fecha: DD.MM.YYYY"
    date_labeled = re.findall(r'Fecha[\s:]*([0-3]?[0-9][\/\-\.][0-1]?[0-9][\/\-\.](?:20)?[2-3][0-9])', text, re.IGNORECASE)
    for dl in date_labeled:
        cand = clean_date(dl)
        # Avoid renewal dates or 01/01/2026 default
        if cand and cand not in ['01/01/2026', '31/12/2026']:
            fecha = cand
            break

    if not fecha:
        # Pattern B: Standard date anywhere in text (prioritizing 2026 or 2024-2026)
        all_dates = re.findall(r'\b([0-3]?[0-9][\/\-\.][0-1]?[0-9][\/\-\.](?:20)?2[4-6])\b', text)
        for ad in all_dates:
            cand = clean_date(ad)
            if cand and cand not in ['01/01/2026', '31/12/2026']:
                fecha = cand
                break

    if not fecha:
        # Pattern C: Check filename
        fn_d = re.search(r'\b([0-3]?[0-9])[\s\/\-\.](0?[1-9]|1[0-2])[\s\/\-\.](202[4-6])\b', fname)
        if fn_d:
            fecha = f"{fn_d.group(1).zfill(2)}/{fn_d.group(2).zfill(2)}/{fn_d.group(3)}"

    # 6. Resultado (Efectiva vs Fallida)
    es_fallida = False
    obs_fallida = ""

    # Check filename first
    if 'FALLIDA' in fname.upper() or 'VISITA FALLIDA' in fname.upper():
        es_fallida = True

    # Check text for fallida markers
    fallida_triggers = [
        'VISITA FALLIDA', 'RESULTADO: FALLIDA', 'MOTIVOS DE VISITA FALLIDA',
        'NO SE PUDO REALIZAR', 'SE ENCONTRABA CERRADO', 'ESTABLECIMIENTO CERRADO',
        'OBRA FINALIZADA', 'NO PERMITIERON EL INGRESO', 'SIN ACTIVIDAD EN EL PREDIO',
        'NO HABIA OPERARIOS', 'NO SE ENCONTRABA NADIE'
    ]
    for ft in fallida_triggers:
        if ft in text.upper():
            es_fallida = True
            break

    # 7. Observación si es fallida
    if es_fallida:
        # Extract from text observations
        obs_m = re.search(r'(?:Observaci[oó]n(?:es)?|Motivo(?:s)?|Causa)[\s:]*([^\r\n]{10,300})', text, re.IGNORECASE)
        if obs_m:
            obs_fallida = obs_m.group(1).strip()
        else:
            # Check context around fallida
            ctx = re.search(r'([^\.\n]*fallida[^\.\n]*)', text, re.IGNORECASE)
            if ctx:
                obs_fallida = ctx.group(1).strip()
            elif 'FALLIDA' in fname.upper():
                obs_fallida = "Visita fallida registrada según acta y documentación adjunta."

    resultado = "Fallida" if es_fallida else "Efectiva"

    return {
        "nombre_archivo": fname,
        "cuit": cuit,
        "rs": rs,
        "nro_establecimiento": estab,
        "fecha_visita": fecha,
        "resultado": resultado,
        "observacion_fallida": obs_fallida if es_fallida else "",
        "link_doc": link
    }

print("Starting batch processing of 105 PDFs...")
results = []
for idx, f in enumerate(local_files):
    res = parse_single_pdf(f)
    results.append(res)
    print(f"[{idx+1:3d}/105] {res['nombre_archivo'][:35]} | CUIT: {res['cuit']} | RS: {res['rs'][:20]} | Est: {res['nro_establecimiento']} | Fecha: {res['fecha_visita']} | Res: {res['resultado']}")

# Save to JSON
with open('analisis_105_pdfs.json', 'w', encoding='utf-8') as out_j:
    json.dump(results, out_j, indent=2, ensure_ascii=False)

# Save to CSV
with open('analisis_105_pdfs.csv', 'w', newline='', encoding='utf-8-sig') as out_c:
    writer = csv.DictWriter(out_c, fieldnames=[
        "nombre_archivo", "cuit", "rs", "nro_establecimiento",
        "fecha_visita", "resultado", "observacion_fallida", "link_doc"
    ])
    writer.writeheader()
    writer.writerows(results)

print("\nFinished! Results saved to analisis_105_pdfs.json and analisis_105_pdfs.csv")
