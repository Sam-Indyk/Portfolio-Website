// Underground stage: a finished Loop-scale tunnel lined with cameras and switches (The Boring
// Company), opening into a launch shaft where the UATXcavators DN600 sits against the rock face,
// with the Polytopia-Zero "fossil" set into the shaft wall. Units are metres.
import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { fossilMaps } from "../textures.js";
import { pbrRepeat } from "../pbr.js";

export const TUNNEL_R = 1.83;      // 12 ft Loop tunnel
export const TUNNEL_LEN = 132;
// Shaft centre: its near wall (radius 7.5) meets the tunnel mouth.
export const SHAFT = new THREE.Vector3(0, 1.2, -TUNNEL_LEN - 7.3);

function ledPanel(cols, rows) {
  const c = document.createElement("canvas");
  c.width = 128; c.height = 64;
  const g = c.getContext("2d");
  g.fillStyle = "#15171b"; g.fillRect(0, 0, 128, 64);
  for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
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
    // CAD colours identify parts, not finishes: render as a real machine instead.
    // Shell + thrust ring painted; cutterhead and bearing module bare machined steel; seals/elastomers dark.
    const cad = new THREE.Color(mm.color).getHSL({});
    const rubber = cad.l < 0.22;
    const finish = rubber ? { color: 0x1c1d1f, metalness: 0.0, roughness: 0.7 }
      : mm.group === "Shell weldment" || mm.group === "Thrust ring" || mm.group === "Jacking cylinders" ? { color: 0xb8952e, metalness: 0.0, roughness: 0.62 }
      : mm.group === "Cutterhead" ? { color: 0x6d7176, metalness: 0.9, roughness: 0.36 }
      : { color: 0xa8adb3, metalness: 0.92, roughness: 0.3 };
    const mat = new THREE.MeshStandardMaterial({ ...finish, envMapIntensity: 1.0 });
    const mesh = new THREE.Mesh(g, mat);
    mesh.castShadow = mesh.receiveShadow = true;
    (mm.group === "Cutterhead" ? cutter : root).add(mesh);
  }
  root.add(cutter);
  root.scale.setScalar(0.001); // mm -> m
  return { root, cutter };
}

