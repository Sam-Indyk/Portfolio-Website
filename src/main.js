import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { RGBELoader } from "three/addons/loaders/RGBELoader.js";
import Lenis from "lenis";
import { gsap } from "gsap";
import "./style.css";
import { ITEMS, INDEX } from "./content.js";
import { setLoadingManager } from "./pbr.js";
import { buildSpace, EARTH } from "./world/space.js";
import { buildSurface } from "./world/surface.js";
import { buildUnderground } from "./world/underground.js";
import { Rail, OUTRO_FROM } from "./rail.js";
import { renderEigen, loadEigen } from "./eigen.js";

const BASE = import.meta.env.BASE_URL;
const isMobile = matchMedia("(pointer: coarse)").matches || innerWidth < 700;
const $ = (id) => document.getElementById(id);
const clamp01 = (x) => Math.min(1, Math.max(0, x));
const sstep = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };

// ---------- renderer ----------
const canvas = $("gl");
const DPR = Math.min(devicePixelRatio, isMobile ? 2 : 2.5);
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
renderer.setPixelRatio(DPR);
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x000000);
const camera = new THREE.PerspectiveCamera(isMobile ? 55 : 40, innerWidth / innerHeight, 0.05, 14000);

// Post-processing renders into a multisampled target so edges stay anti-aliased.
let composer = null, bloom = null;
if (!isMobile) {
  const rt = new THREE.WebGLRenderTarget(innerWidth * DPR, innerHeight * DPR, { type: THREE.HalfFloatType, samples: 4 });
  composer = new EffectComposer(renderer, rt);
  composer.setPixelRatio(DPR);
  composer.addPass(new RenderPass(scene, camera));
  bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.4, 0.5, 0.9);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());
}

// ---------- loading ----------
const manager = new THREE.LoadingManager();
manager.onProgress = (_, done, total) => { $("loader-text").textContent = `Loading ${Math.round((done / total) * 100)}%`; };
const loader = new THREE.TextureLoader(manager);
setLoadingManager(manager);
const res = isMobile ? "2k" : "4k";
const textures = {};
const loadTex = (key, url, srgb = true) => new Promise((done) => loader.load(url, (t) => {
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = renderer.capabilities.getMaxAnisotropy();
  textures[key] = t; done();
}));

await Promise.all([
  loadTex(`day-${res}`, `${BASE}assets/earth/day-${res}.jpg`),
  loadTex(`night-${res}`, `${BASE}assets/earth/night-${res}.jpg`),
  loadTex(`clouds-${res}`, `${BASE}assets/earth/clouds-${res}.jpg`),
  loadTex("specular-2k", `${BASE}assets/earth/specular-2k.jpg`, false),
  loadTex("galaxies", `${BASE}assets/galaxies.jpg`),
  loadTex("seal", `${BASE}assets/au-seal.png`),
  loadTex("backdrop", `${BASE}assets/sky-backdrop.jpg`),
  new RGBELoader(manager).loadAsync(`${BASE}assets/sky-${isMobile ? "1k" : "2k"}.hdr`).then((t) => { textures.sky = t; }),
  fetch(`${BASE}assets/sky-backdrop.json`).then((r) => r.json()).then((j) => { textures.backdropMeta = j; }),
]);
const galaxyMeta = await fetch(`${BASE}assets/galaxies.json`).then((r) => r.json());
const space = buildSpace({ textures, galaxyMeta, isMobile });
const surface = buildSurface({ textures, renderer, isMobile, base: BASE });
const under = await buildUnderground({ renderer, isMobile, base: BASE });
scene.add(space.group, surface.group, under.group);
const spaceEnv = new THREE.PMREMGenerator(renderer).fromScene(space.envScene, 0.02).texture;
const pickables = [...space.pickables, ...surface.pickables, ...under.pickables];

const rail = new Rail({ zScale: Math.min(2.4, Math.max(1, 1.25 / (innerWidth / innerHeight))) });

