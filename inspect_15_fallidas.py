import os
import pypdfium2 as pdfium
import winocr

folder = r"C:\Users\cript\Downloads\drive-download-20261025T121822Z-1-001"
all_files = os.listdir(folder)
pdf_files = sorted([f for f in all_files if f.lower().endswith('.pdf')])
companion_imgs = [f for f in all_files if not f.lower().endswith('.pdf')]

candidates_15 = [56, 47, 1, 52, 50, 36, 48, 53, 57, 5, 46, 24, 103, 23, 104]

details = []

for idx in candidates_15:
    fn = pdf_files[idx - 1]
    fpath = os.path.join(folder, fn)
    doc = pdfium.PdfDocument(fpath)
    
    # Check companion image
    contract = fn.split(' - ')[0].strip()
    c_img = [img for img in companion_imgs if img.startswith(contract)]
    
    # Check page 1 Entrevistado
    p1 = doc[0].render(scale=2).to_pil()
    w1, h1 = p1.size
    ent_crop = p1.crop((int(0.05 * w1), int(0.24 * h1), int(0.95 * w1), int(0.35 * h1)))
    ent_txt = winocr.recognize_pil_sync(ent_crop, lang='es')['text'].replace('\n', ' ')
    
    # Check page 3 Observaciones
    p3 = doc[min(2, len(doc)-1)].render(scale=2).to_pil()
    w3, h3 = p3.size
    obs_crop = p3.crop((int(0.05 * w3), int(0.18 * h3), int(0.95 * w3), int(0.55 * h3)))
    obs_txt = winocr.recognize_pil_sync(obs_crop, lang='es')['text'].replace('\n', ' ')
    
    # Check page 4
    extra_txt = ""
    if len(doc) >= 4:
        p4 = doc[3].render(scale=2).to_pil()
        extra_txt = winocr.recognize_pil_sync(p4, lang='es')['text'].replace('\n', ' ')
        
    details.append({
        'idx': idx,
        'fname': fn,
        'pages': len(doc),
        'companion_img': c_img,
        'entrevistado': ent_txt,
        'obs': obs_txt,
        'extra_p4': extra_txt[:120]
    })

for d in details:
    print("="*75)
    print(f"[{d['idx']}] {d['fname']} (Pages: {d['pages']})")
    print(f"  Companion: {d['companion_img']}")
    print(f"  Obs: {d['obs']}")
    print(f"  P4 Extra: {d['extra_p4']}")
