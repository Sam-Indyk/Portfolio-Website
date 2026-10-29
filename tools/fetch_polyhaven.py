"""
Download CC0 textures and the sky HDRI from Poly Haven into public/assets/.

  python tools/fetch_polyhaven.py

Textures land in public/assets/tex/<id>/{diff,nor,rough}.jpg (1k);
the sky in public/assets/sky-{1k,2k}.hdr.
"""
import json
import urllib.request
from pathlib import Path

OUT = Path(__file__).resolve().parent.parent / "public" / "assets"
TEXTURES = ["sparse_grass", "painted_plaster_wall", "precast_stone_paving", "brushed_concrete_2",
            "asphalt_02", "cliff_side", "rock_face", "wood_floor"]
SKY = "kloppenheim_06_puresky"
UA = {"User-Agent": "samuelindyk.com asset fetch"}


def get(url):
    return urllib.request.urlopen(urllib.request.Request(url, headers=UA)).read()


for tid in TEXTURES:
    files = json.loads(get(f"https://api.polyhaven.com/files/{tid}"))
    d = OUT / "tex" / tid
    d.mkdir(parents=True, exist_ok=True)
    for key, name in [("Diffuse", "diff"), ("nor_gl", "nor"), ("Rough", "rough")]:
        if key in files:
            (d / f"{name}.jpg").write_bytes(get(files[key]["1k"]["jpg"]["url"]))
    print(tid, "ok")

files = json.loads(get(f"https://api.polyhaven.com/files/{SKY}"))
for res in ("1k", "2k"):
    (OUT / f"sky-{res}.hdr").write_bytes(get(files["hdri"][res]["hdr"]["url"]))
print(SKY, "ok")