// ---------- lighting by altitude: one continuous scene, so blend rather than switch ----------
const noRot = new THREE.Euler();
let galaxyTagFade = 1;
function atmosphere(y, z) {
  const inSpace = sstep(180, 340, y);
  const overview = sstep(400, 1200, z);
  // Earth gives way to the sky panorama on the way down, and stays out of the closing overview.
  // The sky panorama comes in first (over a still-solid Earth, like haze), then Earth goes once covered.
  space.setFade(sstep(380, 450, y) * (1 - sstep(260, 700, z)), Math.max(sstep(430, 500, y), overview));
  surface.setSkyOpacity(Math.max(1 - sstep(460, 505, y), overview), overview);
  // Underground the daylight goes away: the rock is lit only by the tunnel and work lights.
  const ground = Math.max(sstep(-4, 10, y), overview);
  space.sun.intensity = 3.4 * Math.max(inSpace, overview * 0.8);
  surface.sun.intensity = 5.5 * (1 - sstep(260, 420, y) * (1 - overview)) * ground;
  surface.hemi.intensity = THREE.MathUtils.lerp(0.06, 0.9 * (1 - inSpace * (1 - overview)), ground);
  galaxyTagFade = sstep(440, 500, y);
  const below = y < -3 && z < 400;
  const env = y > 330 && z < 400 ? spaceEnv : below ? under.envMap : surface.envMap;
  if (scene.environment !== env) scene.environment = env;
  // Underground the image-based light is only a faint fill for metal reflections.
  scene.environmentIntensity = below ? 0.1 : 1;
  scene.environmentRotation.copy(env === surface.envMap ? surface.skyRotation : noRot);
  scene.fog = y < 220 && z < 400 ? surface.fog : null;
  renderer.toneMappingExposure = below ? 1.05 : THREE.MathUtils.lerp(0.68, 1.0, Math.max(inSpace, overview * 0.4));
  if (bloom) bloom.strength = below ? 0.55 : 0.4;
}

// ---------- scrolling ----------
const lenis = new Lenis({ lerp: 0.075, wheelMultiplier: 0.9, touchMultiplier: 1.4 });
gsap.ticker.add((time) => lenis.raf(time * 1000));
gsap.ticker.lagSmoothing(0);
const progress = () => (lenis.limit > 0 ? clamp01(lenis.scroll / lenis.limit) : 0);

// ---------- camera ----------
const focus = { active: false, pos: new THREE.Vector3(), target: new THREE.Vector3(), mix: 0 };
const mouse = { x: 0, y: 0, sx: 0, sy: 0 };
const camPos = new THREE.Vector3(), camTarget = new THREE.Vector3();
let lastPose = null;
function applyCamera(t) {
  const pose = rail.pose(t);
  lastPose = pose;
  camPos.copy(pose.pos); camTarget.copy(pose.target);
  // A whisper of parallax from the pointer (translation only, no rotation).
  mouse.sx += (mouse.x - mouse.sx) * 0.05; mouse.sy += (mouse.y - mouse.sy) * 0.05;
  const k = pose.pos.z * 0.012;
  camPos.x += mouse.sx * k; camTarget.x += mouse.sx * k;
  camPos.y -= mouse.sy * k * 0.5; camTarget.y -= mouse.sy * k * 0.5;
  if (focus.mix > 0) { camPos.lerp(focus.pos, focus.mix); camTarget.lerp(focus.target, focus.mix); }
  camera.position.copy(camPos);
  camera.lookAt(camTarget);
  $("zone").textContent = pose.zone;
  atmosphere(pose.pos.y, pose.pos.z);
  const outro = sstep(OUTRO_FROM, 0.985, t);
  $("outro").style.opacity = outro.toFixed(3);
  $("outro").style.pointerEvents = outro > 0.5 ? "auto" : "none";
  document.body.classList.toggle("in-outro", outro > 0.02);
}

// ---------- picking ----------
const box = new THREE.Box3(), v3 = new THREE.Vector3(), camDir = new THREE.Vector3();
const earthSphere = new THREE.Sphere(EARTH.center, EARTH.r * 1.01), ray = new THREE.Ray();

