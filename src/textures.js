// Procedural canvas textures, generated once at startup.
import * as THREE from "three";

function canvas(w, h = w) {
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  return [c, c.getContext("2d")];
}

function tex(c, { repeat = 1, srgb = true } = {}) {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat, repeat);
  t.anisotropy = 8;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// Tileable value-noise fBm in [0,1].
function fbm(size, { octaves = 5, base = 4, seed = 1 } = {}) {
  const out = new Float32Array(size * size);
  let s = seed;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  let amp = 1, total = 0;
  for (let o = 0; o < octaves; o++) {
    const n = base << o;
    const g = new Float32Array(n * n).map(rnd);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const fx = (x / size) * n, fy = (y / size) * n;
        const x0 = Math.floor(fx), y0 = Math.floor(fy);
        const tx = fx - x0, ty = fy - y0;
        const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
        const a = g[(y0 % n) * n + (x0 % n)], b = g[(y0 % n) * n + ((x0 + 1) % n)];
        const c = g[((y0 + 1) % n) * n + (x0 % n)], d = g[((y0 + 1) % n) * n + ((x0 + 1) % n)];
        out[y * size + x] += amp * ((a * (1 - sx) + b * sx) * (1 - sy) + (c * (1 - sx) + d * sx) * sy);
      }
    }
    total += amp; amp *= 0.5;
  }
  for (let i = 0; i < out.length; i++) out[i] /= total;
  return out;
}

