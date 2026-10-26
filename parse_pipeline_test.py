import os
import json
import re
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

# Also load planilla_iapser_raw.csv to cross-reference contract info
contracts_db = {}
if os.path.exists('planilla_iapser_raw.csv'):
    import csv
    with open('planilla_iapser_raw.csv', 'r', encoding='utf-8', errors='ignore') as f:
        reader = csv.DictReader(f)
        for r in reader:
            c = r.get('Contrato IAPART', '').strip()
            if c:
                if c not in contracts_db:
                    contracts_db[c] = []
                contracts_db[c].append(r)

print(f"Loaded {len(contracts_db)} contracts from master sheet.")

def get_drive_link(fname):
    nf = norm(fname)
    if nf in drive_map:
        return drive_map[nf].get('webViewLink')
    for k, v in drive_map.items():
        if nf[:25] in k or k[:25] in nf:
            return v.get('webViewLink')
    return ""

def extract_text_from_pdf(fpath):
    # 1. Try pdfplumber
    text_plumber = ""
    try:
        with pdfplumber.open(fpath) as p:
            for page in p.pages[:3]:
                t = page.extract_text()
                if t:
                    text_plumber += t + "\n"
    except Exception:
        pass

    # 2. If plumber has rich text, we can use it. But often dates or checkmarks are handwritten/scanned.
    # Let's also do OCR if plumber text is short or missing key fields
    ocr_text = ""
    if len(text_plumber.strip()) < 300 or "CUIT" not in text_plumber.upper():
        try:
            doc = pdfium.PdfDocument(fpath)
            max_pages = min(len(doc), 3)
            for p_no in range(max_pages):
                img = doc[p_no].render(scale=2).to_pil()
                res = winocr.recognize_pil_sync(img, lang='es')
                if res and res.get('text'):
                    ocr_text += f"\n--- PAGE {p_no+1} OCR ---\n" + res['text']
        except Exception as e:
            pass

    full_text = text_plumber + "\n" + ocr_text
    return full_text

# Test on 5 files
for f in local_files[:5]:
    txt = extract_text_from_pdf(os.path.join(folder, f))
    print(f"\nFILE: {f} | Extracted length: {len(txt)}")
