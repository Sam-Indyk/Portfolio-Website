/*
 * world.js: the scroll-driven background.
 *
 * The page is one long descent. Every element of the scene is placed in
 * document coordinates (px from the top of the page), so scrolling moves
 * the camera through: orbit -> atmosphere -> the White House lawn -> tunnels.
 * Zone boundaries come from the .zone wrappers in index.html.
 */
(() => {
  const cv = document.getElementById("world");
  const ctx = cv.getContext("2d");
  const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

  const el = {
    sky: document.getElementById("zone-sky"),
    surface: document.getElementById("zone-surface"),
    ground: document.getElementById("zone-underground"),
    hudZone: document.getElementById("hud-zone"),
    hudLabel: document.getElementById("hud-label"),
    hudValue: document.getElementById("hud-value"),
    hudFill: document.getElementById("hud-fill"),
    hudGround: document.querySelector(".hud-ground"),
  };

  let W = 0, H = 0, DPR = 1;
  let skyTop = 0, surfaceTop = 0, groundY = 0, orbitTop = 0, docH = 0;
  let scroll = 0, lastScroll = 0, scrollVel = 0;
  let mouseX = 0.5, mouseY = 0.5;

  // ---------- deterministic RNG so the scene is identical on every load ----------
  let seed = 1337;
  const rand = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
  const lerp = (a, b, t) => a + (b - a) * t;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const smooth = (t) => t * t * (3 - 2 * t);

  // ---------- static scene data ----------
  const stars = Array.from({ length: 420 }, () => ({
    x: rand(), y: rand(), r: rand() * 1.3 + 0.2, tw: rand() * Math.PI * 2, s: rand() * 0.8 + 0.2,
  }));

  const galaxy = Array.from({ length: 1700 }, (_, i) => {
    const arm = i % 3;
    const r = Math.pow(rand(), 0.55);
    const spread = (rand() - 0.5) * (0.5 - r * 0.25);
    return {
      r,
      th: arm * (Math.PI * 2 / 3) + r * 5.2 + spread * 2.2,
      z: (rand() - 0.5) * 0.06 * (1 - r),
      size: rand() < 0.04 ? 2.2 : rand() * 1.3 + 0.4,
      core: r < 0.18,
      hue: rand(),
    };
  });

  // Pre-rendered cloud sprites (drawn once, stamped many times).
  const cloudSprites = Array.from({ length: 5 }, () => {
    const c = document.createElement("canvas");
    c.width = 420; c.height = 160;
    const g = c.getContext("2d");
    for (let i = 0; i < 14; i++) {
      const x = 60 + rand() * 300, y = 70 + (rand() - 0.5) * 50, r = 30 + rand() * 55;
      const grd = g.createRadialGradient(x, y, 0, x, y, r);
      grd.addColorStop(0, "rgba(255,255,255,0.55)");
      grd.addColorStop(1, "rgba(255,255,255,0)");
      g.fillStyle = grd;
      g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
    }
    return c;
  });
  const clouds = Array.from({ length: 26 }, () => ({
    u: rand(),            // relative position inside the cloud band
    x: rand() * 1.4 - 0.2,
    p: 0.55 + rand() * 0.8, // parallax
    s: 0.6 + rand() * 1.4,
    sprite: (rand() * cloudSprites.length) | 0,
    drift: (rand() - 0.5) * 0.01,
  }));

  const trees = Array.from({ length: 60 }, () => ({ x: rand(), h: 18 + rand() * 30, w: 18 + rand() * 26 }));
  const windowsLit = Array.from({ length: 64 }, () => rand() > 0.25);
  const rocks = Array.from({ length: 260 }, () => ({
    x: rand(), d: rand(), rx: 3 + rand() * 14, ry: 2 + rand() * 8, a: rand() * Math.PI, shade: rand(),
  }));
  // Tunnel cross-sections live in the left margin so they never sit behind text.
  const crossSections = Array.from({ length: 6 }, (_, i) => ({ x: 0.035 + rand() * 0.05, d: 0.2 + i * 0.14 + rand() * 0.04, r: 26 + rand() * 18 }));
  const dust = Array.from({ length: 90 }, () => ({ x: rand(), y: rand(), v: 0.2 + rand() * 0.6, r: rand() * 1.6 + 0.3 }));
  const debris = [];

  // ---------- layout ----------
  const docTop = (node) => node.getBoundingClientRect().top + window.scrollY;
  function measure() {
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    W = window.innerWidth; H = window.innerHeight;
    cv.width = Math.round(W * DPR); cv.height = Math.round(H * DPR);
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    skyTop = docTop(el.sky);
    surfaceTop = docTop(el.surface);
    groundY = docTop(el.ground);
    orbitTop = docTop(document.getElementById("orbit"));
    docH = document.documentElement.scrollHeight;
  }

  // ---------- background colour as a function of document depth ----------
  function colorStops() {
    const sky = groundY - skyTop;
    return [
      [0, [5, 6, 11]],
      [skyTop, [7, 10, 26]],
      [skyTop + sky * 0.35, [12, 26, 62]],
      [skyTop + sky * 0.62, [30, 58, 108]],
      [groundY - H * 0.9, [92, 82, 128]],
      [groundY - H * 0.3, [196, 112, 96]],
      [groundY - 2, [242, 160, 98]],
      [groundY, [52, 36, 24]],
      [groundY + H * 1.2, [38, 26, 18]],
      [Math.max(docH, groundY + H * 2), [13, 9, 7]],
    ];
  }
  function bgAt(y, stops) {
    if (y <= stops[0][0]) return stops[0][1];
    for (let i = 1; i < stops.length; i++) {
      if (y <= stops[i][0]) {
        const [y0, c0] = stops[i - 1], [y1, c1] = stops[i];
        const t = (y - y0) / Math.max(1, y1 - y0);
        return [lerp(c0[0], c1[0], t), lerp(c0[1], c1[1], t), lerp(c0[2], c1[2], t)];
      }
    }
    return stops[stops.length - 1][1];
  }
  const rgb = (c, a = 1) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;

  // ---------- drawing ----------
  function drawSky(stops) {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    const n = 8;
    for (let i = 0; i <= n; i++) g.addColorStop(i / n, rgb(bgAt(scroll + (H * i) / n, stops)));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }

  function drawStars(t) {
    // Stars fade out as the sky brightens.
    const fade = 1 - smooth(clamp((scroll + H * 0.5 - skyTop) / ((groundY - skyTop) * 0.55), 0, 1));
    if (fade <= 0) return;
    for (const s of stars) {
      const y = ((s.y * H * 1.6 - scroll * 0.06 * s.s) % (H * 1.6) + H * 1.6) % (H * 1.6) - H * 0.3;
      const tw = reduceMotion ? 1 : 0.6 + 0.4 * Math.sin(t * 0.0018 * s.s + s.tw);
      ctx.globalAlpha = fade * tw * (0.35 + s.s * 0.65);
      ctx.fillStyle = "#fff";
      ctx.fillRect(s.x * W, y, s.r, s.r);
    }
    ctx.globalAlpha = 1;
  }

  function drawGalaxy(t) {
    const fade = 1 - clamp(scroll / (H * 1.1), 0, 1);
    if (fade <= 0) return;
    const mobile = W < 800;
    const cx = mobile ? W * 0.62 : W * 0.72 + (mouseX - 0.5) * 20;
    const cy = (mobile ? H * 0.3 : H * 0.46) - scroll * 0.35 + (mouseY - 0.5) * 14;
    const R = mobile ? W * 0.55 : Math.min(W * 0.3, H * 0.55);
    const tilt = 0.42 + (mouseY - 0.5) * 0.12;
    const rot = -0.5;
    const spin = reduceMotion ? 0 : t * 0.00003;
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    // core glow
    ctx.save();
    ctx.translate(cx, cy); ctx.rotate(rot); ctx.scale(1, tilt);
    const cg = ctx.createRadialGradient(0, 0, 0, 0, 0, R * 0.42);
    cg.addColorStop(0, `rgba(255,236,200,${0.6 * fade})`);
    cg.addColorStop(0.18, `rgba(255,200,140,${0.22 * fade})`);
    cg.addColorStop(1, "rgba(120,140,255,0)");
    ctx.fillStyle = cg;
    ctx.beginPath(); ctx.arc(0, 0, R * 0.42, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    const cr = Math.cos(rot), sr = Math.sin(rot);
    for (const p of galaxy) {
      const th = p.th + spin / (0.25 + p.r);
      const lx = Math.cos(th) * p.r * R;
      const ly = (Math.sin(th) * p.r * R) * tilt + p.z * R;
      const x = cx + lx * cr - ly * sr;
      const y = cy + lx * sr + ly * cr;
      const a = fade * (p.core ? 0.8 : 0.4 + (1 - p.r) * 0.55) * (mobile ? 0.6 : 1);
      ctx.fillStyle = p.core
        ? `rgba(255,${200 + p.hue * 40 | 0},${150 + p.hue * 50 | 0},${a})`
        : p.hue > 0.82 ? `rgba(255,150,190,${a})` : `rgba(${140 + p.hue * 60 | 0},${190 + p.hue * 40 | 0},255,${a})`;
      ctx.fillRect(x, y, p.size, p.size);
    }
    ctx.restore();
  }

  function drawSatellite(t) {
    // A small ISCR-style panel array drifting through the orbit section.
    const oy = orbitTop - scroll;
    if (oy > H * 1.2 || oy < -H * 1.6) return;
    const x = W * 0.85 - ((t * 0.006) % (W * 1.2)) * (reduceMotion ? 0 : 1) * 0.25;
    const y = oy - 40 + Math.sin(t * 0.0005) * 6;
    ctx.save();
    ctx.translate(x, y); ctx.rotate(-0.25);
    for (let i = -3; i <= 3; i++) {
      if (i === 0) continue;
      ctx.fillStyle = "#1f3f72"; ctx.strokeStyle = "rgba(110,200,255,0.8)"; ctx.lineWidth = 1;
      ctx.fillRect(i * 22 - 10, -12, 20, 24); ctx.strokeRect(i * 22 - 10, -12, 20, 24);
    }
    ctx.fillStyle = "#d8dbe4"; ctx.fillRect(-7, -7, 14, 14);
    const glint = 0.5 + 0.5 * Math.sin(t * 0.002);
    ctx.fillStyle = `rgba(255,255,255,${glint * 0.9})`;
    ctx.beginPath(); ctx.arc(44, -8, 2 + glint * 2, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  function drawEarth() {
    // The planet rises from below as the orbit zone ends, then we fall into it.
    const e = clamp((scroll - (skyTop - H * 2.4)) / (H * 2.4), 0, 1);
    const out = clamp((scroll - skyTop) / (H * 0.9), 0, 1);
    if (e <= 0 || out >= 1) return;
    const R = Math.max(W, H) * 2.1;
    const limb = H * (1.12 - 0.8 * smooth(e));
    const cx = W * 0.5, cy = limb + R;
    ctx.save();
    ctx.globalAlpha = 1 - smooth(out);
    // atmosphere glow
    const ag = ctx.createRadialGradient(cx, cy, R * 0.985, cx, cy, R * 1.05);
    ag.addColorStop(0, "rgba(120,200,255,0.9)");
    ag.addColorStop(0.35, "rgba(70,140,255,0.35)");
    ag.addColorStop(1, "rgba(40,80,200,0)");
    ctx.fillStyle = ag;
    ctx.beginPath(); ctx.arc(cx, cy, R * 1.05, 0, Math.PI * 2); ctx.fill();
    // planet body
    const pg = ctx.createLinearGradient(0, limb, 0, limb + H);
    pg.addColorStop(0, "#2a6fb8");
    pg.addColorStop(0.25, "#123f78");
    pg.addColorStop(1, "#071a36");
    ctx.fillStyle = pg;
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.fill();
    // continents / cloud bands, clipped to the disc
    ctx.save();
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.clip();
    ctx.globalAlpha *= 0.5;
    ctx.fillStyle = "#2e6b4a";
    ctx.beginPath(); ctx.ellipse(W * 0.32, limb + H * 0.18, W * 0.22, H * 0.06, -0.08, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(W * 0.78, limb + H * 0.3, W * 0.18, H * 0.08, 0.1, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.55)";
    for (let i = 0; i < 6; i++) {
      ctx.beginPath();
      ctx.ellipse(W * (0.1 + i * 0.17), limb + H * (0.08 + (i % 3) * 0.07), W * 0.12, 6 + (i % 2) * 6, 0.05, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
    // sunrise glint on the limb
    const sg = ctx.createRadialGradient(W * 0.2, limb, 0, W * 0.2, limb, W * 0.4);
    sg.addColorStop(0, "rgba(255,210,150,0.55)");
    sg.addColorStop(1, "rgba(255,210,150,0)");
    ctx.fillStyle = sg;
    ctx.fillRect(0, limb - W * 0.4, W, W * 0.8);
    ctx.restore();
  }

  function drawReentry(t) {
    const k = clamp(1 - Math.abs(scroll + H * 0.5 - (skyTop + H * 0.4)) / (H * 0.9), 0, 1);
    if (k <= 0) return;
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (let i = 0; i < 40; i++) {
      const x = ((i * 97.3) % 1) * W + ((i * 53) % W);
      const len = 60 + ((i * 31) % 120);
      const y = ((i * 211 + (reduceMotion ? 0 : t * 0.9)) % (H + len)) - len;
      const g = ctx.createLinearGradient(0, y, 0, y + len);
      g.addColorStop(0, "rgba(255,150,70,0)");
      g.addColorStop(1, `rgba(255,190,120,${0.5 * k})`);
      ctx.strokeStyle = g; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(x % W, y); ctx.lineTo(x % W, y + len); ctx.stroke();
    }
    ctx.restore();
  }

  function drawClouds(t) {
    const top = skyTop + (groundY - skyTop) * 0.25, bottom = groundY - H * 0.15;
    for (const c of clouds) {
      const docY = lerp(top, bottom, c.u);
      const y = (docY - scroll) * c.p + H * 0.5 * (1 - c.p);
      const spr = cloudSprites[c.sprite];
      const w = spr.width * c.s, h = spr.height * c.s;
      if (y < -h || y > H + h) continue;
      const x = (((c.x + (reduceMotion ? 0 : t * c.drift * 0.001)) % 1.4 + 1.4) % 1.4 - 0.2) * W;
      ctx.globalAlpha = 0.08 + 0.14 * c.p;
      ctx.drawImage(spr, x - w / 2, y - h / 2, w, h);
    }
    ctx.globalAlpha = 1;
  }

  function drawSurface(t) {
    const gy = groundY - scroll;
    if (gy > H + 400 || gy < -H * 0.5) return;
    const s = Math.min(W * 0.62, 680) / 640;

    // tree line on the horizon
    ctx.fillStyle = "#1c2a1e";
    for (const tr of trees) {
      const x = tr.x * W;
      if (Math.abs(x - W / 2) < 330 * s) continue;
      ctx.beginPath(); ctx.ellipse(x, gy - tr.h * s * 0.5, tr.w * s, tr.h * s, 0, 0, Math.PI * 2); ctx.fill();
    }

    // Washington Monument, far left
    const mx = W * 0.12, mh = 300 * s, mw = 16 * s;
    ctx.fillStyle = "#e5dccd";
    ctx.beginPath();
    ctx.moveTo(mx - mw, gy); ctx.lineTo(mx - mw * 0.72, gy - mh); ctx.lineTo(mx, gy - mh - 18 * s);
    ctx.lineTo(mx + mw * 0.72, gy - mh); ctx.lineTo(mx + mw, gy); ctx.closePath(); ctx.fill();
    ctx.fillStyle = "rgba(120,80,60,0.35)";
    ctx.beginPath(); ctx.moveTo(mx, gy); ctx.lineTo(mx, gy - mh - 18 * s); ctx.lineTo(mx + mw * 0.72, gy - mh); ctx.lineTo(mx + mw, gy); ctx.fill();
    if (!reduceMotion && Math.sin(t * 0.004) > 0.6) {
      ctx.fillStyle = "#ff3b3b";
      ctx.beginPath(); ctx.arc(mx, gy - mh - 20 * s, 2.5, 0, Math.PI * 2); ctx.fill();
    }

    // The White House (north facade), baseline on the horizon
    ctx.save();
    ctx.translate(W / 2, gy);
    ctx.scale(s, s);
    const stone = ctx.createLinearGradient(-320, 0, 320, 0);
    stone.addColorStop(0, "#f7e7cf"); stone.addColorStop(0.5, "#efe6da"); stone.addColorStop(1, "#c9bba8");
    ctx.fillStyle = stone;
    ctx.fillRect(-300, -96, 600, 96);                       // wings
    ctx.fillStyle = "#ddd2c2"; ctx.fillRect(-306, -106, 612, 10); // balustrade
    ctx.fillStyle = "#cfc3b1";
    for (let x = -300; x < 300; x += 8) ctx.fillRect(x, -112, 3, 6);
    ctx.fillStyle = stone; ctx.fillRect(-112, -122, 224, 122); // centre block
    // windows
    let wi = 0;
    for (const row of [-82, -40]) {
      for (let x = -284; x <= 268; x += 36) {
        if (x > -120 && x < 104) continue;
        ctx.fillStyle = windowsLit[wi++ % windowsLit.length] ? "#ffcf7d" : "#3b3a40";
        ctx.fillRect(x, row, 16, 26);
        ctx.fillStyle = "rgba(0,0,0,0.25)"; ctx.fillRect(x - 3, row - 5, 22, 3); // pediment caps
      }
    }
    // portico
    ctx.fillStyle = "#f2e9dc";
    ctx.beginPath(); ctx.moveTo(-92, -152); ctx.lineTo(0, -192); ctx.lineTo(92, -152); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = "rgba(0,0,0,0.18)"; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = "#e7dccb"; ctx.fillRect(-96, -152, 192, 14);
    ctx.fillStyle = "#2d2a2a"; ctx.fillRect(-60, -126, 120, 126); // shadowed recess
    ctx.fillStyle = "#ffd58f"; ctx.fillRect(-14, -58, 28, 58);    // lit door
    ctx.fillStyle = "#ffd58f"; ctx.fillRect(-46, -104, 14, 26); ctx.fillRect(32, -104, 14, 26);
    ctx.beginPath(); ctx.arc(0, -84, 12, Math.PI, 0); ctx.fill();
    for (let i = 0; i < 6; i++) {                           // Ionic columns
      const x = -78 + i * 31.2;
      const cg = ctx.createLinearGradient(x - 5, 0, x + 5, 0);
      cg.addColorStop(0, "#fff8ec"); cg.addColorStop(1, "#cbbfae");
      ctx.fillStyle = cg; ctx.fillRect(x - 5, -138, 10, 138);
      ctx.fillStyle = "#e9dfcf"; ctx.fillRect(x - 8, -140, 16, 5);
    }
    // flag
    ctx.strokeStyle = "#ddd"; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(0, -122); ctx.lineTo(0, -238); ctx.stroke();
    ctx.save(); ctx.translate(1, -236);
    for (let i = 0; i < 7; i++) {
      ctx.fillStyle = i % 2 ? "#f4f4f4" : "#c8283c";
      ctx.beginPath();
      for (let x = 0; x <= 36; x += 4) {
        const wv = reduceMotion ? 0 : Math.sin(x * 0.18 - t * 0.006) * 2;
        x === 0 ? ctx.moveTo(x, i * 3 + wv) : ctx.lineTo(x, i * 3 + wv);
      }
      for (let x = 36; x >= 0; x -= 4) {
        const wv = reduceMotion ? 0 : Math.sin(x * 0.18 - t * 0.006) * 2;
        ctx.lineTo(x, i * 3 + 3 + wv);
      }
      ctx.fill();
    }
    ctx.fillStyle = "#2b3a78"; ctx.fillRect(0, 0, 15, 12);
    ctx.restore();
    ctx.restore();

    // lawn
    const lawn = ctx.createLinearGradient(0, gy, 0, gy + 18);
    lawn.addColorStop(0, "#3d6b3a"); lawn.addColorStop(1, "#24401f");
    ctx.fillStyle = lawn; ctx.fillRect(0, gy, W, 18);
  }

  function strataY(k, x) {
    const base = [0, 18, 70, 190, 380, 640, 980, 1400, 1900, 2500, 3200, 4000][k] ?? (4000 + (k - 11) * 900);
    const a = 6 + k * 3;
    return groundY + base + Math.sin(x * 0.004 + k * 1.7) * a + Math.sin(x * 0.011 + k) * a * 0.4;
  }
  const strataCol = ["#5a3d24", "#4d331e", "#5c4128", "#463020", "#3f2d22", "#4a3628", "#332519", "#3b2b20", "#2a1e16", "#30231a", "#1f1611", "#251a13", "#18110d"];

  function drawUnderground(t) {
    const gy = groundY - scroll;
    if (gy > H) return;

    // strata bands
    for (let k = 0; k < 12; k++) {
      const top = strataY(k, 0) - scroll, bottom = strataY(k + 1, 0) - scroll;
      if (bottom < -60 || top > H + 60) continue;
      ctx.fillStyle = strataCol[k];
      ctx.beginPath();
      for (let x = 0; x <= W + 40; x += 40) ctx.lineTo(x, strataY(k, x) - scroll);
      for (let x = W + 40; x >= 0; x -= 40) ctx.lineTo(x, strataY(k + 1, x) - scroll);
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = "rgba(0,0,0,0.25)"; ctx.lineWidth = 1.5;
      ctx.beginPath();
      for (let x = 0; x <= W + 40; x += 40) ctx.lineTo(x, strataY(k + 1, x) - scroll);
      ctx.stroke();
    }

    // rocks
    const span = Math.max(docH - groundY, H);
    for (const r of rocks) {
      const y = groundY + 40 + r.d * span - scroll;
      if (y < -20 || y > H + 20) continue;
      ctx.fillStyle = `rgba(${150 + r.shade * 60 | 0},${120 + r.shade * 40 | 0},${90 + r.shade * 30 | 0},0.18)`;
      ctx.beginPath(); ctx.ellipse(r.x * W, y, r.rx, r.ry, r.a, 0, Math.PI * 2); ctx.fill();
    }

    // utility tunnel directly beneath the White House, with a Loop-style pod
    const ty = groundY + 250 - scroll;
    if (ty > -120 && ty < H + 120) {
      const th = 64;
      ctx.fillStyle = "#121014";
      ctx.fillRect(0, ty - th / 2, W, th);
      ctx.strokeStyle = "#6f665c"; ctx.lineWidth = 3;
      ctx.strokeRect(-4, ty - th / 2, W + 8, th);
      for (let x = 30; x < W; x += 34) { ctx.fillStyle = "rgba(255,255,255,0.05)"; ctx.fillRect(x, ty - th / 2, 2, th); }
      for (let x = 60; x < W; x += 140) {
        const lg = ctx.createRadialGradient(x, ty - th / 2 + 6, 0, x, ty - th / 2 + 6, 46);
        lg.addColorStop(0, "rgba(255,181,71,0.55)"); lg.addColorStop(1, "rgba(255,181,71,0)");
        ctx.fillStyle = lg; ctx.fillRect(x - 46, ty - th / 2, 92, th);
        ctx.fillStyle = "#ffcf7d"; ctx.fillRect(x - 6, ty - th / 2 + 3, 12, 3);
      }
      // access shaft up to the house
      const sw = 36 * Math.min(W * 0.62, 680) / 640;
      ctx.fillStyle = "#121014"; ctx.fillRect(W / 2 - sw / 2, gy + 18, sw, ty - th / 2 - gy - 18);
      ctx.strokeStyle = "#6f665c"; ctx.lineWidth = 2; ctx.strokeRect(W / 2 - sw / 2, gy + 18, sw, ty - th / 2 - gy - 18);
      // the pod
      const px = reduceMotion ? W * 0.3 : ((t * 0.12) % (W + 200)) - 100;
      ctx.fillStyle = "#d9dde6";
      roundRect(px - 40, ty - 14, 80, 30, 12); ctx.fill();
      ctx.fillStyle = "#33405a"; roundRect(px - 26, ty - 9, 46, 11, 5); ctx.fill();
      ctx.fillStyle = "#ffe7b0"; ctx.fillRect(px + 36, ty + 2, 4, 5);
      ctx.fillStyle = "#ff4d4d"; ctx.fillRect(px - 40, ty + 2, 3, 5);
    }

    // tunnel cross-sections (segmented lining rings)
    for (const c of crossSections) {
      const y = groundY + c.d * span - scroll;
      if (y < -100 || y > H + 100) continue;
      const x = c.x * W;
      ctx.fillStyle = "#0e0c0e"; ctx.beginPath(); ctx.arc(x, y, c.r, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = "#7d746a"; ctx.lineWidth = 5; ctx.stroke();
      ctx.strokeStyle = "#3c3630"; ctx.lineWidth = 2;
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2 + 0.2;
        ctx.beginPath(); ctx.moveTo(x + Math.cos(a) * (c.r - 3), y + Math.sin(a) * (c.r - 3)); ctx.lineTo(x + Math.cos(a) * (c.r + 3), y + Math.sin(a) * (c.r + 3)); ctx.stroke();
      }
      const lg = ctx.createRadialGradient(x, y - c.r * 0.6, 0, x, y - c.r * 0.6, c.r);
      lg.addColorStop(0, "rgba(255,181,71,0.5)"); lg.addColorStop(1, "rgba(255,181,71,0)");
      ctx.fillStyle = lg; ctx.beginPath(); ctx.arc(x, y, c.r - 3, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#3a3330"; ctx.fillRect(x - c.r * 0.7, y + c.r * 0.45, c.r * 1.4, 4); // invert / roadway
    }

    drawTBM(t, gy);

    // dust motes in the lamp light
    ctx.save(); ctx.globalCompositeOperation = "lighter";
    const dfade = clamp((scroll + H - groundY) / H, 0, 1);
    for (const d of dust) {
      const y = ((d.y * H - (reduceMotion ? 0 : t * 0.01 * d.v)) % H + H) % H;
      if (y < gy + 20) continue;
      ctx.fillStyle = `rgba(255,190,110,${0.22 * dfade})`;
      ctx.fillRect(d.x * W + Math.sin(t * 0.0006 + d.y * 9) * 8, y, d.r, d.r);
    }
    ctx.restore();
  }

  // The TBM bores straight down just ahead of the viewport, following the reader.
  function drawTBM(t, gy) {
    const wide = W > 1360;
    const x = wide ? W - Math.max(70, (W - 1120) / 4) : W * 0.9;
    const tipDoc = scroll + H * 0.84;
    const startDoc = groundY + 300;
    if (tipDoc < startDoc + 40) return;
    const tip = tipDoc - scroll;
    const top = Math.max(startDoc - scroll, -20);
    const D = wide ? 72 : 52;
    ctx.save();
    ctx.globalAlpha = wide ? 1 : 0.55;

    // bored shaft with segment rings
    ctx.fillStyle = "#0d0b0d"; ctx.fillRect(x - D / 2, top, D, tip - top);
    ctx.strokeStyle = "#6a6158"; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(x - D / 2, top); ctx.lineTo(x - D / 2, tip); ctx.moveTo(x + D / 2, top); ctx.lineTo(x + D / 2, tip); ctx.stroke();
    ctx.strokeStyle = "rgba(255,255,255,0.07)"; ctx.lineWidth = 1;
    const ringStart = Math.ceil((top + scroll) / 28) * 28;
    for (let yd = ringStart; yd < tipDoc - 150; yd += 28) { ctx.beginPath(); ctx.moveTo(x - D / 2, yd - scroll); ctx.lineTo(x + D / 2, yd - scroll); ctx.stroke(); }
    for (let yd = Math.ceil((top + scroll) / 220) * 220; yd < tipDoc - 160; yd += 220) {
      const lg = ctx.createRadialGradient(x, yd - scroll, 0, x, yd - scroll, D);
      lg.addColorStop(0, "rgba(255,181,71,0.45)"); lg.addColorStop(1, "rgba(255,181,71,0)");
      ctx.fillStyle = lg; ctx.fillRect(x - D / 2, yd - scroll - D, D, D * 2);
    }

    // trailing gantry + shield
    ctx.fillStyle = "#3a3f4a"; ctx.fillRect(x - D / 2 + 8, tip - 150, D - 16, 70);
    ctx.fillStyle = "#ffb547"; ctx.fillRect(x - D / 2 + 8, tip - 118, D - 16, 4);
    const sg = ctx.createLinearGradient(x - D / 2, 0, x + D / 2, 0);
    sg.addColorStop(0, "#7d8594"); sg.addColorStop(0.5, "#c9ced8"); sg.addColorStop(1, "#5d6472");
    ctx.fillStyle = sg; ctx.fillRect(x - D / 2 - 2, tip - 82, D + 4, 70);
    ctx.fillStyle = "#e14b3b"; ctx.fillRect(x - D / 2 - 2, tip - 50, D + 4, 6);

    // cutterhead seen in perspective, spinning with scroll
    const ang = scroll * 0.02 + (reduceMotion ? 0 : t * 0.0008);
    ctx.save(); ctx.translate(x, tip - 6); ctx.scale(1, 0.32);
    ctx.fillStyle = "#9aa1ad"; ctx.beginPath(); ctx.arc(0, 0, D / 2 + 4, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = "#2b2f38"; ctx.lineWidth = 5;
    for (let i = 0; i < 6; i++) {
      const a = ang + (i * Math.PI) / 3;
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.cos(a) * (D / 2 + 2), Math.sin(a) * (D / 2 + 2)); ctx.stroke();
      ctx.fillStyle = "#ffb547"; ctx.beginPath(); ctx.arc(Math.cos(a) * D * 0.32, Math.sin(a) * D * 0.32, 4, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();

    // muck spray while actively scrolling
    const v = Math.min(Math.abs(scrollVel), 60);
    if (!reduceMotion && v > 1) {
      for (let i = 0; i < v / 6; i++) debris.push({ x: x + (Math.random() - 0.5) * D, y: tip + 4, vx: (Math.random() - 0.5) * 3, vy: Math.random() * 2 + 0.5, life: 1 });
    }
    for (let i = debris.length - 1; i >= 0; i--) {
      const d = debris[i];
      d.x += d.vx; d.y += d.vy; d.vy += 0.12; d.life -= 0.035;
      if (d.life <= 0) { debris.splice(i, 1); continue; }
      ctx.fillStyle = `rgba(160,120,80,${d.life})`;
      ctx.fillRect(d.x, d.y, 2.5, 2.5);
    }
    if (debris.length > 400) debris.splice(0, debris.length - 400);
    ctx.restore();
  }

  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }

  // ---------- altimeter ----------
  function updateHUD() {
    const c = scroll + H * 0.5;
    let zone, label, value;
    if (c < skyTop) {
      const k = clamp(scroll / Math.max(1, skyTop - H * 0.5), 0, 1);
      zone = "LOW EARTH ORBIT"; label = "ALT"; value = `${Math.round(lerp(408, 100, k))} km`;
    } else if (c < groundY) {
      const k = (c - skyTop) / Math.max(1, groundY - skyTop);
      const m = 100000 * Math.pow(1 - k, 3);
      zone = c > surfaceTop ? "WASHINGTON, D.C." : k < 0.35 ? "MESOSPHERE" : k < 0.65 ? "STRATOSPHERE" : "TROPOSPHERE";
      label = "ALT"; value = m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m)} m`;
    } else {
      const k = (c - groundY) / Math.max(1, docH - groundY);
      zone = "UNDERGROUND"; label = "DEPTH"; value = `−${(k * 48).toFixed(1)} m`;
    }
    el.hudZone.textContent = zone;
    el.hudLabel.textContent = label;
    el.hudValue.textContent = value;
    el.hudFill.style.height = `${clamp(scroll / Math.max(1, docH - H), 0, 1) * 100}%`;
    el.hudGround.style.top = `${clamp(groundY / docH, 0, 1) * 100}%`;
  }

  // ---------- loop ----------
  function frame(t) {
    scroll = window.scrollY;
    scrollVel = lerp(scrollVel, scroll - lastScroll, 0.3);
    lastScroll = scroll;
    const stops = colorStops();
    drawSky(stops);
    drawStars(t);
    drawGalaxy(t);
    drawSatellite(t);
    drawEarth();
    drawReentry(t);
    drawClouds(t);
    drawSurface(t);
    drawUnderground(t);
    updateHUD();
    requestAnimationFrame(frame);
  }

  measure();
  window.addEventListener("resize", measure);
  new ResizeObserver(measure).observe(document.querySelector("main"));
  window.addEventListener("pointermove", (e) => { mouseX = e.clientX / W; mouseY = e.clientY / H; }, { passive: true });
  requestAnimationFrame(frame);
})();
