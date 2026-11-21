import os
import json
import re
import numpy as np
from PIL import Image
import pypdfium2 as pdfium
import winocr

folder = r"C:\Users\cript\Downloads\drive-download-20261025T121822Z-1-001"
local_files = sorted([f for f in os.listdir(folder) if f.lower().endswith('.pdf')])

def inspect_signatures_and_obs(fname):
    fpath = os.path.join(folder, fname)
    doc = pdfium.PdfDocument(fpath)
    
    info = {
        "file": fname,
        "pages": len(doc),
        "obs_text": "",
        "entrevistado_text": "",
        "empresa_sign_p1": False,
        "empresa_sign_p2": False,
        "empresa_sign_p3": False,
    }
    
    for p_no in range(min(len(doc), 3)):
        img = doc[p_no].render(scale=2).to_pil()
        w, h = img.size
        
        # Bottom right box: approx [0.52*w to 0.98*w, 0.82*h to 0.98*h]
        empresa_box = img.crop((int(0.52 * w), int(0.82 * h), int(0.98 * w), int(0.98 * h)))
        
        # Run OCR on this crop
        res_crop = winocr.recognize_pil_sync(empresa_box, lang='es')
        crop_txt = res_crop['text'].replace('Firma y aclaración por la Empresa', '').replace('Firma y aclarac', '').replace('Firma', '').replace('Empresa', '').strip()
        
        # Check dark pixels (ink)
        arr = np.array(empresa_box.convert('L'))
        dark_pixels = np.sum(arr < 170)
        total_pixels = arr.size
        ratio = dark_pixels / total_pixels
        
        has_sign = (ratio > 0.015) or len(crop_txt) > 3
        if p_no == 0:
            info["empresa_sign_p1"] = (has_sign, round(ratio, 4), crop_txt)
        elif p_no == 1:
            info["empresa_sign_p2"] = (has_sign, round(ratio, 4), crop_txt)
        elif p_no == 2:
            info["empresa_sign_p3"] = (has_sign, round(ratio, 4), crop_txt)
            
        if p_no == 2:
            obs_box = img.crop((0, int(0.12 * h), w, int(0.75 * h)))
            res_obs = winocr.recognize_pil_sync(obs_box, lang='es')
            info["obs_text"] = res_obs['text']
            
        if p_no == 0:
            res_p1 = winocr.recognize_pil_sync(img, lang='es')
            txt1 = res_p1['text']
            m_ent = re.search(r'(?:ENTREVISTADO|Apellido y Nombre)[\s\S]{0,150}?(?:Cargo|En la presente)', txt1, re.IGNORECASE)
            if m_ent:
                info["entrevistado_text"] = m_ent.group(0).replace('\n', ' ')

    return info

for prefix in ['12938', '20353', '21095', '13767', '22379']:
    matched = [f for f in local_files if f.startswith(prefix)]
    if matched:
        fn = matched[0]
        res = inspect_signatures_and_obs(fn)
        print("="*70)
        print("FILE:", fn)
        print("Sign P1:", res["empresa_sign_p1"])
        print("Sign P2:", res["empresa_sign_p2"])
        print("Sign P3:", res["empresa_sign_p3"])
        print("Obs Page 3:\n", res["obs_text"])
        print("Entrevistado P1:\n", res["entrevistado_text"])
