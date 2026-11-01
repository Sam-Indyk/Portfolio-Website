/*
 * EigenGalaxy Explorer: PCA eigengalaxies in the browser.
 *
 * Preferred path: load the basis exported by EigenGalactic/export_web.py
 * (IncrementalPCA fit on Galaxy Zoo 2) from data/eigengalaxies.{json,bin}.
 *
 * Fallback path (mirrors Eigengalactic.py, computed live):
 *   1. generate M procedural galaxy images (N×N grayscale), flatten to D = N² vectors
 *   2. centre them on the mean galaxy
 *   3. top-K eigenvectors via the M×M Gram matrix (subspace iteration + Rayleigh–Ritz)
 *   4. project a held-out (optionally blurred) galaxy onto the basis and reconstruct
 */
(() => {
  let N = 48, D = N * N, K = 64;
  const M = 600;
  let tests = null, testIdx = 0;
  const $ = (id) => document.getElementById(id);
  const tick = () => new Promise((r) => setTimeout(r));
  const css = getComputedStyle(document.documentElement);
  const COLOR = {
    pos: css.getPropertyValue("--accent").trim(),
    neg: css.getPropertyValue("--accent-2").trim(),
    neutral: css.getPropertyValue("--neutral").trim(),
    line: css.getPropertyValue("--accent-2").trim(),
    marker: css.getPropertyValue("--accent").trim(),
    grid: "rgba(255,255,255,0.08)",
    axis: "#737a90",
    text: "#a3a9bb",
  };

  const trainRng = GalaxyGen.rng(2026);
  const testRng = GalaxyGen.rng(99);
  let mean, U, cum; // mean galaxy, K×D eigengalaxies, cumulative variance ratio [K+1]
  let orig, coeffs;
  let k = 12, ready = false;

  function setStatus(frac, text) {
    $("bar").style.width = `${Math.round(frac * 100)}%`;
    $("status-text").textContent = text;
  }

  // ---------- linear algebra helpers ----------
  function orthonormalize(Q) {         // columns stored contiguously: Q[c*M + r]
    for (let c = 0; c < K; c++) {
      const qc = Q.subarray(c * M, c * M + M);
      for (let p = 0; p < c; p++) {
        const qp = Q.subarray(p * M, p * M + M);
        let d = 0;
        for (let r = 0; r < M; r++) d += qc[r] * qp[r];
        for (let r = 0; r < M; r++) qc[r] -= d * qp[r];
      }
      let n = 0;
      for (let r = 0; r < M; r++) n += qc[r] * qc[r];
      n = Math.sqrt(n) || 1;
      for (let r = 0; r < M; r++) qc[r] /= n;
    }
  }

  function gramTimes(G, Q) {
    const Z = new Float64Array(M * K);
    for (let c = 0; c < K; c++) {
      const qc = Q.subarray(c * M, c * M + M);
      for (let r = 0; r < M; r++) {
        let s = 0;
        const row = r * M;
        for (let j = 0; j < M; j++) s += G[row + j] * qc[j];
        Z[c * M + r] = s;
      }
    }
    return Z;
  }

  // Cyclic Jacobi eigen-decomposition of a small symmetric matrix A (n×n, row-major).
  function jacobi(A, n) {
    const V = new Float64Array(n * n);
    for (let i = 0; i < n; i++) V[i * n + i] = 1;
    for (let sweep = 0; sweep < 60; sweep++) {
      let off = 0;
      for (let p = 0; p < n; p++) for (let q = p + 1; q < n; q++) off += A[p * n + q] ** 2;
      if (off < 1e-18) break;
      for (let p = 0; p < n; p++) {
        for (let q = p + 1; q < n; q++) {
          const apq = A[p * n + q];
          if (Math.abs(apq) < 1e-14) continue;
          const theta = (A[q * n + q] - A[p * n + p]) / (2 * apq);
          const t = Math.sign(theta || 1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
          const c = 1 / Math.sqrt(t * t + 1), s = t * c;
          for (let i = 0; i < n; i++) {
            const aip = A[i * n + p], aiq = A[i * n + q];
            A[i * n + p] = c * aip - s * aiq; A[i * n + q] = s * aip + c * aiq;
          }
          for (let i = 0; i < n; i++) {
            const api = A[p * n + i], aqi = A[q * n + i];
            A[p * n + i] = c * api - s * aqi; A[q * n + i] = s * api + c * aqi;
          }
          for (let i = 0; i < n; i++) {
            const vip = V[i * n + p], viq = V[i * n + q];
            V[i * n + p] = c * vip - s * viq; V[i * n + q] = s * vip + c * viq;
          }
        }
      }
    }
    const vals = Array.from({ length: n }, (_, i) => A[i * n + i]);
    return { vals, V };
  }

  // ---------- real basis from EigenGalactic/export_web.py ----------
  async function loadReal() {
    const meta = await (await fetch("data/eigengalaxies.json")).json();
    const buf = await (await fetch("data/eigengalaxies.bin")).arrayBuffer();
    N = meta.image_size[0]; D = N * N; K = meta.n_components;
    const L = meta.layout;
    const rawMean = new Float32Array(buf, L.mean.offset, D);
    const q = new Int8Array(buf, L.components.offset, K * D);
    const t = new Uint8Array(buf, L.test.offset, meta.n_test * D);
    // Work in [0,1] pixel units; PCA is linear so only the coefficients rescale.
    mean = Float32Array.from(rawMean, (v) => v / 255);
    U = new Float32Array(K * D);
    for (let c = 0; c < K; c++) {
      const s = meta.component_scales[c];
      let n = 0, peak = 0;
      for (let d = 0; d < D; d++) {
        const v = q[c * D + d] * s;
        U[c * D + d] = v; n += v * v;
        if (Math.abs(v) > Math.abs(peak)) peak = v;
      }
      const sc = (peak < 0 ? -1 : 1) / (Math.sqrt(n) || 1);
      for (let d = 0; d < D; d++) U[c * D + d] *= sc;
    }
    cum = new Float64Array(K + 1);
    meta.explained_variance_ratio.forEach((v, c) => { cum[c + 1] = cum[c] + v; });
    tests = Array.from({ length: meta.n_test }, (_, i) => Float32Array.from(t.subarray(i * D, i * D + D), (v) => v / 255));
    $("source-note").innerHTML = `This basis was fit by the <a href="https://github.com/Sam-Indyk/EigenGalactic" target="_blank" rel="noopener">EigenGalactic</a>
      Python pipeline (scikit-learn IncrementalPCA, ${K} components) on <b>${meta.n_train.toLocaleString()} real Galaxy Zoo 2 images</b>
      at ${N}×${N}, then exported for the browser. "New galaxy" cycles through ${meta.n_test} galaxies held out from training.`;
    setStatus(1, `Galaxy Zoo 2 basis · ${meta.n_train.toLocaleString()} training images · top ${K} components capture ${(cum[K] * 100).toFixed(1)}% of variance`);
  }

  // ---------- procedural fallback ----------
  async function train() {
    const X = new Float32Array(M * D);
    for (let i = 0; i < M; i++) {
      X.set(GalaxyGen.make(N, trainRng), i * D);
      if (i % 60 === 0) { setStatus(0.15 * i / M, `Generating galaxies… ${i}/${M}`); await tick(); }
    }
    mean = new Float32Array(D);
    for (let i = 0; i < M; i++) for (let d = 0; d < D; d++) mean[d] += X[i * D + d];
    for (let d = 0; d < D; d++) mean[d] /= M;
    for (let i = 0; i < M; i++) for (let d = 0; d < D; d++) X[i * D + d] -= mean[d];

    const G = new Float64Array(M * M);
    for (let i = 0; i < M; i++) {
      const xi = X.subarray(i * D, i * D + D);
      for (let j = 0; j <= i; j++) {
        const xj = X.subarray(j * D, j * D + D);
        let s = 0;
        for (let d = 0; d < D; d++) s += xi[d] * xj[d];
        G[i * M + j] = G[j * M + i] = s;
      }
      if (i % 25 === 0) { setStatus(0.15 + 0.45 * (i * i) / (M * M), "Building the Gram matrix XXᵀ…"); await tick(); }
    }
    let trace = 0;
    for (let i = 0; i < M; i++) trace += G[i * M + i];

    let Q = new Float64Array(M * K);
    const r0 = GalaxyGen.rng(5);
    for (let i = 0; i < Q.length; i++) Q[i] = r0() - 0.5;
    orthonormalize(Q);
    const ITERS = 14;
    for (let it = 0; it < ITERS; it++) {
      Q = gramTimes(G, Q);
      orthonormalize(Q);
      setStatus(0.6 + 0.3 * (it + 1) / ITERS, `Subspace iteration ${it + 1}/${ITERS}…`);
      await tick();
    }

    // Rayleigh–Ritz: diagonalise T = QᵀGQ and rotate Q into eigenvectors.
    const GQ = gramTimes(G, Q);
    const T = new Float64Array(K * K);
    for (let a = 0; a < K; a++) for (let b = 0; b < K; b++) {
      let s = 0;
      for (let r = 0; r < M; r++) s += Q[a * M + r] * GQ[b * M + r];
      T[a * K + b] = s;
    }
    for (let a = 0; a < K; a++) for (let b = a + 1; b < K; b++) T[a * K + b] = T[b * K + a] = (T[a * K + b] + T[b * K + a]) / 2;
    const { vals, V } = jacobi(T, K);
    const order = vals.map((v, i) => [v, i]).sort((x, y) => y[0] - x[0]);

    U = new Float32Array(K * D);
    const lambdas = new Float64Array(K);
    for (let c = 0; c < K; c++) {
      const [lam, src] = order[c];
      lambdas[c] = Math.max(lam, 0);
      const v = new Float64Array(M);
      for (let b = 0; b < K; b++) {
        const w = V[b * K + src];
        for (let r = 0; r < M; r++) v[r] += w * Q[b * M + r];
      }
      const u = U.subarray(c * D, c * D + D);
      for (let r = 0; r < M; r++) {
        const w = v[r];
        const xr = X.subarray(r * D, r * D + D);
        for (let d = 0; d < D; d++) u[d] += w * xr[d];
      }
      let n = 0, peak = 0;
      for (let d = 0; d < D; d++) { n += u[d] * u[d]; if (Math.abs(u[d]) > Math.abs(peak)) peak = u[d]; }
      const sc = (peak < 0 ? -1 : 1) / (Math.sqrt(n) || 1); // sign convention: brightest lobe positive
      for (let d = 0; d < D; d++) u[d] *= sc;
    }
    cum = new Float64Array(K + 1);
    for (let c = 0; c < K; c++) cum[c + 1] = cum[c] + lambdas[c] / trace;
    setStatus(1, `Trained on ${M} galaxies · top ${K} components capture ${(cum[K] * 100).toFixed(1)}% of variance`);
  }

  // ---------- image ops ----------
  function blur(img, sigma) {
    const r = Math.ceil(sigma * 3), ker = [];
    let s = 0;
    for (let i = -r; i <= r; i++) { const w = Math.exp(-(i * i) / (2 * sigma * sigma)); ker.push(w); s += w; }
    for (let i = 0; i < ker.length; i++) ker[i] /= s;
    const refl = (i) => (i < 0 ? -i - 1 : i >= N ? 2 * N - i - 1 : i);
    const tmp = new Float32Array(D), out = new Float32Array(D);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      let v = 0;
      for (let i = -r; i <= r; i++) v += ker[i + r] * img[y * N + refl(x + i)];
      tmp[y * N + x] = v;
    }
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      let v = 0;
      for (let i = -r; i <= r; i++) v += ker[i + r] * tmp[refl(y + i) * N + x];
      out[y * N + x] = v;
    }
    return out;
  }

  function currentInput() {
    return $("blur-on").checked ? blur(orig, parseFloat($("sigma").value)) : orig;
  }

  function project() {
    const inp = currentInput();
    for (let c = 0; c < K; c++) {
      let s = 0;
      const u = U.subarray(c * D, c * D + D);
      for (let d = 0; d < D; d++) s += u[d] * (inp[d] - mean[d]);
      coeffs[c] = s;
    }
    return inp;
  }

  function reconstruct(kk) {
    const out = Float32Array.from(mean);
    for (let c = 0; c < kk; c++) {
      const u = U.subarray(c * D, c * D + D), w = coeffs[c];
      for (let d = 0; d < D; d++) out[d] += w * u[d];
    }
    return out;
  }

  // ---------- rendering ----------
  let inputImg = null;
  function render() {
    if (!ready) return;
    const rec = reconstruct(k);
    const res = new Float32Array(D);
    let se = 0;
    for (let d = 0; d < D; d++) { res[d] = orig[d] - rec[d]; se += res[d] * res[d]; }
    GalaxyGen.paint($("c-orig"), orig, N);
    GalaxyGen.paint($("c-input"), inputImg, N);
    GalaxyGen.paint($("c-recon"), rec, N);
    GalaxyGen.paint($("c-resid"), res, N, { diverging: true, scale: 3 });
    $("cap-input").textContent = $("blur-on").checked ? `blurred, σ=${$("sigma").value}` : "input";
    $("cap-recon").textContent = `μ + ${k} eigengalax${k === 1 ? "y" : "ies"}`;
    $("rmse").textContent = Math.sqrt(se / D).toFixed(4);
    $("varcap").textContent = `${(cum[k] * 100).toFixed(1)}%`;
    drawVar();
    drawCoef();
  }

  function newGalaxy(img) {
    orig = img || (tests ? tests[testIdx++ % tests.length] : GalaxyGen.make(N, testRng));
    inputImg = project();
    render();
  }

  function renderBasis() {
    const box = $("basis");
    box.innerHTML = "";
    const add = (img, label, opts) => {
      const f = document.createElement("figure");
      const c = document.createElement("canvas");
      c.className = "px";
      GalaxyGen.paint(c, img, N, opts);
      const cap = document.createElement("figcaption");
      cap.textContent = label;
      f.append(c, cap);
      box.appendChild(f);
    };
    add(mean, "μ (mean)");
    const shown = window.innerWidth < 900 ? 7 : 11;
    for (let c = 0; c < shown; c++) {
      const u = U.subarray(c * D, c * D + D);
      let m = 0;
      for (let d = 0; d < D; d++) m = Math.max(m, Math.abs(u[d]));
      add(u, `u${c + 1} · ${((cum[c + 1] - cum[c]) * 100).toFixed(1)}%`, { diverging: true, scale: 1 / m });
    }
  }

  // ---------- charts ----------
  function setupCanvas(cv) {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = cv.clientWidth, h = cv.clientHeight;
    cv.width = w * dpr; cv.height = h * dpr;
    const g = cv.getContext("2d");
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, w, h);
    return { g, w, h };
  }

  const VAR = { padL: 38, padR: 10, padT: 10, padB: 24, hover: null };
  function varGeom(w, h) {
    const x = (i) => VAR.padL + (i / K) * (w - VAR.padL - VAR.padR);
    const y = (v) => VAR.padT + (1 - v) * (h - VAR.padT - VAR.padB);
    return { x, y };
  }
  function drawVar() {
    const { g, w, h } = setupCanvas($("c-var"));
    const { x, y } = varGeom(w, h);
    g.font = "11px JetBrains Mono, monospace";
    g.fillStyle = COLOR.text; g.strokeStyle = COLOR.grid; g.lineWidth = 1;
    for (const v of [0, 0.25, 0.5, 0.75, 1]) {
      g.beginPath(); g.moveTo(VAR.padL, y(v)); g.lineTo(w - VAR.padR, y(v)); g.stroke();
      g.textAlign = "right"; g.fillText(`${v * 100}%`, VAR.padL - 6, y(v) + 4);
    }
    g.textAlign = "center";
    for (const f of [0, 0.25, 0.5, 0.75, 1]) g.fillText(Math.round(f * K), x(Math.round(f * K)), h - 6);
    g.strokeStyle = COLOR.line; g.lineWidth = 2; g.lineJoin = "round";
    g.beginPath();
    for (let i = 0; i <= K; i++) i ? g.lineTo(x(i), y(cum[i])) : g.moveTo(x(i), y(cum[i]));
    g.stroke();
    // current k marker
    g.strokeStyle = "rgba(255,181,71,0.35)"; g.setLineDash([3, 3]);
    g.beginPath(); g.moveTo(x(k), VAR.padT); g.lineTo(x(k), h - VAR.padB); g.stroke(); g.setLineDash([]);
    g.fillStyle = COLOR.marker; g.strokeStyle = "#10131c"; g.lineWidth = 2;
    g.beginPath(); g.arc(x(k), y(cum[k]), 5, 0, Math.PI * 2); g.fill(); g.stroke();
    g.fillStyle = "#eceef4"; g.textAlign = x(k) > w - 90 ? "right" : "left";
    g.fillText(`k=${k} · ${(cum[k] * 100).toFixed(1)}%`, x(k) + (x(k) > w - 90 ? -10 : 10), y(cum[k]) + 16);
    if (VAR.hover != null) {
      const i = VAR.hover;
      g.strokeStyle = "rgba(255,255,255,0.3)"; g.lineWidth = 1;
      g.beginPath(); g.moveTo(x(i), VAR.padT); g.lineTo(x(i), h - VAR.padB); g.stroke();
      g.fillStyle = COLOR.line; g.beginPath(); g.arc(x(i), y(cum[i]), 4, 0, Math.PI * 2); g.fill();
    }
  }

  function drawCoef() {
    const { g, w, h } = setupCanvas($("c-coef"));
    let m = 0;
    for (let c = 0; c < K; c++) m = Math.max(m, Math.abs(coeffs[c]));
    m = m || 1;
    const mid = h / 2, slot = w / K, bw = Math.max(1, slot - 2);
    g.strokeStyle = COLOR.axis; g.lineWidth = 1;
    g.beginPath(); g.moveTo(0, mid); g.lineTo(w, mid); g.stroke();
    for (let c = 0; c < K; c++) {
      const v = coeffs[c] / m, bh = Math.abs(v) * (mid - 6);
      const used = c < k;
      g.fillStyle = used ? (v >= 0 ? COLOR.pos : COLOR.neg) : COLOR.neutral;
      g.globalAlpha = used ? 1 : 0.45;
      const x0 = c * slot + 1, r = Math.min(2, bw / 2, bh);
      g.beginPath();
      if (v >= 0) { g.moveTo(x0, mid); g.lineTo(x0, mid - bh + r); g.quadraticCurveTo(x0, mid - bh, x0 + r, mid - bh); g.lineTo(x0 + bw - r, mid - bh); g.quadraticCurveTo(x0 + bw, mid - bh, x0 + bw, mid - bh + r); g.lineTo(x0 + bw, mid); }
      else { g.moveTo(x0, mid); g.lineTo(x0, mid + bh - r); g.quadraticCurveTo(x0, mid + bh, x0 + r, mid + bh); g.lineTo(x0 + bw - r, mid + bh); g.quadraticCurveTo(x0 + bw, mid + bh, x0 + bw, mid + bh - r); g.lineTo(x0 + bw, mid); }
      g.fill();
    }
    g.globalAlpha = 1;
  }

  function hookTooltips() {
    const vc = $("c-var"), vt = $("var-tip");
    vc.addEventListener("pointermove", (e) => {
      if (!ready) return;
      const rect = vc.getBoundingClientRect();
      const { x, y } = varGeom(rect.width, rect.height);
      const i = Math.round(((e.clientX - rect.left - VAR.padL) / (rect.width - VAR.padL - VAR.padR)) * K);
      VAR.hover = Math.max(0, Math.min(K, i));
      vt.textContent = `k=${VAR.hover} · ${(cum[VAR.hover] * 100).toFixed(1)}%`;
      vt.style.left = `${x(VAR.hover)}px`; vt.style.top = `${y(cum[VAR.hover])}px`; vt.style.opacity = 1;
      drawVar();
    });
    vc.addEventListener("pointerleave", () => { VAR.hover = null; vt.style.opacity = 0; if (ready) drawVar(); });
    vc.addEventListener("click", () => { if (VAR.hover != null) setK(VAR.hover); });

    const cc = $("c-coef"), ct = $("coef-tip");
    cc.addEventListener("pointermove", (e) => {
      if (!ready) return;
      const rect = cc.getBoundingClientRect();
      const c = Math.max(0, Math.min(K - 1, Math.floor(((e.clientX - rect.left) / rect.width) * K)));
      ct.textContent = `c${c + 1} = ${coeffs[c] >= 0 ? "+" : ""}${coeffs[c].toFixed(3)}${c < k ? "" : " (unused)"}`;
      ct.style.left = `${(c + 0.5) * (rect.width / K)}px`; ct.style.top = "20px"; ct.style.opacity = 1;
    });
    cc.addEventListener("pointerleave", () => { ct.style.opacity = 0; });
  }

  // ---------- controls ----------
  function setK(v) { k = v; $("k").value = v; $("k-val").textContent = v; render(); }
  $("k").addEventListener("input", (e) => setK(+e.target.value));
  $("blur-on").addEventListener("change", () => { inputImg = project(); render(); });
  $("sigma").addEventListener("input", (e) => {
    $("sigma-val").textContent = (+e.target.value).toFixed(1);
    if ($("blur-on").checked) { inputImg = project(); render(); }
  });
  $("next").addEventListener("click", () => newGalaxy());
  let anim = null;
  $("play").addEventListener("click", () => {
    if (anim) { clearInterval(anim); anim = null; $("play").textContent = "▶ Animate k"; return; }
    let v = 0; setK(0);
    $("play").textContent = "■ Stop";
    anim = setInterval(() => {
      v++; setK(v);
      if (v >= K) { clearInterval(anim); anim = null; $("play").textContent = "▶ Animate k"; }
    }, 70);
  });
  $("upload").addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (!file || !ready) return;
    const img = new Image();
    img.onload = () => {
      const c = document.createElement("canvas");
      c.width = N; c.height = N;
      const g = c.getContext("2d");
      const s = Math.min(img.width, img.height);
      g.drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, N, N);
      const px = g.getImageData(0, 0, N, N).data;
      const out = new Float32Array(D);
      let lo = Infinity, hi = -Infinity;
      for (let i = 0; i < D; i++) {
        const v = 0.299 * px[i * 4] + 0.587 * px[i * 4 + 1] + 0.114 * px[i * 4 + 2];
        out[i] = v; lo = Math.min(lo, v); hi = Math.max(hi, v);
      }
      for (let i = 0; i < D; i++) out[i] = (out[i] - lo) / (hi - lo || 1);
      URL.revokeObjectURL(img.src);
      newGalaxy(out);
    };
    img.src = URL.createObjectURL(file);
    e.target.value = "";
  });
  let rz;
  window.addEventListener("resize", () => { clearTimeout(rz); rz = setTimeout(() => { if (ready) { renderBasis(); render(); } }, 150); });

  // ---------- go ----------
  hookTooltips();
  loadReal().catch(() => { tests = null; N = 48; D = N * N; K = 64; return train(); }).then(() => {
    coeffs = new Float64Array(K);
    $("k").max = K;
    ready = true;
    for (const id of ["k", "next", "play"]) $(id).disabled = false;
    renderBasis();
    newGalaxy();
  });
})();