// Height field -> tangent-space normal map.
function normalFrom(h, size, strength = 2) {
  const [c, g] = canvas(size);
  const img = g.createImageData(size, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const l = h[y * size + ((x - 1 + size) % size)], r = h[y * size + ((x + 1) % size)];
      const u = h[((y - 1 + size) % size) * size + x], d = h[((y + 1) % size) * size + x];
      let nx = (l - r) * strength, ny = (u - d) * strength, nz = 1;
      const len = Math.hypot(nx, ny, nz);
      const i = (y * size + x) * 4;
      img.data[i] = (nx / len * 0.5 + 0.5) * 255;
      img.data[i + 1] = (ny / len * 0.5 + 0.5) * 255;
      img.data[i + 2] = (nz / len * 0.5 + 0.5) * 255;
      img.data[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  return c;
}

function colorize(h, size, stops) {
  const [c, g] = canvas(size);
  const img = g.createImageData(size, size);
  for (let i = 0; i < h.length; i++) {
    const v = h[i];
    let k = 0;
    while (k < stops.length - 2 && v > stops[k + 1][0]) k++;
    const [v0, c0] = stops[k], [v1, c1] = stops[k + 1];
    const t = Math.min(1, Math.max(0, (v - v0) / (v1 - v0)));
    img.data[i * 4] = c0[0] + (c1[0] - c0[0]) * t;
    img.data[i * 4 + 1] = c0[1] + (c1[1] - c0[1]) * t;
    img.data[i * 4 + 2] = c0[2] + (c1[2] - c0[2]) * t;
    img.data[i * 4 + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  return c;
}

export function rockMaps(repeat = 4) {
  const n = 256, h = fbm(n, { octaves: 6, base: 4, seed: 7 });
  const map = tex(colorize(h, n, [[0, [52, 44, 38]], [0.45, [92, 80, 68]], [0.6, [118, 104, 88]], [1, [70, 60, 52]]]), { repeat });
  const normalMap = tex(normalFrom(h, n, 6), { repeat, srgb: false });
  return { map, normalMap };
}

export function concreteMaps(repeat = 2) {
  const n = 256, h = fbm(n, { octaves: 6, base: 8, seed: 11 });
  const map = tex(colorize(h, n, [[0, [128, 128, 124]], [0.5, [158, 157, 152]], [1, [176, 175, 170]]]), { repeat });
  const normalMap = tex(normalFrom(h, n, 1.5), { repeat, srgb: false });
  return { map, normalMap };
}

export function grassMap(repeat = 40) {
  const n = 256, h = fbm(n, { octaves: 7, base: 16, seed: 3 });
  return tex(colorize(h, n, [[0, [30, 44, 22]], [0.42, [46, 64, 30]], [0.6, [62, 80, 36]], [1, [84, 96, 46]]]), { repeat });
}

// Sash window: panes with mullions. Lit windows glow through the panes only.
export function windowMap(lit) {
  const [c, g] = canvas(64, 128);
  g.fillStyle = "#e9e4da"; g.fillRect(0, 0, 64, 128);            // frame
  for (let y = 0; y < 4; y++) for (let x = 0; x < 2; x++) {
    const grd = g.createLinearGradient(0, 8 + y * 29, 0, 8 + y * 29 + 26);
    if (lit) { grd.addColorStop(0, "#ffd9a0"); grd.addColorStop(1, "#f0a85a"); }
    else { grd.addColorStop(0, "#2a3140"); grd.addColorStop(1, "#151820"); }
    g.fillStyle = grd;
    g.fillRect(6 + x * 27, 8 + y * 29, 25, 26);
  }
  const t = tex(c);
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}

export function stoneMap(repeat = 1) {
  const n = 256, h = fbm(n, { octaves: 5, base: 4, seed: 21 });
  return tex(colorize(h, n, [[0, [218, 212, 200]], [1, [240, 236, 226]]]), { repeat });
}

// Monocrystalline solar cells: dark blue squares with silver busbars.
export function solarCells(cells = 6) {
  const [c, g] = canvas(256);
  g.fillStyle = "#c9ccd2"; g.fillRect(0, 0, 256, 256);
  const s = 256 / cells;
  for (let y = 0; y < cells; y++) {
    for (let x = 0; x < cells; x++) {
      const grd = g.createLinearGradient(x * s, y * s, x * s + s, y * s + s);
      grd.addColorStop(0, "#14244a"); grd.addColorStop(1, "#0b1530");
      g.fillStyle = grd;
      g.fillRect(x * s + 2, y * s + 2, s - 4, s - 4);
      g.fillStyle = "rgba(200,205,215,0.35)";
      for (let b = 1; b < 4; b++) g.fillRect(x * s + 2, y * s + (s * b) / 4, s - 4, 0.8);
    }
  }
  return tex(c);
}

// Crinkled multi-layer insulation foil.
export function foilMaps(tint = [220, 222, 228]) {
  const n = 256, h = fbm(n, { octaves: 6, base: 16, seed: 5 });
  const map = tex(colorize(h, n, [[0, tint.map((v) => v * 0.7)], [1, tint]]));
  const normalMap = tex(normalFrom(h, n, 10), { srgb: false });
  return { map, normalMap };
}

// US flag: stripes and canton on one canvas so the whole cloth waves together.
export function flagMap() {
  const [c, g] = canvas(380, 200);
  for (let i = 0; i < 13; i++) {
    g.fillStyle = i % 2 ? "#f4f2ee" : "#b22234";
    g.fillRect(0, (i * 200) / 13, 380, 200 / 13 + 0.5);
  }
  g.fillStyle = "#3c3b6e";
  g.fillRect(0, 0, 152, (200 * 7) / 13);
  g.fillStyle = "#f4f2ee";
  for (let r = 0; r < 9; r++) {
    const cols = r % 2 ? 5 : 6;
    for (let k = 0; k < cols; k++) {
      const x = (r % 2 ? 25.3 : 12.6) + k * 25.3, y = 7.5 + r * 10.8;
      g.beginPath(); g.arc(x, y, 3, 0, Math.PI * 2); g.fill();
    }
  }
  const t = tex(c);
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}

// Isometric board engraved in stone (the Polytopia-Zero "fossil").
export function fossilMaps(tiles = 9) {
  const n = 512, h = fbm(n, { octaves: 6, base: 4, seed: 33 });
  const [hc, hg] = canvas(n);
  const img = hg.createImageData(n, n);
  for (let i = 0; i < h.length; i++) { const v = h[i] * 120 + 60; img.data.set([v, v, v, 255], i * 4); }
  hg.putImageData(img, 0, 0);
  // Engrave a diamond grid and a few raised "pieces".
  hg.save(); hg.translate(n / 2, n / 2); hg.rotate(Math.PI / 4); hg.scale(1, 1);
  const s = (n * 0.62) / tiles;
  hg.strokeStyle = "rgba(0,0,0,0.7)"; hg.lineWidth = 6;
  for (let i = 0; i <= tiles; i++) {
    hg.beginPath(); hg.moveTo(-tiles * s / 2 + i * s, -tiles * s / 2); hg.lineTo(-tiles * s / 2 + i * s, tiles * s / 2); hg.stroke();
    hg.beginPath(); hg.moveTo(-tiles * s / 2, -tiles * s / 2 + i * s); hg.lineTo(tiles * s / 2, -tiles * s / 2 + i * s); hg.stroke();
  }
  hg.fillStyle = "rgba(255,255,255,0.9)";
  for (const [x, y] of [[1, 2], [6, 6], [2, 7], [5, 1], [7, 3], [3, 4]]) {
    hg.beginPath(); hg.arc(-tiles * s / 2 + (x + 0.5) * s, -tiles * s / 2 + (y + 0.5) * s, s * 0.22, 0, Math.PI * 2); hg.fill();
  }
  hg.restore();
  const hd = hg.getImageData(0, 0, n, n).data;
  const hh = new Float32Array(n * n).map((_, i) => hd[i * 4] / 255);
  const map = tex(colorize(hh, n, [[0, [70, 62, 54]], [0.4, [128, 118, 104]], [1, [176, 166, 150]]]));
  const normalMap = tex(normalFrom(hh, n, 12), { srgb: false });
  return { map, normalMap };
}

// A cluster of leaves on transparency, for alpha-cut foliage cards.
export function leafClusterMap() {
  const [c, g] = canvas(256);
  let s = 3;
  const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  // Dense enough that the cluster's average alpha survives mipmapping (otherwise distant crowns vanish).
  for (let i = 0; i < 420; i++) {
    const a = r() * Math.PI * 2, d = Math.pow(r(), 0.7) * 110;
    const x = 128 + Math.cos(a) * d, y = 128 + Math.sin(a) * d;
    const light = 16 + r() * 26 + (1 - d / 110) * -5;
    g.save(); g.translate(x, y); g.rotate(r() * Math.PI * 2);
    g.fillStyle = `hsl(${88 + r() * 26}, ${32 + r() * 22}%, ${light}%)`;
    g.beginPath(); g.ellipse(0, 0, 5 + r() * 6, 2.4 + r() * 2.6, 0, 0, Math.PI * 2); g.fill();
    g.restore();
  }
  const t = tex(c);
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}

// Soft radial glow sprite.
export function glowMap(inner = "rgba(255,255,255,1)", outer = "rgba(255,255,255,0)") {
  const [c, g] = canvas(128);
  const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grd.addColorStop(0, inner); grd.addColorStop(0.25, inner.replace(/[\d.]+\)$/, "0.35)")); grd.addColorStop(1, outer);
  g.fillStyle = grd; g.fillRect(0, 0, 128, 128);
  return tex(c);
}
