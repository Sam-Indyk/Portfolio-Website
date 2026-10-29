// Orbit stage: Earth from 408 km, the ISCR array, a telescope, a Crew Dragon, and a sky of real galaxies.
import * as THREE from "three";
import { solarCells, foilMaps, glowMap } from "../textures.js";

export const R = 100;                     // Earth radius in scene units (1 unit ≈ 64 km)
export const ALT = R * (408 / 6371);      // ISS altitude
const EYE_Y = R + ALT;

// Sun just above the eastern limb (the horizon dips ~20° at this altitude).
export const SUN_DIR = new THREE.Vector3(0.18, Math.sin(THREE.MathUtils.degToRad(-16)), -1).normalize();
// Direction of the galaxy field (up and behind-left of the opening view).
const GALAXY_DIR = new THREE.Vector3(-0.35, 0.82, 0.45).normalize();

// Rotate the textured globe so Washington, D.C. is directly below the camera with east ahead (-z).
function orientOverDC(mesh) {
  const lat = THREE.MathUtils.degToRad(38.9), lon = THREE.MathUtils.degToRad(-77.04);
  const phi = lon + Math.PI, theta = Math.PI / 2 - lat;
  const up = new THREE.Vector3(-Math.cos(phi) * Math.sin(theta), Math.cos(theta), Math.sin(phi) * Math.sin(theta));
  const east = new THREE.Vector3(Math.sin(phi), 0, Math.cos(phi)).normalize();
  const src = new THREE.Matrix4().makeBasis(east, up, new THREE.Vector3().crossVectors(east, up));
  const dst = new THREE.Matrix4().makeBasis(new THREE.Vector3(0, 0, -1), new THREE.Vector3(0, 1, 0), new THREE.Vector3(1, 0, 0));
  mesh.quaternion.setFromRotationMatrix(dst.multiply(src.transpose()));
}

const earthVert = /* glsl */ `
  varying vec2 vUv; varying vec3 vN; varying vec3 vW;
  void main() {
    vUv = uv;
    vN = normalize(mat3(modelMatrix) * normal);
    vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz;
    gl_Position = projectionMatrix * viewMatrix * w;
  }`;
const earthFrag = /* glsl */ `
  uniform sampler2D dayMap, nightMap, specMap, cloudMap;
  uniform vec3 sunDir; uniform float cloudShift;
  varying vec2 vUv; varying vec3 vN; varying vec3 vW;
  void main() {
    vec3 n = normalize(vN), v = normalize(cameraPosition - vW);
    float ndl = dot(n, sunDir);
    vec3 day = texture2D(dayMap, vUv).rgb;
    vec3 night = texture2D(nightMap, vUv).rgb;
    float ocean = texture2D(specMap, vUv).r;
    float cloudShadow = texture2D(cloudMap, vUv + vec2(cloudShift - 0.0015, 0.0)).r;
    float lit = smoothstep(-0.08, 0.35, ndl);
    vec3 dayCol = day * (0.06 + 1.35 * max(ndl, 0.0)) * (1.0 - 0.45 * cloudShadow);
    vec3 nightCol = pow(night, vec3(1.6)) * vec3(1.6, 1.15, 0.7) * (1.0 - smoothstep(-0.25, 0.05, ndl));
    vec3 col = dayCol * lit + nightCol;
    // Sun glint on water.
    vec3 h = normalize(sunDir + v);
    col += vec3(1.0, 0.86, 0.66) * pow(max(dot(n, h), 0.0), 90.0) * ocean * lit * 1.4;
    // Rayleigh-ish haze toward the limb: blue on the day side, a thin warm band at the terminator.
    float fres = pow(1.0 - max(dot(n, v), 0.0), 4.0);
    float term = exp(-pow((ndl - 0.02) / 0.09, 2.0));
    vec3 haze = mix(vec3(0.28, 0.5, 0.95), vec3(1.0, 0.5, 0.22), term * 0.8);
    col = mix(col, col * 0.6 + haze * 0.55 * smoothstep(-0.15, 0.25, ndl), fres * 0.85);
    gl_FragColor = vec4(col, 1.0);
  }`;

