"""
Resize Earth source maps into public/assets/earth/ (4K for desktop, 2K for mobile).

Sources (download into one folder, pass it as argv[1]):
  world.200412.3x5400x2700.jpg   NASA Blue Marble Next Generation, Dec 2004 (public domain)
  8k_earth_nightmap.jpg          Solar System Scope, CC BY 4.0 (from NASA Black Marble)
  8k_earth_clouds.jpg            Solar System Scope, CC BY 4.0
  2k_earth_normal_map.tif        Solar System Scope, CC BY 4.0
  2k_earth_specular_map.tif      Solar System Scope, CC BY 4.0
"""
import sys
from pathlib import Path

from PIL import Image

Image.MAX_IMAGE_PIXELS = None
src = Path(sys.argv[1])
out = Path(__file__).resolve().parent.parent / "public" / "assets" / "earth"
out.mkdir(parents=True, exist_ok=True)

jobs = [
    ("world.200412.3x5400x2700.jpg", "day", "RGB", (4096, 2048)),
    ("8k_earth_nightmap.jpg", "night", "RGB", (4096, 2048)),
    ("8k_earth_clouds.jpg", "clouds", "L", (4096, 2048)),
    ("2k_earth_normal_map.tif", "normal", "RGB", None),
    ("2k_earth_specular_map.tif", "specular", "L", None),
]
for name, key, mode, big in jobs:
    im = Image.open(src / name).convert(mode)
    if big:
        im.resize(big, Image.LANCZOS).save(out / f"{key}-4k.jpg", quality=88)
    im.resize((2048, 1024), Image.LANCZOS).save(out / f"{key}-2k.jpg", quality=86)
    print(key, "done")
