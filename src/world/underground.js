// Below the plaza, as a cross-section. The Loop (The Boring Company): a portal ramp east of the plaza
// that the camera follows a car down, a bored curve under the lawn, and the straight tunnel cut open
// along the face, with traffic. Below it, a clearing (reception pit) that the UATXcavators DN600
// breaks into as the scroll drives it across, with the team's control station running the operator
// GUI. Units are metres; the plaza is y = 0, the cut face is z = CUT_Z.
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { glowMap } from "../textures.js";
import { pbrRepeat } from "../pbr.js";
import { SLAB_W } from "./surface.js";
import { CUT_Z, TUNNEL, ROAD_Y, RAMP, ROUTE, LENGTH, S_PORTAL, S_JOIN, S_END } from "./loop.js";

export const BORE = { y: -34.2, r: 0.36, x0: -60, end: -1.0 };   // the DN600's cutterhead stops at x = end
export const CHAMBER = { x0: -2, x1: 14, y0: -35, y1: -28.4, back: 7, front: 1.2 };
const DEPTH = 80;                                                // height of the strata face

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

// A generic modern electric saloon, lofted from a side profile and a rounded cross-section that
// narrows above the beltline to a glass roof. The glasshouse is marked in vertex colour, so any paint
// keeps dark glass. Nose toward +x, 4.7 m long, wheels on y = 0.
function carGeometries() {
  const L = 4.7, NU = 56, NV = 44;
  const lerpTable = (tab, u) => {
    let i = 0;
    while (i < tab.length - 2 && u > tab[i + 1][0]) i++;
    const [u0, a] = tab[i], [u1, b] = tab[i + 1], f = THREE.MathUtils.clamp((u - u0) / (u1 - u0), 0, 1);
    return a + (b - a) * (f * f * (3 - 2 * f));
  };
  // u runs nose (0) to tail (1).
  const ROOF = [[0, 0.56], [0.03, 0.66], [0.1, 0.76], [0.28, 0.9], [0.33, 0.95], [0.48, 1.38], [0.6, 1.42], [0.78, 1.3], [0.92, 1.08], [0.98, 1.0], [1, 0.86]];
  const BELT = [[0, 0.56], [0.28, 0.9], [0.33, 0.93], [0.7, 0.97], [0.92, 1.02], [1, 0.86]];
  const HALF = [[0, 0.68], [0.035, 0.86], [0.1, 0.93], [0.88, 0.93], [0.97, 0.88], [1, 0.78]];
  const BASE = 0.22;
  const pos = [], col = [], idx = [];
  for (let i = 0; i <= NU; i++) {
    const u = i / NU, roof = lerpTable(ROOF, u), belt = Math.min(lerpTable(BELT, u), roof), half = lerpTable(HALF, u);
    for (let j = 0; j < NV; j++) {
      // Around the section: an angle; a squared-off superellipse (flat sides, flat roof), and above
      // the beltline the glasshouse draws in toward the roof.
      const a = (j / NV) * Math.PI * 2, c = Math.cos(a), sn = Math.sin(a);
      const y = BASE + (roof - BASE) * (0.5 + 0.5 * Math.sign(sn) * Math.abs(sn) ** 0.3);
      let w = half * Math.sign(c) * Math.abs(c) ** 0.2;
      if (y > belt) w *= 1 - 0.3 * ((y - belt) / Math.max(0.01, roof - belt)) ** 1.2;   // tumblehome
      pos.push((0.5 - u) * L, y, w);
      const glass = y > belt + 0.03 && u > 0.31 && u < 0.95;
      const trim = y < BASE + 0.14 && (u < 0.07 || u > 0.92);   // black lower bumpers, front and back
      col.push(...(glass ? [0.05, 0.06, 0.07] : trim ? [0.1, 0.1, 0.11] : [1, 1, 1]));
    }
  }
  for (let i = 0; i < NU; i++) for (let j = 0; j < NV; j++) {
    const a = i * NV + j, b = i * NV + ((j + 1) % NV), c = a + NV, d = b + NV;
    idx.push(a, b, c, b, d, c);
  }
  // Close the nose and tail with fans.
  for (const [ring, flip] of [[0, true], [NU, false]]) {
    const center = pos.length / 3;
    let cx = 0, cy = 0;
    for (let j = 0; j < NV; j++) { cx += pos[(ring * NV + j) * 3]; cy += pos[(ring * NV + j) * 3 + 1]; }
    pos.push(cx / NV, cy / NV, 0); col.push(1, 1, 1);
    for (let j = 0; j < NV; j++) {
      const a = ring * NV + j, b = ring * NV + ((j + 1) % NV);
      idx.push(...(flip ? [center, b, a] : [center, a, b]));
    }
  }
  const body = new THREE.BufferGeometry();
  body.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  body.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  body.setIndex(idx);
  body.computeVertexNormals();
  const tyre = new THREE.CylinderGeometry(0.34, 0.34, 0.24, 24).rotateX(Math.PI / 2);
  const cover = new THREE.CylinderGeometry(0.25, 0.25, 0.26, 24).rotateX(Math.PI / 2);
  const at = [[1.52, 0.83], [1.52, -0.83], [-1.4, 0.83], [-1.4, -0.83]];
  return {
    body,
    tyres: mergeGeometries(at.map(([x, z]) => tyre.clone().translate(x, 0.34, z))),
    covers: mergeGeometries(at.map(([x, z]) => cover.clone().translate(x, 0.34, z))),
    head: mergeGeometries([0.52, -0.52].map((z) => new THREE.BoxGeometry(0.08, 0.05, 0.34).translate(2.27, 0.66, z))),
    // A light bar across the tail, deeper at the corners.
    tail: mergeGeometries([new THREE.BoxGeometry(0.06, 0.035, 1.5).translate(-2.33, 0.88, 0), ...[0.62, -0.62].map((z) => new THREE.BoxGeometry(0.06, 0.09, 0.36).translate(-2.31, 0.86, z))]),
  };
}

