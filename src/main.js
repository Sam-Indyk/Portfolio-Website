import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { GTAOPass } from "three/addons/postprocessing/GTAOPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { RGBELoader } from "three/addons/loaders/RGBELoader.js";
import Lenis from "lenis";
import { setLoadingManager } from "./pbr.js";
import { gsap } from "gsap";
import "./style.css";
import { ITEMS, INDEX } from "./content.js";
import { buildSpace, R } from "./world/space.js";
import { buildSurface } from "./world/surface.js";
import { buildUnderground, TUNNEL_LEN, SHAFT } from "./world/underground.js";
import { Rail } from "./rail.js";
import { renderEigen, loadEigen } from "./eigen.js";

const BASE = import.meta.env.BASE_URL;
const isMobile = matchMedia("(pointer: coarse)").matches || innerWidth < 700;
const $ = (id) => document.getElementById(id);

// ---------- renderer ----------
const canvas = $("gl");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: !isMobile, powerPreference: "high-performance" });
renderer.setPixelRatio(Math.min(devicePixelRatio, isMobile ? 1.5 : 2));
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(isMobile ? 62 : 48, innerWidth / innerHeight, 0.01, 30000);

let composer = null, bloom = null, ao = null;
if (!isMobile) {
  composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  ao = new GTAOPass(scene, camera, innerWidth, innerHeight);
  ao.updateGtaoMaterial({ radius: 0.6, distanceExponent: 1.4, thickness: 1.2, scale: 1.1, samples: 12 });
  ao.blendIntensity = 0.85;
  composer.addPass(ao);
  bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.55, 0.6, 0.86);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());
}

// ---------- loading ----------
const manager = new THREE.LoadingManager();
manager.onProgress = (_, done, total) => { $("loader-text").textContent = `Loading ${Math.round((done / total) * 100)}%`; };
const loader = new THREE.TextureLoader(manager);
setLoadingManager(manager);
const texNames = isMobile
  ? ["day-2k", "night-2k", "clouds-2k", "specular-2k"]
  : ["day-4k", "night-4k", "clouds-4k", "specular-2k"];
const textures = {};
const loadTex = (key, url) => new Promise((res) => loader.load(url, (t) => { t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; textures[key] = t; res(); }));

async function load() {
  await Promise.all([
    ...texNames.map((n) => loadTex(n, `${BASE}assets/earth/${n}.jpg`)),
    loadTex("galaxies", `${BASE}assets/galaxies.jpg`),
    loadTex("seal", `${BASE}assets/au-seal.png`),
    new RGBELoader(manager).loadAsync(`${BASE}assets/sky-${isMobile ? "1k" : "2k"}.hdr`).then((t) => { textures.sky = t; }),
  ]);
  textures["specular-2k"].colorSpace = THREE.NoColorSpace;
  const galaxyMeta = await fetch(`${BASE}assets/galaxies.json`).then((r) => r.json());
  const space = buildSpace({ textures, galaxyMeta, isMobile });
  const surface = buildSurface({ textures, renderer, isMobile, base: BASE });
  const under = await buildUnderground({ renderer, isMobile, base: BASE });
  return { space, surface, under, galaxyMeta };
}

const stages = await load();
const pmrem = new THREE.PMREMGenerator(renderer);
const spaceEnv = pmrem.fromScene(stages.space.envScene, 0.02).texture;
scene.add(stages.space.group, stages.surface.group, stages.under.group);
const STAGES = {
  space: { group: stages.space.group, env: spaceEnv, fog: null, exposure: 1.0, bloom: 0.55, background: new THREE.Color(0x000000) },
  surface: { group: stages.surface.group, env: stages.surface.envMap, fog: stages.surface.fog, exposure: 0.68, bloom: 0.35, background: stages.surface.background, rotation: stages.surface.skyRotation },
  underground: { group: stages.under.group, env: stages.under.envMap, fog: stages.under.fog, exposure: 1.15, bloom: 0.7, background: new THREE.Color(0x050403) },
};
const pickables = [...stages.space.pickables, ...stages.surface.pickables, ...stages.under.pickables];

