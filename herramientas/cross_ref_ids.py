import json
import csv
import urllib.request
import io
import zipfile
import re

with open('all_pdfs_list.json', 'r', encoding='utf-8') as f:
    drive_files = json.load(f)

# Download xlsx to inspect hyperlinks
xlsx_url = 'https://docs.google.com/spreadsheets/d/1xXEmPqATmcMR0JpO2IuTmf1YZ6fMRxyeAc9avbfDRqI/export?format=xlsx'
req = urllib.request.Request(xlsx_url, headers={'User-Agent': 'Mozilla/5.0'})
with urllib.request.urlopen(req) as resp:
    xlsx_bytes = resp.read()

drive_links = {}
with zipfile.ZipFile(io.BytesIO(xlsx_bytes)) as z:
    for name in z.namelist():
        if 'sheet1.xml.rels' in name:
            rels_xml = z.read(name).decode('utf-8')
            for m in re.finditer(r'<Relationship\s+[^>]*Id="([^"]+)"[^>]*Target="([^"]+)"', rels_xml):
                drive_links[m.group(1)] = m.group(2)

print(f"Total relationships/targets in sheet1: {len(drive_links)}")
matched = 0
for f in drive_files:
    fid = f['id']
    for rid, target in drive_links.items():
        if fid in target:
            matched += 1
            print(f"Match: {f['name']} -> {target}")
            break

print(f"Total matches in sheet: {matched}")
