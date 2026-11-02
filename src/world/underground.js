// Below the plaza, as a cross-section: a deep face of rock strata behind the cut, The Boring Company's
// Loop tunnel finished and cut open lengthwise with Teslas driving through, and far below it the
// UATXcavators DN600 boring its own tunnel, creeping across with the scroll until it reaches the
// centre for the closing shot. Units are metres; the plaza is y = 0, the cut face is z = CUT_Z.
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { glowMap } from "../textures.js";
import { pbrRepeat } from "../pbr.js";
import { CUT_Z, SLAB_W } from "./surface.js";

export const TUNNEL = { y: -14, r: 1.83, x0: -80, x1: 80 };
export const BORE = { y: -100, r: 0.36, x0: -90, end: 0 };     // the DN600's cutterhead reaches x = end
export const DEPTH = 175;                                     // height of the strata face

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

async function loadDN600(base, fetchAs) {
  const [meta, buf] = await Promise.all([fetchAs(`${base}assets/dn600q.json`, "json"), fetchAs(`${base}assets/dn600q.bin`, "arrayBuffer")]);
  const root = new THREE.Group(), cutter = new THREE.Group();
  for (const mm of meta.meshes) {
    // Positions are uint16 within each mesh's bounding box (see tools/optimize_assets.py).
    const q = new Uint16Array(buf, mm.v[0], mm.v[1] * 3), pos = new Float32Array(q.length);
    const lo = mm.lo, span = [0, 1, 2].map((k) => (mm.hi[k] - mm.lo[k]) / 65535);
    for (let i = 0; i < q.length; i++) pos[i] = lo[i % 3] + q[i] * span[i % 3];
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    g.setIndex(new THREE.BufferAttribute(mm.i32 ? new Uint32Array(buf, mm.i[0], mm.i[1]) : new Uint16Array(buf, mm.i[0], mm.i[1]), 1));
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

// A generic modern EV, low-poly: painted body to the beltline, a dark all-glass greenhouse, light
// bars front and back. Nose toward +x, 4.75 m long, wheels on y = 0.
function carGeometries() {
  const profile = (pts) => { const s = new THREE.Shape(); pts.forEach(([x, y], i) => (i ? s.lineTo(x, y) : s.moveTo(x, y))); return s; };
  const extrude = (pts, w, bevel) => new THREE.ExtrudeGeometry(profile(pts), { depth: w, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 2, curveSegments: 1 })
    .translate(-2.375, 0, -w / 2).rotateY(Math.PI);
  const body = extrude([[0, 0.32], [0, 0.72], [0.35, 0.86], [1.6, 1.02], [4.3, 1.06], [4.72, 0.95], [4.75, 0.42], [4.55, 0.3], [0.2, 0.3]], 1.66, 0.12);
  const glass = extrude([[1.55, 0.98], [2.45, 1.56], [3.55, 1.58], [4.42, 1.04]], 1.5, 0.07);
  const wheel = new THREE.CylinderGeometry(0.36, 0.36, 0.26, 16).rotateX(Math.PI / 2);
  const wheels = mergeGeometries([[-1.52, 0.82], [-1.52, -0.82], [1.48, 0.82], [1.48, -0.82]].map(([x, z]) => wheel.clone().translate(x, 0.36, z)));
  const head = new THREE.BoxGeometry(0.04, 0.05, 1.5).translate(2.38, 0.74, 0);
  const tail = new THREE.BoxGeometry(0.04, 0.06, 1.7).translate(-2.39, 0.86, 0);
  return { body, glass, wheels, head, tail };
}

export async function buildUnderground({ renderer, isMobile, base = "/", fetchAs }) {
  const group = new THREE.Group();
  const pickables = [];
  const blink = [];
  const envMap = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;

  // ---------- strata: the cut face, in bands that change with depth ----------
  const SW = SLAB_W, SH = DEPTH;
  const cliff = pbrRepeat("cliff_side", SW / 9, SH / 9, base);
  const strata = new THREE.MeshStandardMaterial({ ...cliff, normalScale: new THREE.Vector2(1.4, 1.4), color: 0xffffff, roughness: 1, envMapIntensity: 0.1 });
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
        float rock = dot(a * 0.45 + b * 0.35 + c * 0.2, vec3(0.3, 0.55, 0.15));
        // Formations by depth, each with its own colour and thin internal bedding; the contacts
        // between them undulate gently along x.
        float y = vSW.y + sin(vSW.x * 0.031) * 1.2 + sin(vSW.x * 0.011 + 1.7) * 2.0;
        vec3 col = vec3(0.17, 0.11, 0.07);                                                 // topsoil
        col = mix(col, vec3(0.66, 0.38, 0.24), smoothstep(-2.0, -3.5, y));                 // red clay
        col = mix(col, vec3(0.86, 0.8, 0.66), smoothstep(-9.0, -10.5, y));                 // pale limestone
        col = mix(col, vec3(0.42, 0.45, 0.5), smoothstep(-30.0, -32.0, y));                // blue-grey shale
        col = mix(col, vec3(0.78, 0.62, 0.42), smoothstep(-48.0, -50.0, y));               // sandstone
        col = mix(col, vec3(0.62, 0.55, 0.47), smoothstep(-66.0, -68.0, y));               // marl
        col = mix(col, vec3(0.5, 0.43, 0.39), smoothstep(-80.0, -82.0, y));                // dolomite
        col = mix(col, vec3(0.58, 0.48, 0.46), smoothstep(-118.0, -121.0, y));             // granite
        float bed = fract(y / (2.2 + 1.3 * sin(floor(y / 9.0) * 3.1)));
        col *= 0.88 + 0.12 * smoothstep(0.0, 0.08, bed) * smoothstep(1.0, 0.9, bed);
        diffuseColor.rgb = vec3(rock) * col * 1.65;
        float side = smoothstep(${(SW / 2).toFixed(1)}, ${(SW / 2 - 40).toFixed(1)}, abs(vSW.x));
        float bottom = smoothstep(${(-SH).toFixed(1)}, ${(-SH + 30).toFixed(1)}, vSW.y);
        diffuseColor.rgb *= side * bottom;`);
  };
  const wall = new THREE.Mesh(new THREE.PlaneGeometry(SW, SH, 1, 1), strata);
  wall.position.set(0, -SH / 2, CUT_Z);
  wall.receiveShadow = true;
  group.add(wall);

  const lining = new THREE.MeshStandardMaterial({ ...pbrRepeat("brushed_concrete_2", 6, 1, base), color: 0xc9cdd2, roughness: 0.9, side: THREE.DoubleSide, envMapIntensity: 0.25 });
  const cutFace = new THREE.MeshStandardMaterial({ color: 0x9c968c, roughness: 0.95 });

  // ---------- the Loop tunnel, finished, cut open lengthwise ----------
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
  const joints = new THREE.InstancedMesh(jg, new THREE.MeshStandardMaterial({ color: 0x55534f, roughness: 1 }), Math.floor(L / 1.5));
  const m = new THREE.Matrix4();
  for (let i = 0; i < joints.count; i++) { m.makeTranslation(TUNNEL.x0 + 0.75 + i * 1.5, TUNNEL.y, tz); joints.setMatrixAt(i, m); }
  group.add(joints);
  // A full-width roadway: in the cutaway it shows as a slab across the tunnel.
  const ROAD_Y = TUNNEL.y - 1.32;
  const roadMaps = pbrRepeat("asphalt_02", L / 2.7, 1, base);
  const road = new THREE.Mesh(new THREE.BoxGeometry(L, 0.3, 2.9), new THREE.MeshStandardMaterial({ ...roadMaps, color: 0x8a8a8e, roughness: 1 }));
  road.position.set(tx, ROAD_Y - 0.15, tz);
  road.receiveShadow = true;
  group.add(road);
  // Cool-white LED strips along the crown and a slow chase of colour along the wall, as in the Loop.
  const strip = new THREE.Mesh(new THREE.BoxGeometry(L, 0.05, 0.1), new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xe8f0ff, emissiveIntensity: 2.2 }));
  strip.position.set(tx, TUNNEL.y + 1.55, tz - 0.95);
  group.add(strip);
  const chaseMat = new THREE.ShaderMaterial({
    uniforms: { t: { value: 0 } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: "varying vec3 vP; void main() { vP = (modelMatrix * vec4(position, 1.0)).xyz; gl_Position = projectionMatrix * viewMatrix * vec4(vP, 1.0); }",
    fragmentShader: `uniform float t; varying vec3 vP;
      void main() {
        float h = fract(vP.x * 0.012 - t * 0.05);
        vec3 c = 0.55 + 0.45 * cos(6.2832 * (h + vec3(0.0, 0.33, 0.67)));
        gl_FragColor = vec4(c * 0.55, 1.0);
      }`,
  });
  const chase = new THREE.Mesh(new THREE.BoxGeometry(L, 0.04, 0.04), chaseMat);
  chase.position.set(tx, TUNNEL.y - 0.7, tz - 1.7);
  group.add(chase);

  // Cameras and network switch cabinets along the wall: what the integration testing covered.
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
    cam.position.set(x, TUNNEL.y + 1.1, tz - 1.4);
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
    cab.position.set(x, ROAD_Y + 0.75, tz - 1.62);
    group.add(cab);
    if (!focusCab || Math.abs(x) < Math.abs(focusCab.position.x)) focusCab = cab;
  }
  pickables.push({ id: "tunnel", object: tube, tagAnchor: focusCab, focus: { pos: new THREE.Vector3(focusCab.position.x + 2.5, TUNNEL.y + 0.4, tz + 6.5), target: focusCab.position.clone().setY(TUNNEL.y) } });

  // Teslas, spaced along the tunnel, driving through at city speed.
  const car = carGeometries();
  const paints = [0xf2f2f0, 0x111214, 0xa3171c, 0x24427a, 0x8c9096, 0xf2f2f0];
  const glassMat = new THREE.MeshStandardMaterial({ color: 0x0b0d10, metalness: 0.6, roughness: 0.12, envMapIntensity: 1.2 });
  const tyre = new THREE.MeshStandardMaterial({ color: 0x151515, roughness: 0.8 });
  const headMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 3 });
  const tailMat = new THREE.MeshStandardMaterial({ color: 0x400000, emissive: 0xff2a1a, emissiveIntensity: 2.5 });
  const cars = paints.map((paint, i) => {
    const c = new THREE.Group();
    c.add(new THREE.Mesh(car.body, new THREE.MeshStandardMaterial({ color: paint, metalness: 0.5, roughness: 0.32, envMapIntensity: 1.1 })),
      new THREE.Mesh(car.glass, glassMat), new THREE.Mesh(car.wheels, tyre), new THREE.Mesh(car.head, headMat), new THREE.Mesh(car.tail, tailMat));
    c.traverse((o) => { if (o.isMesh) o.castShadow = o.receiveShadow = true; });
    c.position.set(TUNNEL.x0 + (i / paints.length) * L, ROAD_Y, tz);
    group.add(c);
    return c;
  });
  // Light: two wide lights for the whole tunnel (every extra light costs every pixel on screen).
  for (const x of [-20, 20]) {
    const l = new THREE.PointLight(0xe6eeff, 40, 40, 1.4);
    l.position.set(x, TUNNEL.y + 1.0, tz + 1.2);
    group.add(l);
  }
  // Pools of light: additive decals on the rock face stand in for lamps (no per-pixel lighting cost).
  const poolTex = glowMap("rgba(255,178,90,1)");
  const pool = (x, y, w, h, o, color = 0xffb25a) => {
    const d = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: poolTex, color, transparent: true, opacity: o, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
    d.position.set(x, y, CUT_Z + 0.04);
    group.add(d);
    return d;
  };
  for (let x = TUNNEL.x0 + 3; x < TUNNEL.x1; x += 7) { pool(x, TUNNEL.y + 2.7, 9, 3.4, 0.12, 0xdfe8ff); pool(x, TUNNEL.y - 2.5, 9, 3.0, 0.08, 0xdfe8ff); }

  // ---------- shaft from the lawn down to the tunnel ----------
  const SR = 3.2, sx = -38, sTop = 0, sBot = TUNNEL.y - TUNNEL.r;
  const shaft = halfTube(SR, sTop - sBot, "y", lining.clone());
  shaft.material.map = shaft.material.map.clone(); shaft.material.map.repeat.set(3, 4);
  shaft.position.set(sx, (sTop + sBot) / 2, CUT_Z + SR + 0.15);
  group.add(shaft);
  for (const s of [-1, 1]) {
    const rim = new THREE.Mesh(new THREE.BoxGeometry(0.3, sTop - sBot, 0.06), cutFace);
    rim.position.set(sx + s * (SR + 0.15), (sTop + sBot) / 2, CUT_Z + SR + 0.15);
    group.add(rim);
  }

  // ---------- survey marks: depth every 10 m on the left, formation names on the right ----------
  // Painted on the face like an engineering section, so the drop reads as the distance it is.
  const label = (text, w, h, px, font, color, align) => {
    const c = document.createElement("canvas");
    c.width = w; c.height = h;
    const g = c.getContext("2d");
    g.font = `${px}px ${font}`; g.fillStyle = color; g.textBaseline = "middle"; g.textAlign = align;
    g.fillText(text, align === "left" ? 4 : w - 4, h / 2);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8;
    return new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, toneMapped: false, fog: false });
  };
  const mono = '"JetBrains Mono", ui-monospace, monospace', serif = '"Instrument Serif", Georgia, serif';
  const tick = new THREE.MeshBasicMaterial({ color: 0xf2efe8, transparent: true, opacity: 0.55, toneMapped: false, fog: false });
  for (let d = 20; d <= 100; d += 10) {
    const y = -d;
    const line = new THREE.Mesh(new THREE.PlaneGeometry(d % 50 ? 1.2 : 2.4, 0.05), tick);
    line.position.set(-15, y, CUT_Z + 0.06);
    const txt = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 0.8), label(`−${d} m`, 256, 64, 40, mono, "rgba(242,239,232,0.8)", "left"));
    txt.position.set(-15 + 2.0, y, CUT_Z + 0.06);
    group.add(line, txt);
  }
  for (const [name, y] of [["Red clay", -2.75], ["Limestone", -9.75], ["Shale", -31], ["Sandstone", -49], ["Marl", -67], ["Dolomite", -81], ["Granite", -119.5]]) {
    const txt = new THREE.Mesh(new THREE.PlaneGeometry(4.8, 1.0), label(name, 384, 80, 56, serif, "rgba(246,236,217,0.85)", "right"));
    txt.position.set(13, y - 0.9, CUT_Z + 0.06);
    const line = new THREE.Mesh(new THREE.PlaneGeometry(5.2, 0.03), tick);
    line.position.set(12.8, y, CUT_Z + 0.06);
    group.add(txt, line);
  }
  // ---------- the DN600, far below, boring toward the centre ----------
  const bz = CUT_Z + BORE.r + 0.06;
  const boreMat = new THREE.MeshStandardMaterial({ color: 0x2a221c, roughness: 1, side: THREE.DoubleSide });
  const bore = halfTube(BORE.r + 0.02, 1, "x", boreMat);   // stretched each frame from the launch side to the machine
  group.add(bore);
  // The machine: model x spans -0.13 m (cutterhead) to +1.15 m (tail). Turned so the cutterhead
  // faces +x (the direction of drive) and a little toward the viewer.
  const { root: dn, cutter } = await loadDN600(base, fetchAs);
  dn.rotation.y = Math.PI - 0.45;
  const tbm = new THREE.Group();
  tbm.add(dn);
  group.add(tbm);
  const TAIL = 1.15 * Math.cos(0.45) + 0.13;
  // Concrete jacking pipes pushed in behind it, ending at the machine's tail.
  const PIPE = 2.05, NP = Math.ceil((BORE.end - BORE.x0) / PIPE) + 2;
  const pipes = new THREE.InstancedMesh(new THREE.CylinderGeometry(BORE.r - 0.05, BORE.r - 0.05, 2.0, 32).rotateZ(Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x77726a, roughness: 0.9 }), NP);
  pipes.castShadow = pipes.receiveShadow = true;
  pipes.frustumCulled = false;
  group.add(pipes);
  // Lamps along the deep level, each throwing a pool of sodium light on the rock, and a work light
  // that rides with the machine.
  const lampMat = new THREE.MeshStandardMaterial({ color: 0x332211, emissive: 0xffb25a, emissiveIntensity: 4 });
  const cage = new THREE.MeshStandardMaterial({ color: 0x2a2a2a, metalness: 0.7, roughness: 0.5 });
  for (let x = BORE.x0 + 6; x < BORE.end + 30; x += 11) {
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.06, 12, 8), lampMat);
    bulb.position.set(x, BORE.y + 1.6, CUT_Z + 0.25);
    const bracket = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.03, 0.25), cage);
    bracket.position.set(x, BORE.y + 1.68, CUT_Z + 0.13);
    group.add(bulb, bracket);
    pool(x, BORE.y + 1.0, 5.5, 4.6, 0.3);
  }
  const work = new THREE.SpotLight(0xffc27a, 45, 16, 0.55, 0.7, 1.5);
  work.target = tbm;
  group.add(work);
  const facePool = pool(0, BORE.y + 0.2, 7, 4.5, 0.28);
  // Spoil thrown off the face while the machine moves.
  const NS = 60;
  const spoil = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.03, 0), new THREE.MeshStandardMaterial({ color: 0x8a6a4a, roughness: 1 }), NS);
  spoil.frustumCulled = false;
  group.add(spoil);
  const bits = Array.from({ length: NS }, () => ({ p: new THREE.Vector3(), v: new THREE.Vector3(), life: 0 }));
  pickables.push({ id: "dn600", object: tbm, dynamic: true, focus: { pos: new THREE.Vector3(BORE.end + 0.6, BORE.y + 0.35, CUT_Z + 3.4), target: new THREE.Vector3(BORE.end - 0.4, BORE.y, bz) } });

  // A lamp that travels with the camera, so whatever part of the face is in view is lit.
  const headlamp = new THREE.PointLight(0xffe2c0, 0, 70, 1.3);
  group.add(headlamp);

  let lastX = BORE.x0, spin = 0;
  const one = new THREE.Vector3(1, 1, 1), q0 = new THREE.Quaternion();
  return {
    group, pickables, envMap,
    // drive: 0..1, how far the DN600 has come (main.js maps the scroll to it).
    update(t, camera, drive = 1) {
      const dt = 1 / 60;
      chaseMat.uniforms.t.value = t * 0.001;
      blink.forEach((mat, i) => { mat.emissiveIntensity = Math.sin(t * 0.004 + i * 1.7) > 0.6 ? 0.4 : 3; });
      // Traffic: one-way, nose to tail, wrapping around the tunnel's length.
      cars.forEach((c, i) => { c.position.x = TUNNEL.x0 + ((((t * 0.011 + (i / cars.length) * L) % L) + L) % L); });
      // The machine: head at x, the bore and pipe string behind it back to the launch side.
      const x = THREE.MathUtils.lerp(BORE.x0 + 30, BORE.end, drive);
      const speed = Math.abs(x - lastX) / dt;
      lastX = x;
      tbm.position.set(x - 0.13, BORE.y, bz + 0.12);
      const tail = x - TAIL;
      bore.position.set((BORE.x0 + x) / 2, BORE.y, bz);
      bore.scale.set(1, x - BORE.x0, 1);
      let n = 0;
      for (let px = tail; px > BORE.x0 && n < NP; px -= PIPE) pipes.setMatrixAt(n++, m.compose(new THREE.Vector3(px - 1.0, BORE.y, bz), q0, one));
      pipes.count = n;
      pipes.instanceMatrix.needsUpdate = true;
      spin += dt * (0.6 + Math.min(speed, 6) * 2.5);
      cutter.rotation.x = spin;
      work.position.set(x - 2.5, BORE.y + 3.2, CUT_Z + 4.5);
      facePool.position.x = x - 0.6;
      // Spoil: a few chips per frame while it's moving, falling under gravity.
      bits.forEach((b, i) => {
        if (b.life <= 0 && speed > 0.05 && Math.random() < 0.25) {
          b.p.set(x + 0.05, BORE.y + (Math.random() - 0.5) * 0.4, bz + 0.2 + Math.random() * 0.3);
          b.v.set(0.4 + Math.random() * 0.8, Math.random() * 0.9, 0.3 + Math.random() * 0.6);
          b.life = 0.6 + Math.random() * 0.5;
        }
        if (b.life > 0) { b.life -= dt; b.v.y -= 9.8 * dt; b.p.addScaledVector(b.v, dt); }
        spoil.setMatrixAt(i, m.compose(b.p, q0, b.life > 0 ? one : new THREE.Vector3(0, 0, 0)));
      });
      spoil.instanceMatrix.needsUpdate = true;
      // The headlamp sits a little above and ahead of the camera, toward the face.
      headlamp.position.set(camera.position.x, camera.position.y + 3, Math.min(camera.position.z - 6, CUT_Z + 22));
      headlamp.intensity = camera.position.y < -1 ? 110 : 0;
    },
  };
}
