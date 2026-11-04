"""
Real Austin terrain for the descent: aerial imagery, elevation, and a regional Texas map for the dive.

  python tools/austin_terrain.py [cache-dir]

All sources are public domain:
  - USDA NAIP orthoimagery via the USGS National Map image service (colour and near-infrared)
  - USGS 3DEP elevation via the USGS National Map elevation service
  - NASA Blue Marble Next Generation via NASA GIBS (the Texas map blended into the globe)

Local frame (metres, matches the scene): origin at the plaza, +x north, +z east, y up. The camera
faces west (-z), into the sunset, down the length of Zilker Park's Great Lawn.

Writes public/assets/austin/: naip-far.webp (+ -2k), naip-near.webp, naip-plaza.webp, mask-near.webp
(R water, G vegetation), mask-far.webp (R water), dem.bin, texas.webp, austin.json (with the tree
canopy around the plaza, as positions for 3D trees).
"""
import io
import json
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "public" / "assets" / "austin"
CACHE = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(__file__).resolve().parent / ".cache"

PLAZA = (30.26818, -97.76626)        # the Great Lawn, Zilker Park, on the south shore of Lady Bird Lake
M_LAT = 110861.0                     # metres per degree at ~30.3 N
M_LON = 111320.0 * np.cos(np.radians(PLAZA[0]))
FAR = {"x": (-13000.0, 13000.0), "z": (-18000.0, 8000.0)}   # north-south, east-west extents
NEAR_HALF = 1600.0
PLAZA_HALF = 600.0                   # NAIP's own ~0.6 m/px around the plaza, for eye level
TREES_R = 480.0                      # 3D trees stand on the imagery's canopy out to here
DEM_N = 513
TEXAS = {"lat": (22.0, 38.5), "lon": (-106.5, -89.0)}

NAIP = "https://imagery.nationalmap.gov/arcgis/rest/services/USGSNAIPImagery/ImageServer/exportImage"
DEP = "https://elevation.nationalmap.gov/arcgis/rest/services/3DEPElevation/ImageServer/exportImage"
GIBS = "https://gibs.earthdata.nasa.gov/wms/epsg4326/best/wms.cgi"
RAW = urllib.parse.quote(json.dumps({"rasterFunction": "None"}))   # the bands as recorded


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


def bands(half_x, half_z, size, name):
    """Raw NIR, green and red over the same extent as the colour export: (nir, g, r) in [0, 1]."""
    x0, x1 = half_x
    z0, z1 = half_z
    url = (f"{NAIP}?bbox={bbox(x0, x1, z0, z1)}&bboxSR=4326&size={size},{size}&format=png"
           f"&bandIds=3,1,0&renderingRule={RAW}&f=image")
    a = np.asarray(Image.open(io.BytesIO(fetch(url, name))).convert("RGB"), np.float32) / 255
    return a[..., 0], a[..., 1], a[..., 2]


def indices(nir, g, r):
    """Water (NDWI) and vegetation (NDVI) in [0, 1], softened so single pixels don't speckle."""
    ndwi = (g - nir) / (g + nir + 1e-4)
    ndvi = (nir - r) / (nir + r + 1e-4)
    water = np.clip((ndwi - 0.3) / 0.2, 0, 1)
    # Building shadows read as specks of water: keep only patches wider than a few pixels.
    w = Image.fromarray((water > 0.5).astype(np.uint8) * 255)
    water *= np.asarray(w.filter(ImageFilter.MinFilter(5)).filter(ImageFilter.MaxFilter(7)), np.float32) / 255
    veg = np.clip((ndvi - 0.05) / 0.2, 0, 1) * (1 - water)   # dry summer lawn sits around NDVI 0.3
    return water, veg, ndvi


