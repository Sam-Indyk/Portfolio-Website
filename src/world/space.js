// Space band (top of the cross-section): a daylit Blue Marble Earth far behind, real Galaxy Zoo
// galaxies and stars beyond it, and the ISCR array, a telescope and a Crew Dragon floating in front.
import * as THREE from "three";
import { solarCells, foilMaps } from "../textures.js";

// Earth: a huge sphere far behind the content plane, so its limb rises slowly as the camera descends.
// Its limb sits a little under the floating objects, filling the lower third of the opening frame.
// Far enough back that even its nearest point is behind the sky panorama (z = -720).
export const EARTH = { r: 2100, center: new THREE.Vector3(0, 241 - 2100, -3000) };
export const SUN_SPACE = new THREE.Vector3(-0.45, 0.55, 0.7).normalize();
export const SPACE_Y = 530;   // middle of the floating objects
// Where Austin faces on the globe: low on its visible face, so the dive tips the camera ~25° down.
export const AUSTIN_DIR = new THREE.Vector3(0, 0.8, 0.6).normalize();
const AUSTIN_LL = [30.317, -97.758];

// Rotate the globe so a chosen lat/lon faces `dir`, north up.
function orient(mesh, lat, lon, dir) {
  const phi = THREE.MathUtils.degToRad(lon) + Math.PI, theta = Math.PI / 2 - THREE.MathUtils.degToRad(lat);
  const p = new THREE.Vector3(-Math.cos(phi) * Math.sin(theta), Math.cos(theta), Math.sin(phi) * Math.sin(theta));
  const east = new THREE.Vector3(Math.sin(phi), 0, Math.cos(phi)).normalize();
  const north = new THREE.Vector3().crossVectors(p, east);
  const d = dir.clone().normalize();
  const dEast = new THREE.Vector3(0, 1, 0).cross(d).normalize();
  const dNorth = new THREE.Vector3().crossVectors(d, dEast);
  const src = new THREE.Matrix4().makeBasis(east, north, p);
  const dst = new THREE.Matrix4().makeBasis(dEast, dNorth, d);
  mesh.quaternion.setFromRotationMatrix(dst.multiply(src.transpose()));
}

const vert = /* glsl */ `
  varying vec2 vUv; varying vec3 vN; varying vec3 vW;
  void main() {
    vUv = uv; vN = normalize(mat3(modelMatrix) * normal);
    vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz;
    gl_Position = projectionMatrix * viewMatrix * w;
  }`;
const earthFrag = /* glsl */ `
  uniform sampler2D dayMap, specMap, cloudMap, texasMap; uniform vec3 sunDir; uniform float shift, fade, haze, texasOn;
  uniform vec4 texasBox;   // lon0, lon1, lat0, lat1
  varying vec2 vUv; varying vec3 vN; varying vec3 vW;
  void main() {
    if (fade <= 0.001) discard;
    vec3 n = normalize(vN), v = normalize(cameraPosition - vW);
    float ndl = dot(n, sunDir);
    vec3 day = texture2D(dayMap, vUv).rgb;
    // Sharper regional map of Texas for the dive (same Blue Marble source), feathered at its edges.
    vec2 ll = vec2(vUv.x * 360.0 - 180.0, vUv.y * 180.0 - 90.0);
    vec2 tu = (ll - texasBox.xz) / (texasBox.yw - texasBox.xz);
    float inTx = texasOn * smoothstep(0.0, 0.12, min(min(tu.x, 1.0 - tu.x), min(tu.y, 1.0 - tu.y)));
    if (inTx > 0.0) day = mix(day, texture2D(texasMap, tu).rgb, inTx);
    float ocean = texture2D(specMap, vUv).r;
    float shadow = texture2D(cloudMap, vUv + vec2(shift - 0.0012, 0.0006)).r;
    // Deepen oceans toward the rich blue of NASA imagery.
    day = mix(day, day * vec3(0.55, 0.78, 1.25), ocean * 0.6);
    vec3 col = day * (0.04 + 1.35 * max(ndl, 0.0)) * (1.0 - 0.4 * shadow);
    vec3 h = normalize(sunDir + v);
    col += vec3(1.0, 0.95, 0.85) * pow(max(dot(n, h), 0.0), 260.0) * ocean * 0.45 * step(0.0, ndl);
    float fres = pow(1.0 - max(dot(n, v), 0.0), 3.0);
    col = mix(col, vec3(0.35, 0.6, 1.0) * (0.25 + max(ndl, 0.0)), fres * 0.7);
    // Re-entry: the air thickens into a bright blue haze as the camera dives.
    col = mix(col, vec3(0.62, 0.76, 0.95), haze);
    gl_FragColor = vec4(col, fade);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }`;
