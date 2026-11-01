import csv

with open('analisis_105_pdfs_final.csv', 'r', encoding='utf-8') as f:
    reader = csv.DictReader(f)
    fallidas = [r for r in reader if r['resultado'] == 'Fallida']

print(f'Total Fallidas en CSV: {len(fallidas)}')
for idx, r in enumerate(fallidas):
    print(f"{idx+1}. {r['nombre_archivo']} | CUIT: {r['cuit']} | Est: {r['nro_establecimiento']} | Fecha: {r['fecha_visita']}")
    print(f"   Obs: {r['observacion_fallida']}")
    print(f"   Link: {r['link_documento']}")
