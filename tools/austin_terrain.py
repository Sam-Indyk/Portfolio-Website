"""
Real Austin terrain for the descent: aerial imagery, elevation, and a regional Texas map for the dive.

  python tools/austin_terrain.py [cache-dir]

All sources are public domain:
  - USDA NAIP orthoimagery via the USGS National Map image service
  - USGS 3DEP elevation via the USGS National Map elevation service
  - NASA Blue Marble Next Generation via NASA GIBS (the Texas map blended into the globe)

Local frame (metres, matches the scene): origin at the plaza, +x north, +z east, y up. The camera
faces west (-z), into the sunset.

Writes public/assets/austin/: naip-far.webp (+ -2k), naip-near.webp (with the park around the plaza
painted in), dem.bin, texas.webp, austin.json
"""
import io
import json
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "public" / "assets" / "austin"
CACHE = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(__file__).resolve().parent / ".cache"

PLAZA = (30.3175, -97.7605)          # flat upland ~1.5 km east of the Mount Bonnell bluff, west of MoPac
M_LAT = 110861.0                     # metres per degree at ~30.3 N
M_LON = 111320.0 * np.cos(np.radians(PLAZA[0]))
FAR = {"x": (-13000.0, 13000.0), "z": (-18000.0, 8000.0)}   # north-south, east-west extents
NEAR_HALF = 1600.0
DEM_N = 513
TEXAS = {"lat": (22.0, 38.5), "lon": (-106.5, -89.0)}
LAWN = {"r0": 320, "cz": -90}        # the park around the plaza; keep in step with src/world/terrain.js

NAIP = "https://imagery.nationalmap.gov/arcgis/rest/services/USGSNAIPImagery/ImageServer/exportImage"
DEP = "https://elevation.nationalmap.gov/arcgis/rest/services/3DEPElevation/ImageServer/exportImage"
GIBS = "https://gibs.earthdata.nasa.gov/wms/epsg4326/best/wms.cgi"


def fetch(url, name):
    CACHE.mkdir(parents=True, exist_ok=True)
    path = CACHE / name
    if not path.exists():
        print("fetch", name)
        req = urllib.request.Request(url, headers={"User-Agent": "samuelindyk.com asset build"})
        for attempt in range(4):   # the National Map services return the odd 502 under load
            try:
                with urllib.request.urlopen(req, timeout=300) as r:
                    data = r.read()
                break
            except urllib.error.HTTPError as e:
                if attempt == 3 or e.code < 500:
                    raise
                time.sleep(5 * (attempt + 1))
        if data[:1] == b"{":
            raise RuntimeError(f"{name}: {data[:300]!r}")
        path.write_bytes(data)
    return path.read_bytes()


def bbox(x0, x1, z0, z1):
    """Local extents (m) -> lon/lat bbox string (west, south, east, north)."""
    lat0, lon0 = PLAZA
    return f"{lon0 + z0 / M_LON:.6f},{lat0 + x0 / M_LAT:.6f},{lon0 + z1 / M_LON:.6f},{lat0 + x1 / M_LAT:.6f}"


def naip(x0, x1, z0, z1, size, name):
    url = f"{NAIP}?bbox={bbox(x0, x1, z0, z1)}&bboxSR=4326&size={size},{size}&format=jpg&f=image"
    return Image.open(io.BytesIO(fetch(url, name))).convert("RGB")


def naip_tiled(x0, x1, z0, z1, size, name):
    """The service caps exports at 4000 px, so larger images come down as a 2x2 mosaic."""
    if size <= 4000:
        return naip(x0, x1, z0, z1, size, f"{name}.jpg")
    h, xm, zm = size // 2, (x0 + x1) / 2, (z0 + z1) / 2
    out = Image.new("RGB", (size, size))
    for row, (a, b) in enumerate([(xm, x1), (x0, xm)]):          # image rows run north -> south
        for col, (c, d) in enumerate([(z0, zm), (zm, z1)]):      # columns run west -> east
            out.paste(naip(a, b, c, d, h, f"{name}-{row}{col}.jpg"), (col * h, row * h))
    return out


def grade(img):
    """NAIP is shot near midday: lift it slightly toward the hazy, warm look of late afternoon."""
    a = np.asarray(img, np.float32) / 255.0
    lum = a @ np.array([0.3, 0.59, 0.11], np.float32)
    a = lum[..., None] + (a - lum[..., None]) * 0.85            # a touch less saturated
    a = np.clip(a * 1.04 + 0.01, 0, 1)
    return Image.fromarray((a * 255 + 0.5).astype(np.uint8))


def to_lin(a):
    return np.where(a <= 0.04045, a / 12.92, ((a + 0.055) / 1.055) ** 2.4)


def to_srgb(a):
    return np.where(a <= 0.0031308, a * 12.92, 1.055 * np.power(a, 1 / 2.4) - 0.055)


def lawn_colour():
    """Average of the scene's recoloured lawn (terrain.js), so the painted park matches it up close."""
    g = to_lin(np.asarray(Image.open(ROOT / "public/assets/tex/sparse_grass/diff.webp").convert("RGB"), np.float32) / 255)
    lum = g @ np.array([0.3, 0.59, 0.11], np.float32)
    rec = g * 0.25 + lum[..., None] * np.array([0.42, 0.78, 0.24], np.float32) * 1.9 * 0.75
    return to_srgb(rec.reshape(-1, 3).mean(0) * 0.93 * 1.9)