const cloudFrag = /* glsl */ `
  uniform sampler2D cloudMap; uniform vec3 sunDir; uniform float shift, fade;
  varying vec2 vUv; varying vec3 vN; varying vec3 vW;
  void main() {
    float c = texture2D(cloudMap, vUv + vec2(shift, 0.0)).r;
    float ndl = dot(normalize(vN), sunDir);
    gl_FragColor = vec4(vec3(1.0) * (0.03 + 1.25 * max(ndl, 0.0)), smoothstep(0.08, 0.9, c) * 0.95 * fade);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }`;
const atmoFrag = /* glsl */ `
  uniform vec3 sunDir; uniform float fade; varying vec3 vN; varying vec3 vW;
  void main() {
    vec3 n = normalize(vN), v = normalize(cameraPosition - vW);
    float rim = pow(1.0 - abs(dot(n, v)), 2.6);
    float light = smoothstep(-0.25, 0.3, dot(n, sunDir));
    gl_FragColor = vec4(vec3(0.32, 0.58, 1.0) * rim * light * 0.9 * fade, 1.0);
  }`;

const starVert = /* glsl */ `
  attribute float size; attribute vec3 tint; varying vec3 vTint;
  void main() { vTint = tint; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mv; gl_PointSize = size; }`;
const starFrag = /* glsl */ `
  uniform float fade; varying vec3 vTint;
  void main() { float d = length(gl_PointCoord - 0.5); float a = smoothstep(0.5, 0.0, d); gl_FragColor = vec4(vTint * a * a * fade, 1.0); }`;

const galaxyVert = /* glsl */ `
  attribute vec3 center; attribute float size; attribute vec2 cell; attribute float bright;
  uniform float grid; varying vec2 vUv; varying float vB;
  void main() {
    vec3 p = center + vec3(position.xy * size, 0.0);
    vUv = (cell + uv) / grid; vUv.y = 1.0 - vUv.y; vB = bright;
    gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
  }`;
const galaxyFrag = /* glsl */ `
  uniform sampler2D atlas; uniform float fade; varying vec2 vUv; varying float vB;
  void main() { gl_FragColor = vec4(texture2D(atlas, vUv).rgb * vB * fade, 1.0); }`;

