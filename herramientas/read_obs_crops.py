import os
import winocr
from PIL import Image, ImageEnhance

obs_dir = r"C:\Users\cript\.gemini\antigravity\brain\365abf10-ca3f-47ca-ac6a-794c844ec6f0\scratch\suspicious\obs_crops"

for fn in sorted(os.listdir(obs_dir)):
    p = os.path.join(obs_dir, fn)
    im = Image.open(p).convert('L')
    
    # enhance contrast
    enhancer = ImageEnhance.Contrast(im)
    im_enh = enhancer.enhance(2.5)
    
    res = winocr.recognize_pil_sync(im_enh, lang='es')
    lines = [l['text'] for l in res['lines']]
    print(f"[{fn}]: {' // '.join(lines)}")