const cloudFrag = /* glsl */ `
  uniform sampler2D cloudMap; uniform vec3 sunDir; uniform float cloudShift;
  varying vec2 vUv; varying vec3 vN; varying vec3 vW;
  void main() {
    vec3 n = normalize(vN);
    float c = texture2D(cloudMap, vUv + vec2(cloudShift, 0.0)).r;
    float ndl = dot(n, sunDir);
    float lit = smoothstep(-0.12, 0.3, ndl);
    vec3 col = mix(vec3(1.0, 0.62, 0.42), vec3(1.0), smoothstep(0.0, 0.35, ndl)) * (0.03 + 1.1 * lit);
    gl_FragColor = vec4(col, c * 0.92);
  }`;

const atmoFrag = /* glsl */ `
  uniform vec3 sunDir; varying vec3 vN; varying vec3 vW;
  void main() {
    vec3 n = normalize(vN), v = normalize(cameraPosition - vW);
    float rim = pow(1.0 - abs(dot(n, v)), 5.0);
    float facing = dot(n, sunDir);
    float light = smoothstep(-0.28, 0.2, facing);
    float term = exp(-pow((facing - 0.0) / 0.12, 2.0));
    vec3 col = mix(vec3(0.3, 0.56, 1.0), vec3(1.0, 0.48, 0.18), term * 0.75);
    gl_FragColor = vec4(col * rim * light * 1.15, 1.0);
  }`;

const galaxyVert = /* glsl */ `
  attribute vec3 center; attribute float size; attribute vec2 cell; attribute float bright;
  uniform float grid; uniform float hover;
  varying vec2 vUv; varying float vB;
  void main() {
    vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
    vec3 up = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
    vec3 p = center + (right * position.x + up * position.y) * size;
    vUv = (cell + uv) / grid; vUv.y = 1.0 - vUv.y;
    vB = bright;
    gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
  }`;
const galaxyFrag = /* glsl */ `
  uniform sampler2D atlas; uniform float opacity;
  varying vec2 vUv; varying float vB;
  void main() { gl_FragColor = vec4(texture2D(atlas, vUv).rgb * vB * opacity, 1.0); }`;

