import os
import pypdfium2 as pdfium
import winocr

folder = r"C:\Users\cript\Downloads\drive-download-20261025T121822Z-1-001"
pdf_files = sorted([f for f in os.listdir(folder) if f.lower().endswith('.pdf')])

shortlist = [56, 57, 48, 95, 93, 55, 65, 20, 81, 53, 31, 1, 72, 21, 47, 52, 36, 49, 50, 46, 5, 23, 24, 103, 104]

print(f"Inspecting {len(shortlist)} candidates...")

for idx in shortlist:
    fn = pdf_files[idx - 1]
    fpath = os.path.join(folder, fn)
    doc = pdfium.PdfDocument(fpath)
    
    print("="*80)
    print(f"[{idx}] {fn} (Pages: {len(doc)})")
    
    # Page 1
    p1 = doc[0].render(scale=2).to_pil()
    w1, h1 = p1.size
    # Entrevistado box
    ent_box = p1.crop((int(0.05 * w1), int(0.24 * h1), int(0.95 * w1), int(0.35 * h1)))
    ent_txt = winocr.recognize_pil_sync(ent_box, lang='es')['text'].replace('\n', ' | ')
    
    # Page 3 (or last)
    p_last_idx = min(len(doc)-1, 2)
    p_last = doc[p_last_idx].render(scale=2).to_pil()
    w_l, h_l = p_last.size
    obs_box = p_last.crop((int(0.05 * w_l), int(0.18 * h_l), int(0.95 * w_l), int(0.70 * h_l)))
    obs_txt = winocr.recognize_pil_sync(obs_box, lang='es')['text'].replace('\n', ' | ')
    
    # Empresa sign box page 1 vs page last
    s1 = p1.crop((int(0.55 * w1), int(0.835 * h1), int(0.95 * w1), int(0.905 * h1)))
    s1_txt = winocr.recognize_pil_sync(s1, lang='es')['text'].replace('\n', ' ')
    
    s_l = p_last.crop((int(0.55 * w_l), int(0.835 * h_l), int(0.95 * w_l), int(0.905 * h_l)))
    s_l_txt = winocr.recognize_pil_sync(s_l, lang='es')['text'].replace('\n', ' ')
    
    print(f"  ENTREVISTADO: {ent_txt}")
    print(f"  OBSERVACIONES: {obs_txt}")
    print(f"  EMPRESA SIGN P1: '{s1_txt}' | P{p_last_idx+1}: '{s_l_txt}'")
    
    if len(doc) >= 4:
        for p_extra in range(3, len(doc)):
            p_ex = doc[p_extra].render(scale=2).to_pil()
            ex_txt = winocr.recognize_pil_sync(p_ex, lang='es')['text'].replace('\n', ' ')
            print(f"  EXTRA PAGE {p_extra+1}: {ex_txt[:120]}")
