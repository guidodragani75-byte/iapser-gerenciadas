import os
from PIL import Image

scratch = r"C:\Users\cript\.gemini\antigravity\brain\365abf10-ca3f-47ca-ac6a-794c844ec6f0\scratch\suspicious"
obs_dir = os.path.join(scratch, "obs_crops")
os.makedirs(obs_dir, exist_ok=True)

for fn in sorted(os.listdir(scratch)):
    if fn.endswith('_p3.png'):
        im = Image.open(os.path.join(scratch, fn))
        w, h = im.size
        # The Observaciones area is roughly y: 0.15 to 0.45, x: 0.10 to 0.90
        obs_crop = im.crop((int(0.10 * w), int(0.15 * h), int(0.90 * w), int(0.40 * h)))
        obs_crop.save(os.path.join(obs_dir, fn))

print("Saved obs crops")
