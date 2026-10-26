import json

with open('analisis_105_pdfs.json', 'r', encoding='utf-8') as f:
    data = json.load(f)

print(f"Total analyzed: {len(data)}")

missing_cuit = [d for d in data if not d.get('cuit')]
missing_fecha = [d for d in data if not d.get('fecha_visita')]
fallidas = [d for d in data if d.get('resultado') == 'Fallida']

print(f"Missing CUIT: {len(missing_cuit)}")
print(f"Missing Fecha: {len(missing_fecha)}")
print(f"Total Fallidas: {len(fallidas)}")

print("\n--- FALLIDAS ---")
for f in fallidas:
    print(f"{f['nombre_archivo']} | CUIT: {f['cuit']} | Obs: {f['observacion_fallida']}")

print("\n--- MISSING CUIT SAMPLES ---")
for m in missing_cuit[:10]:
    print(m['nombre_archivo'], "-> RS:", m['rs'])
