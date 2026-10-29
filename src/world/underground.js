// Underground band of the cross-section: the rock strata behind the cut, a shaft down from the lawn,
// the Loop tunnel cut open lengthwise (The Boring Company), the UATXcavators DN600 boring its own
// small tunnel deeper down, and the Polytopia-Zero fossil in the rock face. Units are metres.
import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { fossilMaps } from "../textures.js";
import { pbrRepeat } from "../pbr.js";
import { CUT_Z, SLAB_W } from "./surface.js";

export const TUNNEL = { y: -17, r: 1.83, x0: -30, x1: 26 };
export const BORE = { y: -27.5, r: 0.36, x0: -1, x1: 13 };
export const FOSSIL = new THREE.Vector3(-7, -27.2, CUT_Z + 0.12);

function ledPanel() {
  const c = document.createElement("canvas");
  c.width = 128; c.height = 64;
  const g = c.getContext("2d");
  g.fillStyle = "#15171b"; g.fillRect(0, 0, 128, 64);
  for (let y = 0; y < 2; y++) for (let x = 0; x < 8; x++) {
    g.fillStyle = "#0c0d10"; g.fillRect(8 + x * 14, 10 + y * 22, 10, 8);
    g.fillStyle = Math.random() < 0.8 ? "#3dff8a" : "#ffb347";
    g.fillRect(9 + x * 14, 20 + y * 22, 3, 2);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

async function loadDN600(base) {
  const [meta, buf] = await Promise.all([
    fetch(`${base}assets/dn600.json`).then((r) => r.json()),
    fetch(`${base}assets/dn600.bin`).then((r) => r.arrayBuffer()),
  ]);
  const root = new THREE.Group(), cutter = new THREE.Group();
  for (const mm of meta.meshes) {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(buf, mm.v[0], mm.v[1] * 3), 3));
    g.setIndex(new THREE.BufferAttribute(new Uint32Array(buf, mm.i[0], mm.i[1]), 1));
    g.computeVertexNormals();
    // CAD colours identify parts, not finishes: shell painted, cutterhead/bearings machined steel.
    const rubber = new THREE.Color(mm.color).getHSL({}).l < 0.22;
    const finish = rubber ? { color: 0x1c1d1f, metalness: 0.0, roughness: 0.7 }
      : ["Shell weldment", "Thrust ring", "Jacking cylinders"].includes(mm.group) ? { color: 0xb8952e, metalness: 0.0, roughness: 0.62 }
      : mm.group === "Cutterhead" ? { color: 0x6d7176, metalness: 0.9, roughness: 0.36 }
      : { color: 0xa8adb3, metalness: 0.92, roughness: 0.3 };
    const mesh = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ ...finish, envMapIntensity: 1.0 }));
    mesh.castShadow = mesh.receiveShadow = true;
    (mm.group === "Cutterhead" ? cutter : root).add(mesh);
  }
  root.add(cutter);
  root.scale.setScalar(0.001); // mm -> m
  return { root, cutter };
}

// Back half of a cylinder (the half behind the cut plane), axis along x or y.
function halfTube(r, len, axis, mat) {
  const g = new THREE.CylinderGeometry(r, r, len, 64, 1, true, Math.PI / 2, Math.PI);
  if (axis === "x") g.rotateZ(-Math.PI / 2);
  return new THREE.Mesh(g, mat);
}

