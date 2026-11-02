// The plaza at golden hour, on real ground in Austin (terrain.js): the Austin Union chamber front and
// centre and close, the White House and a classical rotunda (8VC) set well back to either side.
// Units are metres; the plaza is at y = 0 and the camera faces west (-z), into the sunset.
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { flagMap, windowMap, leafClusterMap, glowMap } from "../textures.js";
import { pbr, triplanar } from "../pbr.js";
import { LAWN } from "./terrain.js";

export const CUT_Z = 30;         // the cross-section cut: nothing stands in front of it, so from below the plaza sits behind its edge
export const SLAB_W = 440;       // width of the strata face

// Find the sun in an equirectangular HDR (its brightest region) as a direction.
function hdrSun(tex) {
  const { width: w, height: h, data } = tex.image;
  const half = data instanceof Uint16Array;
  const val = (i) => (half ? THREE.DataUtils.fromHalfFloat(data[i]) : data[i]);
  const ch = data.length / (w * h);
  let best = -1, bx = 0, by = 0;
  for (let y = 0; y < h / 2; y += 2) for (let x = 0; x < w; x += 2) {
    const i = (y * w + x) * ch;
    const l = val(i) * 0.2126 + val(i + 1) * 0.7152 + val(i + 2) * 0.0722;
    if (l > best) { best = l; bx = x; by = y; }
  }
  // Inverse of three's equirectUv: u = atan(z, x)/2π + 0.5, v = asin(y)/π + 0.5 (v measured from the bottom).
  const u = (bx + 0.5) / w, v = 1 - (by + 0.5) / h;
  return { az: (u - 0.5) * Math.PI * 2, el: (v - 0.5) * Math.PI };
}

const box = (w, h, d, x = 0, y = 0, z = 0) => new THREE.BoxGeometry(w, h, d).translate(x, y, z);

export const AYE = "#d9b25a", NO = "#3e6fe0";   // the two sides' colours, on the lecterns and the banner

// The chamber's banner, drawn on a canvas: the seal when idle; with a motion open, the motion and its
// running tally. Width:height matches the banner mesh (4.2 x 6.2).
function bannerArt(seal) {
  const W = 640, H = 945;
  const c = document.createElement("canvas");
  c.width = W; c.height = H;
  const g = c.getContext("2d");
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  const serif = '"Instrument Serif", Georgia, serif', mono = '"JetBrains Mono", ui-monospace, monospace';
  const cloth = () => {
    const grd = g.createLinearGradient(0, 0, 0, H);
    grd.addColorStop(0, "#5a0f1d"); grd.addColorStop(1, "#3c0812");
    g.fillStyle = grd; g.fillRect(0, 0, W, H);
    g.strokeStyle = "#c9a14a"; g.lineWidth = 3; g.strokeRect(22, 22, W - 44, H - 44);
    g.lineWidth = 1.5; g.strokeRect(34, 34, W - 68, H - 68);
  };
  const wrap = (text, maxW) => {
    const lines = [];
    let line = "";
    for (const w of text.split(" ")) {
      const t = line ? `${line} ${w}` : w;
      if (g.measureText(t).width > maxW && line) { lines.push(line); line = w; } else line = t;
    }
    return [...lines, line];
  };
  let last = null;
  function draw(m) {
    last = m;
    cloth();
    g.textAlign = "center";
    if (!m) {
      g.drawImage(seal, W / 2 - 190, H * 0.42 - 190, 380, 380);
    } else {
      g.drawImage(seal, W / 2 - 62, 74, 124, 124);
      g.fillStyle = "#c9a14a"; g.font = `500 21px ${mono}`;
      g.fillText("THE HOUSE DEBATES", W / 2, 258);
      g.fillStyle = "#f3e9da"; g.font = `76px ${serif}`;
      const lines = wrap(m.title, W - 150);
      const top = 470 - ((lines.length - 1) * 84) / 2;
      lines.forEach((l, i) => g.fillText(l, W / 2, top + i * 84));
      // Tally: gold for Aye, blue for No, split by share of the vote.
      const total = m.ayes + m.noes, share = total ? m.ayes / total : 0.5, bx = 90, bw = W - 180, by = 720;
      g.fillStyle = "rgba(0,0,0,0.25)"; g.fillRect(bx, by, bw, 18);
      if (total) {
        g.fillStyle = AYE; g.fillRect(bx, by, bw * share, 18);
        g.fillStyle = NO; g.fillRect(bx + bw * share, by, bw * (1 - share), 18);
      }
      g.font = `500 26px ${mono}`;
      g.textAlign = "left"; g.fillStyle = AYE; g.fillText(`AYE ${m.known ? m.ayes : "–"}`, bx, by + 66);
      g.textAlign = "right"; g.fillStyle = "#8fb0ff"; g.fillText(`${m.known ? m.noes : "–"} NO`, bx + bw, by + 66);
      g.textAlign = "center"; g.fillStyle = "rgba(243,233,218,0.55)"; g.font = `500 19px ${mono}`;
      g.fillText(total ? "VOTES CAST ONLINE" : "NO VOTES YET", W / 2, by + 122);
    }
    tex.needsUpdate = true;
  }
  draw(null);
  // Redraw once the page's fonts arrive (the first draw may have used fallbacks).
  document.fonts?.ready.then(() => draw(last));
  return { tex, draw };
}

