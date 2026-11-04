// Real ground under the descent: USGS 3DEP elevation and USDA NAIP aerial imagery at three scales
// around the plaza, on Zilker Park's Great Lawn (see tools/austin_terrain.py), and NASA's regional Texas
// map beyond it out to the haze. Close to the camera, wherever NAIP's near-infrared band says the
// ground is vegetated, fine lawn detail is worked into the imagery's own colour; Lady Bird Lake
// reflects the sky. The haze takes the sky's colour in each direction. Local frame: metres, +x north,
// +z east, plaza at the origin.
import * as THREE from "three";
import { pbr } from "../pbr.js";
import { SKY_GLSL } from "./sky.js";
import { RAMP } from "./loop.js";
import { SLAB_W } from "./surface.js";

const FLAT_R0 = 420, FLAT_R1 = 1200;   // the plaza's ground is level out to R0, real terrain from R1
const EXAGGERATION = 1.25;             // a little extra relief reads better from altitude at low sun
const EDGE = 2600;                     // last stretch of the elevation grid eases to a constant height

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

  // ---------- material: imagery by distance, lawn detail and water up close, lit by the scene's sun ----------
  const grass = pbr("sparse_grass", 1, base);
  const lat0 = meta.plaza[0], lon0 = meta.plaza[1], [mLat, mLon] = meta.metresPerDeg;
  const uniforms = {
    nearMap: { value: textures.naipNear }, farMap: { value: textures.naipFar }, plazaMap: { value: textures.naipPlaza }, texasMap: { value: textures.texas },
    maskNear: { value: textures.maskNear }, maskFar: { value: textures.maskFar }, grassMap: { value: grass.map },
    nearH: { value: meta.near }, plazaH: { value: meta.plazaHalf }, farX: { value: new THREE.Vector2(...far.x) }, farZ: { value: new THREE.Vector2(...far.z) },
    texLat: { value: new THREE.Vector2(...meta.texas.lat) }, texLon: { value: new THREE.Vector2(...meta.texas.lon) },
    origin: { value: new THREE.Vector4(lat0, lon0, mLat, mLon) },
    cutZ: { value: 1e5 },
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
        uniform sampler2D nearMap, farMap, plazaMap, texasMap, maskNear, maskFar, grassMap;
        uniform float nearH, plazaH, cutZ; uniform vec2 farX, farZ, texLat, texLon; uniform vec4 origin;
        float box(vec2 p, vec2 lo, vec2 hi, float w) {
          vec2 e = min(p - lo, hi - p);
          return smoothstep(0.0, w, min(e.x, e.y));
        }
        float hash2(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float vnoise(vec2 p) {
          vec2 i = floor(p), f = fract(p);
          f = f * f * (3.0 - 2.0 * f);
          return mix(mix(hash2(i), hash2(i + vec2(1.0, 0.0)), f.x), mix(hash2(i + vec2(0.0, 1.0)), hash2(i + vec2(1.0, 1.0)), f.x), f.y);
        }
        // A tiling texture without visible repeats (after Inigo Quilez): patches of a few tiles each
        // take their own random offset into it, blended across patch boundaries.
        vec3 noTile(sampler2D t, vec2 uv) {
          float k = vnoise(uv * 0.35) * 8.0, f = fract(k), i = floor(k);
          vec2 dx = dFdx(uv), dy = dFdy(uv);
          vec3 a = textureGrad(t, uv + sin(vec2(3.0, 7.0) * i), dx, dy).rgb;
          vec3 b = textureGrad(t, uv + sin(vec2(3.0, 7.0) * (i + 1.0)), dx, dy).rgb;
          return mix(a, b, smoothstep(0.2, 0.8, f - 0.1 * dot(a - b, vec3(1.0))));
        }`)
      .replace("#include <map_fragment>", `
        vec2 xz = vTW.xz;
        // The Loop's portal ramp cuts down through the lawn here (underground.js builds its walls).
        if (xz.x > ${RAMP.x0.toFixed(1)} && xz.x < ${RAMP.x1.toFixed(1)} && xz.y > ${RAMP.z0.toFixed(1)} && xz.y < ${RAMP.z1.toFixed(1)}) discard;
        // The cross-section: going below ground, the ground in front of the cut face is taken away.
        if (xz.y > cutZ && abs(xz.x) < ${(SLAB_W / 2).toFixed(1)}) discard;
        // Imagery: u runs east (z), v runs north (x).
        vec2 lonlat = vec2(origin.y + xz.y / origin.w, origin.x + xz.x / origin.z);
        vec3 c = texture2D(texasMap, vec2((lonlat.x - texLon.x) / (texLon.y - texLon.x), (lonlat.y - texLat.x) / (texLat.y - texLat.x))).rgb;
        vec2 farUV = vec2((xz.y - farZ.x) / (farZ.y - farZ.x), (xz.x - farX.x) / (farX.y - farX.x));
        float inFar = box(xz.yx, vec2(farZ.x, farX.x), vec2(farZ.y, farX.y), 3000.0);
        c = mix(c, texture2D(farMap, farUV).rgb, inFar);
        float water = texture2D(maskFar, farUV).r * inFar, veg = 0.5;
        vec2 nearUV = (xz.yx + nearH) / (2.0 * nearH);
        float inNear = box(xz, vec2(-nearH), vec2(nearH), 500.0);
        c = mix(c, texture2D(nearMap, nearUV).rgb, inNear);
        vec2 mk = texture2D(maskNear, nearUV).rg;
        water = mix(water, mk.r, inNear);
        veg = mix(veg, mk.g, inNear);
        c = mix(c, texture2D(plazaMap, (xz.yx + plazaH) / (2.0 * plazaH)).rgb, box(xz, vec2(-plazaH), vec2(plazaH), 120.0));
        // Close up, fine detail in the imagery's own colour: the lawn texture's light and dark (its
        // brightness over its mean), strongest where the ground is vegetated.
        float near = 1.0 - smoothstep(40.0, 420.0, distance(vTW, cameraPosition));
        if (near > 0.0) {
          float d = pow(dot(noTile(grassMap, xz * 0.31), vec3(0.3, 0.59, 0.11)) / 0.0544, 0.7);
          c *= mix(1.0, clamp(d, 0.4, 1.7), near * mix(0.2, 0.75, veg) * (1.0 - water));
        }
        // At eye level the low sun barely reaches the ground and the Union shades the lawn in front of
        // it: lift the vegetation as the camera comes down, as a watered lawn would read.
        float eye = veg * (1.0 - water) * (1.0 - smoothstep(15.0, 120.0, cameraPosition.y));
        c = mix(c, mix(vec3(dot(c, vec3(0.3, 0.59, 0.11))), c, 1.3) * 2.0, eye);
        diffuseColor.rgb *= c;`)
      .replace("#include <fog_fragment>", `
        // Water reflects the sky (strongest at grazing angles), broken up by a little ripple.
        if (water > 0.003) {
          vec3 V = normalize(vTW - cameraPosition);
          vec2 rip = (vec2(vnoise(xz * 0.9), vnoise(xz * 0.9 + 17.0)) - 0.5) * 0.06;
          vec3 R = normalize(vec3(V.x + rip.x, abs(V.y) + 0.002, V.z + rip.y));
          float fres = 0.02 + 0.98 * pow(1.0 - abs(V.y), 5.0);
          gl_FragColor.rgb = mix(gl_FragColor.rgb, skyBase(R) * 0.9, water * clamp(0.18 + fres, 0.0, 0.95));
        }
        #ifdef USE_FOG
          float fogF = smoothstep(fogNear, fogFar, distance(vTW, cameraPosition));
          gl_FragColor.rgb = mix(gl_FragColor.rgb, skyBase(normalize(vTW - cameraPosition)), fogF);
        #endif`);
  };
  for (const t of [textures.naipNear, textures.naipFar, textures.naipPlaza, textures.texas, textures.maskNear, textures.maskFar]) {
    t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
    t.anisotropy = 16;
  }

  const ground = new THREE.Mesh(geo, mat);
  ground.receiveShadow = true;
  const group = new THREE.Group();
  group.add(ground);
  for (const g of ring) group.add(new THREE.Mesh(g, mat));
  // Where the ground in front of the section ends (z); main.js slides it back to the cut face.
  const setCut = (z) => { uniforms.cutZ.value = z; };
  return { group, height, edgeH, setCut };
}
