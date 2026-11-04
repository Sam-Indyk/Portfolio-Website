// Poly Haven PBR textures (CC0) and a world-space triplanar material helper.
import * as THREE from "three";

let manager = THREE.DefaultLoadingManager;
const cache = new Map();

export function setLoadingManager(m) { manager = m; }

// Images decode off the main thread, so a texture's first upload never stalls a frame: as ImageBitmaps
// (flipped while decoding), or where those are unreliable (Safari, old Firefox; as in three's
// GLTFLoader) as <img> decoded ahead with img.decode(). Returns the texture at once, like
// TextureLoader.load; onLoad(texture) follows once it's ready to upload. upright: keep an <img> (for
// textures that are also drawn on 2D canvases, where a pre-flipped bitmap would be upside down).
const ff = navigator.userAgent.match(/firefox\/(\d+)/i);
const useBitmaps = typeof createImageBitmap !== "undefined" && !/^((?!chrome|android).)*safari/i.test(navigator.userAgent) && !(ff && +ff[1] < 98);
export function loadTexture(url, onLoad, upright = false) {
  const t = new THREE.Texture();
  const done = (image) => { t.image = image; t.needsUpdate = true; onLoad?.(t); };
  if (useBitmaps && !upright) {
    t.flipY = false;
    new THREE.ImageBitmapLoader(manager).setOptions({ imageOrientation: "flipY", premultiplyAlpha: "none", colorSpaceConversion: "none" }).load(url, done);
  } else {
    manager.itemStart(`${url}#decode`);   // counted until decoded, not just downloaded
    new THREE.ImageLoader(manager).load(url, (img) => img.decode().catch(() => {}).then(() => done(img)).finally(() => manager.itemEnd(`${url}#decode`)),
      undefined, () => manager.itemEnd(`${url}#decode`));
  }
  return t;
}

// {map, normalMap, roughnessMap} for public/assets/tex/<id>/, tiled `repeat` times. Each map is
// only downloaded when something actually reads it.
export function pbr(id, repeat = 1, base = "/") {
  const key = `${id}@${repeat}`;
  if (cache.has(key)) return cache.get(key);
  const load = (name, srgb) => {
    const t = loadTexture(`${base}assets/tex/${id}/${name}.webp`);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(repeat, repeat);
    t.anisotropy = 8;
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    return t;
  };
  const got = {};
  const maps = {};
  for (const [prop, file, srgb] of [["map", "diff", true], ["normalMap", "nor", false], ["roughnessMap", "rough", false]]) {
    Object.defineProperty(maps, prop, { enumerable: true, get: () => (got[prop] ||= load(file, srgb)) });
  }
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