const rail = new Rail({ R, eye: stages.space.eyeY, galaxyDir: stages.space.galaxyDir, tunnelLen: TUNNEL_LEN, shaft: SHAFT, pickables });

let activeStage = null;
function setStage(name) {
  if (activeStage === name) return;
  activeStage = name;
  for (const [k, s] of Object.entries(STAGES)) s.group.visible = k === name;
  const s = STAGES[name];
  scene.environment = s.env;
  scene.fog = s.fog;
  scene.background = s.background;
  scene.backgroundRotation.copy(s.rotation || new THREE.Euler());
  scene.environmentRotation.copy(s.rotation || new THREE.Euler());
  renderer.toneMappingExposure = s.exposure;
  if (bloom) bloom.strength = s.bloom;
  if (ao) ao.enabled = name !== "space";
  camera.near = name === "space" ? 0.01 : 0.05;
  camera.far = name === "space" ? 30000 : 25000;
  camera.updateProjectionMatrix();
}

// ---------- scrolling ----------
const lenis = new Lenis({ lerp: 0.075, wheelMultiplier: 0.9, touchMultiplier: 1.4 });
gsap.ticker.add((time) => lenis.raf(time * 1000));
gsap.ticker.lagSmoothing(0);
const progress = () => (lenis.limit > 0 ? THREE.MathUtils.clamp(lenis.scroll / lenis.limit, 0, 1) : 0);

// ---------- camera state ----------
const cam = { pos: new THREE.Vector3(), target: new THREE.Vector3() };
const focus = { active: false, pos: new THREE.Vector3(), target: new THREE.Vector3(), mix: 0 };
const mouse = { x: 0, y: 0, sx: 0, sy: 0 };

function applyCamera(t) {
  const pose = rail.pose(t);
  setStage(pose.stage);
  cam.pos.copy(pose.pos); cam.target.copy(pose.target);
  // Subtle parallax from the pointer.
  mouse.sx += (mouse.x - mouse.sx) * 0.04; mouse.sy += (mouse.y - mouse.sy) * 0.04;
  const right = new THREE.Vector3().subVectors(cam.target, cam.pos).cross(camera.up).normalize();
  const k = pose.stage === "space" ? 0.06 : pose.stage === "surface" ? 0.6 : 0.08;
  cam.pos.addScaledVector(right, mouse.sx * k).addScaledVector(camera.up, -mouse.sy * k * 0.5);
  if (focus.mix > 0) {
    cam.pos.lerp(focus.pos, focus.mix);
    cam.target.lerp(focus.target, focus.mix);
  }
  camera.position.copy(cam.pos);
  camera.lookAt(cam.target);
  $("veil").style.opacity = pose.veil.toFixed(3);
  $("veil").style.background = pose.veilColor;
  $("veil").style.mixBlendMode = pose.veilBlend;
  $("zone").textContent = pose.zone;
}

// ---------- picking ----------
const box = new THREE.Box3(), v3 = new THREE.Vector3(), earthSphere = new THREE.Sphere(new THREE.Vector3(), R * 1.01);
const ray = new THREE.Ray();

function screenRect(p) {
  const W = innerWidth, H = innerHeight;
  let pts;
  if (p.sphere) {
    const c = v3.copy(p.sphere.center).project(camera);
    if (c.z > 1) return null;
    const dist = camera.position.distanceTo(p.sphere.center);
    const px = (p.sphere.radius / (dist * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)))) * (H / 2);
    const x = (c.x * 0.5 + 0.5) * W, y = (-c.y * 0.5 + 0.5) * H;
    return { x: x - px, y: y - px, w: px * 2, h: px * 2, cx: x, cy: y, z: dist };
  }
  box.setFromObject(p.object);
  pts = [];
  for (let i = 0; i < 8; i++) {
    v3.set(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z);
    const d = v3.clone().sub(camera.position).dot(camera.getWorldDirection(new THREE.Vector3()));
    if (d <= 0) return null;
    v3.project(camera);
    pts.push([(v3.x * 0.5 + 0.5) * W, (-v3.y * 0.5 + 0.5) * H]);
  }
  const xs = pts.map((q) => q[0]), ys = pts.map((q) => q[1]);
  const x0 = Math.max(Math.min(...xs), -20), x1 = Math.min(Math.max(...xs), W + 20);
  const y0 = Math.max(Math.min(...ys), -20), y1 = Math.min(Math.max(...ys), H + 20);
  if (x1 - x0 < 4 || y1 - y0 < 4) return null;
  box.getCenter(v3);
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, z: camera.position.distanceTo(v3) };
}