export function buildSpace({ textures, galaxyMeta, isMobile }) {
  const group = new THREE.Group();
  const pickables = [];
  const res = isMobile ? "2k" : "4k";

  // ---------- Earth ----------
  const seg = isMobile ? 96 : 192;
  const shared = { sunDir: { value: SUN_DIR }, cloudShift: { value: 0 } };
  const earth = new THREE.Mesh(
    new THREE.SphereGeometry(R, seg, seg / 2),
    new THREE.ShaderMaterial({
      vertexShader: earthVert, fragmentShader: earthFrag,
      uniforms: { ...shared, dayMap: { value: textures[`day-${res}`] }, nightMap: { value: textures[`night-${res}`] }, specMap: { value: textures["specular-2k"] }, cloudMap: { value: textures[`clouds-${res}`] } },
    })
  );
  orientOverDC(earth);
  const clouds = new THREE.Mesh(
    new THREE.SphereGeometry(R * 1.004, seg, seg / 2),
    new THREE.ShaderMaterial({ vertexShader: earthVert, fragmentShader: cloudFrag, transparent: true, depthWrite: false, uniforms: { ...shared, cloudMap: { value: textures[`clouds-${res}`] } } })
  );
  clouds.quaternion.copy(earth.quaternion);
  const atmo = new THREE.Mesh(
    new THREE.SphereGeometry(R * 1.011, seg, seg / 2),
    new THREE.ShaderMaterial({ vertexShader: earthVert, fragmentShader: atmoFrag, side: THREE.BackSide, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, uniforms: shared })
  );
  group.add(earth, clouds, atmo);

  // ---------- stars ----------
  const N = isMobile ? 2500 : 7000;
  const sp = new Float32Array(N * 3), sc = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) {
    const v = new THREE.Vector3().randomDirection().multiplyScalar(4000);
    sp.set([v.x, v.y, v.z], i * 3);
    const t = Math.random(), b = 0.35 + Math.pow(Math.random(), 3) * 0.9;
    sc.set([b * (0.85 + t * 0.15), b * (0.88 + t * 0.1), b], i * 3);
  }
  const sg = new THREE.BufferGeometry();
  sg.setAttribute("position", new THREE.BufferAttribute(sp, 3));
  sg.setAttribute("color", new THREE.BufferAttribute(sc, 3));
  const stars = new THREE.Points(sg, new THREE.PointsMaterial({ size: 1.6, sizeAttenuation: false, vertexColors: true, depthWrite: false }));
  group.add(stars);

  // ---------- sun ----------
  const sun = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowMap("rgba(255,244,225,1)"), color: 0xfff2dd, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
  sun.position.copy(SUN_DIR).multiplyScalar(3000);
  sun.scale.setScalar(260);
  const sunCore = sun.clone(); sunCore.material = sun.material.clone(); sunCore.material.color.setRGB(6, 5.6, 5); sunCore.scale.setScalar(60);
  group.add(sun, sunCore);

  const sunLight = new THREE.DirectionalLight(0xfff4e6, 3.2);
  sunLight.position.copy(SUN_DIR).multiplyScalar(50);
  const earthshine = new THREE.HemisphereLight(0x0b1220, 0x223a66, 0.35);
  group.add(sunLight, sunLight.target, earthshine);

  // ---------- galaxies (real Galaxy Zoo 2 cutouts) ----------
  const G = galaxyMeta.count;
  const quad = new THREE.PlaneGeometry(1, 1);
  const gg = new THREE.InstancedBufferGeometry();
  gg.index = quad.index;
  gg.setAttribute("position", quad.getAttribute("position"));
  gg.setAttribute("uv", quad.getAttribute("uv"));
  const centers = new Float32Array(G * 3), sizes = new Float32Array(G), cells = new Float32Array(G * 2), bright = new Float32Array(G);
  const tangent = new THREE.Vector3(0, 1, 0).cross(GALAXY_DIR).normalize();
  const bitan = new THREE.Vector3().crossVectors(GALAXY_DIR, tangent);
  const galaxies = [];
  let seed = 42;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < G; i++) {
    // Spread over a ~40° cap, denser toward the middle.
    const r = Math.sqrt(rnd()) * 0.72, a = rnd() * Math.PI * 2;
    const dir = GALAXY_DIR.clone().addScaledVector(tangent, Math.cos(a) * r).addScaledVector(bitan, Math.sin(a) * r).normalize();
    const dist = 2200 + rnd() * 600;
    const c = dir.multiplyScalar(dist).add(new THREE.Vector3(0, EYE_Y, 0));
    centers.set([c.x, c.y, c.z], i * 3);
    sizes[i] = 46 + Math.pow(rnd(), 2) * 110;
    cells.set([i % galaxyMeta.grid, Math.floor(i / galaxyMeta.grid)], i * 2);
    bright[i] = 0.85 + rnd() * 0.5;
    galaxies.push({ index: i, center: c, size: sizes[i] });
  }
  gg.setAttribute("center", new THREE.InstancedBufferAttribute(centers, 3));
  gg.setAttribute("size", new THREE.InstancedBufferAttribute(sizes, 1));
  gg.setAttribute("cell", new THREE.InstancedBufferAttribute(cells, 2));
  gg.setAttribute("bright", new THREE.InstancedBufferAttribute(bright, 1));
  gg.instanceCount = G;
  const galaxyMat = new THREE.ShaderMaterial({
    vertexShader: galaxyVert, fragmentShader: galaxyFrag,
    uniforms: { atlas: { value: textures.galaxies }, grid: { value: galaxyMeta.grid }, opacity: { value: 1 } },
    blending: THREE.AdditiveBlending, transparent: true, depthWrite: false,
  });
  const galaxyMesh = new THREE.Mesh(gg, galaxyMat);
  galaxyMesh.frustumCulled = false;
  group.add(galaxyMesh);
  for (const g of galaxies) {
    pickables.push({ id: "galaxy", galaxy: g.index, stage: "space", sphere: new THREE.Sphere(g.center, g.size * 0.42), label: "Galaxy · decompose", focusDir: g.center });
  }

  // ---------- ISCR satellite: a large array of solar/compute/radiator panels ----------
  const iscr = new THREE.Group();
  const cols = isMobile ? 16 : 22, rows = isMobile ? 6 : 8, pw = 0.17, gap = 0.006;
  const cellsTex = solarCells(6);
  const radiator = new THREE.MeshStandardMaterial({ color: 0xeeeeea, metalness: 0.0, roughness: 0.55 });   // white-painted radiator
  const edge = new THREE.MeshStandardMaterial({ color: 0xb8bcc2, metalness: 0.85, roughness: 0.35 });
  const top = new THREE.MeshPhysicalMaterial({ map: cellsTex, metalness: 0.2, roughness: 0.42, clearcoat: 1, clearcoatRoughness: 0.08, color: 0x9fb6ff, envMapIntensity: 0.5 });
  // BoxGeometry face order: +x, -x, +y, -y, +z, -z
  const panels = new THREE.InstancedMesh(new THREE.BoxGeometry(pw, 0.008, pw), [edge, edge, top, radiator, edge, edge], cols * rows);
  const m = new THREE.Matrix4();
  let k = 0;
  for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
    m.makeTranslation((x - cols / 2 + 0.5) * (pw + gap), 0, (y - rows / 2 + 0.5) * (pw + gap));
    panels.setMatrixAt(k++, m);
  }
  iscr.add(panels);
  const spine = new THREE.Mesh(new THREE.BoxGeometry(cols * (pw + gap) + 0.1, 0.02, 0.02), edge);
  spine.position.y = -0.03;
  const { map: foil, normalMap: foilN } = foilMaps([214, 176, 92]);
  const bus = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.14, 0.22), new THREE.MeshStandardMaterial({ map: foil, normalMap: foilN, metalness: 1, roughness: 0.32 }));
  bus.position.y = -0.11;
  iscr.add(spine, bus);
  // Behind the opening view, cells turned to the rising sun: turning around reveals the lit face.
  iscr.position.set(2.6, EYE_Y + 0.75, 6.4);
  iscr.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), SUN_DIR);
  iscr.rotateY(0.5);
  group.add(iscr);
  pickables.push({ id: "iscr", stage: "space", object: iscr, focus: { pos: new THREE.Vector3(1.3, EYE_Y + 0.55, 3.6), target: iscr.position.clone() } });

  // ---------- space telescope (Deblurring) ----------
  const tele = new THREE.Group();
  const { map: silver, normalMap: silverN } = foilMaps([226, 228, 232]);
  const tubeMat = new THREE.MeshStandardMaterial({ map: silver, normalMap: silverN, metalness: 1, roughness: 0.28 });
  const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.62, 48, 1, true), tubeMat);
  const aft = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.36, 48), tubeMat);
  aft.position.y = -0.48;
  const inside = new THREE.Mesh(new THREE.CircleGeometry(0.155, 48), new THREE.MeshStandardMaterial({ color: 0x050505, roughness: 1 }));
  inside.rotation.x = -Math.PI / 2; inside.position.y = 0.2;
  const door = new THREE.Mesh(new THREE.CircleGeometry(0.165, 48), tubeMat);
  door.position.set(0, 0.31, -0.16); door.rotation.x = -0.5;
  const wingMat = new THREE.MeshStandardMaterial({ map: solarCells(10), metalness: 0.5, roughness: 0.3, side: THREE.DoubleSide });
  for (const s of [-1, 1]) {
    const wing = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.7), wingMat);
    wing.position.set(s * 0.36, -0.22, 0); wing.rotation.y = Math.PI / 2 * 0.15;
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.22), edge);
    arm.rotation.z = Math.PI / 2; arm.position.set(s * 0.2, -0.22, 0);
    tele.add(wing, arm);
  }
  tele.add(tube, aft, inside, door);
  tele.position.set(-2.7, EYE_Y + 0.55, 1.2);
  tele.rotation.set(0.35, 0.6, 0.55);
  group.add(tele);
  pickables.push({ id: "telescope", stage: "space", object: tele, focus: { pos: new THREE.Vector3(-1.5, EYE_Y + 0.8, 2.1), target: tele.position.clone() } });

  // ---------- Crew Dragon (Torchlight / Inspiration4) ----------
  const dragon = new THREE.Group();
  const prof = [[0, -0.22], [0.2, -0.22], [0.215, -0.2], [0.2, -0.17], [0.12, 0.13], [0.07, 0.19], [0, 0.2]].map(([x, y]) => new THREE.Vector2(x, y));
  const white = new THREE.MeshStandardMaterial({ color: 0xf1f1ee, metalness: 0.05, roughness: 0.45 });
  const capsule = new THREE.Mesh(new THREE.LatheGeometry(prof, 64), white);
  const shield = new THREE.Mesh(new THREE.CircleGeometry(0.2, 64), new THREE.MeshStandardMaterial({ color: 0x1b1a19, roughness: 0.9 }));
  shield.rotation.x = Math.PI / 2; shield.position.y = -0.221;
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.26, 64, 1, true), new THREE.MeshStandardMaterial({ map: solarCells(14), metalness: 0.4, roughness: 0.35, side: THREE.DoubleSide }));
  trunk.position.y = -0.36;
  const nose = new THREE.Mesh(new THREE.SphereGeometry(0.07, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2), white);
  nose.position.set(0.05, 0.2, 0); nose.rotation.z = -1.1;
  const winMat = new THREE.MeshStandardMaterial({ color: 0x0a0d12, metalness: 0.9, roughness: 0.1 });
  for (let i = 0; i < 4; i++) {
    const w = new THREE.Mesh(new THREE.CircleGeometry(0.022, 24), winMat);
    const a = (i / 4) * Math.PI * 2 + 0.4;
    w.position.set(Math.cos(a) * 0.168, 0.0, Math.sin(a) * 0.168);
    w.lookAt(w.position.clone().multiplyScalar(2).setY(0.04));
    dragon.add(w);
  }
  dragon.add(capsule, shield, trunk, nose);
  dragon.position.set(-0.9, EYE_Y - 0.2, 4.4);
  dragon.rotation.set(-0.4, 0.3, -0.9);
  group.add(dragon);
  pickables.push({ id: "capsule", stage: "space", object: dragon, focus: { pos: new THREE.Vector3(-0.45, EYE_Y + 0.05, 3.3), target: dragon.position.clone() } });

  // Environment for PBR objects: black sky, sun, blue earthshine from below.
  const envScene = new THREE.Scene();
  const envSphere = new THREE.Mesh(new THREE.SphereGeometry(10, 32, 16), new THREE.ShaderMaterial({
    side: THREE.BackSide,
    uniforms: { sunDir: { value: SUN_DIR } },
    vertexShader: `varying vec3 vD; void main(){ vD = normalize(position); gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
    fragmentShader: `uniform vec3 sunDir; varying vec3 vD; void main(){
      float down = smoothstep(0.0, -0.6, vD.y);
      vec3 c = mix(vec3(0.0), vec3(0.05,0.11,0.24), down);
      c += vec3(6.0,5.6,5.0) * pow(max(dot(vD, sunDir),0.), 400.);
      c += vec3(0.5,0.35,0.2) * pow(max(dot(vD, sunDir),0.), 8.) * 0.25;
      gl_FragColor = vec4(c,1.); }`,
  }));
  envScene.add(envSphere);

  return {
    group, pickables, envScene, galaxyMat, eyeY: EYE_Y, galaxyDir: GALAXY_DIR,
    update(t) {
      shared.cloudShift.value = t * 0.0000025;
      iscr.position.y = EYE_Y + 0.75 + Math.sin(t * 0.00025) * 0.03;
      tele.rotation.z = 0.55 + t * 0.000012;
      dragon.rotation.y = 0.3 + t * 0.00002;
    },
  };
}
