// Surface band of the cross-section, at golden hour: the White House, the Austin Union chamber and
// a classical rotunda (8VC) in one row facing the viewer. Units are metres; the ground is y = 0.
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { flagMap, windowMap, leafClusterMap } from "../textures.js";
import { pbr, triplanar } from "../pbr.js";

export const CUT_Z = -12;        // the cross-section cut: lawn behind it, strata wall below it
export const ROW_Z = -34;        // the row of buildings
const BACKDROP_Z = -720;         // sky panorama
export const SLAB_W = 440;       // width of the lawn and the strata face

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
  const az = (u - 0.5) * Math.PI * 2, el = (v - 0.5) * Math.PI;
  return { az, el };
}

// Classical column: shaft with entasis + base + capital.
function column(h, r, mat) {
  const g = new THREE.Group();
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.86, r, h * 0.9, 24), mat);
  shaft.position.y = h * 0.05 + h * 0.45;
  const base = new THREE.Mesh(new THREE.CylinderGeometry(r * 1.25, r * 1.35, h * 0.05, 24), mat);
  base.position.y = h * 0.025;
  const cap = new THREE.Mesh(new THREE.BoxGeometry(r * 2.6, h * 0.05, r * 2.6), mat);
  cap.position.y = h * 0.975;
  g.add(shaft, base, cap);
  return g;
}

function pediment(width, height, depth, mat) {
  const s = new THREE.Shape();
  s.moveTo(-width / 2, 0); s.lineTo(width / 2, 0); s.lineTo(0, height); s.closePath();
  const geo = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: false });
  geo.translate(0, 0, -depth / 2);
  return new THREE.Mesh(geo, mat);
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