// One Ionic column of height h and lower radius r, as a single geometry: moulded base, fluted shaft
// with entasis, and a capital with volutes. Instanced per building.
function columnGeometry(h, r) {
  const flutes = 20, pts = [];
  for (let i = 0; i < flutes * 8; i++) {
    const a = (i / (flutes * 8)) * Math.PI * 2;
    const k = 1 - 0.05 * Math.max(0, Math.cos(a * flutes)) ** 0.6;   // concave flutes, flat fillets between
    pts.push(new THREE.Vector2(Math.cos(a) * r * k, Math.sin(a) * r * k));
  }
  const shaftH = h * 0.86;
  const shaft = new THREE.ExtrudeGeometry(new THREE.Shape(pts), { depth: shaftH, steps: 6, bevelEnabled: false, curveSegments: 1 });
  shaft.rotateX(-Math.PI / 2);
  const sp = shaft.getAttribute("position");
  for (let i = 0; i < sp.count; i++) {
    const t = sp.getY(i) / shaftH, s = 1 - 0.14 * t * t;               // entasis: taper toward the top
    sp.setX(i, sp.getX(i) * s); sp.setZ(i, sp.getZ(i) * s);
  }
  shaft.translate(0, h * 0.07, 0);
  shaft.computeVertexNormals();
  const ring = (rr, hh, y) => new THREE.CylinderGeometry(rr, rr, hh, 40).translate(0, y, 0).toNonIndexed();
  const torus = (rr, tube, y) => new THREE.TorusGeometry(rr, tube, 8, 40).rotateX(Math.PI / 2).translate(0, y, 0).toNonIndexed();
  const parts = [
    box(r * 2.8, h * 0.025, r * 2.8, 0, h * 0.0125).toNonIndexed(),     // plinth
    torus(r * 1.15, r * 0.16, h * 0.035), torus(r * 1.02, r * 0.12, h * 0.06),
    ring(r * 1.0, h * 0.02, h * 0.075),
    shaft.index ? shaft.toNonIndexed() : shaft,
    torus(r * 0.9, r * 0.08, h * 0.935),                                // astragal
    box(r * 2.5, h * 0.035, r * 2.1, 0, h * 0.955).toNonIndexed(),     // echinus + volute band
    new THREE.CylinderGeometry(r * 0.42, r * 0.42, r * 2.2, 20).rotateX(Math.PI / 2).translate(-r * 1.2, h * 0.955, 0).toNonIndexed(),
    new THREE.CylinderGeometry(r * 0.42, r * 0.42, r * 2.2, 20).rotateX(Math.PI / 2).translate(r * 1.2, h * 0.955, 0).toNonIndexed(),
    box(r * 2.7, h * 0.022, r * 2.7, 0, h * 0.989).toNonIndexed(),     // abacus
  ];
  for (const g of parts) { g.deleteAttribute("uv"); }
  return mergeGeometries(parts);
}

function columns(positions, h, r, mat) {
  const mesh = new THREE.InstancedMesh(columnGeometry(h, r), mat, positions.length);
  const m = new THREE.Matrix4();
  positions.forEach(([x, y, z], i) => mesh.setMatrixAt(i, m.makeTranslation(x, y, z)));
  mesh.castShadow = mesh.receiveShadow = true;
  return mesh;
}

function pediment(width, height, depth) {
  const s = new THREE.Shape();
  s.moveTo(-width / 2, 0); s.lineTo(width / 2, 0); s.lineTo(0, height); s.closePath();
  return new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: false }).translate(0, 0, -depth / 2);
}

function wavingFlag(time) {
  const mat = new THREE.MeshStandardMaterial({ map: flagMap(), roughness: 0.8, side: THREE.DoubleSide });
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = time;
    sh.vertexShader = sh.vertexShader
      .replace("#include <common>", "#include <common>\nuniform float uTime;")
      .replace("#include <beginnormal_vertex>", `
        float fk = (position.x + 1.5) / 3.0;
        float ph = position.x * 2.1 - uTime * 3.2 + position.y * 0.7;
        float dz = cos(ph) * 2.1 * 0.24 * fk + sin(ph) * 0.24 / 3.0;
        vec3 objectNormal = normalize(vec3(-dz, 0.0, 1.0));`)
      .replace("#include <begin_vertex>", `
        vec3 transformed = vec3(position);
        transformed.z += sin(ph) * 0.24 * fk;
        transformed.y += sin(position.x * 1.3 - uTime * 2.0) * 0.06 * fk;`);
  };
  const flag = new THREE.Mesh(new THREE.PlaneGeometry(3, 1.58, 40, 12), mat);
  flag.position.x = 1.5; // hoist edge at the pole
  return flag;
}