export async function buildUnderground({ renderer, isMobile, base = "/" }) {
  const group = new THREE.Group();
  const pickables = [];
  const blink = [];

  const pmrem = new THREE.PMREMGenerator(renderer);
  const envMap = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

  // ---------- tunnel ----------
  const lining = new THREE.MeshStandardMaterial({ ...pbrRepeat("brushed_concrete_2", 4, TUNNEL_LEN / 3, base), color: 0xd8d4cc, roughness: 1, side: THREE.BackSide, envMapIntensity: 0.25 });
  const tube = new THREE.Mesh(new THREE.CylinderGeometry(TUNNEL_R, TUNNEL_R, TUNNEL_LEN, 64, 1, true), lining);
  tube.rotation.x = Math.PI / 2;
  tube.position.z = -TUNNEL_LEN / 2;
  tube.receiveShadow = true;
  group.add(tube);
  // Segment joints every 1.5 m.
  const joints = new THREE.InstancedMesh(new THREE.TorusGeometry(TUNNEL_R - 0.005, 0.012, 6, 64), new THREE.MeshStandardMaterial({ color: 0x3a3936, roughness: 1 }), Math.floor(TUNNEL_LEN / 1.5));
  const m = new THREE.Matrix4();
  for (let i = 0; i < joints.count; i++) { m.makeTranslation(0, 0, -i * 1.5); joints.setMatrixAt(i, m); }
  group.add(joints);
  // Roadway slab.
  const road = new THREE.Mesh(new THREE.BoxGeometry(2.7, 0.3, TUNNEL_LEN), new THREE.MeshStandardMaterial({ ...pbrRepeat("asphalt_02", 1, TUNNEL_LEN / 2.7, base), color: 0x8a8a8e, roughness: 1, envMapIntensity: 0.35 }));
  road.position.set(0, -1.32, -TUNNEL_LEN / 2);
  road.receiveShadow = true;
  group.add(road);
  // Continuous light strip along the crown, plus a cable tray.
  const strip = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.03, TUNNEL_LEN), new THREE.MeshStandardMaterial({ color: 0xfff1dd, emissive: 0xffd8a8, emissiveIntensity: 3.2 }));
  strip.position.set(0, TUNNEL_R - 0.06, -TUNNEL_LEN / 2);
  const tray = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.05, TUNNEL_LEN), new THREE.MeshStandardMaterial({ color: 0x8d9096, metalness: 0.8, roughness: 0.4 }));
  tray.position.set(-1.3, 1.15, -TUNNEL_LEN / 2); tray.rotation.z = -0.62;
  group.add(strip, tray);

  // Cameras along the wall; switch cabinets every 33 m.
  const housing = new THREE.MeshStandardMaterial({ color: 0xe8e8e6, roughness: 0.5, metalness: 0.2 });
  const lensMat = new THREE.MeshStandardMaterial({ color: 0x050608, metalness: 0.9, roughness: 0.08 });
  const ledOn = new THREE.MeshStandardMaterial({ color: 0x113322, emissive: 0x3dff8a, emissiveIntensity: 3 });
  const panelTex = ledPanel(8, 2);
  function camera(z, side) {
    const g = new THREE.Group();
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.04, 0.18), housing);
    arm.position.z = 0.09;
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.11, 0.26), housing);
    body.position.z = 0.26;
    const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.02, 16), lensMat);
    lens.rotation.x = Math.PI / 2; lens.position.z = 0.4;
    const led = new THREE.Mesh(new THREE.SphereGeometry(0.008, 6, 6), ledOn.clone());
    led.position.set(0.045, 0.03, 0.392);
    blink.push(led.material);
    g.add(arm, body, lens, led);
    const a = side > 0 ? 0.62 : Math.PI - 0.62;
    g.position.set(Math.cos(a) * (TUNNEL_R - 0.02), Math.sin(a) * (TUNNEL_R - 0.02), z);
    g.lookAt(0, 0.2, z - 6 * Math.sign(side) - 4);
    return g;
  }
  function cabinet(z) {
    const g = new THREE.Group();
    const box = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.9, 0.3), new THREE.MeshStandardMaterial({ color: 0x9a9da2, metalness: 0.7, roughness: 0.38 }));
    const face = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.25), new THREE.MeshStandardMaterial({ map: panelTex, emissive: 0xffffff, emissiveMap: panelTex, emissiveIntensity: 1.6 }));
    face.position.set(0, 0.18, 0.151);
    g.add(box, face);
    // Flush against the wall: at y=-0.55 the lining is at x = sqrt(R² - 0.55²).
    g.position.set(Math.sqrt(TUNNEL_R ** 2 - 0.55 ** 2) - 0.17, -0.55, z);
    g.rotation.y = -Math.PI / 2;
    return g;
  }
  let focusCab = null;
  for (let z = -6; z > -TUNNEL_LEN + 4; z -= 11) group.add(camera(z, (Math.round(z / 11) % 2) ? 1 : -1));
  for (let z = -18; z > -TUNNEL_LEN + 4; z -= 33) {
    const c = cabinet(z);
    group.add(c);
    if (!focusCab) focusCab = c;
  }
  pickables.push({ id: "tunnel", stage: "underground", object: focusCab, focus: { pos: new THREE.Vector3(-0.2, 0.15, -15.4), target: focusCab.position.clone().add(new THREE.Vector3(0, 0.1, 0)) } });

  // Lights travel with the camera so the lining is always lit locally.
  const travel = [];
  for (let i = 0; i < 3; i++) {
    const l = new THREE.PointLight(0xffd2a0, 9, 14, 2);
    group.add(l);
    travel.push(l);
  }

  // ---------- reception shaft: a vertical rock-walled cylinder ----------
  const SR = 7.5, SH = 26;               // shaft radius / height
  const cliff = pbrRepeat("cliff_side", 9, 5, base);
  const rock = new THREE.MeshStandardMaterial({ ...cliff, normalScale: new THREE.Vector2(1.8, 1.8), color: 0x948c84, roughness: 1, side: THREE.BackSide, envMapIntensity: 0.08 });
  const rockFace = pbrRepeat("rock_face", 1, 1, base);
  const rMap = rockFace.map, rNorm = rockFace.normalMap;
  const shaftGeo = new THREE.CylinderGeometry(SR, SR, SH, 128, 48, true);
  const pos = shaftGeo.getAttribute("position");
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const a = Math.atan2(v.z, v.x);
    const n = Math.sin(a * 7 + v.y * 0.9) * 0.18 + Math.sin(a * 19 + v.y * 2.3) * 0.07 + Math.sin(v.y * 3.7 + a * 3) * 0.06;
    const k = 1 + n / SR;
    pos.setXYZ(i, v.x * k, v.y, v.z * k);
  }
  shaftGeo.computeVertexNormals();
  const shaft = new THREE.Mesh(shaftGeo, rock);
  shaft.position.set(SHAFT.x, -1.5 + SH / 2, SHAFT.z);
  shaft.receiveShadow = true;
  group.add(shaft);
  const floorMaps = pbrRepeat("rock_face", 9, 9, base);
  const floorMat = new THREE.MeshStandardMaterial({ ...floorMaps, normalScale: new THREE.Vector2(1.5, 1.5), color: 0x7a7068, roughness: 1 });
  const floorS = new THREE.Mesh(new THREE.CircleGeometry(SR + 0.4, 64), floorMat);
  floorS.rotation.x = -Math.PI / 2; floorS.position.set(SHAFT.x, -1.47, SHAFT.z);
  floorS.receiveShadow = true;
  group.add(floorS);

  // Sodium work lights rigged from above, plus a cool fill.
  const work = new THREE.SpotLight(0xffb25a, 300, 40, 0.32, 0.8, 1.6);
  work.position.set(SHAFT.x + 2.5, 9, SHAFT.z + 2);
  work.castShadow = !isMobile;
  work.shadow.mapSize.set(1024, 1024);
  work.shadow.bias = -0.0005;
  const fill = new THREE.PointLight(0xff9c4a, 9, 14, 2);
  fill.position.set(SHAFT.x - 3, 2, SHAFT.z + 3);
  const sky = new THREE.PointLight(0x9fb4d6, 6, 30, 1.5);
  sky.position.set(SHAFT.x, 18, SHAFT.z);
  group.add(work, work.target, fill, sky);

  // DN600 breaking through the far wall, cutterhead toward the viewer.
  const { root: dn, cutter } = await loadDN600(base);
  dn.rotation.y = Math.PI / 2;             // model -x (cutterhead) -> scene +z
  const tbm = new THREE.Group();
  tbm.add(dn);
  const wallZ = SHAFT.z - SR;
  tbm.position.set(SHAFT.x + 0.4, -0.6, wallZ + 0.95);  // front ~1 m out of the rock, rest buried
  group.add(tbm);
  // Breakthrough: dark bore + a ring of broken rock around the shell.
  const bore = new THREE.Mesh(new THREE.CircleGeometry(0.42, 48), new THREE.MeshBasicMaterial({ color: 0x030202 }));
  bore.position.set(tbm.position.x, tbm.position.y, wallZ + 0.25);
  group.add(bore);
  const rubbleGeo = new THREE.IcosahedronGeometry(1, 2);
  {
    const rp = rubbleGeo.getAttribute("position"), w = new THREE.Vector3();
    for (let i = 0; i < rp.count; i++) {
      w.fromBufferAttribute(rp, i);
      w.multiplyScalar(1 + Math.sin(w.x * 4.1 + w.y * 2.3) * 0.18 + Math.sin(w.z * 6.7 - w.x * 3.1) * 0.1);
      rp.setXYZ(i, w.x, w.y * 0.7, w.z);
    }
    rubbleGeo.computeVertexNormals();
  }
  const rubble = new THREE.InstancedMesh(rubbleGeo, new THREE.MeshStandardMaterial({ map: cliff.map, normalMap: cliff.normalMap, color: 0x948c84, roughness: 1 }), 90);
  const q = new THREE.Quaternion(), sc = new THREE.Vector3(), p = new THREE.Vector3(), m2 = new THREE.Matrix4();
  for (let i = 0; i < rubble.count; i++) {
    const a = Math.random() * Math.PI * 2, r = 0.34 + Math.pow(Math.random(), 2) * 0.32;
    const onFloor = i > 60;
    p.set(tbm.position.x + (onFloor ? (Math.random() - 0.5) * 1.8 : Math.cos(a) * r), onFloor ? -1.44 : tbm.position.y + Math.sin(a) * r, wallZ + (onFloor ? 0.3 + Math.random() * 1.2 : 0.12 + Math.random() * 0.14));
    q.setFromEuler(new THREE.Euler(Math.random() * 3, Math.random() * 3, Math.random() * 3));
    sc.setScalar(onFloor ? 0.025 + Math.random() * 0.05 : 0.03 + Math.random() * 0.045);
    rubble.setMatrixAt(i, m2.compose(p, q, sc));
  }
  rubble.castShadow = rubble.receiveShadow = true;
  group.add(rubble);
  work.target.position.copy(tbm.position);
  pickables.push({ id: "dn600", stage: "underground", object: tbm, focus: { pos: new THREE.Vector3(SHAFT.x + 1.9, -0.25, wallZ + 3.4), target: tbm.position.clone().add(new THREE.Vector3(0, 0, 0.5)) } });

  // Polytopia-Zero fossil set into the shaft wall, to the left.
  const { map: fMap, normalMap: fNorm } = fossilMaps(9);
  // Map the shape's -1..1 coordinates onto the texture's 0..1.
  for (const t of [fMap, fNorm]) { t.repeat.set(0.5, 0.5); t.offset.set(0.5, 0.5); }
  const slabMat = new THREE.MeshStandardMaterial({ map: fMap, normalMap: fNorm, normalScale: new THREE.Vector2(2.2, 2.2), color: 0x8a7f73, roughness: 0.95 });
  const edgeRock = new THREE.MeshStandardMaterial({ map: rMap, normalMap: rNorm, color: 0x948c84, roughness: 0.95 });
  // An irregular, board-shaped outline rather than a clean tile.
  const outline = new THREE.Shape();
  for (let i = 0; i <= 48; i++) {
    const a = (i / 48) * Math.PI * 2;
    const r = 0.98 + Math.sin(a * 5 + 1.3) * 0.04 + Math.sin(a * 13) * 0.02;
    const x = Math.cos(a) * r, y = Math.sin(a) * r;
    const sq = Math.max(Math.abs(Math.cos(a)), Math.abs(Math.sin(a)));   // squarish
    i === 0 ? outline.moveTo(x / sq * 0.92, y / sq * 0.92) : outline.lineTo(x / sq * 0.92, y / sq * 0.92);
  }
  const slabGeo = new THREE.ExtrudeGeometry(outline, { depth: 0.24, bevelEnabled: true, bevelThickness: 0.04, bevelSize: 0.05, bevelSegments: 2 });
  slabGeo.translate(0, 0, -0.24);
  const slab = new THREE.Mesh(slabGeo, [slabMat, edgeRock]);
  slab.scale.setScalar(0.95);
  const fa = Math.PI * 0.86;  // angle around the shaft wall
  // Nearly flush with the rock: the wall's own relief half-buries the edges.
  slab.position.set(SHAFT.x + Math.cos(fa) * (SR - 0.03), 0.35, SHAFT.z - Math.sin(fa) * (SR - 0.03));
  slab.lookAt(SHAFT.x, 0.35, SHAFT.z);
  slab.castShadow = slab.receiveShadow = true;
  const slabLight = new THREE.SpotLight(0xffdcae, 60, 9, 0.42, 0.75, 1.8);
  slabLight.position.copy(slab.position).lerp(new THREE.Vector3(SHAFT.x, 3, SHAFT.z), 0.45);
  slabLight.target = slab;
  group.add(slab, slabLight);
  const slabFocus = slab.position.clone().lerp(new THREE.Vector3(SHAFT.x, 0.35, SHAFT.z), 0.5);
  pickables.push({ id: "polytopia", stage: "underground", object: slab, focus: { pos: slabFocus, target: slab.position.clone() } });

  // Dust in the work lights.
  const dustN = isMobile ? 400 : 1200;
  const dp = new Float32Array(dustN * 3);
  for (let i = 0; i < dustN; i++) dp.set([SHAFT.x + (Math.random() - 0.5) * 12, -1.4 + Math.random() * 6, SHAFT.z + (Math.random() - 0.5) * 12], i * 3);
  const dg = new THREE.BufferGeometry();
  dg.setAttribute("position", new THREE.BufferAttribute(dp, 3));
  // Round, soft motes; capped on-screen size so the ones near the lens don't become squares.
  const dust = new THREE.Points(dg, new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: `void main(){ vec4 mv = modelViewMatrix * vec4(position,1.); gl_Position = projectionMatrix * mv; gl_PointSize = clamp(14.0 / -mv.z, 0.5, 3.5); }`,
    fragmentShader: `void main(){ float d = length(gl_PointCoord - 0.5); gl_FragColor = vec4(vec3(1.0,0.78,0.54) * smoothstep(0.5, 0.0, d) * 0.5, 1.0); }`,
  }));
  group.add(dust);

  const fog = new THREE.FogExp2(0x0b0907, 0.035);

  return {
    group, pickables, envMap, fog,
    update(t, camera) {
      cutter.rotation.x = t * 0.0006;
      blink.forEach((mat, i) => { mat.emissiveIntensity = (Math.sin(t * 0.004 + i * 1.7) > 0.6) ? 0.4 : 3; });
      travel.forEach((l, i) => l.position.set(0, 1.2, Math.min(camera.position.z - 2 - i * 7, 0)));
      const p = dust.geometry.getAttribute("position");
      for (let i = 0; i < p.count; i += 7) p.setY(i, -1.4 + ((p.getY(i) + 1.4 + 0.002) % 6));
      p.needsUpdate = true;
    },
  };
}
