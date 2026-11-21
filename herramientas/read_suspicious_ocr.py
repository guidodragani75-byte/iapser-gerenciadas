import os
import winocr
from PIL import Image

scratch = r"C:\Users\cript\.gemini\antigravity\brain\365abf10-ca3f-47ca-ac6a-794c844ec6f0\scratch\suspicious"

files = sorted(os.listdir(scratch))
for fn in files:
    if fn.endswith('.png'):
        im = Image.open(os.path.join(scratch, fn))
        res = winocr.recognize_pil_sync(im, lang='es')
        txt = ' '.join([line['text'] for line in res['lines']])
        print(f"--- {fn} ---")
        print(txt)
