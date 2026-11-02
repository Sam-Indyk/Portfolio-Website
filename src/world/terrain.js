// Real ground under the descent: USGS 3DEP elevation and USDA NAIP aerial imagery around the plaza
// (see tools/austin_terrain.py, which also paints the park around the plaza into the imagery), NASA's
// regional Texas map beyond it out to the haze, and lawn detail near the camera. The haze takes the
// sky's colour in each direction. Local frame: metres, +x north, +z east, plaza at the origin.
import * as THREE from "three";
import { pbr } from "../pbr.js";
import { SKY_GLSL } from "./sky.js";
import { RAMP } from "./loop.js";

const FLAT_R0 = 420, FLAT_R1 = 1200;   // the plaza's ground is level out to R0, real terrain from R1
const EXAGGERATION = 1.25;             // a little extra relief reads better from altitude at low sun
const EDGE = 2600;                     // last stretch of the elevation grid eases to a constant height
export const LAWN = { r0: 320, r1: 440, cz: -90 };   // the park around the plaza (as painted by the tool)

function sampler(dem, n, far) {
  // Bilinear lookup in the elevation grid (row 0 = north edge).
  return (x, z) => {
    const u = THREE.MathUtils.clamp((z - far.z[0]) / (far.z[1] - far.z[0]), 0, 1) * (n - 1);
    const v = THREE.MathUtils.clamp((far.x[1] - x) / (far.x[1] - far.x[0]), 0, 1) * (n - 1);
    const i = Math.min(n - 2, Math.floor(u)), j = Math.min(n - 2, Math.floor(v)), fu = u - i, fv = v - j;
    const a = dem[j * n + i], b = dem[j * n + i + 1], c = dem[(j + 1) * n + i], d = dem[(j + 1) * n + i + 1];
    return (a * (1 - fu) + b * fu) * (1 - fv) + (c * (1 - fu) + d * fu) * fv;
  };
}

// Grid coordinate in [-1, 1] -> metres, denser near the plaza (s = 0).
const warp = (s, lo, hi) => (s < 0 ? -lo : hi) * (0.07 * Math.abs(s) + 0.93 * Math.abs(s) ** 1.9);