function screenRect(p) {
  const W = innerWidth, H = innerHeight;
  camera.getWorldDirection(camDir);
  if (p.sphere) {
    if (v3.copy(p.sphere.center).sub(camera.position).dot(camDir) <= 0) return null;
    const c = v3.copy(p.sphere.center).project(camera);
    const dist = camera.position.distanceTo(p.sphere.center);
    const px = (p.sphere.radius / (dist * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)))) * (H / 2);
    const x = (c.x * 0.5 + 0.5) * W, y = (-c.y * 0.5 + 0.5) * H;
    return { x: x - px, y: y - px, w: px * 2, h: px * 2 };
  }
  box.setFromObject(p.object);
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (let i = 0; i < 8; i++) {
    v3.set(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z);
    if (v3.clone().sub(camera.position).dot(camDir) <= 0) return null;
    v3.project(camera);
    const sx = (v3.x * 0.5 + 0.5) * W, sy = (-v3.y * 0.5 + 0.5) * H;
    x0 = Math.min(x0, sx); x1 = Math.max(x1, sx); y0 = Math.min(y0, sy); y1 = Math.max(y1, sy);
  }
  x0 = Math.max(x0, -20); x1 = Math.min(x1, W + 20); y0 = Math.max(y0, -20); y1 = Math.min(y1, H + 20);
  if (x1 - x0 < 6 || y1 - y0 < 6) return null;
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

function hiddenBehindEarth(p) {
  const c = p.sphere ? p.sphere.center : box.setFromObject(p.object).getCenter(new THREE.Vector3());
  ray.origin.copy(camera.position); ray.direction.copy(c).sub(camera.position).normalize();
  const hit = ray.intersectSphere(earthSphere, new THREE.Vector3());
  return hit && hit.distanceTo(camera.position) < c.distanceTo(camera.position);
}

let hovered = null;
function pick(x, y) {
  let best = null, bestArea = Infinity;
  for (const p of pickables) {
    const r = screenRect(p);
    if (!r || r.w > innerWidth * 1.3) continue;
    const pad = p.sphere ? 4 : 10;
    if (x < r.x - pad || x > r.x + r.w + pad || y < r.y - pad || y > r.y + r.h + pad) continue;
    if (p.sphere && (galaxyTagFade < 0.5 || hiddenBehindEarth(p))) continue;
    const area = r.w * r.h;
    if (area < bestArea) { best = p; bestArea = area; }
  }
  return best;
}

const reticle = $("reticle"), tag = $("reticle-tag");
function setHover(p) {
  hovered = p;
  document.body.classList.toggle("hovering", !!p);
  reticle.classList.toggle("on", !!p);
  if (p) tag.textContent = p.label || ITEMS[p.id].label;
}
function trackReticle() {
  if (!hovered) return;
  const r = screenRect(hovered);
  if (!r) { setHover(null); return; }
  const pad = hovered.sphere ? 2 : 6;
  reticle.style.transform = `translate(${r.x - pad}px, ${r.y - pad}px)`;
  reticle.style.width = `${r.w + pad * 2}px`;
  reticle.style.height = `${r.h + pad * 2}px`;
}

// ---------- always-on mini tags ----------
const tagLayer = $("tags");
const tags = pickables.filter((p) => !p.sphere).map((p) => {
  const el = document.createElement("span");
  el.className = "mini mono";
  el.textContent = ITEMS[p.id].label;
  tagLayer.appendChild(el);
  return { p, el };
});
// One tag for the whole galaxy field.
const galaxyTag = document.createElement("span");
galaxyTag.className = "mini mono";
galaxyTag.textContent = "Galaxy Zoo 2 · click any galaxy";
tagLayer.appendChild(galaxyTag);
const galaxyAnchor = new THREE.Vector3(0, 1230, -4200);

