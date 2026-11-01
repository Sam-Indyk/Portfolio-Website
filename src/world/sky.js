// The sky over Austin. A camera-centred dome shows the sunset photo where it has data and continues
// the photo's own colours everywhere else, so it never reads as a flat backdrop. The same colours
// are the haze that the ground and clouds fade into (skyBase below). A sea of cloud, drawn as its lit
// upper surface, is what the descent drops through (main.js whites out the screen inside it). Units
// are metres; the camera faces west (-z) and the sun sets ahead of it.
import * as THREE from "three";
import { cloudNoise } from "../textures.js";

export const DECK = { y0: 1950, y1: 2400, edgeZ: 3600 };   // cloud base, highest tops, western edge
const DIVE = [0, 5200];                                      // where the rail drops through the deck

// Colour of the clear sky at each pitch of the photo: the brighter half of every row, so dark cloud
// bases don't muddy it. Raw sRGB rows, bottom of the photo first.
function photoGradient(img) {
  const w = 192, h = 96;
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  const g = c.getContext("2d", { willReadFrequently: true });
  g.drawImage(img, 0, 0, w, h);
  const px = g.getImageData(0, 0, w, h).data;
  const rows = new Uint8Array(h * 4);
  for (let y = 0; y < h; y++) {
    const row = [];
    for (let x = Math.floor(w * 0.12); x < w * 0.88; x++) {
      const i = (y * w + x) * 4;
      row.push([px[i] * 0.3 + px[i + 1] * 0.59 + px[i + 2] * 0.11, px[i], px[i + 1], px[i + 2]]);
    }
    row.sort((a, b) => a[0] - b[0]);
    const band = row.slice(Math.floor(row.length * 0.4), Math.floor(row.length * 0.78));
    const o = (h - 1 - y) * 4;   // flip: row 0 = bottom of the photo
    for (let k = 0; k < 3; k++) rows[o + k] = band.reduce((s, p) => s + p[k + 1], 0) / band.length;
    rows[o + 3] = 255;
  }
  // Smooth across rows so individual clouds in the photo don't band the sky.
  const out = new Uint8Array(rows.length);
  for (let y = 0; y < h; y++) for (let k = 0; k < 4; k++) {
    let sum = 0, n = 0;
    for (let d = -4; d <= 4; d++) { const yy = Math.min(h - 1, Math.max(0, y + d)); sum += rows[yy * 4 + k]; n++; }
    out[y * 4 + k] = sum / n;
  }
  return out;
}

// Sky colour by direction without the photo's clouds; below the horizon it holds the horizon colour
// for that bearing. Display-space sRGB, like the photo, so fog and dome agree exactly.
export const SKY_GLSL = /* glsl */ `
  uniform sampler2D skyGrad; uniform vec3 skySun, skyZenith; uniform float skyP0, skyP1;
  vec3 skyBase(vec3 d) {
    float pitch = degrees(asin(clamp(d.y, 0.0, 1.0)));
    float v = (pitch - skyP0) / (skyP1 - skyP0);
    vec3 g = texture2D(skyGrad, vec2(0.5, clamp(v, 0.0, 1.0))).rgb;
    g = mix(g, skyZenith, smoothstep(1.0, 2.6, v));
    float s = max(dot(normalize(vec3(d.x, max(d.y, 0.0), d.z)), skySun), 0.0);
    return g + vec3(1.0, 0.62, 0.34) * (pow(s, 5.0) * 0.16 + pow(s, 60.0) * 0.3);
  }`;