function occludedByEarth(p) {
  if (activeStage !== "space") return false;
  const c = p.sphere ? p.sphere.center : box.setFromObject(p.object).getCenter(new THREE.Vector3());
  ray.origin.copy(camera.position);
  ray.direction.copy(c).sub(camera.position).normalize();
  const hit = ray.intersectSphere(earthSphere, new THREE.Vector3());
  return hit && hit.distanceTo(camera.position) < c.distanceTo(camera.position);
}

let hovered = null, hoveredRect = null;
function pick(x, y) {
  let best = null, bestArea = Infinity;
  for (const p of pickables) {
    if (p.stage !== activeStage) continue;
    const r = screenRect(p);
    if (!r) continue;
    const pad = p.sphere ? 4 : 10;
    if (x < r.x - pad || x > r.x + r.w + pad || y < r.y - pad || y > r.y + r.h + pad) continue;
    if (r.w > innerWidth * 1.4) continue;
    if (occludedByEarth(p)) continue;
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
  hoveredRect = screenRect(hovered);
  if (!hoveredRect) { setHover(null); return; }
  const pad = hovered.sphere ? 2 : 6;
  reticle.style.transform = `translate(${hoveredRect.x - pad}px, ${hoveredRect.y - pad}px)`;
  reticle.style.width = `${hoveredRect.w + pad * 2}px`;
  reticle.style.height = `${hoveredRect.h + pad * 2}px`;
}

addEventListener("pointermove", (e) => {
  mouse.x = (e.clientX / innerWidth) * 2 - 1;
  mouse.y = (e.clientY / innerHeight) * 2 - 1;
  if (e.pointerType === "touch" || focus.active || indexOpen) return;
  setHover(pick(e.clientX, e.clientY));
});

let tapped = null;
canvas.addEventListener("click", (e) => {
  if (focus.active || indexOpen) return;
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
    renderEigen($("eg"), eigenData, p.galaxy, textures.galaxies.image, stages.galaxyMeta);
  }
}

function open(p) {
  setHover(null);
  focus.active = true;
  lenis.stop();
  if (p.focus) {
    focus.pos.copy(p.focus.pos); focus.target.copy(p.focus.target);
  } else {
    // Galaxies: turn toward it without moving far.
    focus.pos.copy(camera.position);
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
  const t = rail.timeOf(p.id);
  lenis.scrollTo(t * lenis.limit, { duration: 2.2, onComplete: () => setTimeout(() => open(p), 250) });
});
$("home").addEventListener("click", (e) => { e.preventDefault(); close(); lenis.scrollTo(0, { duration: 2.5 }); });

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
  stages.space.update(t);
  stages.surface.update(t, camera);
  // Descent clouds are sprites; keep them (and AO, which can't handle sprites) apart.
  if (activeStage === "surface" && ao) ao.enabled = camera.position.y < 150;
  stages.under.update(t, camera);
  trackReticle();
  if (composer) composer.render(); else renderer.render(scene, camera);
});

// Compile everything up front so the first stage switch doesn't hitch.
for (const s of Object.values(STAGES)) s.group.visible = true;
renderer.compile(scene, camera);
setStage("space");
requestAnimationFrame(() => document.body.classList.add("ready"));

window.__site = { stages, camera, rail };
// Debug/screenshot hook: ?t=0.5 jumps the rail, ?open=<id> opens a panel.
const qs = new URLSearchParams(location.search);
if (qs.has("t")) { const t = parseFloat(qs.get("t")); lenis.scrollTo(t * lenis.limit, { immediate: true }); }
if (qs.has("open")) {
  const id = qs.get("open");
  const p = pickables.find((q) => q.id === id && (q.id !== "galaxy" || q.galaxy === (parseInt(qs.get("g") || "0", 10))));
  if (p) setTimeout(() => open(p), 300);
}