function updateTags() {
  const show = !focus.active && !indexOpen && progress() < OUTRO_FROM;
  for (const { p, el } of tags) {
    const r = show && p !== hovered ? screenRect(p.tagAnchor ? { object: p.tagAnchor } : p) : null;
    if (!r || r.y < 40 || r.y > innerHeight - 40) { el.style.opacity = 0; continue; }
    el.style.opacity = 1;
    const x = Math.min(Math.max(r.x, 14), innerWidth - el.offsetWidth - 14);
    el.style.transform = `translate(${x}px, ${Math.max(r.y - 22, 48)}px)`;
  }
  const g = v3.copy(galaxyAnchor).project(camera);
  const gy = (-g.y * 0.5 + 0.5) * innerHeight;
  galaxyTag.style.opacity = show && galaxyTagFade > 0.5 && g.z < 1 && gy > 60 && gy < innerHeight - 60 ? 1 : 0;
  galaxyTag.style.transform = `translate(${(g.x * 0.5 + 0.5) * innerWidth}px, ${gy}px)`;
}

addEventListener("pointermove", (e) => {
  mouse.x = (e.clientX / innerWidth) * 2 - 1;
  mouse.y = (e.clientY / innerHeight) * 2 - 1;
  if (e.pointerType === "touch" || focus.active || indexOpen || progress() > OUTRO_FROM) return;
  setHover(pick(e.clientX, e.clientY));
});

let tapped = null;
canvas.addEventListener("click", (e) => {
  if (focus.active || indexOpen || progress() > OUTRO_FROM) return;
  const p = pick(e.clientX, e.clientY);
  if (!p) { setHover(null); tapped = null; return; }
  if (isMobile && tapped !== p) { tapped = p; setHover(p); return; }  // first tap = hover
  tapped = null;
  open(p);
});

// ---------- panel ----------
const panel = $("panel"), body = $("panel-body");
let eigenData = null;

function linksHTML(item) {
  const parts = [];
  if (item.demo) parts.push(`<a class="btn solid" href="${item.demo}" target="_blank" rel="noopener">Launch demo ↗</a>`);
  for (const [label, href] of item.links || []) parts.push(`<a class="btn" href="${href}" target="_blank" rel="noopener">${label} ↗</a>`);
  return parts.length ? `<div class="p-links">${parts.join("")}</div>` : "";
}

async function fillPanel(p) {
  const item = ITEMS[p.id];
  panel.classList.toggle("wide", p.id === "polytopia" || p.id === "galaxy");
  let html = "";
  if (item.seal) html += `<img class="p-seal" src="${BASE}assets/au-seal.png" alt="Austin Union Society seal">`;
  html += `<p class="p-meta mono">${item.meta}</p><h2 class="p-title">${item.title}</h2><p class="p-body">${item.body}</p>`;
  if (item.guests) html += `<p class="p-body">${item.guests}</p>`;
  if (item.figures) html += `<div class="p-figs">${item.figures.map(([b, s]) => `<div><b>${b}</b><span>${s}</span></div>`).join("")}</div>`;
  if (p.id === "galaxy") html += `<div class="eg" id="eg"></div>`;
  if (item.replay) html += `<iframe class="p-frame" src="${item.replay}" title="Polytopia-Zero replay" loading="lazy"></iframe>`;
  html += linksHTML(item);
  body.innerHTML = html;
  if (p.id === "galaxy") {
    eigenData = eigenData || (await loadEigen(BASE));
    renderEigen($("eg"), eigenData, p.galaxy, textures.galaxies.image, galaxyMeta);
  }
}

function open(p) {
  setHover(null);
  focus.active = true;
  lenis.stop();
  if (p.focus) { focus.pos.copy(p.focus.pos); focus.target.copy(p.focus.target); }
  else {
    // Galaxies: glide toward it a little, keeping the view level.
    focus.pos.copy(camera.position).lerp(p.sphere.center, 0.12);
    focus.target.copy(p.sphere.center);
  }
  // Shift the framing left so the object isn't hidden under the panel.
  const right = new THREE.Vector3().subVectors(focus.target, focus.pos).cross(camera.up).normalize();
  const dist = focus.pos.distanceTo(focus.target);
  if (innerWidth > 800) focus.target.addScaledVector(right, dist * (p.id === "polytopia" || p.id === "galaxy" ? 0.36 : 0.22));
  gsap.to(focus, { mix: 1, duration: 1.6, ease: "power3.inOut" });
  fillPanel(p);
  panel.classList.add("open");
  panel.setAttribute("aria-hidden", "false");
}

