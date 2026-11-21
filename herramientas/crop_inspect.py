import os
import pypdfium2 as pdfium
import winocr

folder = r"C:\Users\cript\Downloads\drive-download-20261025T121822Z-1-001"
fname = [f for f in os.listdir(folder) if f.startswith('22484')][0]
fpath = os.path.join(folder, fname)

doc = pdfium.PdfDocument(fpath)
for p in range(len(doc)):
    img = doc[p].render(scale=3).to_pil()
    w, h = img.size
    # Crop header
    crop1 = img.crop((0, 0, w, int(h * 0.35)))
    res = winocr.recognize_pil_sync(crop1, lang='es')
    print(f"--- PAGE {p+1} HEADER CROP ---")
    print(res['text'])
    # Crop footer
    crop2 = img.crop((0, int(h * 0.75), w, h))
    res2 = winocr.recognize_pil_sync(crop2, lang='es')
    print(f"--- PAGE {p+1} FOOTER CROP ---")
    print(res2['text'])
