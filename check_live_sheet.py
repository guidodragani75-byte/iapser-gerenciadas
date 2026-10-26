import json
import csv
import re
import urllib.request
import io

# 1. Load live Google Sheet
url = 'https://docs.google.com/spreadsheets/d/1xXEmPqATmcMR0JpO2IuTmf1YZ6fMRxyeAc9avbfDRqI/export?format=csv'
req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
with urllib.request.urlopen(req) as resp:
    data = resp.read().decode('utf-8')
reader = csv.DictReader(io.StringIO(data))
sheet_rows = list(reader)

print(f"Total rows in live Google Sheet: {len(sheet_rows)}")
print("Sheet columns:", sheet_rows[0].keys() if sheet_rows else "Empty")

# 2. Check how many rows in the sheet have 'Fecha Realizada', 'Resultado Visita', 'Documento Adjunto'
realizadas = [r for r in sheet_rows if r.get('Fecha Realizada')]
print(f"Rows with Fecha Realizada in Sheet: {len(realizadas)}")

for r in realizadas[:10]:
    print(r.get('Contrato IAPART'), r.get('Cuit'), r.get('Empleador')[:25], r.get('Nro Estab Intercambio'), r.get('Fecha Realizada'), r.get('Resultado Visita'), r.get('Observaciones'))
