import os
import pypdfium2 as pdfium
import winocr
from PIL import Image
import numpy as np

folder = r"C:\Users\cript\Downloads\drive-download-20261025T121822Z-1-001"
pdf_files = sorted([f for f in os.listdir(folder) if f.lower().endswith('.pdf')])

report = []

for idx, fname in enumerate(pdf_files):
    fpath = os.path.join(folder, fname)
    doc = pdfium.PdfDocument(fpath)
    num_pages = len(doc)
    
    # Check if any page after page 3 contains photos or images
    has_photo_page = False
    photo_page_ocr = []
    if num_pages >= 4:
        for p_idx in range(3, num_pages):
            p = doc[p_idx].render(scale=2).to_pil()
            txt = winocr.recognize_pil_sync(p, lang='es')['text'].replace('\n', ' ')
            photo_page_ocr.append((p_idx+1, txt))
            # Check if this page is a photo (e.g. very few words or 'ALQUILA', 'VENTA', 'SE VENDE', etc.)
            has_photo_page = True
            
    # Check Entrevistado on page 1
    p1 = doc[0].render(scale=2).to_pil()
    w1, h1 = p1.size
    
    # In the IAPSER form:
    # "ENTREVISTADO: Apellido y Nombre: ... Cargo: ..."
    # Let's crop specifically the line for "ENTREVISTADO" / "Apellido y Nombre":
    # It is located around y: 0.28 to 0.35, x: 0.05 to 0.95
    ent_crop = p1.crop((int(0.05 * w1), int(0.28 * h1), int(0.95 * w1), int(0.35 * h1)))
    ent_txt = winocr.recognize_pil_sync(ent_crop, lang='es')['text'].replace('\n', ' ')
    
    # Check signature on Empresa box for Page 1, Page 2, Page 3
    emp_signs = []
    for p_idx in range(min(num_pages, 3)):
        p_img = doc[p_idx].render(scale=2).to_pil()
        w, h = p_img.size
        # The signing area strictly inside the box above the footer
        s_box = p_img.crop((int(0.55 * w), int(0.835 * h), int(0.95 * w), int(0.905 * h)))
        arr = np.array(s_box.convert('L'))
        dark_ratio = np.sum(arr < 160) / arr.size
        emp_signs.append(round(dark_ratio, 4))
        
    # Check page 3 Observaciones
    p3_idx = 2 if num_pages >= 3 else num_pages - 1
    p3 = doc[p3_idx].render(scale=2).to_pil()
    w3, h3 = p3.size
    obs_crop = p3.crop((int(0.05 * w3), int(0.18 * h3), int(0.95 * w3), int(0.70 * h3)))
    obs_txt = winocr.recognize_pil_sync(obs_crop, lang='es')['text'].replace('\n', ' ')
    
    report.append({
        'idx': idx + 1,
        'fname': fname,
        'pages': num_pages,
        'emp_signs': emp_signs,
        'max_emp_sign': max(emp_signs) if emp_signs else 0,
        'entrevistado': ent_txt,
        'obs': obs_txt,
        'photo_pages': photo_page_ocr
    })

import json
with open('reception_full_audit.json', 'w', encoding='utf-8') as f:
    json.dump(report, f, ensure_ascii=False, indent=2)

print('Full audit complete!')