export function buildSpace({ textures, galaxyMeta, isMobile, portrait = false }) {
  const group = new THREE.Group();
  const pickables = [];
  const res = isMobile ? "2k" : "4k";
  const earthFade = { value: 1 }, skyFade = { value: 1 }, haze = { value: 0 }, texasOn = { value: 0 };
  const texasMap = { value: null }, texasBox = { value: new THREE.Vector4(-180, -179, -90, -89) };
  const shared = { sunDir: { value: SUN_SPACE }, shift: { value: 0 }, fade: earthFade };

  // ---------- Earth ----------
  const seg = isMobile ? 128 : 256;
  const earth = new THREE.Mesh(new THREE.SphereGeometry(EARTH.r, seg, seg / 2), new THREE.ShaderMaterial({
    vertexShader: vert, fragmentShader: earthFrag, transparent: true,
    uniforms: { ...shared, haze, texasOn, texasMap, texasBox, dayMap: { value: textures[`day-${res}`] }, specMap: { value: textures["specular-2k"] }, cloudMap: { value: textures[`clouds-${res}`] } },
  }));
  const clouds = new THREE.Mesh(new THREE.SphereGeometry(EARTH.r * 1.003, seg, seg / 2), new THREE.ShaderMaterial({
    vertexShader: vert, fragmentShader: cloudFrag, transparent: true, depthWrite: false, uniforms: { ...shared, cloudMap: { value: textures[`clouds-${res}`] } },
  }));
  const atmo = new THREE.Mesh(new THREE.SphereGeometry(EARTH.r * 1.012, seg, seg / 2), new THREE.ShaderMaterial({
    vertexShader: vert, fragmentShader: atmoFrag, side: THREE.BackSide, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, uniforms: shared,
  }));
  // Austin sits where the dive aims (see rail.js), North America spread around it.
  orient(earth, ...AUSTIN_LL, AUSTIN_DIR);
  clouds.quaternion.copy(earth.quaternion);
  for (const m of [earth, clouds, atmo]) m.position.copy(EARTH.center);
  // Everything far behind draws before the sky panorama, so the panorama covers it lower down.
  earth.renderOrder = -10; clouds.renderOrder = -9; atmo.renderOrder = -8;
  group.add(earth, clouds, atmo);

  // ---------- stars: round, soft, varied ----------
  const N = isMobile ? 3000 : 9000;
  const sp = new Float32Array(N * 3), ss = new Float32Array(N), st = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) {
    sp.set([(Math.random() - 0.5) * 17000, -900 + Math.random() * 7400, -4900 - Math.random() * 600], i * 3);
    const b = Math.pow(Math.random(), 4);
    ss[i] = (1.2 + b * 3.2) * Math.min(devicePixelRatio, 2);
    const tTemp = Math.random();
    st.set([0.5 + b * 0.6, 0.55 + b * 0.55 - tTemp * 0.04, 0.62 + b * 0.5 + tTemp * 0.08], i * 3);
  }
  const sg = new THREE.BufferGeometry();
  sg.setAttribute("position", new THREE.BufferAttribute(sp, 3));
  sg.setAttribute("size", new THREE.BufferAttribute(ss, 1));
  sg.setAttribute("tint", new THREE.BufferAttribute(st, 3));
  const stars = new THREE.Points(sg, new THREE.ShaderMaterial({ vertexShader: starVert, fragmentShader: starFrag, uniforms: { fade: skyFade }, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
  stars.renderOrder = -12;
  group.add(stars);

  // ---------- galaxies (Galaxy Zoo 2) ----------
  const G = galaxyMeta.count, quad = new THREE.PlaneGeometry(1, 1);
  const gg = new THREE.InstancedBufferGeometry();
  gg.index = quad.index;
  gg.setAttribute("position", quad.getAttribute("position"));
  gg.setAttribute("uv", quad.getAttribute("uv"));
  const centers = new Float32Array(G * 3), sizes = new Float32Array(G), cells = new Float32Array(G * 2), bright = new Float32Array(G);
  let seed = 42;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  // Scattered across the whole sky among the stars: mostly small and faint, a few nearby and large.
  // Stratified (jittered grid) so they never clump.
  const gz = -4200, gCols = 20, gRows = Math.ceil(G / gCols);
  const order = Array.from({ length: G }, (_, i) => i).sort(() => rnd() - 0.5);
  let tagGalaxy = null;
  for (let i = 0; i < G; i++) {
    const cell = order[i], cx = cell % gCols, cy = Math.floor(cell / gCols);
    const c = new THREE.Vector3(
      (-0.5 + (cx + 0.15 + rnd() * 0.7) / gCols) * 5600,
      -260 + ((cy + 0.15 + rnd() * 0.7) / gRows) * 2700,
      gz - rnd() * 400);
    centers.set([c.x, c.y, c.z], i * 3);
    const big = rnd() < 0.08;
    sizes[i] = big ? 95 + rnd() * 70 : 26 + Math.pow(rnd(), 1.6) * 46;
    if (big && (!tagGalaxy || Math.abs(c.x) + Math.abs(c.y - 1150) < Math.abs(tagGalaxy.c.x) + Math.abs(tagGalaxy.c.y - 1150))) tagGalaxy = { c, s: sizes[i] };
    cells.set([i % galaxyMeta.grid, Math.floor(i / galaxyMeta.grid)], i * 2);
    bright[i] = 0.9 + rnd() * 0.45;
    pickables.push({ id: "galaxy", galaxy: i, sphere: new THREE.Sphere(c, sizes[i] * 0.42), label: "Galaxy · decompose" });
  }
  gg.setAttribute("center", new THREE.InstancedBufferAttribute(centers, 3));
  gg.setAttribute("size", new THREE.InstancedBufferAttribute(sizes, 1));
  gg.setAttribute("cell", new THREE.InstancedBufferAttribute(cells, 2));
  gg.setAttribute("bright", new THREE.InstancedBufferAttribute(bright, 1));
  gg.instanceCount = G;
  const galaxyMesh = new THREE.Mesh(gg, new THREE.ShaderMaterial({
    vertexShader: galaxyVert, fragmentShader: galaxyFrag, uniforms: { atlas: { value: textures.galaxies }, grid: { value: galaxyMeta.grid }, fade: skyFade },
    blending: THREE.AdditiveBlending, transparent: true, depthWrite: false,
  }));
  galaxyMesh.frustumCulled = false;
  galaxyMesh.renderOrder = -11;
  group.add(galaxyMesh);

  // ---------- ISCR array: orbital AI compute ----------
  // Each panel is solar cells, compute and a radiator in one. The compute shows as activity: pulses
  // run out from the bus across the cells and along the rows, and the panel edges glow with it.
  const iscr = new THREE.Group();
  const cols = isMobile ? 16 : 22, rows = isMobile ? 6 : 8, pw = 1.7, gap = 0.06;
  const edge = new THREE.MeshStandardMaterial({ color: 0xb8bcc2, metalness: 0.85, roughness: 0.35 });
  const radiator = new THREE.MeshStandardMaterial({ color: 0xeeeeea, metalness: 0.0, roughness: 0.55 });
  const cellsMat = new THREE.MeshPhysicalMaterial({ map: solarCells(6), metalness: 0.2, roughness: 0.42, clearcoat: 1, clearcoatRoughness: 0.08, color: 0x9fb6ff, emissive: 0x5ac8ff });
  const panelEdge = new THREE.MeshStandardMaterial({ color: 0x9aa3ad, metalness: 0.8, roughness: 0.35, emissive: 0x5ac8ff });
  const pulseTime = { value: 0 };
  const pulses = (mat, cells) => {
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uPulse = pulseTime;
      sh.vertexShader = sh.vertexShader
        .replace("#include <common>", "#include <common>\nvarying vec2 vPanel; varying vec2 vCellUv;")
        .replace("#include <uv_vertex>", "#include <uv_vertex>\nvPanel = (instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xz; vCellUv = uv;");
      sh.fragmentShader = sh.fragmentShader
        .replace("#include <common>", `#include <common>
          uniform float uPulse; varying vec2 vPanel; varying vec2 vCellUv;
          float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }`)
        .replace("#include <emissivemap_fragment>", `
          // Wavefronts leaving the bus at the centre, and packets running along each row.
          float wave = fract(length(vPanel) / 22.0 - uPulse * 0.32);
          float front = smoothstep(0.0, 0.015, wave) * (1.0 - smoothstep(0.015, 0.11, wave));
          float row = floor(vPanel.y / 1.76 + 0.5);
          float pk = fract(vPanel.x / 46.0 - uPulse * (0.18 + hash(vec2(row, 3.0)) * 0.3) + hash(vec2(row, 7.0)));
          float packet = smoothstep(0.0, 0.015, pk) * (1.0 - smoothstep(0.015, 0.06, pk));
          float panel = hash(floor(vPanel * 0.57));
          float act = max(front * (0.3 + panel * 0.7), packet * 0.7) + 0.04;
          ${cells ? `// Single cells flicker as the pulse passes, like activations.
          vec2 cell = floor(vCellUv * 6.0);
          act *= 0.2 + 0.8 * step(0.62, hash(cell + floor(uPulse * 9.0) + panel * 13.0));` : ""}
          totalEmissiveRadiance *= act * ${cells ? "0.75" : "1.6"};`);
    };
    mat.customProgramCacheKey = () => `pulses-${cells}`;
  };
  pulses(cellsMat, true);
  pulses(panelEdge, false);
  const panels = new THREE.InstancedMesh(new THREE.BoxGeometry(pw, 0.09, pw), [panelEdge, panelEdge, cellsMat, radiator, panelEdge, panelEdge], cols * rows);
  const m = new THREE.Matrix4();
  let k = 0;
  for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
    m.makeTranslation((x - cols / 2 + 0.5) * (pw + gap), 0, (y - rows / 2 + 0.5) * (pw + gap));
    // Each panel slightly different (cell batches and angle), so the array reads as many panels.
    const s = 0.78 + Math.random() * 0.3;
    panels.setColorAt(k, new THREE.Color(s, s * (0.97 + Math.random() * 0.05), Math.min(1, s * 1.06)));
    panels.setMatrixAt(k++, m);
  }
  const span = cols * (pw + gap);
  const spine = new THREE.Mesh(new THREE.BoxGeometry(span + 1, 0.25, 0.25), edge);
  spine.position.y = -0.35;
  const ribs = new THREE.InstancedMesh(new THREE.BoxGeometry(0.14, 0.14, rows * (pw + gap)), edge, 6);
  for (let i = 0; i < 6; i++) { m.makeTranslation(-span / 2 + (i + 0.5) * (span / 6), -0.2, 0); ribs.setMatrixAt(i, m); }
  const { map: gold, normalMap: goldN } = foilMaps([214, 176, 92]);
  const bus = new THREE.Mesh(new THREE.BoxGeometry(2.6, 1.8, 2.6), new THREE.MeshStandardMaterial({ map: gold, normalMap: goldN, metalness: 1, roughness: 0.32 }));
  bus.position.y = -1.4;
  // Status lights on the bus.
  const led = new THREE.MeshBasicMaterial({ color: 0x7fe0ff });
  for (let i = 0; i < 6; i++) {
    const l = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.05, 0.02), led);
    l.position.set(-0.75 + i * 0.3, -1.0, 1.31);
    bus.add(l);
  }
  iscr.add(panels, spine, ribs, bus);
  // The ISCR array is the centrepiece, large and forward; the telescope and capsule sit at the edges
  // (stacked on phones). It hangs in a pivot that turns it toward the cursor.
  const L = portrait
    ? { iscr: [0, 3, 38], tele: [-14, 40, -8], drag: [13, -32, -2], scale: 1.15 }
    : { iscr: [0, 7, 12], tele: [-50, 15, -30], drag: [50, -12, -24], scale: 1.25 };
  const pivot = new THREE.Group();
  pivot.position.set(L.iscr[0], SPACE_Y + L.iscr[1], L.iscr[2]);
  pivot.scale.setScalar(L.scale);
  iscr.rotation.set(1.05, 0.32, -0.08);   // tilted to face the sun and the viewer
  pivot.add(iscr);
  group.add(pivot);
  // The hover tag sits at the array's upper-left corner (its whole box runs off the top of the screen).
  const tagAt = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2));
  tagAt.visible = false;
  tagAt.position.set(-span / 2, 0, -rows * (pw + gap) / 2);
  iscr.add(tagAt);
  pivot.updateMatrixWorld(true);
  pickables.push({ id: "iscr", object: pivot, tagAnchor: tagAt, focus: { pos: pivot.position.clone().add(new THREE.Vector3(13, 8, 56)), target: pivot.position.clone() } });


  // ---------- space telescope ----------
  const tele = new THREE.Group();
  const { map: silver, normalMap: silverN } = foilMaps([226, 228, 232]);
  const tubeMat = new THREE.MeshStandardMaterial({ map: silver, normalMap: silverN, metalness: 1, roughness: 0.28 });
  const tube = new THREE.Mesh(new THREE.CylinderGeometry(2.1, 2.1, 9, 64, 1, true), tubeMat);
  const aft = new THREE.Mesh(new THREE.CylinderGeometry(2.3, 2.3, 4.6, 64), tubeMat);
  aft.position.y = -6.8;
  const inner = new THREE.Mesh(new THREE.CircleGeometry(2.05, 64), new THREE.MeshStandardMaterial({ color: 0x050505, roughness: 1 }));
  inner.rotation.x = -Math.PI / 2; inner.position.y = 3;
  const door = new THREE.Mesh(new THREE.CircleGeometry(2.2, 64), tubeMat);
  door.position.set(0, 4.6, -2.0); door.rotation.x = -0.55;
  const wingMat = new THREE.MeshPhysicalMaterial({ map: solarCells(10), metalness: 0.2, roughness: 0.4, clearcoat: 1, color: 0x9fb6ff, side: THREE.DoubleSide });
  for (const s of [-1, 1]) {
    const wing = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 9.5), wingMat);
    wing.position.set(s * 4.8, -3, 0);
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 2.4), edge);
    arm.rotation.z = Math.PI / 2; arm.position.set(s * 2.9, -3, 0);
    tele.add(wing, arm);
  }
  tele.add(tube, aft, inner, door);
  tele.position.set(L.tele[0], SPACE_Y + L.tele[1], L.tele[2]);
  tele.rotation.set(0.25, 0.5, -1.0);
  group.add(tele);
  pickables.push({ id: "telescope", object: tele, focus: { pos: tele.position.clone().add(new THREE.Vector3(6, 0, 30)), target: tele.position.clone() } });

  // ---------- Crew Dragon ----------
  const dragon = new THREE.Group();
  const prof = [[0, -2.2], [2.0, -2.2], [2.15, -2.0], [2.0, -1.7], [1.2, 1.3], [0.7, 1.9], [0, 2.0]].map(([x, y]) => new THREE.Vector2(x, y));
  const white = new THREE.MeshStandardMaterial({ color: 0xf1f1ee, roughness: 0.42 });
  const capsule = new THREE.Mesh(new THREE.LatheGeometry(prof, 96), white);
  const shield = new THREE.Mesh(new THREE.CircleGeometry(2.0, 96), new THREE.MeshStandardMaterial({ color: 0x1b1a19, roughness: 0.9 }));
  shield.rotation.x = Math.PI / 2; shield.position.y = -2.21;
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(2.0, 2.0, 2.6, 96, 1, true), new THREE.MeshPhysicalMaterial({ map: solarCells(14), metalness: 0.3, roughness: 0.38, clearcoat: 1, side: THREE.DoubleSide }));
  trunk.position.y = -3.6;
  const nose = new THREE.Mesh(new THREE.SphereGeometry(0.7, 48, 24, 0, Math.PI * 2, 0, Math.PI / 2), white);
  nose.position.set(0.5, 2.0, 0); nose.rotation.z = -1.1;
  const winMat = new THREE.MeshStandardMaterial({ color: 0x0a0d12, metalness: 0.9, roughness: 0.1 });
  for (let i = 0; i < 4; i++) {
    const w = new THREE.Mesh(new THREE.CircleGeometry(0.22, 24), winMat);
    const a = (i / 4) * Math.PI * 2 + 0.4;
    w.position.set(Math.cos(a) * 1.68, 0, Math.sin(a) * 1.68);
    w.lookAt(w.position.clone().multiplyScalar(2).setY(0.4));
    dragon.add(w);
  }
  dragon.add(capsule, shield, trunk, nose);
  dragon.position.set(L.drag[0], SPACE_Y + L.drag[1], L.drag[2]);
  dragon.rotation.set(-0.3, 0.4, -0.6);
  group.add(dragon);
  pickables.push({ id: "capsule", object: dragon, focus: { pos: dragon.position.clone().add(new THREE.Vector3(-3, 2, 22)), target: dragon.position.clone() } });

  // Key light for the space objects (faded out lower down by main.js).
  const sun = new THREE.DirectionalLight(0xfff4e6, 3.4);
  sun.position.copy(SUN_SPACE).multiplyScalar(200).add(new THREE.Vector3(0, SPACE_Y, 0));
  sun.target.position.set(0, SPACE_Y, 0);
  group.add(sun, sun.target);

  // Environment for PBR objects in space: black sky, sun, blue earthshine from below.
  const envScene = new THREE.Scene();
  envScene.add(new THREE.Mesh(new THREE.SphereGeometry(10, 32, 16), new THREE.ShaderMaterial({
    side: THREE.BackSide, uniforms: { sunDir: { value: SUN_SPACE } },
    vertexShader: `varying vec3 vD; void main(){ vD = normalize(position); gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
    fragmentShader: `uniform vec3 sunDir; varying vec3 vD; void main(){
      vec3 c = mix(vec3(0.0), vec3(0.08,0.16,0.34), smoothstep(0.0, -0.6, vD.y));
      c += vec3(6.0,5.6,5.0) * pow(max(dot(vD, sunDir),0.), 400.);
      gl_FragColor = vec4(c,1.); }`,
  })));

  return {
    group, pickables, envScene, sun,
    galaxyTagAnchor: tagGalaxy ? tagGalaxy.c.clone().add(new THREE.Vector3(-tagGalaxy.s * 0.5, tagGalaxy.s * 0.75, 0)) : new THREE.Vector3(0, 1300, gz),
    // Earth dissolves into the sky as the camera descends, and is hidden in the closing overview;
    // stars and galaxies fade out below the upper atmosphere.
    setFade(earth, sky) { earthFade.value = earth; skyFade.value = sky; },
    setHaze(v) { haze.value = v; },
    // The regional Texas map arrives with the rest of the scene, after the opening frame.
    setTexas(tex, box) { texasMap.value = tex; texasBox.value.set(box.lon[0], box.lon[1], box.lat[0], box.lat[1]); texasOn.value = 1; },
    // pointer: smoothed cursor in [-1, 1] (x right, y down), or null on touch screens.
    update(t, pointer) {
      shared.shift.value = t * 0.0000018;
      pulseTime.value = t * 0.001;
      // Turn the array's face toward the cursor; drift gently without one.
      const px = pointer ? pointer.x : Math.sin(t * 0.00021) * 0.4, py = pointer ? pointer.y : Math.sin(t * 0.00017) * 0.3;
      pivot.rotation.y += (px * 0.42 - pivot.rotation.y) * 0.06;
      pivot.rotation.x += (py * 0.3 - pivot.rotation.x) * 0.06;
      pivot.position.y = SPACE_Y + L.iscr[1] + Math.sin(t * 0.0004) * 0.4;
      tele.rotation.z = -1.0 + Math.sin(t * 0.00015) * 0.05;
      dragon.rotation.y = 0.4 + t * 0.00003;
    },
  };
}
