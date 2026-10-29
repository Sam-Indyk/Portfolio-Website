"""
Cut a panoramic sunset backdrop out of an equirectangular HDR (Poly Haven kloppenheim_06, CC0).

  python tools/sky_backdrop.py <sky-8k.hdr>

Writes public/assets/sky-backdrop.jpg and sky-backdrop.json (sun position within the image).
An equirectangular crop is already cylindrical (x ∝ yaw, y ∝ pitch), which reads naturally on a
large flat backdrop behind the plaza.
"""
import json
import sys
from pathlib import Path

import cv2
import numpy as np

OUT = Path(__file__).resolve().parent.parent / "public" / "assets"
YAW_SPAN, PITCH_LO, PITCH_HI, SUN_X = 150.0, -2.0, 44.0, 0.36

hdr = cv2.imread(sys.argv[1], cv2.IMREAD_UNCHANGED)[:, :, ::-1].astype(np.float32)  # BGR -> RGB
h, w, _ = hdr.shape
lum = hdr @ np.array([0.2126, 0.7152, 0.0722], np.float32)
sy, sx = np.unravel_index(np.argmax(cv2.GaussianBlur(lum[: h // 2], (0, 0), 6)), (h // 2, w))
sun_pitch = (0.5 - (sy + 0.5) / h) * 180.0

px_per_deg = w / 360.0
cw = int(YAW_SPAN * px_per_deg)
x0 = int(sx - SUN_X * cw)
cols = np.arange(x0, x0 + cw) % w
r0, r1 = int((90 - PITCH_HI) * px_per_deg), int((90 - PITCH_LO) * px_per_deg)
crop = hdr[r0:r1][:, cols]

# Exposure so the sky away from the sun sits around mid-grey, then ACES (Narkowicz fit) + sRGB.
ref = np.percentile(lum[r0:r1][:, cols], 60)
x = crop * (0.32 / ref)
x = np.clip((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0, 1)
srgb = np.where(x <= 0.0031308, 12.92 * x, 1.055 * np.power(x, 1 / 2.4) - 0.055)
img = (srgb * 255 + 0.5).astype(np.uint8)[:, :, ::-1]

OUT.mkdir(parents=True, exist_ok=True)
cv2.imwrite(str(OUT / "sky-backdrop.jpg"), img, [cv2.IMWRITE_JPEG_QUALITY, 88])
meta = {"width": img.shape[1], "height": img.shape[0], "yaw_span": YAW_SPAN, "pitch": [PITCH_LO, PITCH_HI],
        "sun": {"x": SUN_X, "y": (PITCH_HI - sun_pitch) / (PITCH_HI - PITCH_LO), "pitch_deg": round(float(sun_pitch), 2)}}
(OUT / "sky-backdrop.json").write_text(json.dumps(meta))
print(meta)
