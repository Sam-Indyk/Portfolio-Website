// Eigen-decomposition of a chosen sky galaxy, using the basis exported by EigenGalactic.

export async function loadEigen(base) {
  const [meta, buf, gray] = await Promise.all([
    fetch(`${base}assets/eigengalaxies.json`).then((r) => r.json()),
    fetch(`${base}assets/eigengalaxies.bin`).then((r) => r.arrayBuffer()),
    fetch(`${base}assets/galaxies-gray.bin`).then((r) => r.arrayBuffer()),
  ]);
  const N = meta.image_size[0], D = N * N, K = meta.n_components, L = meta.layout;
  const mean = Float32Array.from(new Float32Array(buf, L.mean.offset, D), (v) => v / 255);
  const q = new Int8Array(buf, L.components.offset, K * D);
  const U = new Float32Array(K * D);
  for (let c = 0; c < K; c++) {
    const s = meta.component_scales[c];
    let n = 0;
    for (let d = 0; d < D; d++) { const v = q[c * D + d] * s; U[c * D + d] = v; n += v * v; }
    n = Math.sqrt(n) || 1;
    for (let d = 0; d < D; d++) U[c * D + d] /= n;
  }
  return { N, D, K, mean, U, gray: new Uint8Array(gray), evr: meta.explained_variance_ratio, nTrain: meta.n_train };
}

function paint(canvas, img, N, { signed = false, scale = 1 } = {}) {
  canvas.width = canvas.height = N;
  const g = canvas.getContext("2d");
  const out = g.createImageData(N, N);
  for (let i = 0; i < N * N; i++) {
    let r, gg, b;
    if (signed) {
      const v = Math.max(-1, Math.min(1, img[i] * scale));
      // warm for positive, cool for negative, black at zero
      r = v > 0 ? 255 * v : 110 * -v; gg = v > 0 ? 190 * v : 170 * -v; b = v > 0 ? 120 * v : 255 * -v;
    } else {
      const v = Math.pow(Math.max(0, Math.min(1, img[i])), 0.8) * 255;
      r = gg = b = v;
    }
    out.data[i * 4] = r; out.data[i * 4 + 1] = gg; out.data[i * 4 + 2] = b; out.data[i * 4 + 3] = 255;
  }
  g.putImageData(out, 0, 0);
}

export function renderEigen(el, E, index, atlasImg, gmeta) {
  const { N, D, K, mean, U } = E;
  const x = Float32Array.from(E.gray.subarray(index * D, index * D + D), (v) => v / 255);
  const coef = new Float32Array(K);
  for (let c = 0; c < K; c++) {
    let s = 0;
    for (let d = 0; d < D; d++) s += U[c * D + d] * (x[d] - mean[d]);
    coef[c] = s;
  }
  const top = [...coef.keys()].sort((a, b) => Math.abs(coef[b]) - Math.abs(coef[a])).slice(0, 12);

  el.innerHTML = `
    <div class="eg-top">
      <figure><canvas id="eg-color"></canvas><figcaption>Galaxy Zoo 2 · #${index + 1}</figcaption></figure>
      <figure><canvas id="eg-rec"></canvas><figcaption id="eg-rec-cap"></figcaption></figure>
    </div>
    <label class="eg-k mono">k <input type="range" id="eg-k" min="1" max="${K}" value="16"><span id="eg-k-val">16</span></label>
    <div class="eg-grid" id="eg-grid"></div>`;

  // Colour cutout straight from the sky atlas.
  const cc = el.querySelector("#eg-color");
  const tile = gmeta.tile, gx = index % gmeta.grid, gy = Math.floor(index / gmeta.grid);
  cc.width = cc.height = tile;
  cc.getContext("2d").drawImage(atlasImg, gx * tile, gy * tile, tile, tile, 0, 0, tile, tile);

  const rec = el.querySelector("#eg-rec"), cap = el.querySelector("#eg-rec-cap");
  const kIn = el.querySelector("#eg-k"), kVal = el.querySelector("#eg-k-val");
  const draw = () => {
    const k = +kIn.value;
    const out = Float32Array.from(mean);
    for (let c = 0; c < k; c++) for (let d = 0; d < D; d++) out[d] += coef[c] * U[c * D + d];
    paint(rec, out, N);
    const v = E.evr.slice(0, k).reduce((a, b) => a + b, 0);
    kVal.textContent = k;
    cap.textContent = `Mean + ${k} eigengalaxies · ${(v * 100).toFixed(0)}% of variance`;
  };
  kIn.addEventListener("input", draw);
  draw();

  const grid = el.querySelector("#eg-grid");
  const maxW = Math.max(...top.map((c) => Math.abs(coef[c])));
  for (const c of top) {
    const f = document.createElement("figure");
    const cv = document.createElement("canvas");
    const w = new Float32Array(D);
    let peak = 0;
    for (let d = 0; d < D; d++) { w[d] = coef[c] * U[c * D + d]; peak = Math.max(peak, Math.abs(w[d])); }
    paint(cv, w, N, { signed: true, scale: 1 / (peak || 1) * Math.sqrt(Math.abs(coef[c]) / maxW) });
    const fc = document.createElement("figcaption");
    fc.textContent = `u${c + 1} · ${coef[c] >= 0 ? "+" : "−"}${Math.abs(coef[c]).toFixed(2)}`;
    f.append(cv, fc);
    grid.appendChild(f);
  }
}