def smooth_noise(n, cells, rng):
    small = Image.fromarray((rng.random((cells, cells)) * 255).astype(np.uint8))
    return np.asarray(small.resize((n, n), Image.BICUBIC), np.float32) / 127.5 - 1.0


def paint_park(img):
    """Replace the houses around the plaza site with parkland: lawn, mottling and tree canopy."""
    n = img.size[0]
    px = n / (2 * NEAR_HALF)                                       # pixels per metre
    rng = np.random.default_rng(7)
    zs = (np.arange(n) + 0.5) / px - NEAR_HALF                     # columns run east
    xs = NEAR_HALF - (np.arange(n) + 0.5) / px                     # rows run south
    Z, X = np.meshgrid(zs, xs)
    r = np.hypot(X, Z - LAWN["cz"]) + smooth_noise(n, 24, rng) * 45
    mask = np.clip((LAWN["r0"] + 30 - r) / 90, 0, 1)
    mask = mask * mask * (3 - 2 * mask)
    lawn = lawn_colour() * (1 + smooth_noise(n, 90, rng)[..., None] * 0.07 + smooth_noise(n, 400, rng)[..., None] * 0.04)
    canopy = Image.new("L", img.size, 0)
    d = ImageDraw.Draw(canopy)
    for _ in range(900):
        a, rr = rng.random() * 2 * np.pi, np.sqrt(rng.random()) * (LAWN["r0"] + 40)
        cx, cz = np.cos(a) * rr, LAWN["cz"] + np.sin(a) * rr
        if abs(cz) < 70 and abs(cx) < 40:                          # the forecourt and the Union stay open
            continue
        col, row, rad = (cz + NEAR_HALF) * px, (NEAR_HALF - cx) * px, (3 + rng.random() * 4) * px
        d.ellipse([col - rad, row - rad, col + rad, row + rad], fill=int(150 + rng.random() * 105))
    canopy = np.asarray(canopy.filter(ImageFilter.GaussianBlur(1.2)), np.float32)[..., None] / 255
    tree = np.array([56, 70, 64], np.float32) / 255           # NAIP tree canopy around Austin
    park = lawn * (1 - canopy) + tree * canopy
    a = np.asarray(img, np.float32) / 255
    out = a * (1 - mask[..., None]) + park * mask[..., None]
    return Image.fromarray((np.clip(out, 0, 1) * 255 + 0.5).astype(np.uint8))


def main():
    OUT.mkdir(parents=True, exist_ok=True)

    far = grade(naip_tiled(*FAR["x"], *FAR["z"], 4096, "naip-far"))
    # Seen only from 1.5 km up (closer ground uses naip-near), so ~8.5 m/px is plenty.
    far.resize((3072, 3072), Image.LANCZOS).save(OUT / "naip-far.webp", quality=78, method=6)
    far.resize((2048, 2048), Image.LANCZOS).save(OUT / "naip-far-2k.webp", quality=80, method=6)
    near = paint_park(grade(naip(-NEAR_HALF, NEAR_HALF, -NEAR_HALF, NEAR_HALF, 2048, "naip-near.jpg")))
    near.save(OUT / "naip-near.webp", quality=82, method=6)

    url = f"{DEP}?bbox={bbox(*FAR['x'], *FAR['z'])}&bboxSR=4326&size={DEM_N},{DEM_N}&format=tiff&pixelType=F32&f=image"
    dem = np.array(Image.open(io.BytesIO(fetch(url, "dem.tif"))), dtype=np.float32)
    # Plaza elevation: the median of the ground around the site, so it sits on its own ground level.
    ci =(0 - FAR["x"][0]) / (FAR["x"][1] - FAR["x"][0]) * (DEM_N - 1)
    cj = (0 - FAR["z"][0]) / (FAR["z"][1] - FAR["z"][0]) * (DEM_N - 1)
    r, cc = int(round((DEM_N - 1) - ci)), int(round(cj))
    plaza = float(np.median(dem[r - 6:r + 7, cc - 6:cc + 7]))
    lo = float(dem.min())
    (OUT / "dem.bin").write_bytes(np.round((dem - lo) * 10).astype("<u2").tobytes())

    t = TEXAS
    url = (f"{GIBS}?SERVICE=WMS&REQUEST=GetMap&VERSION=1.3.0&LAYERS=BlueMarble_NextGeneration&CRS=EPSG:4326"
           f"&BBOX={t['lat'][0]},{t['lon'][0]},{t['lat'][1]},{t['lon'][1]}&WIDTH=2048&HEIGHT=2048&FORMAT=image/jpeg")
    Image.open(io.BytesIO(fetch(url, "texas.jpg"))).convert("RGB").save(OUT / "texas.webp", quality=84, method=6)

    meta = {
        "plaza": PLAZA, "metresPerDeg": [M_LAT, round(float(M_LON), 2)],
        "far": FAR, "near": NEAR_HALF,
        "dem": {"size": DEM_N, "min": round(lo, 2), "scale": 0.1, "plaza": round(plaza, 2)},
        "texas": TEXAS,
        "credit": "Imagery: USDA NAIP / USGS. Elevation: USGS 3DEP. Texas: NASA Blue Marble.",
    }
    (OUT / "austin.json").write_text(json.dumps(meta, indent=1))
    print(json.dumps(meta, indent=1))
    for f in sorted(OUT.iterdir()):
        print(f"{f.stat().st_size / 1e6:6.2f} MB  {f.name}")


if __name__ == "__main__":
    main()