export function buildTerrain({ textures, sky, isMobile, base = "/" }) {
  const meta = textures.austinMeta;
  const { far, dem: dm } = meta;
  const raw = new Uint16Array(textures.dem);
  const n = dm.size, dem = new Float32Array(raw.length);
  for (let i = 0; i < raw.length; i++) dem[i] = dm.min + raw[i] * dm.scale - dm.plaza;
  const h = sampler(dem, n, far);

  // Height the edges ease to, so the flat outer ground meets the grid without a step.
  let edgeSum = 0, edgeN = 0;
  for (let k = 0; k <= 64; k++) {
    const s = k / 64;
    for (const [x, z] of [[far.x[0], far.z[0] + s * (far.z[1] - far.z[0])], [far.x[1], far.z[0] + s * (far.z[1] - far.z[0])],
      [far.x[0] + s * (far.x[1] - far.x[0]), far.z[0]], [far.x[0] + s * (far.x[1] - far.x[0]), far.z[1]]]) { edgeSum += h(x, z); edgeN++; }
  }
  const edgeH = (edgeSum / edgeN) * EXAGGERATION;
  const height = (x, z) => {
    const r = Math.hypot(x, z);
    let y = h(x, z) * EXAGGERATION * THREE.MathUtils.smoothstep(r, FLAT_R0, FLAT_R1);
    const e = Math.min(x - far.x[0], far.x[1] - x, z - far.z[0], far.z[1] - z);
    return THREE.MathUtils.lerp(edgeH, y, THREE.MathUtils.smoothstep(e, 0, EDGE));
  };

  // ---------- the elevation grid ----------
  const G = isMobile ? 200 : 340;
  const pos = new Float32Array(G * G * 3);
  for (let j = 0; j < G; j++) for (let i = 0; i < G; i++) {
    const x = warp((j / (G - 1)) * 2 - 1, -far.x[0], far.x[1]);
    const z = warp((i / (G - 1)) * 2 - 1, -far.z[0], far.z[1]);
    pos.set([x, height(x, z), z], (j * G + i) * 3);
  }
  const idx = new Uint32Array((G - 1) * (G - 1) * 6);
  let k = 0;
  for (let j = 0; j < G - 1; j++) for (let i = 0; i < G - 1; i++) {
    const a = j * G + i, b = a + 1, c = a + G, d = c + 1;
    idx.set([a, b, c, b, d, c], k); k += 6;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  geo.setIndex(new THREE.BufferAttribute(idx, 1));
  geo.computeVertexNormals();

  // ---------- flat ground beyond it, out to the haze: four quads around the grid ----------
  const R = 160000, ring = [];
  for (const [x0, x1, z0, z1] of [[-R, far.x[0], -R, R], [far.x[1], R, -R, R], [far.x[0], far.x[1], -R, far.z[0]], [far.x[0], far.x[1], far.z[1], R]]) {
    ring.push(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2).scale(x1 - x0, 1, z1 - z0).translate((x0 + x1) / 2, edgeH, (z0 + z1) / 2));
  }

  // ---------- material: imagery by distance, lawn near the plaza, lit by the scene's sun ----------
  const grass = pbr("sparse_grass", 1, base);
  const lat0 = meta.plaza[0], lon0 = meta.plaza[1], [mLat, mLon] = meta.metresPerDeg;
  const uniforms = {
    nearMap: { value: textures.naipNear }, farMap: { value: textures.naipFar }, texasMap: { value: textures.texas }, grassMap: { value: grass.map },
    nearH: { value: meta.near }, farX: { value: new THREE.Vector2(...far.x) }, farZ: { value: new THREE.Vector2(...far.z) },
    texLat: { value: new THREE.Vector2(...meta.texas.lat) }, texLon: { value: new THREE.Vector2(...meta.texas.lon) },
    origin: { value: new THREE.Vector4(lat0, lon0, mLat, mLon) },
    lawn: { value: new THREE.Vector3(LAWN.r0, LAWN.r1, LAWN.cz) },
  };
  const mat = new THREE.MeshLambertMaterial({ color: 0xffffff });
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uniforms, sky.skyUniforms);
    sh.vertexShader = sh.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vTW;")
      .replace("#include <project_vertex>", "#include <project_vertex>\nvTW = (modelMatrix * vec4(transformed, 1.0)).xyz;");
    sh.fragmentShader = sh.fragmentShader
      .replace("#include <common>", `#include <common>
        ${SKY_GLSL}
        varying vec3 vTW;
        uniform sampler2D nearMap, farMap, texasMap, grassMap;
        uniform float nearH; uniform vec2 farX, farZ, texLat, texLon; uniform vec4 origin; uniform vec3 lawn;
        float box(vec2 p, vec2 lo, vec2 hi, float w) {
          vec2 e = min(p - lo, hi - p);
          return smoothstep(0.0, w, min(e.x, e.y));
        }`)
      .replace("#include <map_fragment>", `
        vec2 xz = vTW.xz;
        // The Loop's portal ramp cuts down through the lawn here (underground.js builds its walls).
        if (abs(xz.x - ${RAMP.x.toFixed(1)}) < ${RAMP.half.toFixed(2)} && xz.y > ${RAMP.portal.toFixed(1)} && xz.y < ${RAMP.top.toFixed(1)}) discard;
        // Imagery: u runs east (z), v runs north (x).
        vec2 lonlat = vec2(origin.y + xz.y / origin.w, origin.x + xz.x / origin.z);
        vec3 c = texture2D(texasMap, vec2((lonlat.x - texLon.x) / (texLon.y - texLon.x), (lonlat.y - texLat.x) / (texLat.y - texLat.x))).rgb;
        vec3 farC = texture2D(farMap, vec2((xz.y - farZ.x) / (farZ.y - farZ.x), (xz.x - farX.x) / (farX.y - farX.x))).rgb;
        c = mix(c, farC, box(xz.yx, vec2(farZ.x, farX.x), vec2(farZ.y, farX.y), 3000.0));
        vec3 nearC = texture2D(nearMap, (xz.yx + nearH) / (2.0 * nearH)).rgb;
        c = mix(c, nearC, box(xz, vec2(-nearH), vec2(nearH), 500.0));
        // Lawn detail where the camera is close: the source texture is dry and brownish, so keep its
        // detail but recolour it as a watered lawn (the painted park is this lawn's average colour).
        vec3 gr = texture2D(grassMap, xz * 0.31).rgb;
        float lum = dot(gr, vec3(0.3, 0.59, 0.11));
        gr = mix(gr, vec3(lum) * vec3(0.42, 0.78, 0.24) * 1.9, 0.75);
        float big = texture2D(grassMap, xz * 0.0041).g * 2.4 + texture2D(grassMap, xz * 0.00097 + 0.3).g * 1.6;
        gr *= mix(0.72, 1.12, clamp(big - 0.2, 0.0, 1.0)) * 1.9;
        float park = 1.0 - smoothstep(lawn.x - 60.0, lawn.x, length(xz - vec2(0.0, lawn.z)));
        c = mix(c, gr, park * (1.0 - smoothstep(150.0, 700.0, distance(vTW, cameraPosition))));
        diffuseColor.rgb *= c;`)
      .replace("#include <fog_fragment>", `
        #ifdef USE_FOG
          float fogF = smoothstep(fogNear, fogFar, distance(vTW, cameraPosition));
          gl_FragColor.rgb = mix(gl_FragColor.rgb, skyBase(normalize(vTW - cameraPosition)), fogF);
        #endif`);
  };
  for (const t of [textures.naipNear, textures.naipFar, textures.texas]) {
    t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
    t.anisotropy = 16;
  }

  const ground = new THREE.Mesh(geo, mat);
  ground.receiveShadow = true;
  const group = new THREE.Group();
  group.add(ground);
  for (const g of ring) group.add(new THREE.Mesh(g, mat));
  return { group, height, edgeH };
}
