import json
from collections import Counter

with open('analisis_105_pdfs_final.json', 'r', encoding='utf-8') as f:
    data = json.load(f)

# Total files in September
sept_all = [d for d in data if '/09/' in d.get('fecha_visita', '')]
sept_efectivas = [d for d in sept_all if d['resultado'] == 'Efectiva']
sept_fallidas = [d for d in sept_all if d['resultado'] == 'Fallida']

print(f"Total visitas en Septiembre: {len(sept_all)}")
print(f"  - Efectivas en Septiembre: {len(sept_efectivas)}")
print(f"  - Fallidas en Septiembre: {len(sept_fallidas)}")

print("\n--- DETALLE DE LAS FALLIDAS EN SEPTIEMBRE ---")
for idx, sf in enumerate(sept_fallidas):
    print(f"{idx+1}. [{sf['fecha_visita']}] {sf['razon_social']} (Est. {sf['nro_establecimiento']})")
    print(f"   Archivo: {sf['nombre_archivo']}")
    print(f"   Obs: {sf['observacion_fallida']}")
