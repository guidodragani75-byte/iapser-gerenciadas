import json
import csv
import re

# Load drive mapping
with open('all_pdfs_list.json', 'r', encoding='utf-8') as f:
    drive_list = json.load(f)

drive_links = {d['name'].strip().lower(): d['webViewLink'] for d in drive_list}

# Load current records
with open('analisis_105_pdfs_final.json', 'r', encoding='utf-8') as f:
    records = json.load(f)

# Verified exact dates for the 15 fallidas
exact_fallidas_dates = {
    "12938": "04/09/2026",
    "16024": "07/09/2026",
    "20163 - MALVICINI SRL (AV. P. GRAL. ROCA 95": "07/09/2026",
    "20163 - MALVICINI SRL (VILLEGAS 247": "07/09/2026",
    "20353": "04/09/2026",
    "20586": "07/09/2026",
    "20704": "04/09/2026",
    "20706": "08/10/2026",
    "20850": "04/09/2026",
    "20955": "04/09/2026",
    "20984": "08/10/2026",
    "21095": "04/09/2026",
    "21152": "08/10/2026",
    "4975 - ALAIS MARCELO JORGE (ZONA RURAL 0. EST 1": "07/09/2026",
    "4975 - ALAIS MARCELO JORGE (ZONA RURAL 0. EST 2": "07/09/2026",
}

# Update records
matched_links = 0
for r in records:
    fn = r['nombre_archivo'].strip()
    fn_lower = fn.lower()
    
    # Match drive link
    link = drive_links.get(fn_lower, "")
    if not link:
        # try matching by prefix / contract
        for k, v in drive_links.items():
            if fn_lower[:25] in k or k[:25] in fn_lower:
                link = v
                break
    r['link_documento'] = link
    if link:
        matched_links += 1
        
    # Check exact date for fallidas if present
    for k, d in exact_fallidas_dates.items():
        if k in fn:
            r['fecha_visita'] = d
            break

print(f"Total records: {len(records)} | Matched Drive links: {matched_links}")

# Save JSON
with open('analisis_105_pdfs_final.json', 'w', encoding='utf-8') as f:
    json.dump(records, f, ensure_ascii=False, indent=2)

# Save CSV
fieldnames = [
    "nombre_archivo",
    "cuit",
    "razon_social",
    "nro_establecimiento",
    "fecha_visita",
    "resultado",
    "observacion_fallida",
    "link_documento"
]

with open('analisis_105_pdfs_final.csv', 'w', encoding='utf-8', newline='') as f:
    writer = csv.DictWriter(f, fieldnames=fieldnames)
    writer.writeheader()
    for row in records:
        writer.writerow({
            "nombre_archivo": row.get("nombre_archivo", ""),
            "cuit": row.get("cuit", ""),
            "razon_social": row.get("razon_social", ""),
            "nro_establecimiento": row.get("nro_establecimiento", ""),
            "fecha_visita": row.get("fecha_visita", ""),
            "resultado": row.get("resultado", ""),
            "observacion_fallida": row.get("observacion_fallida", ""),
            "link_documento": row.get("link_documento", "")
        })

print("Successfully synced Drive links and dates to JSON and CSV!")