// The operator interface on the control station's screen, after the team's PyQt GUI: cream panels,
// navy type, gold rules; FAULT button, state, stacklight, subsystem health, the three control groups,
// and a live strip of sensor traces.
function controlScreen() {
  const W = 1024, H = 640;
  const c = document.createElement("canvas");
  c.width = W; c.height = H;
  const g = c.getContext("2d");
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  const navy = "#1a2744", gold = "#b8a060", cream = "#f5f0e5", sans = "Arial, Helvetica, sans-serif";
  const round = (x, y, w, h, r) => { g.beginPath(); g.roundRect(x, y, w, h, r); };
  const group = (x, y, w, h, title) => {
    g.strokeStyle = gold; g.lineWidth = 1.5; round(x, y, w, h, 4); g.stroke();
    g.font = `bold 13px ${sans}`;
    g.fillStyle = cream; g.fillRect(x + 8, y - 8, g.measureText(title).width + 10, 14);
    g.fillStyle = navy; g.fillText(title, x + 13, y + 3);
  };
  const button = (x, y, w, label, on) => {
    g.fillStyle = on ? navy : "#fffdf8"; round(x, y, w, 30, 4); g.fill();
    g.strokeStyle = on ? navy : gold; g.lineWidth = 1; g.stroke();
    g.fillStyle = on ? cream : navy; g.font = `12px ${sans}`; g.textAlign = "center"; g.fillText(label, x + w / 2, y + 19); g.textAlign = "left";
  };
  const traces = [[], [], []];
  function draw(t) {
    g.fillStyle = cream; g.fillRect(0, 0, W, H);
    g.fillStyle = navy; g.fillRect(0, 0, W, 32);
    g.fillStyle = cream; g.font = `14px ${sans}`; g.fillText("UATXcavators GUI – NABC Operator Interface", 14, 21);
    // Header: FAULT, state, power, comms.
    g.fillStyle = "#c62828"; round(16, 44, 150, 54, 6); g.fill();
    g.fillStyle = "#fff"; g.font = `bold 20px ${sans}`; g.fillText("⚠  FAULT", 38, 78);
    g.fillStyle = "#1a8040"; g.font = `bold 11px ${sans}`; g.fillText("READY", 70, 112);
    g.fillStyle = "#f0d870"; round(186, 56, 132, 30, 4); g.fill();
    g.fillStyle = "#4a3000"; g.font = `bold 15px ${sans}`; g.fillText("●  RUNNING", 200, 77);
    g.fillStyle = "#1a8040"; round(334, 56, 120, 30, 4); g.fill();
    g.fillStyle = "#fff"; g.font = `13px ${sans}`; g.fillText("⚡ Power On", 352, 76);
    g.font = `12px ${sans}`;
    [["PLC", 640], ["IO-Link", 730], ["MQTT", 840]].forEach(([n, x]) => {
      g.fillStyle = (Math.floor(t * 2 + x) % 7) ? "#1a8040" : "#7fd59a"; g.fillText("●", x, 76);
      g.fillStyle = navy; g.fillText(n, x + 16, 76);
    });
    // Tabs.
    ["Overview", "Sensors", "Controls", "Telemetry", "Config"].forEach((n, i) => {
      g.fillStyle = i ? "#5a7090" : navy; g.font = `${i ? "" : "bold "}14px ${sans}`; g.fillText(n, 22 + i * 110, 140);
    });
    g.fillStyle = gold; g.fillRect(18, 148, 76, 3); g.fillRect(0, 154, W, 1);
    // Safety indicator: the stacklight, running green.
    group(20, 176, 300, 176, "Safety Indicator");
    [["#1a1a1a", "ALARM"], ["#1a1a1a", "WARN"], ["#00cc44", "RUN"]].forEach(([colr, n], i) => {
      g.fillStyle = colr; g.beginPath(); g.arc(80 + i * 90, 252, 26, 0, Math.PI * 2); g.fill();
      g.fillStyle = "#5a7090"; g.font = `11px ${sans}`; g.textAlign = "center"; g.fillText(n, 80 + i * 90, 306); g.textAlign = "left";
    });
    // Subsystem health.
    group(340, 176, 320, 176, "Subsystem Health");
    ["Sensors", "Vibration", "Actuator", "Digital Inputs"].forEach((n, i) => {
      const x = 358 + (i % 2) * 150, y = 206 + Math.floor(i / 2) * 64;
      g.fillStyle = "#e0f8ec"; round(x, y, 138, 34, 4); g.fill();
      g.fillStyle = "#1a8040"; g.font = `13px ${sans}`; g.fillText(`●  ${n}`, x + 10, y + 22);
    });
    // Controls.
    group(680, 176, 324, 440, "Controls");
    [["Conditioning", ["Cond Stop", "Water Flow", "Conditioner"]], ["Cutterhead", ["CH Stop", "CW", "CCW"]], ["Thrust", ["Stop", "Extend", "Retract"]]].forEach(([n, bs], i) => {
      const y = 210 + i * 130;
      g.fillStyle = navy; g.font = `bold 13px ${sans}`; g.fillText(n, 698, y);
      bs.forEach((b, k) => button(698 + k * 100, y + 14, 92, b, k === 1));
    });
    // Sensors and a live trace strip.
    group(20, 372, 640, 244, "Sensors · Telemetry");
    const vals = [["Ambient Temp", 22.4 + Math.sin(t * 0.3) * 0.2, "°C"], ["Contact Temp", 41.8 + Math.sin(t * 0.7) * 1.4, "°C"],
      ["Pressure", 2.6 + Math.sin(t * 1.3) * 0.25, "bar"], ["Extrusion Distance", 118 + ((t * 0.4) % 40), "mm"]];
    vals.forEach(([n, v, u], i) => {
      g.fillStyle = navy; g.font = `12px ${sans}`; g.fillText(n, 38, 410 + i * 26);
      g.font = `bold 12px ${sans}`; g.fillText(`${v.toFixed(1)} ${u}`, 190, 410 + i * 26);
      g.fillStyle = "#1a8040"; g.fillText("OK", 270, 410 + i * 26);
    });
    const ch = [310, 392, 336, 200];
    g.strokeStyle = "#e3d9c2"; g.lineWidth = 1;
    for (let k = 0; k <= 4; k++) { g.beginPath(); g.moveTo(ch[0], ch[1] + k * 50); g.lineTo(ch[0] + ch[2], ch[1] + k * 50); g.stroke(); }
    traces[0].push(0.5 + Math.sin(t * 1.3) * 0.18 + Math.sin(t * 4.1) * 0.05);
    traces[1].push(0.35 + Math.sin(t * 0.7 + 1) * 0.12 + Math.sin(t * 5.3) * 0.04);
    traces[2].push(0.7 + Math.sin(t * 2.2 + 2) * 0.08 + Math.sin(t * 7.0) * 0.06);
    [["#1a2744", "Pressure"], ["#b8a060", "Contact Temp"], ["#1a8040", "Friction (A-RMS)"]].forEach(([colr, n], k) => {
      const tr = traces[k];
      if (tr.length > 120) tr.shift();
      g.strokeStyle = colr; g.lineWidth = 2; g.beginPath();
      tr.forEach((v, i) => { const x = ch[0] + (i / 119) * ch[2], y = ch[1] + ch[3] - v * ch[3]; i ? g.lineTo(x, y) : g.moveTo(x, y); });
      g.stroke();
      g.fillStyle = colr; g.font = `11px ${sans}`; g.fillText(`— ${n}`, ch[0] + k * 112, ch[1] + ch[3] + 18);
    });
    tex.needsUpdate = true;
  }
  draw(0);
  return { tex, draw };
}

