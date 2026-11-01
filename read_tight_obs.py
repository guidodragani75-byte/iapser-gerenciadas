import os
from PIL import Image
import winocr

scratch = r"C:\Users\cript\.gemini\antigravity\brain\365abf10-ca3f-47ca-ac6a-794c844ec6f0\scratch\suspicious"
crops_dir = os.path.join(scratch, "obs_crops_tight")
os.makedirs(crops_dir, exist_ok=True)

for idx in [56, 47, 1, 52, 50, 36, 48, 53, 57, 5, 46, 24, 103, 23, 104]:
    p3_file = os.path.join(scratch, f"{idx}_p3.png")
    if os.path.exists(p3_file):
        im = Image.open(p3_file)
        w, h = im.size
        # The exact box for Observaciones lines:
        # On page 3: "Observaciones:" label is around y=0.18*h
        # Handwritten text is between y=0.18*h and 0.35*h
        tight_crop = im.crop((int(0.18 * w), int(0.18 * h), int(0.95 * w), int(0.35 * h)))
        save_path = os.path.join(crops_dir, f"{idx}_obs.png")
        tight_crop.save(save_path)
        
        # Run OCR with different preprocessing
        res = winocr.recognize_pil_sync(tight_crop, lang='es')
        txt = " ".join([l['text'] for l in res['lines']])
        print(f"[{idx:3d}]: {txt}")
