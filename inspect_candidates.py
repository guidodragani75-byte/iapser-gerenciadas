import os
import pypdfium2 as pdfium
import winocr
from PIL import Image

folder = r"C:\Users\cript\Downloads\drive-download-20261025T121822Z-1-001"
scratch = r"C:\Users\cript\.gemini\antigravity\brain\365abf10-ca3f-47ca-ac6a-794c844ec6f0\scratch\candidates"
os.makedirs(scratch, exist_ok=True)

candidate_indices = [56, 52, 47, 1, 36, 50, 46, 48, 104, 23, 24, 103, 5, 53, 57, 55, 65, 93, 89]

pdf_files = sorted([f for f in os.listdir(folder) if f.lower().endswith('.pdf')])

for idx in candidate_indices:
    fname = pdf_files[idx - 1]
    fpath = os.path.join(folder, fname)
    doc = pdfium.PdfDocument(fpath)
    
    print("="*75)
    print(f"[{idx}] {fname} (Pages: {len(doc)})")
    
    # Render page 1
    p1 = doc[0].render(scale=2).to_pil()
    w1, h1 = p1.size
    
    # Crop Entrevistado
    ent_crop = p1.crop((int(0.05 * w1), int(0.20 * h1), int(0.95 * w1), int(0.33 * h1)))
    ent_txt = winocr.recognize_pil_sync(ent_crop, lang='es')['text'].replace('\n', ' | ')
    print(f"ENTREVISTADO P1: {ent_txt}")
    
    # Save emp sign crops for page 1 and page 3
    for p_no in range(min(len(doc), 3)):
        p_img = doc[p_no].render(scale=2).to_pil()
        w, h = p_img.size
        # signature box
        s_crop = p_img.crop((int(0.52 * w), int(0.82 * h), int(0.98 * w), int(0.95 * h)))
        s_crop.save(os.path.join(scratch, f"{idx}_p{p_no+1}_sign.png"))
        
    # Check page 3 Observaciones
    if len(doc) >= 3:
        p3 = doc[2].render(scale=2).to_pil()
        w3, h3 = p3.size
        obs_crop = p3.crop((int(0.05 * w3), int(0.15 * h3), int(0.95 * w3), int(0.70 * h3)))
        obs_txt = winocr.recognize_pil_sync(obs_crop, lang='es')['text'].replace('\n', ' ')
        print(f"OBSERVACIONES P3: {obs_txt}")
        
    # Check page 4 if exists
    if len(doc) >= 4:
        p4 = doc[3].render(scale=2).to_pil()
        txt4 = winocr.recognize_pil_sync(p4, lang='es')['text'].replace('\n', ' ')
        print(f"PAGE 4 text: {txt4[:200]}")
