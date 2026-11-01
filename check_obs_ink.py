import os
from PIL import Image
import numpy as np

scratch = r"C:\Users\cript\.gemini\antigravity\brain\365abf10-ca3f-47ca-ac6a-794c844ec6f0\scratch\suspicious"

# We saved {idx}_p3.png in scratch
for idx in [56, 47, 1, 52, 50, 36, 48, 53, 57, 5, 46, 24, 103, 23, 104]:
    p3_file = os.path.join(scratch, f"{idx}_p3.png")
    if os.path.exists(p3_file):
        im = Image.open(p3_file).convert('L')
        w, h = im.size
        # Observaciones area: roughly y: 0.16 to 0.40, x: 0.15 to 0.85
        obs_area = im.crop((int(0.15 * w), int(0.16 * h), int(0.85 * w), int(0.35 * h)))
        arr = np.array(obs_area)
        # dark ink in this box
        ink = np.sum(arr < 140)
        print(f"[{idx:3d}] Ink in Observaciones area: {ink:4d} (shape={arr.shape})")
