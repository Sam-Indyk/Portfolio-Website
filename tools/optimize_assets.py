"""
Shrink the site's runtime assets (run after the other asset tools):

  python tools/optimize_assets.py

- JPG/PNG textures in public/assets -> WebP (originals removed). Earth day/cloud maps are capped at
  4096 px; the seal at 512 px.
- dn600.bin (float32 positions, uint32 indices) -> dn600q.bin: positions quantized to uint16 within
  each mesh's bounding box (0.02 mm steps on a 1.3 m machine) and uint16 indices where they fit.
"""
import json
from pathlib import Path

import numpy as np
from PIL import Image

A = Path(__file__).resolve().parent.parent / "public" / "assets"
Image.MAX_IMAGE_PIXELS = None


def webp(src: Path, max_w=None, quality=82, mode=None):
    im = Image.open(src)
    if mode:
        im = im.convert(mode)
    elif im.mode not in ("RGB", "RGBA", "L"):
        im = im.convert("RGBA" if "A" in im.getbands() else "RGB")
    if max_w and im.width > max_w:
        im = im.resize((max_w, round(im.height * max_w / im.width)), Image.LANCZOS)
    out = src.with_suffix(".webp")
    im.save(out, "WEBP", quality=quality, method=6)
    print(f"{src.relative_to(A)}: {src.stat().st_size/1e6:.2f} -> {out.stat().st_size/1e6:.2f} MB")
    src.unlink()


for f in sorted(A.glob("earth/*.jpg")):
    webp(f, max_w=4096, quality=84, mode="L" if ("clouds" in f.name or "specular" in f.name) else None)
for f in sorted(A.glob("tex/*/*.jpg")):
    webp(f, quality=80, mode="L" if f.stem == "rough" else None)
for name, w in [("galaxies.jpg", None), ("sky-backdrop.jpg", None), ("au-seal.png", 512)]:
    if (A / name).exists():
        webp(A / name, max_w=w, quality=88)

# ---- DN600 ----
meta = json.loads((A / "dn600.json").read_text())
buf = (A / "dn600.bin").read_bytes()
chunks, meshes, off = [], [], 0
for m in meta["meshes"]:
    v = np.frombuffer(buf, np.float32, m["v"][1] * 3, m["v"][0]).reshape(-1, 3)
    i = np.frombuffer(buf, np.uint32, m["i"][1], m["i"][0])
    lo, hi = v.min(0), v.max(0)
    q = np.round((v - lo) / np.maximum(hi - lo, 1e-6) * 65535).astype(np.uint16)
    idx = i.astype(np.uint16) if len(v) <= 65535 else i
    vb, ib = q.tobytes(), idx.tobytes()
    pad = (-len(vb)) % 4
    entry = {**{k: m[k] for k in ("color", "group")}, "lo": lo.tolist(), "hi": hi.tolist(),
             "v": [off, len(v)], "i": [off + len(vb) + pad, len(idx)], "i32": idx.dtype == np.uint32}
    chunks += [vb, b"\0" * pad, ib, b"\0" * ((-len(ib)) % 4)]
    off += len(vb) + pad + len(ib) + ((-len(ib)) % 4)
    meshes.append(entry)
(A / "dn600q.bin").write_bytes(b"".join(chunks))
(A / "dn600q.json").write_text(json.dumps({"units": "mm", "quantized": True, "meshes": meshes}))
print(f"dn600: {len(buf)/1e6:.2f} -> {off/1e6:.2f} MB")