export async function buildUnderground({ renderer, isMobile, base = "/", fetchAs }) {
  const group = new THREE.Group();
  const pickables = [];
  const blink = [];
  const envMap = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
  const m = new THREE.Matrix4(), one = new THREE.Vector3(1, 1, 1), zero = new THREE.Vector3(0, 0, 0), q0 = new THREE.Quaternion();
  const X = new THREE.Vector3(1, 0, 0), UP = new THREE.Vector3(0, 1, 0);

  // ---------- strata: the cut face, in bands that change with depth; open where the clearing is ----------
  const SW = SLAB_W, SH = DEPTH;
  const cliff = pbrRepeat("cliff_side", SW / 9, SH / 9, base);
  const strata = new THREE.MeshStandardMaterial({ ...cliff, normalScale: new THREE.Vector2(1.4, 1.4), color: 0xffffff, roughness: 1, envMapIntensity: 0.1 });
  strata.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace("#include <common>", "#include <common>\nvarying vec3 vSW;")
      .replace("#include <project_vertex>", "#include <project_vertex>\nvSW = (modelMatrix * vec4(transformed, 1.0)).xyz;");
    sh.fragmentShader = sh.fragmentShader.replace("#include <common>", "#include <common>\nvarying vec3 vSW;")
      .replace("#include <map_fragment>", `
        if (vSW.x > ${CHAMBER.x0.toFixed(1)} && vSW.x < ${CHAMBER.x1.toFixed(1)} && vSW.y > ${CHAMBER.y0.toFixed(1)} && vSW.y < ${CHAMBER.y1.toFixed(1)}) discard;
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
        col = mix(col, vec3(0.42, 0.45, 0.5), smoothstep(-24.0, -26.0, y));                // blue-grey shale
        col = mix(col, vec3(0.62, 0.48, 0.36), smoothstep(-44.0, -46.0, y));               // sandstone
        float bed = fract(y / (2.2 + 1.3 * sin(floor(y / 9.0) * 3.1)));
        col *= 0.88 + 0.12 * smoothstep(0.0, 0.08, bed) * smoothstep(1.0, 0.9, bed);
        diffuseColor.rgb = vec3(rock) * col * 1.65;
        float side = smoothstep(${(SW / 2).toFixed(1)}, ${(SW / 2 - 40).toFixed(1)}, abs(vSW.x));
        float bottom = smoothstep(${(-SH).toFixed(1)}, ${(-SH + 25).toFixed(1)}, vSW.y);
        diffuseColor.rgb *= side * bottom;`);
  };
  const wall = new THREE.Mesh(new THREE.PlaneGeometry(SW, SH, 1, 1), strata);
  wall.position.set(0, -SH / 2, CUT_Z);
  wall.receiveShadow = true;
  group.add(wall);

  const lining = new THREE.MeshStandardMaterial({ ...pbrRepeat("brushed_concrete_2", 6, 1, base), color: 0xc9cdd2, roughness: 0.9, side: THREE.DoubleSide, envMapIntensity: 0.25 });
  const relined = (rx, ry) => { const mt = lining.clone(); mt.map = lining.map.clone(); mt.map.repeat.set(rx, ry); return mt; };
  const cutFace = new THREE.MeshStandardMaterial({ color: 0x9c968c, roughness: 0.95 });
  const steel = new THREE.MeshStandardMaterial({ color: 0x8e9298, metalness: 0.8, roughness: 0.4 });

  // ---------- the Loop: the straight tunnel, cut open lengthwise ----------
  const L = TUNNEL.x1 - TUNNEL.x0, tz = TUNNEL.z, tx = (TUNNEL.x0 + TUNNEL.x1) / 2;
  const tube = halfTube(TUNNEL.r, L, "x", relined(L / 3, 2));
  tube.position.set(tx, TUNNEL.y, tz);
  tube.receiveShadow = true;
  group.add(tube);
  for (const sg of [-1, 1]) {
    const rim = new THREE.Mesh(new THREE.BoxGeometry(L, 0.3, 0.06), cutFace);
    rim.position.set(tx, TUNNEL.y + sg * (TUNNEL.r + 0.15), tz);
    group.add(rim);
  }
  // Segment joints every 1.5 m (half rings).
  const jg = new THREE.TorusGeometry(TUNNEL.r - 0.01, 0.014, 6, 48, Math.PI);
  jg.rotateY(Math.PI / 2); jg.rotateX(-Math.PI / 2);
  const joints = new THREE.InstancedMesh(jg, new THREE.MeshStandardMaterial({ color: 0x55534f, roughness: 1 }), Math.floor(L / 1.5));
  for (let i = 0; i < joints.count; i++) joints.setMatrixAt(i, m.makeTranslation(TUNNEL.x0 + 0.75 + i * 1.5, TUNNEL.y, tz));
  group.add(joints);
  // A full-width roadway: in the cutaway it shows as a slab across the tunnel.
  const road = new THREE.Mesh(new THREE.BoxGeometry(L, 0.3, 2.9), new THREE.MeshStandardMaterial({ ...pbrRepeat("asphalt_02", L / 2.7, 1, base), color: 0x8a8a8e, roughness: 1 }));
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
    if (!focusCab || Math.abs(x + 8) < Math.abs(focusCab.position.x + 8)) focusCab = cab;
  }
  pickables.push({ id: "tunnel", object: tube, tagAnchor: focusCab, focus: { pos: new THREE.Vector3(focusCab.position.x + 2.5, TUNNEL.y + 0.4, tz + 6.5), target: focusCab.position.clone().setY(TUNNEL.y) } });
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

  // ---------- survey marks: depth every 10 m on the left, formation names on the right ----------
  // Painted on the face like an engineering section.
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
  for (const d of [10, 20, 30, 40]) {
    const line = new THREE.Mesh(new THREE.PlaneGeometry(d % 20 ? 1.2 : 2.4, 0.05), tick);
    line.position.set(-15, -d, CUT_Z + 0.06);
    const txt = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 0.8), label(`−${d} m`, 256, 64, 40, mono, "rgba(242,239,232,0.8)", "left"));
    txt.position.set(-13, -d, CUT_Z + 0.06);
    group.add(line, txt);
  }
  for (const [name, y] of [["Red clay", -2.75], ["Limestone", -9.75], ["Shale", -25], ["Sandstone", -45]]) {
    const txt = new THREE.Mesh(new THREE.PlaneGeometry(4.8, 1.0), label(name, 384, 80, 56, serif, "rgba(246,236,217,0.85)", "right"));
    txt.position.set(22, y - 0.9, CUT_Z + 0.06);
    const line = new THREE.Mesh(new THREE.PlaneGeometry(5.2, 0.03), tick);
    line.position.set(21.8, y, CUT_Z + 0.06);
    group.add(txt, line);
  }

  // ---------- the way in: the portal ramp and the bored curve the camera rides down ----------
  // Shown only while the camera is on that stretch; from the cross-section it would float in front.
  const ride = new THREE.Group();
  group.add(ride);
  const along = (s0, s1, n, fn) => { for (let i = 0; i <= n; i++) fn(s0 + ((s1 - s0) * i) / n, i); };
  const side = new THREE.Vector3();
  const strip2 = (n, s0, s1, edge, mat) => {
    // A strip along the route between two edges (each: (point, side, s) -> Vector3).
    const pos = [], uv = [], idx = [];
    along(s0, s1, n, (sr, i) => {
      const p = ROUTE.getPointAt(sr);
      side.crossVectors(ROUTE.getTangentAt(sr), UP).normalize();
      for (const e of [0, 1]) { const v = edge(e, p, side, sr); pos.push(v.x, v.y, v.z); uv.push(e, (sr * LENGTH) / 4); }
      if (i) { const a = (i - 1) * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    return new THREE.Mesh(g, mat);
  };
  // Road down the ramp and on through the curve (narrower inside the bore).
  const rampRoad = new THREE.MeshStandardMaterial({ ...pbrRepeat("asphalt_02", 1, 1, base), color: 0x8a8a8e, roughness: 1, side: THREE.DoubleSide });
  ride.add(strip2(90, 0, S_JOIN, (e, p, sd, sr) => p.clone().addScaledVector(sd, (e ? 1 : -1) * (sr < S_PORTAL ? RAMP.half - 0.1 : 1.25)).add(new THREE.Vector3(0, 0.01, 0)), rampRoad));
  // Retaining walls either side of the open cut, from the road up to the lawn.
  for (const sg of [-1, 1]) {
    ride.add(strip2(40, 0, S_PORTAL + 0.004, (e, p, sd) => { const v = p.clone().addScaledVector(sd, sg * RAMP.half); v.y = e ? 0.25 : p.y; return v; }, relined(12, 1)));
  }
  // Portal headwall with the tunnel mouth, facing up the ramp, and a light bar over it.
  const pp = ROUTE.getPointAt(S_PORTAL);
  const head = new THREE.Shape();
  head.moveTo(-RAMP.half, 0); head.lineTo(RAMP.half, 0); head.lineTo(RAMP.half, -pp.y + 0.6); head.lineTo(-RAMP.half, -pp.y + 0.6); head.closePath();
  const mouth = new THREE.Path();
  mouth.absarc(0, 1.32, TUNNEL.r + 0.05, 0, Math.PI * 2, true);
  head.holes.push(mouth);
  const portal = new THREE.Mesh(new THREE.ShapeGeometry(head, 32), new THREE.MeshStandardMaterial({ color: 0xbfc3c8, roughness: 0.85, side: THREE.DoubleSide }));
  const pt = ROUTE.getTangentAt(S_PORTAL);
  portal.rotation.y = Math.atan2(pt.x, pt.z);   // square to the road
  portal.position.copy(pp);
  ride.add(portal);
  const portalLight = new THREE.Mesh(new THREE.BoxGeometry(RAMP.half * 2 - 0.4, 0.08, 0.08), new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xe8f0ff, emissiveIntensity: 2.5 }));
  portalLight.position.set(pp.x, pp.y + 3.6, pp.z + 0.1);
  ride.add(portalLight);
  // The bored curve: a full tube from the portal to the straight tunnel, ringed with colour-changing
  // LED bands every few metres, as in the Loop.
  const tubePts = [];
  along(S_PORTAL, S_JOIN, 40, (sr) => tubePts.push(ROUTE.getPointAt(sr).add(new THREE.Vector3(0, 1.32, 0))));
  const curve = new THREE.CatmullRomCurve3(tubePts);
  ride.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 140, TUNNEL.r, 28, false), relined(curve.getLength() / 3, 2)));
  const NR = Math.floor(curve.getLength() / 3.2);
  const rings = new THREE.InstancedMesh(new THREE.TorusGeometry(TUNNEL.r - 0.05, 0.035, 6, 48), new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }), NR);
  const ringCol = new THREE.Color(), Z = new THREE.Vector3(0, 0, 1), rq = new THREE.Quaternion();
  for (let i = 0; i < NR; i++) {
    const u = (i + 0.5) / NR;
    rings.setMatrixAt(i, m.compose(curve.getPointAt(u), rq.setFromUnitVectors(Z, curve.getTangentAt(u)), one));
    rings.setColorAt(i, ringCol.setHSL(i / NR, 0.8, 0.6));
  }
  ride.add(rings);

  // ---------- traffic: one convoy; the camera tails its last car down the ramp ----------
  const car = carGeometries();
  const paints = [0xf2f2f0, 0x24427a, 0xa3171c, 0x111214, 0x8c9096];
  const tyreMat = new THREE.MeshStandardMaterial({ color: 0x141414, roughness: 0.85 });
  const coverMat = new THREE.MeshStandardMaterial({ color: 0xb9bdc2, metalness: 0.8, roughness: 0.3 });
  const headMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 3 });
  const tailMat = new THREE.MeshStandardMaterial({ color: 0x400000, emissive: 0xff2a1a, emissiveIntensity: 2.5 });
  const cars = paints.map((paint) => {
    const c = new THREE.Group();
    c.add(new THREE.Mesh(car.body, new THREE.MeshStandardMaterial({ color: paint, vertexColors: true, metalness: 0.45, roughness: 0.26, envMapIntensity: 1.2 })),
      new THREE.Mesh(car.tyres, tyreMat), new THREE.Mesh(car.covers, coverMat), new THREE.Mesh(car.head, headMat), new THREE.Mesh(car.tail, tailMat));
    c.traverse((o) => { if (o.isMesh) o.castShadow = o.receiveShadow = true; });
    group.add(c);
    return c;
  });
  // The followed car lights the tunnel ahead of it.
  const beam = new THREE.SpotLight(0xf4f6ff, 70, 40, 0.5, 0.6, 1.3);
  beam.position.set(2.3, 0.7, 0);
  beam.target.position.set(14, 0.2, 0);
  cars[0].add(beam, beam.target);
  // Distance along the route, then on along the straight tunnel (heading -x), wrapping at its end.
  const D_JOIN = S_JOIN * LENGTH, X_JOIN = ROUTE.getPointAt(S_JOIN).x, SPAN = TUNNEL.x1 - TUNNEL.x0 - 8;
  const placeCar = (c, d) => {
    if (d <= D_JOIN) {
      const sr = d / LENGTH;
      c.position.copy(ROUTE.getPointAt(sr));
      c.quaternion.setFromUnitVectors(X, ROUTE.getTangentAt(sr));
    } else {
      let x = X_JOIN - (d - D_JOIN);
      while (x < TUNNEL.x0 + 4) x += SPAN;
      c.position.set(x, ROAD_Y, tz);
      c.quaternion.setFromAxisAngle(UP, Math.PI);
    }
  };
  let free = null;   // once the camera lets the car go: { d, at }

  // ---------- the clearing: a reception pit the DN600 breaks into ----------
  const C = CHAMBER, CW = C.x1 - C.x0, CH = C.y1 - C.y0, CD = C.back + C.front;
  const bz = CUT_Z + BORE.r + 0.06;
  const shotcrete = new THREE.MeshStandardMaterial({ ...pbrRepeat("brushed_concrete_2", CW / 4, CH / 4, base), color: 0xa9a49b, roughness: 0.95, side: THREE.BackSide, envMapIntensity: 0.2 });
  // An open-fronted room: seen from in front, the box's own front face is culled.
  const room = new THREE.Mesh(new THREE.BoxGeometry(CW, CH, CD), shotcrete);
  room.position.set((C.x0 + C.x1) / 2, (C.y0 + C.y1) / 2, CUT_Z - C.back + CD / 2);
  room.receiveShadow = true;
  group.add(room);
  // Reception cradle the machine drives out onto.
  const cradleTop = BORE.y - BORE.r - 0.06;
  group.add(new THREE.Mesh(mergeGeometries([
    ...[-0.24, 0.24].map((dz) => new THREE.BoxGeometry(3, 0.12, 0.1).translate(C.x0 + 1.5, cradleTop, bz + dz)),
    ...[0, 1.45, 2.9].map((dx) => new THREE.BoxGeometry(0.1, cradleTop - C.y0, 0.7).translate(C.x0 + 0.05 + dx, (cradleTop + C.y0) / 2, bz)),
  ]), steel));
  // Broken rock where it comes through the wall, and on the floor below.
  const rubbleG = [];
  let seed = 3;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 46; i++) {
    const a = rnd() * Math.PI * 2, r = BORE.r + 0.02 + rnd() * 0.16;
    rubbleG.push(new THREE.DodecahedronGeometry(0.02 + rnd() * 0.04, 0).translate(C.x0 + 0.02, BORE.y + Math.sin(a) * r, bz + Math.cos(a) * r));
  }
  for (let i = 0; i < 30; i++) rubbleG.push(new THREE.DodecahedronGeometry(0.02 + rnd() * 0.06, 0).translate(C.x0 + 0.2 + rnd() * 1.4, C.y0 + 0.03, bz + (rnd() - 0.5) * 1.4));
  group.add(new THREE.Mesh(mergeGeometries(rubbleG), new THREE.MeshStandardMaterial({ color: 0x6f6658, roughness: 1, flatShading: true })));
  // Work lights on tripods.
  for (const [x, z, aim] of [[3.5, CUT_Z - 4.5, -1], [12.5, CUT_Z - 5.5, 7]]) {
    const mast = new THREE.Mesh(mergeGeometries([new THREE.CylinderGeometry(0.03, 0.03, 2.6, 6).translate(0, 1.3, 0), new THREE.BoxGeometry(0.5, 0.3, 0.12).translate(0, 2.6, 0.04)]), steel);
    mast.position.set(x, C.y0, z);
    const lamp = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.22), new THREE.MeshBasicMaterial({ color: 0xfff4dc, toneMapped: false }));
    lamp.position.set(x, C.y0 + 2.6, z + 0.11);
    const spot = new THREE.SpotLight(0xffe7c4, 60, 22, 0.8, 0.7, 1.4);
    spot.position.set(x, C.y0 + 2.7, z + 0.3);
    spot.target.position.set(aim, BORE.y, bz);
    group.add(mast, lamp, spot, spot.target);
  }
  // A shaft from the clearing up to the lawn, with a ladder: how the team gets down.
  const SR = 1.5, sx = C.x1 - 2.6, sTop = 0, sBot = C.y1;
  const shaft = halfTube(SR, sTop - sBot, "y", relined(2, 6));
  shaft.position.set(sx, (sTop + sBot) / 2, CUT_Z + SR + 0.15);
  group.add(shaft);
  for (const sg of [-1, 1]) {
    const rim = new THREE.Mesh(new THREE.BoxGeometry(0.3, sTop - sBot, 0.06), cutFace);
    rim.position.set(sx + sg * (SR + 0.15), (sTop + sBot) / 2, CUT_Z + SR + 0.15);
    group.add(rim);
    const rail = new THREE.Mesh(new THREE.BoxGeometry(0.05, sTop - C.y0, 0.05), steel);
    rail.position.set(sx + sg * 0.25, (sTop + C.y0) / 2, CUT_Z + 0.55);
    group.add(rail);
  }
  const rungs = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.02, 0.02, 0.5, 6).rotateZ(Math.PI / 2), steel, Math.floor((sTop - C.y0) / 0.3));
  for (let i = 0; i < rungs.count; i++) rungs.setMatrixAt(i, m.makeTranslation(sx, C.y0 + 0.3 + i * 0.3, CUT_Z + 0.55));
  group.add(rungs);

  // The control station: a table, the screen running the GUI, a laptop, a stacklight.
  const station = new THREE.Group();
  const deskMat = new THREE.MeshStandardMaterial({ color: 0x3c3f44, roughness: 0.6, metalness: 0.4 });
  station.add(new THREE.Mesh(mergeGeometries([
    new THREE.BoxGeometry(1.7, 0.05, 0.8).translate(0, 0.76, 0),
    ...[[-0.8, -0.35], [0.8, -0.35], [-0.8, 0.35], [0.8, 0.35]].map(([x, z]) => new THREE.BoxGeometry(0.04, 0.76, 0.04).translate(x, 0.38, z)),
  ]), deskMat));
  const screen = controlScreen();
  const monitor = new THREE.Group();
  monitor.add(new THREE.Mesh(mergeGeometries([new THREE.BoxGeometry(0.98, 0.64, 0.04), new THREE.BoxGeometry(0.06, 0.3, 0.06).translate(0, -0.42, -0.03), new THREE.BoxGeometry(0.3, 0.02, 0.2).translate(0, -0.57, -0.03)]), new THREE.MeshStandardMaterial({ color: 0x18191b, roughness: 0.5 })));
  const display = new THREE.Mesh(new THREE.PlaneGeometry(0.92, 0.575), new THREE.MeshBasicMaterial({ map: screen.tex, toneMapped: false }));
  display.position.z = 0.021;
  monitor.add(display);
  monitor.position.set(0.1, 0.78 + 0.58, -0.15);
  station.add(monitor);
  const laptop = new THREE.Group();
  laptop.add(new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.015, 0.24), deskMat));
  const lid = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.22), new THREE.MeshBasicMaterial({ map: screen.tex, toneMapped: false, color: 0xcccccc }));
  lid.position.set(0, 0.11, -0.12); lid.rotation.x = -0.25;
  laptop.add(lid);
  laptop.position.set(-0.55, 0.79, 0.12); laptop.rotation.y = 0.4;
  station.add(laptop);
  const lights = [0xff2a1a, 0xffc020, 0x2bd65a].map((hex, i) => {
    const mat = new THREE.MeshStandardMaterial({ color: 0x222222, emissive: hex, emissiveIntensity: i === 2 ? 3 : 0.05 });
    const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.13, 16), mat);
    lens.position.set(1.1, 1.92 - i * 0.14, -0.2);
    station.add(lens);
    return mat;
  });
  station.add(new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 1.6, 8).translate(1.1, 0.8, -0.2), steel));
  station.position.set(8.3, C.y0, CUT_Z - 1.6);
  station.rotation.y = -0.32;
  station.traverse((o) => { if (o.isMesh) o.castShadow = o.receiveShadow = true; });
  group.add(station);
  group.updateMatrixWorld(true);
  const screenAt = display.getWorldPosition(new THREE.Vector3());
  pickables.push({ id: "controls", object: station, focus: { pos: screenAt.clone().add(new THREE.Vector3(-0.55, 0.05, 1.6)), target: screenAt.clone() } });

  // ---------- the DN600, boring toward the clearing ----------
  const bore = halfTube(BORE.r + 0.02, 1, "x", new THREE.MeshStandardMaterial({ color: 0x2a221c, roughness: 1, side: THREE.DoubleSide }));
  group.add(bore);   // stretched each frame from the launch side to the machine
  // The machine: model x spans -0.13 m (cutterhead) to +1.15 m (tail); turned to drive along +x, in
  // line with its bore and pipe string.
  const { root: dn, cutter } = await loadDN600(base, fetchAs);
  dn.rotation.y = Math.PI;
  const tbm = new THREE.Group();
  tbm.add(dn);
  group.add(tbm);
  const TAIL = 1.15 + 0.13;
  // Concrete jacking pipes pushed in behind it, ending at the machine's tail.
  const PIPE = 2.05, NP = Math.ceil((BORE.end - BORE.x0) / PIPE) + 2;
  const pipes = new THREE.InstancedMesh(new THREE.CylinderGeometry(BORE.r - 0.05, BORE.r - 0.05, 2.0, 32).rotateZ(Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x77726a, roughness: 0.9 }), NP);
  pipes.castShadow = pipes.receiveShadow = true;
  pipes.frustumCulled = false;
  group.add(pipes);
  // Lamps along the bore, each throwing a pool of sodium light on the rock.
  const lampMat = new THREE.MeshStandardMaterial({ color: 0x332211, emissive: 0xffb25a, emissiveIntensity: 4 });
  const cage = new THREE.MeshStandardMaterial({ color: 0x2a2a2a, metalness: 0.7, roughness: 0.5 });
  for (let x = BORE.x0 + 6; x < C.x0 - 2; x += 11) {
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.06, 12, 8), lampMat);
    bulb.position.set(x, BORE.y + 1.6, CUT_Z + 0.25);
    const bracket = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.03, 0.25), cage);
    bracket.position.set(x, BORE.y + 1.68, CUT_Z + 0.13);
    group.add(bulb, bracket);
    pool(x, BORE.y + 1.0, 5.5, 4.6, 0.3);
  }
  const work = new THREE.SpotLight(0xffc27a, 35, 14, 0.55, 0.7, 1.5);
  work.target = tbm;
  group.add(work);
  // Spoil thrown off the face while the machine moves.
  const NS = 60;
  const spoil = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.03, 0), new THREE.MeshStandardMaterial({ color: 0x8a6a4a, roughness: 1 }), NS);
  spoil.frustumCulled = false;
  group.add(spoil);
  const bits = Array.from({ length: NS }, () => ({ p: new THREE.Vector3(), v: new THREE.Vector3(), life: 0 }));
  pickables.push({ id: "dn600", object: tbm, dynamic: true, focus: { pos: new THREE.Vector3(0.9, BORE.y + 0.45, CUT_Z + 2.6), target: new THREE.Vector3(BORE.end - 0.5, BORE.y, bz) } });

  // A lamp that travels with the camera below ground, so whatever part of the face is in view is lit.
  const headlamp = new THREE.PointLight(0xffe2c0, 0, 70, 1.3);
  group.add(headlamp);

  let lastX = BORE.x0, spin = 0, lastScreen = 0;
  return {
    group, pickables, envMap,
    // drive: 0..1, how far the DN600 has come. loop: { s, ride } — the followed car's place on the
    // route (arc fraction) and whether the ramp and curve are in play (main.js maps the scroll to both).
    update(t, camera, drive = 1, loop = { s: S_END, ride: false }) {
      const dt = 1 / 60;
      chaseMat.uniforms.t.value = t * 0.001;
      blink.forEach((mat, i) => { mat.emissiveIntensity = Math.sin(t * 0.004 + i * 1.7) > 0.6 ? 0.4 : 3; });
      ride.visible = loop.ride;
      if (loop.ride) {
        for (let i = 0; i < NR; i++) rings.setColorAt(i, ringCol.setHSL((i / NR + t * 0.00008) % 1, 0.8, 0.6));
        rings.instanceColor.needsUpdate = true;
      }
      // The convoy: while the camera tails it, its last car is wherever the scroll says; after that
      // it drives on by itself at 9 m/s, the others ahead of it.
      let d;
      if (loop.s < S_END - 1e-4) { free = null; d = loop.s * LENGTH; }
      else { free ||= { d: S_END * LENGTH, at: t }; d = free.d + (t - free.at) * 0.009; }
      cars.forEach((c, i) => placeCar(c, d + i * 26));
      // The machine: head at x, the bore and pipe string behind it back to the launch side.
      const x = THREE.MathUtils.lerp(BORE.x0 + 20, BORE.end, drive);
      const speed = Math.abs(x - lastX) / dt;
      lastX = x;
      tbm.position.set(x - 0.13, BORE.y, bz);
      const boreEnd = Math.min(x, C.x0);
      bore.position.set((BORE.x0 + boreEnd) / 2, BORE.y, bz);
      bore.scale.set(1, boreEnd - BORE.x0, 1);
      let n = 0;
      for (let px = x - TAIL; px > BORE.x0 && n < NP; px -= PIPE) pipes.setMatrixAt(n++, m.compose(new THREE.Vector3(px - 1.0, BORE.y, bz), q0, one));
      pipes.count = n;
      pipes.instanceMatrix.needsUpdate = true;
      spin += dt * (0.6 + Math.min(speed, 6) * 2.5);
      cutter.rotation.x = spin;
      work.position.set(x - 2.5, BORE.y + 2.4, CUT_Z + 3.5);
      // Spoil: a few chips per frame while it's moving, falling under gravity onto the floor.
      bits.forEach((b, i) => {
        if (b.life <= 0 && speed > 0.05 && Math.random() < 0.25) {
          b.p.set(x + 0.05, BORE.y + (Math.random() - 0.5) * 0.4, bz + 0.2 + Math.random() * 0.3);
          b.v.set(0.4 + Math.random() * 0.8, Math.random() * 0.9, 0.3 + Math.random() * 0.6);
          b.life = 0.6 + Math.random() * 0.5;
        }
        if (b.life > 0) {
          b.life -= dt; b.v.y -= 9.8 * dt; b.p.addScaledVector(b.v, dt);
          if (b.p.y < C.y0 + 0.03) { b.p.y = C.y0 + 0.03; b.v.set(0, 0, 0); }
        }
        spoil.setMatrixAt(i, m.compose(b.p, q0, b.life > 0 ? one : zero));
      });
      spoil.instanceMatrix.needsUpdate = true;
      // The GUI's screen redraws a few times a second when it can be seen; the stacklight shows RUN.
      if (t - lastScreen > 200 && camera.position.y < TUNNEL.y - 4) { screen.draw(t * 0.001); lastScreen = t; }
      lights[2].emissiveIntensity = 2.4 + Math.sin(t * 0.003) * 0.4;
      // The headlamp sits a little above and ahead of the camera, toward the face; off on the ride in.
      headlamp.position.set(camera.position.x, camera.position.y + 3, Math.min(camera.position.z - 6, CUT_Z + 22));
      headlamp.intensity = camera.position.y < -1 && !loop.ride ? 110 : 0;
    },
  };
}
