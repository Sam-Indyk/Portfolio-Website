// Poly Haven PBR textures (CC0) and a world-space triplanar material helper.
import * as THREE from "three";

const loader = new THREE.TextureLoader();
const cache = new Map();

export function setLoadingManager(manager) { loader.manager = manager; }

// {map, normalMap, roughnessMap} for public/assets/tex/<id>/, tiled `repeat` times.
export function pbr(id, repeat = 1, base = "/") {
  const key = `${id}@${repeat}`;
  if (cache.has(key)) return cache.get(key);
  const load = (name, srgb) => {
    const t = loader.load(`${base}assets/tex/${id}/${name}.jpg`);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(repeat, repeat);
    t.anisotropy = 8;
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    return t;
  };
  const maps = { map: load("diff", true), normalMap: load("nor", false), roughnessMap: load("rough", false) };
  cache.set(key, maps);
  return maps;
}

// Same maps with an independent (non-uniform) repeat.
export function pbrRepeat(id, rx, ry, base = "/") {
  const src = pbr(id, 1, base), out = {};
  for (const [k, t] of Object.entries(src)) { out[k] = t.clone(); out[k].repeat.set(rx, ry); }
  return out;
}

// Sample map + roughnessMap by world position (metres × scale) instead of UVs.
export function triplanar(material, scale = 0.25) {
  material.onBeforeCompile = (sh) => {
    sh.uniforms.uTriScale = { value: scale };
    sh.vertexShader = sh.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vTriPos; varying vec3 vTriN;")
      .replace("#include <project_vertex>", `#include <project_vertex>
        vec4 triW = vec4(transformed, 1.0);
        vec3 triN = objectNormal;
        #ifdef USE_INSTANCING
          triW = instanceMatrix * triW; triN = mat3(instanceMatrix) * triN;
        #endif
        vTriPos = (modelMatrix * triW).xyz;
        vTriN = normalize(mat3(modelMatrix) * triN);`);
    sh.fragmentShader = sh.fragmentShader
      .replace("#include <common>", `#include <common>
        uniform float uTriScale; varying vec3 vTriPos; varying vec3 vTriN;
        vec4 tri(sampler2D t) {
          vec3 w = pow(abs(vTriN), vec3(4.0)); w /= (w.x + w.y + w.z);
          vec3 p = vTriPos * uTriScale;
          return texture2D(t, p.zy) * w.x + texture2D(t, p.xz) * w.y + texture2D(t, p.xy) * w.z;
        }`)
      .replace("#include <map_fragment>", "diffuseColor *= tri(map);")
      .replace("#include <roughnessmap_fragment>", "float roughnessFactor = roughness * tri(roughnessMap).g;");
  };
  material.customProgramCacheKey = () => `tri-${scale}`;
  return material;
}