const domeVert = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vDir = position;
    vec4 p = projectionMatrix * vec4(mat3(viewMatrix) * position, 1.0);
    gl_Position = p.xyww;   // always on the far plane, centred on the camera
  }`;
const domeFrag = /* glsl */ `
  ${SKY_GLSL}
  uniform sampler2D photo; uniform float clear, yawSpan;
  varying vec3 vDir;
  void main() {
    vec3 d = normalize(vDir);
    float pitch = degrees(asin(clamp(d.y, -1.0, 1.0)));
    vec2 uv = vec2(degrees(atan(d.x, -d.z)) / yawSpan + 0.5, (pitch - skyP0) / (skyP1 - skyP0));
    vec3 ph = texture2D(photo, uv).rgb;
    // The photo's bottom rows hold distant land; from altitude the terrain is the land, so only its sky is used.
    float inside = smoothstep(0.0, 0.1, uv.x) * smoothstep(1.0, 0.9, uv.x) * smoothstep(1.0, 0.7, uv.y) * smoothstep(0.05, 0.1, uv.y);
    vec3 col = mix(skyBase(d), ph, inside * (1.0 - clear));
    // Above the cloud deck there are no photo clouds, but the sun is still there.
    float s = max(dot(d, skySun), 0.0);
    col += clear * vec3(1.0, 0.86, 0.66) * (pow(s, 9000.0) * 5.0 + pow(s, 1200.0) * 0.45);
    gl_FragColor = vec4(col, 1.0);
  }`;

// The cloud sea's upper surface: coverage from two octaves of noise lifts puffs above the base; holes
// fall below it and fade out. Shared by the vertex (shape) and fragment (light) shaders.
const DECK_GLSL = /* glsl */ `
  uniform sampler2D noise; uniform float time, edgeZ, y0, y1; uniform vec2 dive;
  const float TH = 0.35, K = 430.0;
  // lod > 0 blurs the finer octave, for the mesh: its grid is too coarse far out for full detail.
  float coverage(vec2 p, out vec2 grad, float lod) {
    vec4 A = textureLod(noise, p * 0.00009 + vec2(time * 0.0012, 0.0), 0.0);
    vec4 B = textureLod(noise, p * 0.00041 + vec2(0.31, 0.67) + vec2(time * 0.0025, 0.0), lod);
    float c = A.r * 0.55 + B.r * 0.45;
    // Slope per metre from the baked gradients (texel sizes 43 m and 9.5 m).
    grad = (A.gb - 0.5) / 12.0 / 43.4 * 0.55 + (B.gb - 0.5) / 12.0 / 9.53 * 0.45;
    // The deck breaks up toward the west, along a ragged edge; one big cloud where the rail dives in.
    float e = smoothstep(edgeZ - 1800.0, edgeZ + 1800.0, p.y + (B.a - 0.5) * 3000.0);
    c = mix(c - 0.45, c, e);
    c += 0.16 * exp(-dot(p - dive, p - dive) / (2.0 * 2400.0 * 2400.0));
    return c;
  }
  // Rounded domes: the rise eases off toward the top, as cumulus tops flatten.
  float topY(float c) { float u = c - TH; return y0 + (u < 0.0 ? u * 900.0 : K * (1.0 - exp(-u * 4.0)) / 4.0 * 4.0); }`;
const deckVert = /* glsl */ `
  ${DECK_GLSL}
  varying vec3 vW;
  void main() {
    vec4 w = modelMatrix * vec4(position, 1.0);
    vec2 g;
    w.y = max(topY(coverage(w.xz, g, clamp(log2(1.0 + distance(w.xz, dive) / 1500.0) * 1.6, 0.0, 4.0))), y0 - 200.0);
    vW = w.xyz;
    gl_Position = projectionMatrix * viewMatrix * w;
  }`;
const deckFrag = /* glsl */ `
  ${SKY_GLSL}
  ${DECK_GLSL}
  uniform vec3 lit, shade; uniform float fogNear, fogFar, fade;
  varying vec3 vW;
  void main() {
    vec2 g;
    float c = coverage(vW.xz, g, 0.0);
    float a = smoothstep(TH - 0.03, TH + 0.07, c) * fade;
    if (a < 0.01) discard;
    float u = max(c - TH, 0.0), slope = K * exp(-u * 4.0);
    // Cauliflower: two finer octaves of puffs on the big shapes.
    float e = 1.0 / 256.0;
    vec2 q1 = vW.xz * 0.0021 + vec2(0.71, 0.13), q2 = vW.xz * 0.0067 + vec2(0.17, 0.53);
    float a1 = texture2D(noise, q1).a, a2 = texture2D(noise, q2).a;
    vec2 dg = vec2(texture2D(noise, q1 + vec2(e, 0.0)).a - a1, texture2D(noise, q1 + vec2(0.0, e)).a - a1) * 1.1
            + vec2(texture2D(noise, q2 + vec2(e, 0.0)).a - a2, texture2D(noise, q2 + vec2(0.0, e)).a - a2) * 0.7;
    vec3 n = normalize(vec3(-(g.x * slope + dg.x), 1.0, -(g.y * slope + dg.y)));
    // Long shadows from taller puffs between here and the low sun.
    vec2 sd = normalize(skySun.xz);
    float rise = skySun.y / length(skySun.xz), shadow = 1.0;
    for (int i = 1; i <= 3; i++) {
      float dist = float(i * i) * 260.0;
      vec2 gg;
      float h2 = topY(coverage(vW.xz + sd * dist, gg, 1.0));
      shadow *= 1.0 - 0.55 * smoothstep(-10.0, 90.0, h2 - (vW.y + dist * rise));
    }
    // Cloud scatters light all through itself: soft wrap, and shade is only somewhat darker.
    float wrap = clamp((dot(n, skySun) + 0.5) / 1.5, 0.0, 1.0);
    float height = smoothstep(y0 - 100.0, y0 + K * 0.7, vW.y);
    vec3 col = mix(shade, lit, wrap * mix(0.55, 1.0, shadow) * mix(0.8, 1.0, height));
    col *= 0.94 + a1 * 0.12;
    // Thin edges glow when looking toward the sun.
    vec3 view = normalize(vW - cameraPosition);
    float back = pow(max(dot(view, skySun), 0.0), 5.0);
    col += vec3(1.0, 0.7, 0.42) * back * (1.0 - smoothstep(TH, TH + 0.14, c)) * 0.9;
    col += vec3(1.0, 0.76, 0.5) * back * pow(1.0 - max(dot(n, -view), 0.0), 3.0) * 0.5;   // rims glow, backlit
    col = mix(col, skyBase(view), smoothstep(fogNear, fogFar, distance(vW, cameraPosition)));
    gl_FragColor = vec4(col, a);
  }`;

export function buildSky({ textures, isMobile }) {
  const group = new THREE.Group();
  const bm = textures.backdropMeta;
  const yaw = THREE.MathUtils.degToRad((bm.sun.x - 0.5) * bm.yaw_span), pitch = THREE.MathUtils.degToRad(bm.sun.pitch_deg);
  const sunDir = new THREE.Vector3(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch));

  const rows = photoGradient(textures.backdrop.image);
  const grad = new THREE.DataTexture(rows, 1, rows.length / 4);
  grad.magFilter = grad.minFilter = THREE.LinearFilter;
  grad.needsUpdate = true;
  // Shared by every shader that fades into the sky (see SKY_GLSL).
  const skyUniforms = {
    skyGrad: { value: grad }, skySun: { value: sunDir }, skyZenith: { value: new THREE.Vector3(0.2, 0.33, 0.56) },
    skyP0: { value: bm.pitch[0] }, skyP1: { value: bm.pitch[1] },
  };
  const hr = Math.round(((0.6 - bm.pitch[0]) / (bm.pitch[1] - bm.pitch[0])) * (rows.length / 4 - 1)) * 4;

  // ---------- dome ----------
  const clear = { value: 0 };
  const dome = new THREE.Mesh(new THREE.SphereGeometry(1, 64, 32), new THREE.ShaderMaterial({
    vertexShader: domeVert, fragmentShader: domeFrag, side: THREE.BackSide, depthWrite: false, toneMapped: false,
    uniforms: { ...skyUniforms, photo: { value: textures.backdrop }, clear, yawSpan: { value: bm.yaw_span } },
  }));
  dome.frustumCulled = false;
  dome.renderOrder = -100;
  group.add(dome);

  // ---------- cloud sea: a grid, densest where the rail dives through, shaped in the vertex shader ----------
  const deckU = {
    ...skyUniforms, noise: { value: cloudNoise(256) }, time: { value: 0 }, edgeZ: { value: DECK.edgeZ },
    y0: { value: DECK.y0 }, y1: { value: DECK.y1 }, dive: { value: new THREE.Vector2(...DIVE) }, fade: { value: 1 },
    lit: { value: new THREE.Vector3(1.0, 0.85, 0.68) }, shade: { value: new THREE.Vector3(0.56, 0.55, 0.67) },
    fogNear: { value: 5000 }, fogFar: { value: 40000 },
  };
  const G = isMobile ? 200 : 320, X = 30000, Z0 = DIVE[1] - (DECK.edgeZ - 5000), Z1 = DECK.edgeZ + 40000 - DIVE[1];
  const warp = (s, lo, hi) => Math.sign(s) * (s < 0 ? lo : hi) * (0.06 * Math.abs(s) + 0.94 * Math.abs(s) ** 2);
  const pos = new Float32Array(G * G * 3);
  for (let j = 0; j < G; j++) for (let i = 0; i < G; i++) {
    pos.set([warp((i / (G - 1)) * 2 - 1, X, X) + DIVE[0], 0, warp((j / (G - 1)) * 2 - 1, Z0, Z1) + DIVE[1]], (j * G + i) * 3);
  }
  const idx = new Uint32Array((G - 1) * (G - 1) * 6);
  let k = 0;
  for (let j = 0; j < G - 1; j++) for (let i = 0; i < G - 1; i++) {
    const a = j * G + i;
    idx.set([a, a + G, a + 1, a + 1, a + G, a + G + 1], k); k += 6;
  }
  const deckGeo = new THREE.BufferGeometry();
  deckGeo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  deckGeo.setIndex(new THREE.BufferAttribute(idx, 1));
  const deck = new THREE.Mesh(deckGeo, new THREE.ShaderMaterial({
    vertexShader: deckVert, fragmentShader: deckFrag, uniforms: deckU, transparent: true, toneMapped: false,
  }));
  deck.frustumCulled = false;
  deck.renderOrder = 10;
  group.add(deck);

  return {
    group, sunDir, skyUniforms,
    // Display-space haze colour for materials that use the scene's plain fog.
    horizon: new THREE.Color().setRGB(rows[hr] / 255, rows[hr + 1] / 255, rows[hr + 2] / 255, THREE.SRGBColorSpace),
    setClear(v) { clear.value = v; },
    setDeckFade(v) { deckU.fade.value = v; deck.visible = v > 0.001; },
    // How deep inside cloud a point is (0 outside, 1 well inside), for the mist veil in main.js.
    mistAt(p) {
      const d = Math.hypot(p.x - DIVE[0], p.z - DIVE[1]);
      return Math.exp(-(d * d) / (2 * 2200 * 2200)) * THREE.MathUtils.smoothstep(p.y, DECK.y0 - 80, DECK.y0 + 120)
        * (1 - THREE.MathUtils.smoothstep(p.y, DECK.y1 - 150, DECK.y1 + 80));
    },
    update(t) { deckU.time.value = t * 0.001; },
  };
}
