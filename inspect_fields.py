import os
from parse_pipeline_test import extract_text_from_pdf, folder, local_files

for f in local_files[:5]:
    txt = extract_text_from_pdf(os.path.join(folder, f))
    lines = [l.strip() for l in txt.split('\n') if l.strip()]
    print("=" * 60)
    print("FILE:", f)
    # Print lines containing CUIT, Razon, Fecha, Nro, etc.
    for l in lines:
        if any(k in l.upper() for k in ['CUIT', 'RAZON SOCIAL', 'RAZÓN SOCIAL', 'FECHA', 'CONTRATO', 'NRO. EST', 'ESTABL', 'FALLIDA', 'AUDITORIA']):
            print("  ", l[:120])