export function buildSurface({ textures, renderer, isMobile, portrait = false, base = "/" }) {
  const group = new THREE.Group();
  const pickables = [];
  const time = { value: 0 };
  const m = new THREE.Matrix4();

  // Layout: the Union close, front and centre; the others well back, one to either side of it.
  const LAY = portrait
    ? { au: [0, -30, 1.45], wh: [-62, -190, 0.9], ro: [58, -160, 1.0] }
    : { au: [0, -30, 1.45], wh: [-96, -240, 0.9], ro: [90, -200, 1.0] };

  // ---------- sun: matches the backdrop panorama (low, behind the row, a little left) ----------
  const bm = textures.backdropMeta;
  const yaw = THREE.MathUtils.degToRad((bm.sun.x - 0.5) * bm.yaw_span), pitch = THREE.MathUtils.degToRad(bm.sun.pitch_deg);
  const SUN_DIR = new THREE.Vector3(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch));
  // Reflections/ambient from the full HDR, rotated so its sun agrees with the backdrop's.
  const hdr = textures.sky;
  hdr.mapping = THREE.EquirectangularReflectionMapping;
  const s = hdrSun(hdr);
  const skyRotation = new THREE.Euler(0, s.az - Math.atan2(SUN_DIR.z, SUN_DIR.x), 0);
  const envScene = new THREE.Scene();
  envScene.background = hdr;
  envScene.backgroundRotation.copy(skyRotation);
  const envMap = new THREE.PMREMGenerator(renderer).fromScene(envScene, 0, 0.1, 100).texture;

  const sun = new THREE.DirectionalLight(0xffb070, 5.5);
  sun.target.position.set(0, 0, -110);
  sun.position.copy(sun.target.position).addScaledVector(SUN_DIR, 700);
  sun.castShadow = !isMobile;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -170, right: 170, top: 60, bottom: -60, near: 10, far: 1500 });
  // The sun is 8° up: ground faces it almost edge-on, so shadows need a generous normal offset.
  sun.shadow.bias = -0.001; sun.shadow.normalBias = 0.4;
  const hemi = new THREE.HemisphereLight(0xb6c4e0, 0x3a3222, 0.9);
  // Soft front fill (the bright western sky behind the viewer): shapes facades the sun can't reach.
  const fill = new THREE.DirectionalLight(0xffd9b0, 0.9);
  fill.position.set(-90, 40, 140); fill.target.position.set(0, 8, -40);
  group.add(sun, sun.target, hemi, fill, fill.target);

  // ---------- plaza (the lawn around it is part of the terrain) ----------
  const paveMaps = pbr("precast_stone_paving", 1, base);
  // Purely diffuse: the camera looks across the paving toward the low sun, and PBR's grazing-angle
  // Fresnel turns it into tan glare.
  const pavement = triplanar(new THREE.MeshLambertMaterial({ map: paveMaps.map, color: new THREE.Color(2.6, 2.45, 2.25), polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }), 0.12);
  // A walkway from where the viewer lands up to a wider apron at the Union's steps; lawn either side.
  const plaza = new THREE.Mesh(mergeGeometries([
    new THREE.PlaneGeometry(14, 30).translate(0, -13, 0),
    new THREE.PlaneGeometry(44, 14).translate(0, 6, 0),
  ]), pavement);
  plaza.rotation.x = -Math.PI / 2; plaza.position.set(0, 0.02, 0); plaza.receiveShadow = true;
  group.add(plaza);

  const plaster = pbr("painted_plaster_wall", 1, base);
  // Warm limestone (white paint reads as flat grey-blue at dusk).
  const stone = triplanar(new THREE.MeshStandardMaterial({ map: plaster.map, roughnessMap: plaster.roughnessMap, color: 0xfff3e0, roughness: 1, envMapIntensity: 0.65 }), 0.3);
  const stoneDark = triplanar(new THREE.MeshStandardMaterial({ map: plaster.map, roughnessMap: plaster.roughnessMap, color: 0xd9d2c4, roughness: 1, envMapIntensity: 0.7 }), 0.3);
  const woodMaps = pbr("wood_floor", 1, base);
  const woodFloor = triplanar(new THREE.MeshStandardMaterial({ map: woodMaps.map, roughnessMap: woodMaps.roughnessMap, color: 0x8a5a3c, roughness: 0.9 }), 0.45);
  const warmLit = new THREE.MeshStandardMaterial({ color: 0x2a1a0a, emissive: 0xffb362, emissiveIntensity: 1.6 });
  const roofMat = new THREE.MeshStandardMaterial({ color: 0x5d6166, roughness: 0.65, metalness: 0.35 });
  const shadowAll = (o) => o.traverse((c) => { if (c.isMesh) { c.castShadow = true; c.receiveShadow = true; } });
  const glowTex = glowMap("rgba(255,214,160,1)");
  const glows = [];
  const glow = (parent, x, y, z, size) => {
    const g = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xffd6a0, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, fog: false }));
    g.position.set(x, y, z); g.scale.setScalar(size);
    parent.add(g); glows.push(g);
  };

  // ---------- White House (north facade) ----------
  const wh = new THREE.Group();
  const W = 51, DH = 26, FZ = DH / 2;                          // facade at z = +FZ
  wh.add(new THREE.Mesh(mergeGeometries([
    box(W, 15, DH, 0, 7.5),                                   // body
    box(W + 0.6, 1.3, DH + 0.6, 0, 0.65),                     // plinth
    box(W + 0.3, 0.45, DH + 0.3, 0, 7.4),                     // belt course
    box(W + 0.8, 0.7, DH + 0.8, 0, 14.6),                     // architrave
    box(W + 1.6, 0.55, DH + 1.6, 0, 15.6),                    // cornice
    box(W + 0.4, 1.3, DH + 0.4, 0, 16.5),                     // balustrade base / attic
    // Pilasters between window bays, and rusticated quoins at the corners.
    ...[-20.2, -15.7, 15.7, 20.2].map((x) => box(0.8, 13.2, 0.5, x, 7.9, FZ + 0.25)),
    ...[-1, 1].flatMap((sx) => Array.from({ length: 9 }, (_, i) => box(1.3 - (i % 2) * 0.4, 1.35, 0.45, sx * (W / 2 - 0.6 + (i % 2) * 0.2), 1.6 + i * 1.5, FZ + 0.2))),
  ]), stone));
  // Dentils under the cornice.
  const dent = new THREE.InstancedMesh(new THREE.BoxGeometry(0.22, 0.28, 0.28), stoneDark, 160);
  for (let i = 0; i < 160; i++) dent.setMatrixAt(i, m.makeTranslation(-W / 2 + 0.2 + i * ((W - 0.4) / 159), 15.2, FZ + 0.62));
  wh.add(dent);
  // Hipped roof with chimneys.
  const roof = new THREE.Mesh(new THREE.ConeGeometry(1, 1, 4, 1).rotateY(Math.PI / 4), roofMat);
  roof.scale.set((W - 6) / Math.SQRT2 * 1.0, 3.2, (DH - 6) / Math.SQRT2);
  roof.position.y = 17.1 + 1.6;
  wh.add(roof);
  for (const x of [-15, -6, 6, 15]) for (const z of [-5, 5]) wh.add(new THREE.Mesh(box(1.1, 3.0, 1.6, x, 19.0, z), stoneDark));
  // Balusters along the parapet.
  const bal = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.1, 0.15, 1.0, 8), stone, 150);
  for (let i = 0; i < 150; i++) bal.setMatrixAt(i, m.makeTranslation(-W / 2 + 0.3 + i * ((W - 0.6) / 149), 17.6, FZ + 0.1));
  wh.add(bal);
  wh.add(new THREE.Mesh(box(W + 0.4, 0.3, 0.6, 0, 18.2, FZ + 0.1), stone));   // handrail
  // Windows: main floor with alternating triangular / segmental pediments, upper floor with cornices.
  const litTex = windowMap(true), darkTex = windowMap(false);
  const winLit = new THREE.MeshStandardMaterial({ map: litTex, emissive: 0xffc68a, emissiveMap: litTex, emissiveIntensity: 1.4, roughness: 0.4 });
  const winDark = new THREE.MeshStandardMaterial({ map: darkTex, roughness: 0.15, metalness: 0.3 });
  const trim = [], caps = [];
  const lunette = new THREE.Shape();
  lunette.moveTo(-1.45, 0); lunette.quadraticCurveTo(0, 1.15, 1.45, 0); lunette.closePath();
  let lit = 0;
  const bays = [-22.4, -17.95, -13.45, 13.45, 17.95, 22.4];
  for (const [row, y, hh] of [[0, 3.9, 3.6], [1, 10.6, 3.2]]) {
    for (const x of bays) {
      const on = (lit++ * 7) % 5 !== 0;
      const win = new THREE.Mesh(new THREE.PlaneGeometry(1.8, hh), on ? winLit : winDark);
      win.position.set(x, y, FZ + 0.02);
      wh.add(win);
      // Sash on the wall face inside a projecting architrave frame.
      win.position.z = FZ + 0.03;
      trim.push(box(2.5, 0.25, 0.5, x, y - hh / 2 - 0.16, FZ + 0.15), box(0.3, hh + 0.3, 0.4, x - 1.05, y, FZ + 0.12), box(0.3, hh + 0.3, 0.4, x + 1.05, y, FZ + 0.12));
      if (row === 0) {
        // Alternating triangular and segmental pediments, as on the real facade.
        caps.push(lit % 2
          ? pediment(2.8, 0.75, 0.4).translate(x, y + hh / 2 + 0.25, FZ + 0.18)
          : new THREE.ExtrudeGeometry(lunette, { depth: 0.4, bevelEnabled: false, curveSegments: 16 }).translate(x, y + hh / 2 + 0.25, FZ - 0.02));
        trim.push(box(2.9, 0.22, 0.42, x, y + hh / 2 + 0.14, FZ + 0.2));
      } else {
        trim.push(box(2.6, 0.3, 0.42, x, y + hh / 2 + 0.2, FZ + 0.2));
      }
    }
  }
  wh.add(new THREE.Mesh(mergeGeometries([...trim, ...caps].map((g) => g.index ? g.toNonIndexed() : g).map((g) => { g.deleteAttribute("uv"); return g; })), stone));
  // North portico: steps, 4 + 4 columns, entablature, pediment, lantern, lit door.
  const PZ = FZ + 6.2;
  wh.add(new THREE.Mesh(mergeGeometries([
    box(19, 0.35, 9.6, 0, 0.175, FZ + 4.8), box(17.6, 0.35, 9.0, 0, 0.525, FZ + 4.5), box(16.4, 0.35, 8.4, 0, 0.875, FZ + 4.2),
    box(17.2, 1.1, 9.0, 0, 14.25, FZ + 4.4),                  // portico entablature
    box(17.8, 0.5, 9.6, 0, 15.0, FZ + 4.6),
  ]), stone));
  const ped = new THREE.Mesh(pediment(18.2, 3.6, 9.6), stone);
  ped.position.set(0, 15.25, FZ + 4.6);
  wh.add(ped);
  wh.add(columns([-6.3, -2.1, 2.1, 6.3].flatMap((x) => [[x, 1.05, PZ + 2.2], [x, 1.05, PZ - 2.2]]), 12.6, 0.55, stone));
  wh.add(new THREE.Mesh(box(2.4, 4.6, 0.1, 0, 3.4, FZ + 0.06), warmLit));
  const fan = new THREE.Mesh(new THREE.CircleGeometry(1.2, 24, 0, Math.PI), warmLit);
  fan.position.set(0, 5.7, FZ + 0.07);
  // Lantern hanging from the portico ceiling on a chain.
  const lantern = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.22, 0.9, 8), new THREE.MeshStandardMaterial({ color: 0xffd9a0, emissive: 0xffc070, emissiveIntensity: 2.2 }));
  lantern.position.set(0, 10.6, PZ);
  const chain = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 2.6), roofMat);
  chain.position.set(0, 12.4, PZ);
  wh.add(fan, lantern, chain);
  glow(wh, 0, 10.6, PZ + 0.4, 1.6);
  // Flag on the roof.
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 9, 8), new THREE.MeshStandardMaterial({ color: 0xdddddd, metalness: 0.8, roughness: 0.3 }));
  pole.position.set(0, 24.6, 0);
  const flag = wavingFlag(time);
  flag.position.y = 3.6;
  pole.add(flag);
  wh.add(pole);
  shadowAll(wh);
  flag.castShadow = false;
  wh.position.set(LAY.wh[0], 0, LAY.wh[1]);
  wh.scale.setScalar(LAY.wh[2]);
  group.add(wh);
  pickables.push({ id: "whitehouse", object: wh, focus: { pos: new THREE.Vector3(LAY.wh[0] + 14, 11, LAY.wh[1] + 58), target: new THREE.Vector3(LAY.wh[0], 9, LAY.wh[1]) } });

  // ---------- Rotunda (8VC) ----------
  const ro = new THREE.Group();
  ro.add(new THREE.Mesh(mergeGeometries([[9.4, 0.35], [8.8, 1.05], [8.2, 1.75]].map(([r, y]) => new THREE.CylinderGeometry(r, r, 0.7, 64).translate(0, y, 0))), stone));
  ro.add(columns(Array.from({ length: 12 }, (_, i) => [Math.cos((i / 12) * Math.PI * 2) * 6.6, 2.1, Math.sin((i / 12) * Math.PI * 2) * 6.6]), 9.2, 0.48, stone));
  ro.add(new THREE.Mesh(mergeGeometries([
    new THREE.CylinderGeometry(7.5, 7.5, 1.6, 64, 1, true).translate(0, 12.1, 0),
    new THREE.CylinderGeometry(7.7, 7.7, 0.4, 64).translate(0, 13.1, 0),
    new THREE.CylinderGeometry(6.2, 6.2, 1.4, 64).translate(0, 13.9, 0),
  ]), stone));
  const copper = new THREE.MeshStandardMaterial({ color: 0x6f9c8e, metalness: 0.35, roughness: 0.5 });
  const dome = new THREE.Mesh(new THREE.SphereGeometry(6.4, 64, 24, 0, Math.PI * 2, 0, Math.PI / 2), copper);
  dome.position.y = 14.6; dome.scale.y = 0.78;
  const ribs = new THREE.InstancedMesh(new THREE.TorusGeometry(6.42, 0.06, 4, 32, Math.PI / 2), copper, 16);
  for (let i = 0; i < 16; i++) ribs.setMatrixAt(i, m.makeRotationY((i / 16) * Math.PI * 2).multiply(new THREE.Matrix4().makeTranslation(0, 14.6, 0)).multiply(new THREE.Matrix4().makeScale(1, 0.78, 1)).multiply(new THREE.Matrix4().makeRotationY(Math.PI / 2)));
  const lan = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.1, 1.8, 16), stone);
  lan.position.y = 20.0;
  const floorGlow = new THREE.Mesh(new THREE.CylinderGeometry(4.5, 4.5, 0.3, 32), warmLit);
  floorGlow.position.y = 2.25;
  ro.add(dome, ribs, lan, floorGlow);
  shadowAll(ro);
  ro.position.set(LAY.ro[0], 0, LAY.ro[1]);
  ro.scale.setScalar(LAY.ro[2]);
  group.add(ro);
  pickables.push({ id: "rotunda", object: ro, focus: { pos: new THREE.Vector3(LAY.ro[0] - 12, 10, LAY.ro[1] + 40), target: new THREE.Vector3(LAY.ro[0], 9, LAY.ro[1]) } });

  // ---------- Austin Union chamber: front and centre ----------
  const au = new THREE.Group();
  const AW = 26, AD = 18, AH = 9.5;
  au.add(new THREE.Mesh(mergeGeometries([box(AW + 4, 0.5, AD + 4, 0, 0.25), box(AW + 2, 0.5, AD + 2, 0, 0.75)]), stone));
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(AW, AD), woodFloor);
  floor.rotation.x = -Math.PI / 2; floor.position.y = 1.01;
  au.add(floor);
  const cols = [];
  for (let i = 0; i < 6; i++) cols.push([-AW / 2 + 1 + i * ((AW - 2) / 5), 1, AD / 2 - 0.6]);
  for (const x of [-AW / 2 + 1, AW / 2 - 1]) for (let i = 1; i < 4; i++) cols.push([x, 1, AD / 2 - 0.6 - i * ((AD - 2) / 3)]);
  au.add(columns(cols, AH, 0.5, stone));
  // Dark walnut panelling behind, so the maroon banner reads as its own colour.
  const back = new THREE.Mesh(new THREE.BoxGeometry(AW - 1, AH, 0.6), new THREE.MeshStandardMaterial({ color: 0x3a2a22, roughness: 0.7 }));
  back.position.set(0, 1 + AH / 2, -AD / 2 + 0.6);
  au.add(back);
  au.add(new THREE.Mesh(mergeGeometries([box(AW + 1, 0.9, AD + 1, 0, 1 + AH + 0.45), box(AW + 1.6, 0.6, AD + 1.6, 0, 1 + AH + 1.2)]), stone));
  const gable = new THREE.Mesh(pediment(AW + 1.6, 4.6, AD + 1.4), stone);
  gable.position.y = 1 + AH + 1.5;
  au.add(gable);
  const dentA = new THREE.InstancedMesh(new THREE.BoxGeometry(0.2, 0.26, 0.26), stoneDark, 90);
  for (let i = 0; i < 90; i++) dentA.setMatrixAt(i, m.makeTranslation(-AW / 2 + i * (AW / 89), 1 + AH + 0.78, AD / 2 + 0.62));
  au.add(dentA);
  const sealMat = new THREE.MeshStandardMaterial({ map: textures.seal, transparent: true, roughness: 0.6, metalness: 0.1 });
  const pedSeal = new THREE.Mesh(new THREE.CircleGeometry(1.7, 64), sealMat);
  pedSeal.position.set(0, 1 + AH + 1.5 + 1.75, AD / 2 + 0.72);
  au.add(pedSeal);
  // Deep Union maroon, hung on a gilt rod; shows the seal, or the motion under debate (bannerArt).
  const art = bannerArt(textures.seal.image);
  const banner = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 6.2), new THREE.MeshStandardMaterial({ map: art.tex, roughness: 0.95, emissive: 0xffffff, emissiveMap: art.tex, emissiveIntensity: 0.1 }));
  banner.position.set(0, 6.0, -AD / 2 + 0.95);
  const gilt = new THREE.MeshStandardMaterial({ color: 0xc9a14a, metalness: 0.9, roughness: 0.35 });
  const bannerTrim = new THREE.Mesh(mergeGeometries([
    box(4.4, 0.08, 0.02, 0, 3.1, 0), box(4.4, 0.08, 0.02, 0, -3.1, 0), box(0.08, 6.2, 0.02, -2.16, 0, 0), box(0.08, 6.2, 0.02, 2.16, 0, 0),
    new THREE.CylinderGeometry(0.06, 0.06, 4.9, 12).rotateZ(Math.PI / 2).translate(0, 3.25, 0.02),
  ]), gilt);
  bannerTrim.position.copy(banner.position).add(new THREE.Vector3(0, 0, 0.01));
  au.add(bannerTrim, banner);
  const wood = triplanar(new THREE.MeshStandardMaterial({ map: woodMaps.map, roughnessMap: woodMaps.roughnessMap, color: 0x6b4128, roughness: 0.7 }), 1.2);
  // Two lecterns facing off: Aye (gold) on the left as you look in, No (blue) on the right. Their
  // front panels light in their side's colour while a motion is open.
  const sides = [];
  for (const [sx, hex] of [[-1, AYE], [1, NO]]) {
    const lec = new THREE.Mesh(mergeGeometries([box(0.75, 1.1, 0.5, 0, 0.55), box(0.85, 0.06, 0.6, 0, 1.16, 0.04)]), wood);
    const panelMat = new THREE.MeshStandardMaterial({ color: 0x2a1a12, roughness: 0.5, emissive: new THREE.Color(hex), emissiveIntensity: 0 });
    const front = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.86), panelMat);
    front.position.set(0, 0.56, 0.255);
    lec.add(front);
    lec.position.set(sx * 4.2, 1.0, -AD / 2 + 4.2);
    lec.rotation.y = -sx * 0.55;
    au.add(lec);
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: new THREE.Color(hex), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0, fog: false }));
    halo.position.set(sx * 4.2, 1.7, -AD / 2 + 4.9);
    halo.scale.setScalar(3.2);
    au.add(halo);
    sides.push({ panelMat, halo, level: 0, target: 0 });
  }
  const part = (w, h, d, x, y, z) => box(w, h, d, x, y, z);
  const chairGeo = mergeGeometries([
    part(0.46, 0.05, 0.44, 0, 0.0, 0), part(0.46, 0.5, 0.04, 0, 0.27, 0.2),
    ...[[-0.2, -0.18], [0.2, -0.18], [-0.2, 0.18], [0.2, 0.18]].map(([x, z]) => part(0.035, 0.46, 0.035, x, -0.25, z)),
  ]);
  const chairs = new THREE.InstancedMesh(chairGeo, new THREE.MeshStandardMaterial({ color: 0x2a1c16, roughness: 0.55 }), 60);
  let ci = 0;
  for (let r = 0; r < 5; r++) for (let k = 0; k < 12; k++) {
    if (k === 5 || k === 6) continue; // aisle
    chairs.setMatrixAt(ci++, m.makeTranslation(-6.6 + k * 1.2, 1.48, -AD / 2 + 8 + r * 1.5));
  }
  chairs.count = ci;
  au.add(chairs);
  const bulb = new THREE.MeshStandardMaterial({ color: 0xffe2b8, emissive: 0xffc781, emissiveIntensity: 5 });
  for (const x of [-6, 0, 6]) {
    const ch = new THREE.Mesh(new THREE.SphereGeometry(0.42, 16, 12), bulb);
    ch.position.set(x, 1 + AH - 1.6, -1);
    const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 1.4), roofMat);
    rod.position.set(x, 1 + AH - 0.7, -1);
    au.add(ch, rod);
    glow(au, x, 1 + AH - 1.6, -0.6, 3.4);
  }
  for (const sx of [-1, 1]) glow(au, sx * 4.2, 2.3, -AD / 2 + 4.0, 0.9);
  const inLight = new THREE.PointLight(0xffb870, 260, 32, 2);
  inLight.position.set(0, 7.5, -2);
  au.add(inLight);
  shadowAll(au);
  au.position.set(LAY.au[0], 0, LAY.au[1]);
  au.scale.setScalar(LAY.au[2]);
  group.add(au);
  const ay = (y) => y * LAY.au[2];
  // Opening the Union flies inside the hall to face the banner and both lecterns.
  pickables.push({ id: "union", object: au, focus: { pos: new THREE.Vector3(0, ay(4.8), LAY.au[1] + ay(7.6)), target: new THREE.Vector3(0, ay(4.2), LAY.au[1] - ay(8)) }, shift: 0.13 });

  // ---------- trees ----------
  // Crowns built from alpha-cut leaf cards; card normals point away from the crown centre so the
  // crown shades like a soft volume, not like flat planes.
  const leafTex = leafClusterMap();
  const leaf = new THREE.MeshStandardMaterial({ map: leafTex, alphaTest: 0.3, alphaToCoverage: true, side: THREE.DoubleSide, color: 0xc6d6a8, roughness: 0.9, envMapIntensity: 0.35 });
  const crownGeo = (seed) => {
    let cs2 = seed;
    const r = () => ((cs2 = (cs2 * 16807) % 2147483647) / 2147483647);
    const cards = [], n = new THREE.Vector3(), c = new THREE.Vector3(), e = new THREE.Euler();
    for (let i = 0; i < 48; i++) {
      c.randomDirection().multiplyScalar(0.55 + Math.sqrt(r()) * 0.5);
      c.set(c.x * 2.7, c.y * 2.2, c.z * 2.7);
      const g = new THREE.PlaneGeometry(2.1, 2.1);
      g.applyQuaternion(new THREE.Quaternion().setFromEuler(e.set(r() * Math.PI, r() * Math.PI, r() * Math.PI)));
      g.translate(c.x, c.y, c.z);
      n.copy(c).normalize().multiplyScalar(0.75).add(new THREE.Vector3(0, 0.35, 0)).normalize();
      const na = g.getAttribute("normal");
      for (let k = 0; k < na.count; k++) na.setXYZ(k, n.x, n.y, n.z);
      cards.push(g);
    }
    return mergeGeometries(cards);
  };
  const crownGeos = [crownGeo(11), crownGeo(23), crownGeo(37)];
  const trunkGeo = new THREE.CylinderGeometry(0.22, 0.38, 4, 7);
  const bark = new THREE.MeshStandardMaterial({ color: 0x2b2219, roughness: 1 });
  const spots = [];
  let ts = 5;
  const rr = () => ((ts = (ts * 16807) % 2147483647) / 2147483647);
  // A park around the plaza: clear of the buildings, the forecourt, and the lines of sight from the
  // landing spot to the White House and the rotunda.
  const clear = [[LAY.wh[0], LAY.wh[1], 38 * LAY.wh[2]], [LAY.ro[0], LAY.ro[1], 18], [0, LAY.au[1], 28]];
  const eye = new THREE.Vector2(0, 40);
  const sight = (x, z, [bx, bz], r) => {
    const a = new THREE.Vector2(bx, bz).sub(eye), p = new THREE.Vector2(x, z).sub(eye);
    const k = THREE.MathUtils.clamp(p.dot(a) / a.lengthSq(), 0, 1);
    return p.distanceTo(a.multiplyScalar(k)) > r;
  };
  const free = (x, z) => clear.every(([cx, cz, r]) => Math.hypot(x - cx, z - cz) > r)
    && !(Math.abs(x) < 70 && z > -48)                           // open, sunlit lawn in front of the Union
    && z < CUT_Z - 4
    && sight(x, z, LAY.wh, 34) && sight(x, z, LAY.ro, 24);
  // At an 8° sun each tree throws a ~70 m shadow, so the park is planted sparsely.
  for (let tries = 0; spots.length < (isMobile ? 100 : 170) && tries < 8000; tries++) {
    const a = rr() * Math.PI * 2, d = Math.sqrt(rr()) * LAWN.r0;
    const x = Math.cos(a) * d, z = LAWN.cz + Math.sin(a) * d;
    if (free(x, z)) spots.push([x, z, 0.9 + rr() * 0.8]);
  }
  const trunks = new THREE.InstancedMesh(trunkGeo, bark, spots.length);
  const crowns = crownGeos.map((g) => new THREE.InstancedMesh(g, leaf, spots.length));
  crowns.forEach((c) => { c.count = 0; });
  const q = new THREE.Quaternion(), sc = new THREE.Vector3(), p = new THREE.Vector3();
  spots.forEach(([x, z, sz], i) => {
    trunks.setMatrixAt(i, m.compose(p.set(x, 2 * sz, z), q.identity(), sc.setScalar(sz)));
    const c = crowns[i % crowns.length];
    q.setFromEuler(new THREE.Euler(0, rr() * Math.PI * 2, 0));
    c.setMatrixAt(c.count++, m.compose(p.set(x, 6.6 * sz, z), q, sc.set(sz, sz * (0.9 + rr() * 0.3), sz).multiplyScalar(0.95 + rr() * 0.25)));
  });
  trunks.castShadow = true;
  crowns.forEach((c) => { c.castShadow = c.receiveShadow = true; });
  group.add(trunks, ...crowns);

  // Lamps in pairs along the walkway.
  const lampMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, metalness: 0.6, roughness: 0.4 });
  const globe = new THREE.MeshStandardMaterial({ color: 0xfff0d8, emissive: 0xffc77a, emissiveIntensity: 4 });
  const lamps = [-10, -10, 6, 6, 22, 22].map((z, i) => [(i % 2 ? 1 : -1) * 8.5, z]);
  const posts = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.07, 0.1, 4, 8), lampMat, lamps.length);
  const globes = new THREE.InstancedMesh(new THREE.SphereGeometry(0.28, 12, 8), globe, lamps.length);
  lamps.forEach(([x, z], i) => {
    posts.setMatrixAt(i, m.makeTranslation(x, 2, z));
    globes.setMatrixAt(i, m.makeTranslation(x, 4.2, z));
    glow(group, x, 4.2, z + 0.2, 2.2);
  });
  group.add(posts, globes);

  // The chamber during a vote: the banner shows the motion and tally, and the leading side's lectern
  // glows brighter. show({ title, ayes, noes, known }), hide().
  const chamber = {
    show(m) {
      art.draw(m);
      const total = m.ayes + m.noes, share = total ? m.ayes / total : 0.5;
      sides[0].target = 0.45 + share * 1.1;
      sides[1].target = 0.45 + (1 - share) * 1.1;
    },
    hide() { art.draw(null); for (const s of sides) s.target = 0; },
  };

  return {
    group, pickables, envMap, skyRotation, sun, hemi, fill, sunDir: SUN_DIR, chamber,
    update(t) {
      time.value = t * 0.001;
      for (const s of sides) {
        s.level += (s.target - s.level) * 0.06;
        s.panelMat.emissiveIntensity = s.level * 0.9;
        s.halo.material.opacity = Math.min(0.8, s.level * 0.45);
      }
    },
  };
}
