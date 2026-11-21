import os
import pypdfium2 as pdfium
import winocr

folder = r"C:\Users\cript\Downloads\drive-download-20261025T121822Z-1-001"
fname = [f for f in os.listdir(folder) if f.startswith('12938') and f.endswith('.pdf')][0]
fpath = os.path.join(folder, fname)

pdf = pdfium.PdfDocument(fpath)
print(f"Total pages: {len(pdf)}")
page = pdf[0]
image = page.render(scale=2).to_pil()
print("Rendered page 1 to PIL image, size:", image.size)

result = winocr.recognize_pil(image, lang='es')
print("--- WINOCR TEXT (Page 1) ---")
print(result['text'])
