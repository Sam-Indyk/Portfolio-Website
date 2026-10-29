/*
 * galaxies.js: procedural galaxy images for the EigenGalaxy demo.
 *
 * Stand-in for Galaxy Zoo 2 cutouts: centred, grayscale, square images of
 * ellipticals (Sersic profiles) and two/three-armed spirals (exponential disc
 * modulated by a logarithmic spiral), at random inclination and position angle.
 */
window.GalaxyGen = (() => {
  function mulberry32(a) {
    return () => {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function gauss(rng) {
    const u = Math.max(rng(), 1e-9), v = rng();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  function make(N, rng) {
    const img = new Float32Array(N * N);
    const elliptical = rng() < 0.38;
    const cx = N / 2 - 0.5 + (rng() - 0.5) * 1.2;
    const cy = N / 2 - 0.5 + (rng() - 0.5) * 1.2;
    const pa = rng() * Math.PI;
    const cp = Math.cos(pa), sp = Math.sin(pa);
    const q = elliptical ? 0.45 + rng() * 0.55 : 0.28 + rng() * 0.72;

    // spiral parameters
    const arms = rng() < 0.8 ? 2 : 3;
    const pitch = 0.22 + rng() * 0.3;
    const armAmp = 0.45 + rng() * 0.5;
    const rd = N * (0.07 + rng() * 0.07);
    const bulge = 0.4 + rng() * 1.2;
    const rb = N * (0.02 + rng() * 0.025);
    const phase = rng() * Math.PI * 2;
    const chir = rng() < 0.5 ? 1 : -1;
    // elliptical parameters
    const re = N * (0.05 + rng() * 0.1);
    const n = 1.5 + rng() * 2.5;
    const bn = 2 * n - 1 / 3;

    let max = 0;
    for (let y = 0; y < N; y++) {
      for (let x = 0; x < N; x++) {
        const dx = x - cx, dy = y - cy;
        const xr = dx * cp + dy * sp;
        const yr = (-dx * sp + dy * cp) / q;
        const r = Math.sqrt(xr * xr + yr * yr) + 1e-3;
        let v;
        if (elliptical) {
          v = Math.exp(-bn * (Math.pow(r / re, 1 / n) - 1));
        } else {
          const phi = Math.atan2(yr, xr);
          const spiral = Math.cos(arms * (phi - chir * Math.log(r / rd + 0.3) / Math.tan(pitch)) + phase);
          const disk = Math.exp(-r / rd) * Math.max(0, 1 + armAmp * spiral);
          v = disk + bulge * Math.exp(-r / rb);
        }
        img[y * N + x] = v;
        if (v > max) max = v;
      }
    }
    for (let i = 0; i < img.length; i++) img[i] = Math.max(0, img[i] / max + gauss(rng) * 0.012);
    return img;
  }

  // Grayscale [0,1] (or signed, with diverging=true) -> canvas pixels.
  function paint(canvas, img, N, { diverging = false, scale = 1, gamma = 0.65 } = {}) {
    canvas.width = N; canvas.height = N;
    const g = canvas.getContext("2d");
    const data = g.createImageData(N, N);
    for (let i = 0; i < N * N; i++) {
      let r, gg, b;
      if (diverging) {
        const v = Math.max(-1, Math.min(1, img[i] * scale));
        // blue (negative) / black / amber (positive)
        if (v >= 0) { r = 255 * v; gg = 181 * v; b = 71 * v; }
        else { r = 110 * -v; gg = 200 * -v; b = 255 * -v; }
      } else {
        const v = Math.pow(Math.max(0, Math.min(1, img[i] * scale)), gamma);
        r = 255 * Math.min(1, v * 1.05); gg = 245 * v; b = 225 * v;
      }
      data.data[i * 4] = r; data.data[i * 4 + 1] = gg; data.data[i * 4 + 2] = b; data.data[i * 4 + 3] = 255;
    }
    g.putImageData(data, 0, 0);
  }

  return { make, paint, rng: mulberry32 };
})();