def soften(a, radius):
    return np.asarray(Image.fromarray((a * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(radius)), np.float32) / 255


def grade(img):
    """NAIP is shot near midday: lift it slightly toward the hazy, warm look of late afternoon."""
    a = np.asarray(img, np.float32) / 255.0
    lum = a @ np.array([0.3, 0.59, 0.11], np.float32)
    a = lum[..., None] + (a - lum[..., None]) * 0.85            # a touch less saturated
    a = np.clip(a * 1.04 + 0.01, 0, 1)
    return Image.fromarray((a * 255 + 0.5).astype(np.uint8))


def save_mask(channels, path):
    rgb = np.zeros(channels[0].shape + (3,), np.uint8)
    for k, c in enumerate(channels):
        rgb[..., k] = np.round(np.clip(c, 0, 1) * 255)
    Image.fromarray(rgb).save(path, quality=90, method=6)


def canopy_trees(colour, nir, g, r):
    """Tree positions on the imagery's canopy around the plaza: dark, strongly vegetated pixels, spaced
    like crowns (Poisson disk, ~7 m), nearest first. [x, z, size] in metres."""
    n = colour.shape[0]
    px = n / (2 * PLAZA_HALF)
    water, veg, ndvi = indices(nir, g, r)
    lum = colour @ np.array([0.3, 0.59, 0.11], np.float32)
    canopy = soften(((ndvi > 0.3) & (lum < 0.27) & (water < 0.5)).astype(np.float32), 2.0 * px)
    density = soften(canopy, 6.0 * px)
    rng = np.random.default_rng(11)
    cand = np.argwhere(canopy > 0.45)
    rng.shuffle(cand)
    xs, zs = PLAZA_HALF - (cand[:, 0] + 0.5) / px, (cand[:, 1] + 0.5) / px - PLAZA_HALF
    keep = np.hypot(xs, zs) < TREES_R
    cand, xs, zs = cand[keep], xs[keep], zs[keep]
    cell, grid, out = 7.0, {}, []
    for (i, j), x, z in zip(cand, xs, zs):
        key = (int(x // cell), int(z // cell))
        near = [p for dx in (-1, 0, 1) for dz in (-1, 0, 1) for p in grid.get((key[0] + dx, key[1] + dz), [])]
        if any((x - a) ** 2 + (z - b) ** 2 < cell * cell for a, b in near):
            continue
        grid.setdefault(key, []).append((x, z))
        out.append([round(float(x), 1), round(float(z), 1), round(0.85 + 0.8 * float(density[i, j]), 2)])
    out.sort(key=lambda t: t[0] ** 2 + t[1] ** 2)
    return out


def main():
    OUT.mkdir(parents=True, exist_ok=True)

    far = grade(naip_tiled(*FAR["x"], *FAR["z"], 4096, "naip-far"))
    # Seen only from 1.5 km up (closer ground uses naip-near), so ~8.5 m/px is plenty.
    far.resize((3072, 3072), Image.LANCZOS).save(OUT / "naip-far.webp", quality=78, method=6)
    far.resize((2048, 2048), Image.LANCZOS).save(OUT / "naip-far-2k.webp", quality=80, method=6)
    near = grade(naip(-NEAR_HALF, NEAR_HALF, -NEAR_HALF, NEAR_HALF, 2048, "naip-near.jpg"))
    near.save(OUT / "naip-near.webp", quality=82, method=6)
    plaza_raw = naip(-PLAZA_HALF, PLAZA_HALF, -PLAZA_HALF, PLAZA_HALF, 2048, "naip-plaza.jpg")
    grade(plaza_raw).save(OUT / "naip-plaza.webp", quality=82, method=6)

    # Masks from the near-infrared band: water (Lady Bird Lake reflects the sky) and vegetation (where
    # the lawn's fine detail applies).
    w, v, _ = indices(*bands((-NEAR_HALF, NEAR_HALF), (-NEAR_HALF, NEAR_HALF), 1024, "bands-near.png"))
    save_mask([soften(w, 1.0), soften(v, 0.8)], OUT / "mask-near.webp")
    w, _, _ = indices(*bands(FAR["x"], FAR["z"], 1024, "bands-far.png"))
    save_mask([soften(w, 0.7)], OUT / "mask-far.webp")
    trees = canopy_trees(np.asarray(plaza_raw, np.float32) / 255, *bands((-PLAZA_HALF, PLAZA_HALF), (-PLAZA_HALF, PLAZA_HALF), 2048, "bands-plaza.png"))

    url = f"{DEP}?bbox={bbox(*FAR['x'], *FAR['z'])}&bboxSR=4326&size={DEM_N},{DEM_N}&format=tiff&pixelType=F32&f=image"
    dem = np.array(Image.open(io.BytesIO(fetch(url, "dem.tif"))), dtype=np.float32)
    # Plaza elevation: the median of the ground around the site, so it sits on its own ground level.
    ci = (0 - FAR["x"][0]) / (FAR["x"][1] - FAR["x"][0]) * (DEM_N - 1)
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
        "far": FAR, "near": NEAR_HALF, "plazaHalf": PLAZA_HALF,
        "dem": {"size": DEM_N, "min": round(lo, 2), "scale": 0.1, "plaza": round(plaza, 2)},
        "texas": TEXAS,
        "credit": "Imagery: USDA NAIP / USGS. Elevation: USGS 3DEP. Texas: NASA Blue Marble.",
        "trees": trees,
    }
    (OUT / "austin.json").write_text(json.dumps(meta, separators=(",", ":")))
    print(json.dumps({k: v for k, v in meta.items() if k != "trees"}, indent=1), f"\n{len(trees)} trees")
    for f in sorted(OUT.iterdir()):
        print(f"{f.stat().st_size / 1e6:6.2f} MB  {f.name}")


if __name__ == "__main__":
    main()
