"""
Build binary assets for the 3D site.

  python tools/build_assets.py galaxies <EigenGalactic dir>
      -> public/assets/galaxies.jpg   16×16 atlas of 128px colour Galaxy Zoo 2 cutouts.
         Slots 0..47 are the held-out test galaxies from EigenGalactic/export_web.py, in
         the same order as eigengalaxies.bin; the rest are training-set galaxies.
      -> public/assets/galaxies-gray.bin   the 64×64 grayscale PCA input for every slot,
         so clicking any sky galaxy can show its eigen-decomposition.

  python tools/build_assets.py tbm <viewer JSON>
      -> public/assets/dn600.bin + dn600.json   the UATXcavators DN600 model (one
         revision of uatxcavators-tbm/viewer/data), parts merged per material colour.

Run the galaxies step with EigenGalactic's venv (needs galaxy-datasets, Pillow, numpy).
"""

import json
import os
import sys
from pathlib import Path

import numpy as np

OUT = Path(__file__).resolve().parent.parent / "public" / "assets"


def galaxies(eg_dir):
    from PIL import Image
    from galaxy_datasets import gz2

    os.chdir(eg_dir)
    sys.path.insert(0, str(eg_dir))
    from Eigengalactic import IMAGE_SIZE, NUM_TRAINING_IMAGES
    import export_web

    data_root = "galaxy_data"
    catalog, _ = gz2(root=data_root, train=True, download=False)
    paths = list(catalog["file_loc"][:NUM_TRAINING_IMAGES])
    cache = np.load(os.path.join(data_root, f"cache_{NUM_TRAINING_IMAGES}_{IMAGE_SIZE[0]}x{IMAGE_SIZE[1]}.npy"))

    # Reproduce export_web.py's selection exactly.
    keep = np.flatnonzero(cache.max(axis=1) > 0)
    order = np.random.default_rng(export_web.SEED).permutation(len(keep))
    test_rows = keep[order[:export_web.NUM_TEST_IMAGES]]
    rest = [r for r in keep[order[export_web.NUM_TEST_IMAGES:]]]

    def bright_enough(row):
        return cache[row].reshape(IMAGE_SIZE)[24:40, 24:40].mean() > 60

    backdrop_pool = [r for r in rest if bright_enough(r)]

    tile, grid = 128, 16
    yy, xx = np.mgrid[0:tile, 0:tile]
    vignette = np.clip(1.15 - np.hypot(xx - tile / 2 + 0.5, yy - tile / 2 + 0.5) / (tile / 2), 0, 1)[..., None] ** 0.8

    def cutout(row):
        p = paths[row]
        p = p if os.path.exists(p) else os.path.join(data_root, p)
        im = Image.open(p).convert("RGB")
        w, h = im.size
        c = int(min(w, h) * 0.5)  # GZ2 cutouts are centred; keep the middle half
        im = im.crop(((w - c) // 2, (h - c) // 2, (w + c) // 2, (h + c) // 2)).resize((tile, tile), Image.LANCZOS)
        # Black-level each channel so the sky (and any colour cast) blends away additively on black.
        a = np.asarray(im).astype(np.float32)
        a = np.clip((a - np.percentile(a, 40, axis=(0, 1))) * 1.25, 0, 255)
        edge = np.concatenate([a[:6].ravel(), a[-6:].ravel(), a[:, :6].ravel(), a[:, -6:].ravel()]).mean()
        return a * vignette, edge

    tiles = [cutout(r)[0] for r in test_rows]
    used = list(test_rows)
    for r in backdrop_pool:
        if len(tiles) == grid * grid:
            break
        a, edge = cutout(r)
        if edge < 6:
            tiles.append(a)
            used.append(r)
    # Grayscale 64×64 pixels (the PCA input) for every tile, so any galaxy can be decomposed.
    np.clip(cache[used], 0, 255).astype(np.uint8).tofile(OUT / "galaxies-gray.bin")
    atlas = Image.new("RGB", (tile * grid, tile * grid))
    for i, a in enumerate(tiles):
        atlas.paste(Image.fromarray(a.astype(np.uint8)), ((i % grid) * tile, (i // grid) * tile))
    rows = tiles

    OUT.mkdir(parents=True, exist_ok=True)
    atlas.save(OUT / "galaxies.jpg", quality=86)
    (OUT / "galaxies.json").write_text(json.dumps({"tile": tile, "grid": grid, "count": len(rows), "test": len(test_rows)}))
    print(f"galaxies.jpg: {len(rows)} galaxies ({len(test_rows)} with eigen-decompositions)")


def tbm(viewer_json):
    d = json.load(open(viewer_json))
    by_color = {}
    for p in d["parts"]:
        if p["group"] == "Fixture":
            continue
        pos = np.asarray(p["pos"], np.float32).reshape(-1, 3)
        idx = np.asarray(p["idx"], np.uint32).reshape(-1, 3)
        # "dx" is the viewer's explode offset; the assembled pose ignores it.
        by_color.setdefault((p["color"], p["group"]), []).append((pos, idx))

    chunks, meshes, offset = [], [], 0
    for (color, group), parts in sorted(by_color.items()):
        verts, tris, base = [], [], 0
        for pos, idx in parts:
            verts.append(pos)
            tris.append(idx + base)
            base += len(pos)
        v = np.concatenate(verts).astype(np.float32)
        t = np.concatenate(tris).astype(np.uint32).ravel()
        meshes.append({"color": color, "group": group, "v": [offset, len(v)], "i": [offset + v.nbytes, len(t)]})
        chunks += [v.tobytes(), t.tobytes()]
        offset += v.nbytes + t.nbytes

    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "dn600.bin").write_bytes(b"".join(chunks))
    (OUT / "dn600.json").write_text(json.dumps({"units": "mm", "axis": "x", "meshes": meshes}))
    print(f"dn600.bin: {len(meshes)} meshes, {offset / 1e6:.1f} MB")


if __name__ == "__main__":
    {"galaxies": galaxies, "tbm": tbm}[sys.argv[1]](Path(sys.argv[2]))