function close() {
  if (!focus.active) return;
  panel.classList.remove("open");
  panel.setAttribute("aria-hidden", "true");
  gsap.to(focus, { mix: 0, duration: 1.3, ease: "power3.inOut", onComplete: () => { focus.active = false; lenis.start(); body.innerHTML = ""; } });
}
$("panel-close").addEventListener("click", close);

// ---------- index ----------
let indexOpen = false;
const indexEl = $("index");
$("index-list").innerHTML = INDEX.map(([y, t, r, id, href]) => {
  const inner = `<span class="y">${y}</span><span class="t">${t}</span><span class="r">${r}</span>`;
  if (id) return `<li><button data-id="${id}" style="display:contents">${inner}</button></li>`;
  if (href) return `<li><a href="${href}" target="_blank" rel="noopener" style="display:contents">${inner}</a></li>`;
  return `<li>${inner}</li>`;
}).join("");
function toggleIndex(on) {
  indexOpen = on;
  indexEl.classList.toggle("open", on);
  indexEl.setAttribute("aria-hidden", String(!on));
  if (on) { setHover(null); lenis.stop(); } else if (!focus.active) lenis.start();
}
$("open-index").addEventListener("click", () => toggleIndex(true));
$("index-close").addEventListener("click", () => toggleIndex(false));
$("index-list").addEventListener("click", (e) => {
  const b = e.target.closest("button[data-id]");
  if (!b) return;
  const p = pickables.find((q) => q.id === b.dataset.id && (q.id !== "galaxy" || q.galaxy === 0));
  toggleIndex(false);
  lenis.scrollTo(rail.timeOf(p.id) * lenis.limit, { duration: 2.2, onComplete: () => setTimeout(() => open(p), 250) });
});
const toTop = (e) => { e.preventDefault(); close(); lenis.scrollTo(0, { duration: 3 }); };
$("home").addEventListener("click", toTop);
$("outro-top").addEventListener("click", toTop);
addEventListener("keydown", (e) => {
  if (e.key !== "Escape") return;
  if (indexOpen) toggleIndex(false); else close();
});

// ---------- resize + loop ----------
addEventListener("resize", () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  composer?.setSize(innerWidth, innerHeight);
});

let scrolledOnce = false;
renderer.setAnimationLoop((t) => {
  const pr = progress();
  if (!scrolledOnce && pr > 0.004) { scrolledOnce = true; document.body.classList.add("scrolled"); }
  applyCamera(pr);
  space.update(t);
  surface.update(t);
  under.update(t);
  trackReticle();
  updateTags();
  if (composer) composer.render(); else renderer.render(scene, camera);
});

renderer.compile(scene, camera);
requestAnimationFrame(() => document.body.classList.add("ready"));

window.__site = { space, surface, under, camera, rail };
// Debug/screenshot hooks: ?t=0.5 jumps the rail, ?open=<id> opens a panel (?g=3 picks a galaxy).
const qs = new URLSearchParams(location.search);
for (const h of (qs.get("hide") || "").split(",").filter(Boolean)) ({ space, surface, under })[h].group.visible = false;
if (qs.has("t")) lenis.scrollTo(parseFloat(qs.get("t")) * lenis.limit, { immediate: true });
if (qs.has("open")) {
  const id = qs.get("open");
  const p = pickables.find((q) => q.id === id && (q.id !== "galaxy" || q.galaxy === parseInt(qs.get("g") || "0", 10)));
  if (p) setTimeout(() => open(p), 300);
}