export function buildSurface({ textures, renderer, isMobile, base = "/" }) {
  const group = new THREE.Group();
  const pickables = [];
  const time = { value: 0 };

  // ---------- sun: matches the backdrop panorama (low, behind the row, a little left) ----------
  const bm = textures.backdropMeta;
  const yaw = THREE.MathUtils.degToRad((bm.sun.x - 0.5) * bm.yaw_span), pitch = THREE.MathUtils.degToRad(bm.sun.pitch_deg);
  const SUN_DIR = new THREE.Vector3(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch));
  // Reflections/ambient from the full HDR, rotated so its sun agrees with the backdrop's.
  const hdr = textures.sky;
  hdr.mapping = THREE.EquirectangularReflectionMapping;
  const s = hdr.userData.sun || (hdr.userData.sun = hdrSun(hdr));
  const skyRotation = new THREE.Euler(0, s.az - Math.atan2(SUN_DIR.z, SUN_DIR.x), 0);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envMap = pmrem.fromEquirectangular(hdr).texture;

  const sun = new THREE.DirectionalLight(0xffb070, 5.5);
  sun.target.position.set(0, -12, -20);
  sun.position.copy(sun.target.position).addScaledVector(SUN_DIR, 400);
  sun.castShadow = !isMobile;
  sun.shadow.mapSize.set(4096, 4096);
  Object.assign(sun.shadow.camera, { left: -120, right: 120, top: 80, bottom: -80, near: 10, far: 900 });
  sun.shadow.bias = -0.0003; sun.shadow.normalBias = 0.05;
  const hemi = new THREE.HemisphereLight(0xb6c4e0, 0x3a3222, 0.9);
  group.add(sun, sun.target, hemi);

  // ---------- ground ----------
  const grassMaps = pbr("sparse_grass", 6000, base);
  // Purely diffuse: the camera looks across the lawn toward the low sun, and PBR's grazing-angle
  // Fresnel turns it into tan glare. Real grass barely does that.
  const grassMat = new THREE.MeshLambertMaterial({ map: grassMaps.map, color: new THREE.Color(1.9, 1.9, 1.9) });
  // The source texture is dry and brownish: keep its detail but recolour it as a watered lawn, with
  // large-scale variation so it doesn't tile visibly.
  grassMat.onBeforeCompile = (sh) => {
    sh.fragmentShader = sh.fragmentShader.replace("#include <map_fragment>", `#include <map_fragment>
      float lum = dot(diffuseColor.rgb, vec3(0.3, 0.59, 0.11));
      diffuseColor.rgb = mix(diffuseColor.rgb, vec3(lum) * vec3(0.42, 0.78, 0.24) * 1.9, 0.75);
      float big = texture2D(map, vMapUv * 0.013).g * 2.4 + texture2D(map, vMapUv * 0.0031 + 0.3).g * 1.6;
      diffuseColor.rgb *= mix(0.72, 1.12, clamp(big - 0.2, 0.0, 1.0));`);
  };
  // The lawn ends at the cross-section cut (z = CUT_Z), where the strata wall begins below it.
  // Same width as the strata face, so the closing pull-back shows one clean slab.
  // Runs back to the sky panorama, so the horizon is always lawn meeting sky.
  const LAWN_D = -BACKDROP_Z + CUT_Z - 4;
  const grass = new THREE.Mesh(new THREE.PlaneGeometry(SLAB_W, LAWN_D), grassMat);
  grass.rotation.x = -Math.PI / 2; grass.position.set(0, 0, CUT_Z - LAWN_D / 2); grass.receiveShadow = true;
  const paveMaps = pbr("precast_stone_paving", 1, base);
  const pavement = triplanar(new THREE.MeshStandardMaterial({ map: paveMaps.map, roughnessMap: paveMaps.roughnessMap, color: 0xe2dbd0, roughness: 1 }), 0.22);
  const plaza = new THREE.Mesh(new THREE.PlaneGeometry(170, 30), pavement);
  plaza.rotation.x = -Math.PI / 2; plaza.position.set(0, 0.02, CUT_Z - 15.5); plaza.receiveShadow = true;
  group.add(grass, plaza);

  const plaster = pbr("painted_plaster_wall", 1, base);
  const stone = triplanar(new THREE.MeshStandardMaterial({ map: plaster.map, roughnessMap: plaster.roughnessMap, color: 0xfffaf0, roughness: 1, envMapIntensity: 0.8 }), 0.3);
  const woodMaps = pbr("wood_floor", 1, base);
  const woodFloor = triplanar(new THREE.MeshStandardMaterial({ map: woodMaps.map, roughnessMap: woodMaps.roughnessMap, color: 0x8a5a3c, roughness: 0.9 }), 0.45);
  const warmLit = new THREE.MeshStandardMaterial({ color: 0x2a1a0a, emissive: 0xffb362, emissiveIntensity: 1.6 });
  const roofMat = new THREE.MeshStandardMaterial({ color: 0x6e7176, roughness: 0.7, metalness: 0.3 });
  const shadowAll = (o) => o.traverse((c) => { if (c.isMesh) { c.castShadow = true; c.receiveShadow = true; } });

  // ---------- White House (north facade) ----------
  const wh = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(51, 15, 26), stone);
  body.position.y = 7.5;
  const cornice = new THREE.Mesh(new THREE.BoxGeometry(52.4, 0.9, 27.4), stone);
  cornice.position.y = 15.3;
  const parapet = new THREE.Mesh(new THREE.BoxGeometry(51.6, 1.4, 26.6), stone);
  parapet.position.y = 16.4;
  const roof = new THREE.Mesh(new THREE.BoxGeometry(46, 2.4, 21), roofMat);
  roof.position.y = 17.6;
  wh.add(body, cornice, parapet, roof);
  // Balusters along the front parapet.
  const bal = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.12, 0.16, 1.1, 8), stone, 140);
  const m = new THREE.Matrix4();
  for (let i = 0; i < 140; i++) { m.makeTranslation(-25.5 + i * (51 / 139), 16.4, 13.4); bal.setMatrixAt(i, m); }
  wh.add(bal);
  // Windows: two storeys, lit unevenly.
  const litTex = windowMap(true), darkTex = windowMap(false);
  const winLit = new THREE.MeshStandardMaterial({ map: litTex, emissive: 0xffc68a, emissiveMap: litTex, emissiveIntensity: 1.4, roughness: 0.4 });
  const winDark = new THREE.MeshStandardMaterial({ map: darkTex, roughness: 0.15, metalness: 0.3 });
  let lit = 0;
  for (const [y, h] of [[3.6, 3.6], [10.0, 3.2]]) {
    for (let x = -22.5; x <= 22.5; x += 4.5) {
      if (Math.abs(x) < 9) continue;
      const on = (lit++ * 7) % 5 !== 0;
      const win = new THREE.Mesh(new THREE.PlaneGeometry(1.7, h), on ? winLit : winDark);
      win.position.set(x, y, 13.02);
      const cap = new THREE.Mesh(new THREE.BoxGeometry(2.5, 0.35, 0.4), stone);
      cap.position.set(x, y + h / 2 + 0.35, 13.15);
      const sill = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.2, 0.35), stone);
      sill.position.set(x, y - h / 2 - 0.1, 13.15);
      wh.add(win, cap, sill);
    }
  }
  // North portico.
  const pf = new THREE.Mesh(new THREE.BoxGeometry(17, 0.6, 7), stone);
  pf.position.set(0, 0.3, 16.5);
  wh.add(pf);
  for (const x of [-6.3, -2.1, 2.1, 6.3]) for (const z of [19.2, 15.4]) {
    const c = column(12.6, 0.55, stone);
    c.position.set(x, 0.6, z);
    wh.add(c);
  }
  const ent = new THREE.Mesh(new THREE.BoxGeometry(17, 1.8, 7.4), stone);
  ent.position.set(0, 14.1, 16.6);
  const ped = pediment(17.4, 3.4, 7.4, stone);
  ped.position.set(0, 15.0, 16.6);
  const door = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 4.4), warmLit);
  door.position.set(0, 2.2, 13.03);
  const fan = new THREE.Mesh(new THREE.CircleGeometry(1.1, 24, 0, Math.PI), warmLit);
  fan.position.set(0, 4.4, 13.03);
  const lantern = new THREE.Mesh(new THREE.SphereGeometry(0.45, 16, 12), new THREE.MeshStandardMaterial({ color: 0xffd9a0, emissive: 0xffc070, emissiveIntensity: 3 }));
  lantern.position.set(0, 9.5, 16.6);
  wh.add(ent, ped, door, fan, lantern);
  // Flag on the roof.
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 9, 8), new THREE.MeshStandardMaterial({ color: 0xdddddd, metalness: 0.8, roughness: 0.3 }));
  pole.position.set(0, 23.3, 0);
  const flag = wavingFlag(time);
  flag.position.y = 26.9 - 23.3;
  pole.add(flag);
  wh.add(pole);
  shadowAll(wh);
  flag.castShadow = false;
  wh.position.set(-60, 0, ROW_Z - 6);
  group.add(wh);
  pickables.push({ id: "whitehouse", object: wh, focus: { pos: new THREE.Vector3(-46, 11, ROW_Z + 48), target: new THREE.Vector3(-60, 9, ROW_Z) } });

  // ---------- Rotunda (8VC) ----------
  const ro = new THREE.Group();
  for (const [r, y] of [[9.4, 0.35], [8.8, 1.05], [8.2, 1.75]]) {
    const step = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.7, 64), stone);
    step.position.y = y;
    ro.add(step);
  }
  const n = 12;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const c = column(9.2, 0.48, stone);
    c.position.set(Math.cos(a) * 6.6, 2.1, Math.sin(a) * 6.6);
    ro.add(c);
  }
  const ring = new THREE.Mesh(new THREE.CylinderGeometry(7.5, 7.5, 1.6, 64, 1, true), stone);
  ring.position.y = 12.1;
  const ringTop = new THREE.Mesh(new THREE.RingGeometry(5.8, 7.6, 64), stone);
  ringTop.rotation.x = -Math.PI / 2; ringTop.position.y = 12.9;
  const drum = new THREE.Mesh(new THREE.CylinderGeometry(6.2, 6.2, 1.4, 64), stone);
  drum.position.y = 13.6;
  const dome = new THREE.Mesh(new THREE.SphereGeometry(6.4, 64, 24, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x8c9a97, metalness: 0.65, roughness: 0.45 }));
  dome.position.y = 14.3; dome.scale.y = 0.78;
  const lan = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.1, 1.8, 16), stone);
  lan.position.y = 19.7;
  const glow = new THREE.Mesh(new THREE.CylinderGeometry(4.5, 4.5, 0.3, 32), warmLit);
  glow.position.y = 2.25;
  ro.add(ring, ringTop, drum, dome, lan, glow);
  shadowAll(ro);
  ro.position.set(56, 0, ROW_Z - 2);
  group.add(ro);
  pickables.push({ id: "rotunda", object: ro, focus: { pos: new THREE.Vector3(44, 10, ROW_Z + 34), target: new THREE.Vector3(56, 9, ROW_Z) } });

  // ---------- Austin Union chamber (centre) ----------
  const au = new THREE.Group();
  const W = 26, D = 18, H = 9.5;
  const dais = new THREE.Mesh(new THREE.BoxGeometry(W + 2, 1.0, D + 2), stone);
  dais.position.y = 0.5;
  const step = new THREE.Mesh(new THREE.BoxGeometry(W + 4, 0.5, D + 4), stone);
  step.position.y = 0.25;
  au.add(step, dais);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(W, D), woodFloor);
  floor.rotation.x = -Math.PI / 2; floor.position.y = 1.01;
  au.add(floor);
  // Colonnade: open front and sides.
  for (let i = 0; i < 6; i++) {
    const c = column(H, 0.5, stone);
    c.position.set(-W / 2 + 1 + i * ((W - 2) / 5), 1, D / 2 - 0.6);
    au.add(c);
  }
  for (const x of [-W / 2 + 1, W / 2 - 1]) for (let i = 1; i < 4; i++) {
    const c = column(H, 0.5, stone);
    c.position.set(x, 1, D / 2 - 0.6 - i * ((D - 2) / 3));
    au.add(c);
  }
  // Back wall (oxblood) carrying the banner.
  const back = new THREE.Mesh(new THREE.BoxGeometry(W - 1, H, 0.6), new THREE.MeshStandardMaterial({ color: 0x5a1a1f, roughness: 0.75 }));
  back.position.set(0, 1 + H / 2, -D / 2 + 0.6);
  au.add(back);
  const entab = new THREE.Mesh(new THREE.BoxGeometry(W + 1, 1.5, D + 1), stone);
  entab.position.y = 1 + H + 0.75;
  au.add(entab);
  // Gabled roof running front-to-back; its pediment faces the camera.
  const gable = pediment(W + 1.6, 4.6, D + 1.4, stone);
  gable.position.y = 1 + H + 1.5;
  au.add(gable);
  // Seal in the pediment and on the banner.
  const sealMat = new THREE.MeshStandardMaterial({ map: textures.seal, transparent: true, roughness: 0.6, metalness: 0.1 });
  const pedSeal = new THREE.Mesh(new THREE.CircleGeometry(1.7, 64), sealMat);
  pedSeal.position.set(0, 1 + H + 1.5 + 1.75, D / 2 + 0.72);
  au.add(pedSeal);
  const banner = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 6.2), new THREE.MeshStandardMaterial({ color: 0x7d1d27, roughness: 0.9 }));
  banner.position.set(0, 6.0, -D / 2 + 0.95);
  const bannerSeal = new THREE.Mesh(new THREE.CircleGeometry(1.6, 64), new THREE.MeshStandardMaterial({ map: textures.seal, transparent: true, roughness: 0.7, emissive: 0xffffff, emissiveMap: textures.seal, emissiveIntensity: 0.12 }));
  bannerSeal.position.set(0, 6.6, -D / 2 + 0.97);
  au.add(banner, bannerSeal);
  // Two lecterns facing each other, angled to the audience.
  const wood = triplanar(new THREE.MeshStandardMaterial({ map: woodMaps.map, roughnessMap: woodMaps.roughnessMap, color: 0x6b4128, roughness: 0.7 }), 1.2);
  for (const s of [-1, 1]) {
    const lec = new THREE.Group();
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.75, 1.1, 0.5), wood);
    post.position.y = 0.55;
    const top = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.06, 0.6), wood);
    top.position.set(0, 1.16, 0.04); top.rotation.x = 0.28;   // reading slope toward the speaker
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 8), new THREE.MeshStandardMaterial({ emissive: 0xffe0b0, emissiveIntensity: 4 }));
    lamp.position.set(0, 1.35, -0.2);
    lec.add(post, top, lamp);
    lec.position.set(s * 4.2, 1.0, -D / 2 + 4.2);
    lec.rotation.y = -s * 0.55;
    au.add(lec);
  }
  // Audience rows facing the speakers: proper chairs (seat, back, four legs), facing -z.
  const part = (w, h, d, x, y, z) => new THREE.BoxGeometry(w, h, d).translate(x, y, z);
  const chairGeo = mergeGeometries([
    part(0.46, 0.05, 0.44, 0, 0.0, 0),                // seat
    part(0.46, 0.5, 0.04, 0, 0.27, 0.2),              // back
    ...[[-0.2, -0.18], [0.2, -0.18], [-0.2, 0.18], [0.2, 0.18]].map(([x, z]) => part(0.035, 0.46, 0.035, x, -0.25, z)),
  ]);
  const chairs = new THREE.InstancedMesh(chairGeo, new THREE.MeshStandardMaterial({ color: 0x2a1c16, roughness: 0.55 }), 60);
  let ci = 0;
  for (let r = 0; r < 5; r++) for (let k = 0; k < 12; k++) {
    if (k === 5 || k === 6) continue; // aisle
    m.makeTranslation(-6.6 + k * 1.2, 1.48, -D / 2 + 8 + r * 1.5);
    chairs.setMatrixAt(ci++, m);
  }
  chairs.count = ci;
  au.add(chairs);
  // Chandeliers + real warm lights inside.
  const bulb = new THREE.MeshStandardMaterial({ color: 0xffe2b8, emissive: 0xffc781, emissiveIntensity: 5 });
  for (const x of [-6, 0, 6]) {
    const ch = new THREE.Mesh(new THREE.SphereGeometry(0.42, 16, 12), bulb);
    ch.position.set(x, 1 + H - 1.6, -1);
    const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 1.4), roofMat);
    rod.position.set(x, 1 + H - 0.7, -1);
    au.add(ch, rod);
  }
  const inLight = new THREE.PointLight(0xffb870, 220, 30, 2);
  inLight.position.set(0, 7.5, -2);
  const inLight2 = new THREE.PointLight(0xffc488, 90, 18, 2);
  inLight2.position.set(0, 4, -6);
  au.add(inLight, inLight2);
  shadowAll(au);
  au.position.set(0, 0, ROW_Z);
  group.add(au);
  pickables.push({ id: "union", object: au, focus: { pos: new THREE.Vector3(5, 6.5, ROW_Z + 24), target: new THREE.Vector3(0, 6, ROW_Z - 2) } });

  // ---------- trees and lamps ----------
  // Crowns built from alpha-cut leaf cards (the standard real-time foliage technique). Card normals
  // point away from the crown centre so the crown shades like a soft volume, not like flat planes.
  const leafTex = leafClusterMap();
  const leaf = new THREE.MeshStandardMaterial({ map: leafTex, alphaTest: 0.3, alphaToCoverage: !isMobile, side: THREE.DoubleSide, color: 0xc6d6a8, roughness: 0.9, envMapIntensity: 0.35 });
  const crownGeo = (seed) => {
    let cs2 = seed;
    const r = () => ((cs2 = (cs2 * 16807) % 2147483647) / 2147483647);
    const cards = [], n = new THREE.Vector3(), c = new THREE.Vector3(), e = new THREE.Euler();
    for (let i = 0; i < 64; i++) {
      // Points biased toward the surface of an ellipsoid, so the silhouette is dense and the inside sparse.
      c.randomDirection().multiplyScalar(0.55 + Math.sqrt(r()) * 0.5);
      c.set(c.x * 2.7, c.y * 2.2, c.z * 2.7);
      const g = new THREE.PlaneGeometry(1.9, 1.9);
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
  // Trees behind the row (receding into the haze) and beside it.
  for (let i = 0; i < (isMobile ? 90 : 190); i++) spots.push([(rr() - 0.5) * (SLAB_W - 20), ROW_Z - 30 - rr() * 340, 0.9 + rr() * 0.8]);
  for (let i = 0; i < 28; i++) spots.push([(rr() < 0.5 ? -1 : 1) * (84 + rr() * 70), ROW_Z + 6 - rr() * 30, 0.8 + rr() * 0.6]);
  const trunks = new THREE.InstancedMesh(trunkGeo, bark, spots.length);
  const crowns = crownGeos.map((g) => new THREE.InstancedMesh(g, leaf, spots.length));
  crowns.forEach((c) => { c.count = 0; });
  const q = new THREE.Quaternion(), sc = new THREE.Vector3(), p = new THREE.Vector3();
  spots.forEach(([x, z, s], i) => {
    m.compose(p.set(x, 2 * s, z), q.identity(), sc.setScalar(s));
    trunks.setMatrixAt(i, m);
    const c = crowns[i % crowns.length];
    q.setFromEuler(new THREE.Euler(0, rr() * Math.PI * 2, 0));
    m.compose(p.set(x, 6.6 * s, z), q, sc.set(s, s * (0.9 + rr() * 0.3), s).multiplyScalar(0.95 + rr() * 0.25));
    c.setMatrixAt(c.count++, m);
  });
  trunks.castShadow = true;
  crowns.forEach((c) => { c.castShadow = c.receiveShadow = true; });
  group.add(trunks, ...crowns);

  const lampMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, metalness: 0.6, roughness: 0.4 });
  const globe = new THREE.MeshStandardMaterial({ color: 0xfff0d8, emissive: 0xffc77a, emissiveIntensity: 4 });
  // Lamps along the front of the plaza.
  for (const x of [-92, -30, -16, 16, 30, 92]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.1, 4, 8), lampMat);
    post.position.set(x, 2, CUT_Z - 2);
    const g = new THREE.Mesh(new THREE.SphereGeometry(0.28, 12, 8), globe);
    g.position.set(x, 4.2, CUT_Z - 2);
    group.add(post, g);
  }

  // ---------- sky: a panoramic backdrop cut from the 8K HDR, feathered at the top and sides so it
  // dissolves into the atmosphere above and into darkness in the closing pull-back. ----------
  const BW = 2600, BH = BW / (bm.width / bm.height);
  const skyOpacity = { value: 1 }, skyBottom = { value: 0 };
  const horizonY = 14;                                  // pitch 0 sits at the plaza's eye level
  const backdrop = new THREE.Mesh(new THREE.PlaneGeometry(BW, BH), new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, fog: false, toneMapped: false,
    uniforms: { map: { value: textures.backdrop }, opacity: skyOpacity, bottomFeather: skyBottom, horizon: { value: -bm.pitch[0] / (bm.pitch[1] - bm.pitch[0]) } },
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `uniform sampler2D map; uniform float opacity, bottomFeather, horizon; varying vec2 vUv; void main(){
      vec4 c = texture2D(map, vUv);
      float side = smoothstep(0.0, 0.14, vUv.x) * smoothstep(1.0, 0.86, vUv.x);
      float top = smoothstep(1.0, 0.55, vUv.y);
      // In the closing overview the sky softens into darkness below the horizon instead of a hard edge.
      float bottom = mix(1.0, smoothstep(horizon - 0.02, horizon + 0.12, vUv.y), bottomFeather);
      gl_FragColor = vec4(c.rgb, side * top * bottom * opacity);
    }`,
  }));
  // The horizon row (pitch 0) sits `-pitch[0]/(span)` of the way up from the bottom edge.
  const horizonFrac = -bm.pitch[0] / (bm.pitch[1] - bm.pitch[0]);
  backdrop.position.set(0, horizonY + BH / 2 - BH * horizonFrac, BACKDROP_Z);
  backdrop.renderOrder = -2;
  group.add(backdrop);

  // Haze that matches the backdrop's horizon, so the lawn and trees recede into the panorama.
  const fog = new THREE.Fog(0xd9cbbd, 160, 1100);

  return {
    group, pickables, envMap, fog, skyRotation, sun, hemi, sunDir: SUN_DIR,
    setSkyOpacity(v, bottomFeather = 0) { skyOpacity.value = v; skyBottom.value = bottomFeather; },
    update(t) { time.value = t * 0.001; },
  };
}