export async function buildUnderground({ renderer, isMobile, base = "/" }) {
  const group = new THREE.Group();
  const pickables = [];
  const blink = [];
  const envMap = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;

  // ---------- strata: the cut face, darkening with depth and feathering into black at the sides ----------
  const SW = SLAB_W, SH = 160;
  const cliff = pbrRepeat("cliff_side", SW / 9, SH / 9, base);
  const strata = new THREE.MeshStandardMaterial({ ...cliff, normalScale: new THREE.Vector2(1.3, 1.3), color: 0xffffff, roughness: 1, envMapIntensity: 0.1 });
  strata.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace("#include <common>", "#include <common>\nvarying vec3 vSW;")
      .replace("#include <project_vertex>", "#include <project_vertex>\nvSW = (modelMatrix * vec4(transformed, 1.0)).xyz;");
    sh.fragmentShader = sh.fragmentShader.replace("#include <common>", "#include <common>\nvarying vec3 vSW;")
      .replace("#include <map_fragment>", `
        // Three scales of the same rock (one rotated), so no repeat is visible.
        vec2 p = vSW.xy;
        vec3 a = texture2D(map, p * 0.13).rgb;
        vec3 b = texture2D(map, mat2(0.8, -0.6, 0.6, 0.8) * p * 0.047 + vec2(0.37, 0.61)).rgb;
        vec3 c = texture2D(map, p * 0.017 + vec2(0.71, 0.13)).rgb;
        vec3 rock = vec3(dot(a * 0.45 + b * 0.35 + c * 0.2, vec3(0.3, 0.55, 0.15)));
        // Geological layers of uneven thickness that undulate gently along x.
        float y = vSW.y + sin(vSW.x * 0.031) * 0.9 + sin(vSW.x * 0.011 + 1.7) * 1.4;
        float l = fract(y / 6.5 + sin(floor(y / 6.5) * 12.9) * 0.3);
        vec3 clay = vec3(0.64, 0.45, 0.31), sand = vec3(0.66, 0.59, 0.49), shale = vec3(0.44, 0.40, 0.37);
        vec3 tint = mix(mix(clay, sand, smoothstep(0.2, 0.45, l)), shale, smoothstep(0.65, 0.9, l));
        diffuseColor.rgb = rock * tint * 1.45;
        // Topsoil just under the lawn.
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.16, 0.11, 0.07), 1.0 - smoothstep(-0.3, -2.6, vSW.y));
        float depth = smoothstep(-8.0, -75.0, vSW.y);
        float side = smoothstep(${(SW / 2).toFixed(1)}, ${(SW / 2 - 40).toFixed(1)}, abs(vSW.x));
        float bottom = smoothstep(${(-SH).toFixed(1)}, ${(-SH + 50).toFixed(1)}, vSW.y);
        diffuseColor.rgb *= mix(1.0, 0.3, depth) * side * bottom;`);
  };
  const wall = new THREE.Mesh(new THREE.PlaneGeometry(SW, SH, 1, 1), strata);
  wall.position.set(0, -SH / 2, CUT_Z);
  wall.castShadow = wall.receiveShadow = true;
  group.add(wall);

  const lining = new THREE.MeshStandardMaterial({ ...pbrRepeat("brushed_concrete_2", 6, 1, base), color: 0xd8d4cc, roughness: 1, side: THREE.DoubleSide, envMapIntensity: 0.25 });
  const cutFace = new THREE.MeshStandardMaterial({ color: 0x9c968c, roughness: 0.95 });

  // ---------- shaft from the lawn down to the tunnel ----------
  const SR = 3.2, sx = TUNNEL.x0 - 1.5, sTop = 0, sBot = TUNNEL.y - TUNNEL.r;
  const shaft = halfTube(SR, sTop - sBot, "y", lining.clone());
  shaft.material.map = shaft.material.map.clone(); shaft.material.map.repeat.set(3, 4);
  shaft.position.set(sx, (sTop + sBot) / 2, CUT_Z + SR + 0.15);
  shaft.receiveShadow = true;
  group.add(shaft);
  for (const s of [-1, 1]) {
    const rim = new THREE.Mesh(new THREE.BoxGeometry(0.3, sTop - sBot, 0.06), cutFace);
    rim.position.set(sx + s * (SR + 0.15), (sTop + sBot) / 2, CUT_Z + SR + 0.15);
    group.add(rim);
  }
  const steel = new THREE.MeshStandardMaterial({ color: 0x8e9298, metalness: 0.8, roughness: 0.4 });
  for (const s of [-0.25, 0.25]) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(0.05, sTop - sBot, 0.05), steel);
    rail.position.set(sx + s, (sTop + sBot) / 2, CUT_Z + 0.6);
    group.add(rail);
  }
  const rungs = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.02, 0.02, 0.5, 6), steel, Math.floor((sTop - sBot) / 0.3));
  const m = new THREE.Matrix4(), q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, Math.PI / 2)), one = new THREE.Vector3(1, 1, 1);
  for (let i = 0; i < rungs.count; i++) rungs.setMatrixAt(i, m.compose(new THREE.Vector3(sx, sBot + 0.3 + i * 0.3, CUT_Z + 0.6), q, one));
  group.add(rungs);

  // ---------- the Loop tunnel, cut open lengthwise ----------
  const L = TUNNEL.x1 - TUNNEL.x0, tz = CUT_Z + TUNNEL.r + 0.12, tx = (TUNNEL.x0 + TUNNEL.x1) / 2;
  const tubeMat = lining.clone();
  tubeMat.map = lining.map.clone(); tubeMat.map.repeat.set(L / 3, 2);
  const tube = halfTube(TUNNEL.r, L, "x", tubeMat);
  tube.position.set(tx, TUNNEL.y, tz);
  tube.receiveShadow = true;
  group.add(tube);
  for (const s of [-1, 1]) {
    const rim = new THREE.Mesh(new THREE.BoxGeometry(L, 0.3, 0.06), cutFace);
    rim.position.set(tx, TUNNEL.y + s * (TUNNEL.r + 0.15), tz);
    group.add(rim);
  }
  // Segment joints every 1.5 m (half rings).
  const jg = new THREE.TorusGeometry(TUNNEL.r - 0.01, 0.014, 6, 48, Math.PI);
  jg.rotateY(Math.PI / 2); jg.rotateX(-Math.PI / 2);
  const joints = new THREE.InstancedMesh(jg, new THREE.MeshStandardMaterial({ color: 0x3a3936, roughness: 1 }), Math.floor(L / 1.5));
  for (let i = 0; i < joints.count; i++) { m.makeTranslation(TUNNEL.x0 + 0.75 + i * 1.5, TUNNEL.y, tz); joints.setMatrixAt(i, m); }
  group.add(joints);
  const roadMaps = pbrRepeat("asphalt_02", L / 2.7, 0.5, base);
  const road = new THREE.Mesh(new THREE.BoxGeometry(L, 0.3, 1.35), new THREE.MeshStandardMaterial({ ...roadMaps, color: 0x8a8a8e, roughness: 1 }));
  road.position.set(tx, TUNNEL.y - 1.32, tz - 0.675);
  road.receiveShadow = true;
  group.add(road);
  const strip = new THREE.Mesh(new THREE.BoxGeometry(L, 0.05, 0.08), new THREE.MeshStandardMaterial({ color: 0xfff1dd, emissive: 0xffd8a8, emissiveIntensity: 3 }));
  strip.position.set(tx, TUNNEL.y + 1.32, tz - 1.25);
  group.add(strip);

  const housing = new THREE.MeshStandardMaterial({ color: 0xe8e8e6, roughness: 0.5, metalness: 0.2 });
  const lensMat = new THREE.MeshStandardMaterial({ color: 0x050608, metalness: 0.9, roughness: 0.08 });
  const ledOn = new THREE.MeshStandardMaterial({ color: 0x113322, emissive: 0x3dff8a, emissiveIntensity: 3 });
  for (let x = TUNNEL.x0 + 4; x < TUNNEL.x1 - 2; x += 8) {
    const cam = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.11, 0.13), housing);
    const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.02, 16), lensMat);
    lens.rotation.z = Math.PI / 2; lens.position.x = 0.14;
    const led = new THREE.Mesh(new THREE.SphereGeometry(0.009, 6, 6), ledOn.clone());
    led.position.set(0.13, 0.035, 0.045);
    blink.push(led.material);
    cam.add(body, lens, led);
    cam.position.set(x, TUNNEL.y + 0.85, tz - 1.55);
    cam.rotation.set(0, -0.35, -0.12);
    group.add(cam);
  }
  const panelTex = ledPanel();
  let focusCab = null;
  for (let x = TUNNEL.x0 + 9; x < TUNNEL.x1 - 4; x += 18) {
    const cab = new THREE.Group();
    const box = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.9, 0.3), new THREE.MeshStandardMaterial({ color: 0x9a9da2, metalness: 0.7, roughness: 0.38 }));
    const face = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.25), new THREE.MeshStandardMaterial({ map: panelTex, emissive: 0xffffff, emissiveMap: panelTex, emissiveIntensity: 1.6 }));
    face.position.set(0, 0.18, 0.151);
    cab.add(box, face);
    cab.position.set(x, TUNNEL.y - 0.5, tz - 1.45);
    group.add(cab);
    if (!focusCab || Math.abs(x) < Math.abs(focusCab.position.x)) focusCab = cab;
  }
  pickables.push({ id: "tunnel", object: tube, tagAnchor: focusCab, focus: { pos: new THREE.Vector3(focusCab.position.x + 1.5, TUNNEL.y + 0.2, tz + 5), target: focusCab.position.clone() } });
  for (let x = TUNNEL.x0 + 6; x < TUNNEL.x1; x += 12) {
    const l = new THREE.PointLight(0xffd2a0, 14, 10, 2);
    l.position.set(x, TUNNEL.y + 0.8, tz - 0.5);
    group.add(l);
  }

  // ---------- the DN600 boring its own tunnel deeper down ----------
  const BL = BORE.x1 - BORE.x0, bz = CUT_Z + BORE.r + 0.06;
  const bore = halfTube(BORE.r + 0.02, BL, "x", new THREE.MeshStandardMaterial({ color: 0x2a221c, roughness: 1, side: THREE.DoubleSide }));
  bore.position.set((BORE.x0 + BORE.x1) / 2, BORE.y, bz);
  group.add(bore);
  // The machine: model x spans -0.13 m (cutterhead) to +1.15 m (tail). Turned so the cutterhead
  // faces +x (the direction of drive) and a little toward the viewer.
  const { root: dn, cutter } = await loadDN600(base);
  dn.rotation.y = Math.PI - 0.45;
  const tbm = new THREE.Group();
  tbm.add(dn);
  tbm.position.set(BORE.x1 - 0.13, BORE.y, bz + 0.12);
  group.add(tbm);
  // Concrete jacking pipes pushed in behind it, ending at the machine's tail.
  const tail = tbm.position.x - 1.15 * Math.cos(0.45);
  const pipeMat = new THREE.MeshStandardMaterial({ color: 0x6f6a62, roughness: 0.9 });
  for (let x = tail; x > BORE.x0 + 1; x -= 2.05) {
    const pipe = new THREE.Mesh(new THREE.CylinderGeometry(BORE.r - 0.05, BORE.r - 0.05, 2.0, 32), pipeMat);
    pipe.rotation.z = Math.PI / 2;
    pipe.position.set(x - 1.0, BORE.y, bz);
    pipe.castShadow = pipe.receiveShadow = true;
    group.add(pipe);
  }
  const work = new THREE.SpotLight(0xffb25a, 70, 14, 0.5, 0.7, 1.6);
  work.position.set(BORE.x1 - 2.5, BORE.y + 3.2, CUT_Z + 4.5);
  work.target = tbm;
  work.castShadow = !isMobile;
  const fill = new THREE.PointLight(0xffc488, 4, 6, 2);
  fill.position.set(BORE.x1 + 0.8, BORE.y + 0.5, CUT_Z + 2.2);
  group.add(work, fill);
  // Caged work lamps along the deep level, each throwing a pool of sodium light on the rock.
  const lampMat = new THREE.MeshStandardMaterial({ color: 0x332211, emissive: 0xffb25a, emissiveIntensity: 4 });
  for (const x of [-14, -3, 6]) {
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.06, 12, 8), lampMat);
    bulb.position.set(x, BORE.y + 1.6, CUT_Z + 0.25);
    const l = new THREE.PointLight(0xffb25a, 7, 9, 2);
    l.position.copy(bulb.position).add(new THREE.Vector3(0, 0, 0.3));
    group.add(bulb, l);
  }
  pickables.push({ id: "dn600", object: tbm, focus: { pos: new THREE.Vector3(BORE.x1 + 0.8, BORE.y + 0.4, CUT_Z + 4.2), target: tbm.position.clone() } });

  // ---------- Polytopia-Zero fossil in the rock face ----------
  const { map: fMap, normalMap: fNorm } = fossilMaps(9);
  for (const t of [fMap, fNorm]) { t.repeat.set(0.5, 0.5); t.offset.set(0.5, 0.5); }
  const slabMat = new THREE.MeshStandardMaterial({ map: fMap, normalMap: fNorm, normalScale: new THREE.Vector2(2.2, 2.2), color: 0x8a7f73, roughness: 0.95 });
  const edgeRock = new THREE.MeshStandardMaterial({ map: cliff.map, normalMap: cliff.normalMap, color: 0x948c84, roughness: 0.95 });
  const outline = new THREE.Shape();
  for (let i = 0; i <= 48; i++) {
    const a = (i / 48) * Math.PI * 2;
    const r = 0.98 + Math.sin(a * 5 + 1.3) * 0.04 + Math.sin(a * 13) * 0.02;
    const sq = Math.max(Math.abs(Math.cos(a)), Math.abs(Math.sin(a)));
    const x = (Math.cos(a) * r) / sq * 0.92, y = (Math.sin(a) * r) / sq * 0.92;
    i === 0 ? outline.moveTo(x, y) : outline.lineTo(x, y);
  }
  const slabGeo = new THREE.ExtrudeGeometry(outline, { depth: 0.2, bevelEnabled: true, bevelThickness: 0.04, bevelSize: 0.05, bevelSegments: 2 });
  slabGeo.translate(0, 0, -0.2);
  const slab = new THREE.Mesh(slabGeo, [slabMat, edgeRock]);
  slab.scale.setScalar(1.2);
  slab.position.copy(FOSSIL);
  slab.castShadow = slab.receiveShadow = true;
  const slabLight = new THREE.SpotLight(0xffdcae, 40, 8, 0.5, 0.75, 1.8);
  slabLight.position.set(FOSSIL.x + 1.5, FOSSIL.y + 2.4, CUT_Z + 3);
  slabLight.target = slab;
  group.add(slab, slabLight);
  pickables.push({ id: "polytopia", object: slab, focus: { pos: new THREE.Vector3(FOSSIL.x + 0.4, FOSSIL.y, CUT_Z + 3.6), target: FOSSIL.clone() } });

  return {
    group, pickables, envMap,
    update(t) {
      cutter.rotation.x = t * 0.0006;
      blink.forEach((mat, i) => { mat.emissiveIntensity = Math.sin(t * 0.004 + i * 1.7) > 0.6 ? 0.4 : 3; });
    },
  };
}
