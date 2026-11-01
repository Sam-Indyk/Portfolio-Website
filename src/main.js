import * as THREE from "three";
import { RGBELoader } from "three/addons/loaders/RGBELoader.js";
import Lenis from "lenis";
import { gsap } from "gsap";
import "./style.css";
import { ITEMS, INDEX } from "./content.js";
import { setLoadingManager } from "./pbr.js";
import { buildSpace, EARTH } from "./world/space.js";
import { Rail, OUTRO_FROM, CUT_T } from "./rail.js";

const BASE = import.meta.env.BASE_URL;
const isMobile = matchMedia("(pointer: coarse)").matches || innerWidth < 700;
const portrait = innerHeight > innerWidth;
const $ = (id) => document.getElementById(id);
const clamp01 = (x) => Math.min(1, Math.max(0, x));
const sstep = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };

// ---------- renderer: direct to the canvas with native MSAA (no post-processing targets) ----------
const canvas = $("gl");
const MAX_DPR = Math.min(devicePixelRatio, isMobile ? 1.75 : 2);
let dpr = MAX_DPR;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance", stencil: false });
renderer.setPixelRatio(dpr);
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = !isMobile;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.shadowMap.autoUpdate = false;       // the scene is static: render shadows once, on load

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x000000);
const camera = new THREE.PerspectiveCamera(isMobile ? 55 : 40, innerWidth / innerHeight, 0.05, 14000);

// ---------- loading: the orbit band first, everything else in the background ----------
const manager = new THREE.LoadingManager();
manager.onProgress = (_, done, total) => { $("loader-text").textContent = `Loading ${Math.round((done / total) * 100)}%`; };
const loader = new THREE.TextureLoader(manager);
setLoadingManager(manager);
const res = isMobile ? "2k" : "4k";
const textures = {};
const loadTex = (key, url, srgb = true) => new Promise((done) => loader.load(url, (t) => {
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  textures[key] = t; done();
}));

await Promise.all([
  loadTex(`day-${res}`, `${BASE}assets/earth/day-${res}.webp`),
  loadTex(`clouds-${res}`, `${BASE}assets/earth/clouds-${res}.webp`),
  loadTex("specular-2k", `${BASE}assets/earth/specular-2k.webp`, false),
  loadTex("galaxies", `${BASE}assets/galaxies.webp`),
]);
const galaxyMeta = await fetch(`${BASE}assets/galaxies.json`).then((r) => r.json());
const space = buildSpace({ textures, galaxyMeta, isMobile, portrait });
scene.add(space.group);
const pmrem = new THREE.PMREMGenerator(renderer);
applyEnv(space.group, pmrem.fromScene(space.envScene, 0.02).texture, 1);
for (const p of space.pickables) p.band = "space";
const pickables = [...space.pickables];
// The local world (sky over Austin, terrain, plaza, underground) arrives after the opening frame.
let surface = null, under = null, sky = null, terrain = null, local = null, DECK = null;

// Each band's PBR materials carry their own environment map, so the scene never swaps
// scene.environment (which would recompile every shader mid-scroll).
function applyEnv(group, env, intensity) {
  group.traverse((o) => {
    if (!o.isMesh) return;
    for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
      if (m.isMeshStandardMaterial && !m.envMap) { m.envMap = env; m.envMapIntensity *= intensity; }
    }
  });
}

const rail = new Rail({ portrait, aspect: innerWidth / innerHeight });

async function loadRest() {
  manager.onProgress = () => {};
  await Promise.all([
    loadTex("seal", `${BASE}assets/au-seal.webp`),
    loadTex("backdrop", `${BASE}assets/sky-backdrop.webp`, false),   // raw: the sky shader shows it as is
    new RGBELoader().loadAsync(`${BASE}assets/sky-1k.hdr`).then((t) => { textures.sky = t; }),
    fetch(`${BASE}assets/sky-backdrop.json`).then((r) => r.json()).then((j) => { textures.backdropMeta = j; }),
    loadTex("naipFar", `${BASE}assets/austin/naip-far${isMobile ? "-2k" : ""}.webp`),
    loadTex("naipNear", `${BASE}assets/austin/naip-near.webp`),
    loadTex("texas", `${BASE}assets/austin/texas.webp`),
    fetch(`${BASE}assets/austin/austin.json`).then((r) => r.json()).then((j) => { textures.austinMeta = j; }),
    fetch(`${BASE}assets/austin/dem.bin`).then((r) => r.arrayBuffer()).then((b) => { textures.dem = b; }),
  ]);
  const [{ buildSurface }, { buildUnderground }, skyMod, { buildTerrain }] = await Promise.all([
    import("./world/surface.js"), import("./world/underground.js"), import("./world/sky.js"), import("./world/terrain.js")]);
  DECK = skyMod.DECK;
  sky = skyMod.buildSky({ textures, isMobile });
  terrain = buildTerrain({ textures, sky, isMobile, base: BASE });
  space.setTexas(textures.texas, textures.austinMeta.texas);
  surface = buildSurface({ textures, renderer, isMobile, base: BASE });   // phones pan along the full row
  applyEnv(surface.group, surface.envMap, 1);
  under = await buildUnderground({ renderer, isMobile, base: BASE });
  applyEnv(under.group, under.envMap, 0.15);   // underground, image light is only a faint fill for metal
  // Fog stays on the scene for good; only its range changes. Its colour is the sky's own horizon.
  scene.fog = new THREE.Fog(sky.horizon, 200, 3000);
  local = new THREE.Group();
  local.add(sky.group, terrain.group, surface.group, under.group);
  scene.add(local);
  // Compile against the lights the local world will actually render with (the orbit band's hidden).
  space.group.visible = false;
  await renderer.compileAsync(scene, camera);
  for (const p of under.pickables) p.under = true;
  addPickables([...surface.pickables, ...under.pickables]);
}

// Whether a pickable is in play from where the camera is: its band, and for the local world, close
// enough to the ground (plaza objects) or below it (underground objects).
function inPlay(p) {
  if (p.band !== band) return false;
  if (band === "space") return !p.sphere || galaxyTagFade > 0.5;
  const y = camera.position.y;
  return p.under ? y < 1 : y > -1 && y < 160;
}

// ---------- by altitude: the orbit band until the cut, then the local world ----------
let galaxyTagFade = 1, band = "space", shadowsDrawn = false;
const veilEl = $("veil"), mistEl = $("mist");
function setClip(near, far) {
  if (Math.abs(camera.near - near) / near < 0.05 && Math.abs(camera.far - far) / far < 0.05) return;
  camera.near = near; camera.far = far;
  camera.updateProjectionMatrix();
}
function atmosphere(pose, t) {
  // Re-entry: the dive into the globe thickens into haze, which hides the cut to the sky over Austin.
  const veil = sstep(0.164, CUT_T, t) * (1 - sstep(CUT_T + 0.002, CUT_T + 0.03, t));
  veilEl.style.opacity = veil.toFixed(3);
  band = pose.local && local ? "local" : "space";
  space.group.visible = band === "space";
  if (local) local.visible = band === "local";
  mistEl.style.opacity = band === "local" ? sky.mistAt(pose.pos).toFixed(3) : "0";
  if (band === "space") {
    space.setHaze(sstep(0.148, CUT_T, t) * 0.9);
    galaxyTagFade = 1 - sstep(0.1, 0.13, t);
    space.sun.intensity = 3.4;
    renderer.toneMappingExposure = 1.0;
    if (scene.fog) { scene.fog.near = 1e6; scene.fog.far = 2e6; }
    setClip(0.5, 14000);
    return;
  }
  if (!shadowsDrawn) { renderer.shadowMap.needsUpdate = true; shadowsDrawn = true; }   // static: once, when first seen
  const y = pose.pos.y, alt = Math.max(y, 1);
  sky.setClear(sstep(DECK.y0 + 60, DECK.y1 + 40, y));
  const ground = sstep(-4, 0.5, y);
  surface.sun.intensity = 5.5 * ground;
  surface.hemi.intensity = THREE.MathUtils.lerp(0.06, 1.1, ground);
  surface.fill.intensity = 0.9 * ground;
  renderer.toneMappingExposure = y < -3 ? 1.05 : 1.0;
  // Haze thins with altitude: from the plaza it closes in at a few kilometres, from the cloud deck
  // the land stays visible for tens of kilometres.
  scene.fog.near = y < -2 ? 200 : 140 + alt * 1.1;
  scene.fog.far = y < -2 ? 3000 : 2800 + alt * 15;
  setClip(THREE.MathUtils.clamp(alt * 0.012, 0.05, 30), 30000 + alt * 90);
}

// ---------- scrolling ----------
const lenis = new Lenis({ lerp: 0.085, wheelMultiplier: 0.9, touchMultiplier: 1.4 });
gsap.ticker.add((time) => lenis.raf(time * 1000));
gsap.ticker.lagSmoothing(0);
const progress = () => (lenis.limit > 0 ? clamp01(lenis.scroll / lenis.limit) : 0);

// ---------- camera ----------
const focus = { active: false, pos: new THREE.Vector3(), target: new THREE.Vector3(), mix: 0 };
const mouse = { x: 0, y: 0, sx: 0, sy: 0 };
const camPos = new THREE.Vector3(), camTarget = new THREE.Vector3();
const heroEl = $("hero"), outroEl = $("outro"), zoneEl = $("zone");
function applyCamera(t) {
  const pose = rail.pose(t);
  camPos.copy(pose.pos); camTarget.copy(pose.target);
  // A whisper of parallax from the pointer (translation only, no rotation).
  mouse.sx += (mouse.x - mouse.sx) * 0.05; mouse.sy += (mouse.y - mouse.sy) * 0.05;
  const k = Math.min(Math.abs(pose.pos.z), 120) * 0.012;
  camPos.x += mouse.sx * k; camTarget.x += mouse.sx * k;
  camPos.y -= mouse.sy * k * 0.5; camTarget.y -= mouse.sy * k * 0.5;
  if (focus.mix > 0) { camPos.lerp(focus.pos, focus.mix); camTarget.lerp(focus.target, focus.mix); }
  camera.position.copy(camPos);
  camera.lookAt(camTarget);
  if (zoneEl.textContent !== pose.zone) zoneEl.textContent = pose.zone;
  atmosphere(pose, t);
  const hero = 1 - sstep(0.004, 0.045, t);
  heroEl.style.opacity = hero.toFixed(3);
  heroEl.style.pointerEvents = hero > 0.5 ? "auto" : "none";
  document.body.classList.toggle("in-hero", hero > 0.02);
  const outro = sstep(OUTRO_FROM, 0.985, t);
  outroEl.style.opacity = outro.toFixed(3);
  outroEl.style.pointerEvents = outro > 0.5 ? "auto" : "none";
  document.body.classList.toggle("in-outro", outro > 0.02);
}

// ---------- picking (world boxes cached once: everything pickable is static) ----------
const v3 = new THREE.Vector3(), camDir = new THREE.Vector3();
const earthSphere = new THREE.Sphere(EARTH.center, EARTH.r * 1.01), ray = new THREE.Ray();
const corners = Array.from({ length: 8 }, () => new THREE.Vector3());

function screenRect(p) {
  const W = innerWidth, H = innerHeight;
  if (p.sphere) {
    if (v3.copy(p.sphere.center).sub(camera.position).dot(camDir) <= 0) return null;
    const c = v3.copy(p.sphere.center).project(camera);
    const dist = camera.position.distanceTo(p.sphere.center);
    const px = (p.sphere.radius / (dist * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)))) * (H / 2);
    const x = (c.x * 0.5 + 0.5) * W, y = (-c.y * 0.5 + 0.5) * H;
    return { x: x - px, y: y - px, w: px * 2, h: px * 2 };
  }
  const box = p.box;
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (let i = 0; i < 8; i++) {
    const c = corners[i].set(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z);
    if (v3.copy(c).sub(camera.position).dot(camDir) <= 0) return null;
    c.project(camera);
    const sx = (c.x * 0.5 + 0.5) * W, sy = (-c.y * 0.5 + 0.5) * H;
    x0 = Math.min(x0, sx); x1 = Math.max(x1, sx); y0 = Math.min(y0, sy); y1 = Math.max(y1, sy);
  }
  x0 = Math.max(x0, -20); x1 = Math.min(x1, W + 20); y0 = Math.max(y0, -20); y1 = Math.min(y1, H + 20);
  if (x1 - x0 < 6 || y1 - y0 < 6) return null;
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

function hiddenBehindEarth(p) {
  ray.origin.copy(camera.position); ray.direction.copy(p.sphere.center).sub(camera.position).normalize();
  const hit = ray.intersectSphere(earthSphere, v3);
  return hit && hit.distanceTo(camera.position) < p.sphere.center.distanceTo(camera.position);
}

let hovered = null;
function pick(x, y) {
  let best = null, bestArea = Infinity;
  for (const p of pickables) {
    if (!inPlay(p)) continue;
    const r = screenRect(p);
    if (!r || r.w > innerWidth * 1.3) continue;
    const pad = p.sphere ? 5 : 10;
    if (x < r.x - pad || x > r.x + r.w + pad || y < r.y - pad || y > r.y + r.h + pad) continue;
    if (p.sphere && hiddenBehindEarth(p)) continue;
    const area = r.w * r.h;
    if (area < bestArea) { best = p; bestArea = area; }
  }
  return best;
}

const reticle = $("reticle"), tag = $("reticle-tag");
function setHover(p) {
  if (hovered === p) return;
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
const tags = [];
function addPickables(list) {
  for (const p of list) {
    p.band ||= "local";
    if (p.object) p.box = new THREE.Box3().setFromObject(p.object);
    if (p.tagAnchor) p.tagBox = new THREE.Box3().setFromObject(p.tagAnchor);
    pickables.push(p);
    if (p.sphere) continue;
    const el = document.createElement("span");
    el.className = "mini mono";
    el.textContent = ITEMS[p.id].label;
    tagLayer.appendChild(el);
    tags.push({ p, el, w: 0 });
  }
}
for (const p of pickables) if (p.object) p.box = new THREE.Box3().setFromObject(p.object);
addPickables(pickables.splice(0));
const galaxyTag = document.createElement("span");
galaxyTag.className = "mini mono";
galaxyTag.textContent = "Galaxy Zoo 2 · click any galaxy";
tagLayer.appendChild(galaxyTag);
const galaxyAnchor = space.galaxyTagAnchor;

function updateTags() {
  const show = !focus.active && !indexOpen && progress() < OUTRO_FROM && progress() > 0.03;
  for (const t of tags) {
    const r = show && t.p !== hovered && inPlay(t.p) ? screenRect(t.p.tagBox ? { box: t.p.tagBox } : t.p) : null;
    const on = !!r && r.y > 40 && r.y < innerHeight - 40;
    if (on !== t.on) { t.el.style.opacity = on ? 1 : 0; t.on = on; }
    if (!on) continue;
    t.w = t.w || t.el.offsetWidth;
    const x = Math.min(Math.max(r.x, 14), innerWidth - t.w - 14);
    t.el.style.transform = `translate(${x | 0}px, ${Math.max(r.y - 22, 48) | 0}px)`;
  }
  const g = v3.copy(galaxyAnchor).project(camera);
  const gy = (-g.y * 0.5 + 0.5) * innerHeight;
  galaxyTag.style.opacity = show && band === "space" && galaxyTagFade > 0.5 && g.z < 1 && gy > 60 && gy < innerHeight - 60 ? 1 : 0;
  galaxyTag.style.transform = `translate(${((g.x * 0.5 + 0.5) * innerWidth) | 0}px, ${gy | 0}px)`;
}

let pointerDirty = false, pointerX = 0, pointerY = 0;
addEventListener("pointermove", (e) => {
  mouse.x = (e.clientX / innerWidth) * 2 - 1;
  mouse.y = (e.clientY / innerHeight) * 2 - 1;
  if (e.pointerType === "touch") return;
  pointerX = e.clientX; pointerY = e.clientY; pointerDirty = true;   // picked once per frame, not per event
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

// ---------- demo theatre (full-screen, in page) ----------
const theatre = $("theatre"), theatreFrame = $("theatre-frame");
function openDemo(src, title) {
  $("theatre-title").textContent = title;
  $("theatre-newtab").href = src;
  theatreFrame.src = src;
  theatre.classList.add("open");
  theatre.setAttribute("aria-hidden", "false");
}
function closeDemo() {
  if (!theatre.classList.contains("open")) return false;
  theatre.classList.remove("open");
  theatre.setAttribute("aria-hidden", "true");
  setTimeout(() => { theatreFrame.src = "about:blank"; }, 400);
  return true;
}
$("theatre-close").addEventListener("click", closeDemo);
// Same-origin demos that support themes (the DN600 viewer) open in their dark theme to match.
theatreFrame.addEventListener("load", () => {
  try { theatreFrame.contentDocument.documentElement.dataset.theme = "dark"; } catch { /* cross-origin */ }
});
document.addEventListener("click", (e) => {
  const b = e.target.closest("[data-demo]");
  if (b) { e.preventDefault(); openDemo(b.dataset.demo, b.dataset.title || ""); }
});

// ---------- panel ----------
const panel = $("panel"), body = $("panel-body");
let eigenData = null, eigenMod = null;

function linksHTML(item) {
  const parts = [];
  if (item.demo) parts.push(`<button class="btn solid" data-demo="${item.demo}" data-title="${item.title}">Launch demo</button>`);
  for (const [label, href] of item.links || []) parts.push(`<a class="btn" href="${href}" target="_blank" rel="noopener">${label} ↗</a>`);
  return parts.length ? `<div class="p-links">${parts.join("")}</div>` : "";
}

async function fillPanel(p) {
  const item = ITEMS[p.id];
  panel.classList.toggle("wide", p.id === "polytopia" || p.id === "galaxy" || p.id === "tunnel");
  let html = "";
  if (item.seal) html += `<img class="p-seal" src="${BASE}assets/au-seal.webp" alt="Austin Union Society seal">`;
  html += `<p class="p-meta mono">${item.meta}</p><h2 class="p-title">${item.title}</h2><p class="p-body">${item.body}</p>`;
  if (item.guests) html += `<p class="p-body">${item.guests}</p>`;
  if (item.points) html += `<ul class="p-points">${item.points.map((s) => `<li>${s}</li>`).join("")}</ul>`;
  if (item.figures) html += `<div class="p-figs">${item.figures.map(([b, s]) => `<div><b>${b}</b><span>${s}</span></div>`).join("")}</div>`;
  if (p.id === "galaxy") html += `<div class="eg" id="eg"></div>`;
  if (item.replay) html += `<iframe class="p-frame" src="${item.replay}" title="Polytopia-Zero replay" loading="lazy"></iframe>`;
  html += linksHTML(item);
  if (item.replay) html = html.replace('<div class="p-links">', `<div class="p-links"><button class="btn solid" data-demo="${item.replay}" data-title="Polytopia-Zero · trained agent (blue) vs. lookahead bot">Watch full screen</button>`);
  body.innerHTML = html;
  if (p.id === "galaxy") {
    eigenMod = eigenMod || (await import("./eigen.js"));
    eigenData = eigenData || (await eigenMod.loadEigen(BASE));
    eigenMod.renderEigen($("eg"), eigenData, p.galaxy, textures.galaxies.image, galaxyMeta);
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
  if (innerWidth > 800) focus.target.addScaledVector(right, dist * (panel.classList.contains("wide") || ["polytopia", "galaxy", "tunnel"].includes(p.id) ? 0.36 : 0.22));
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
for (const id of ["open-index", "hero-index"]) $(id).addEventListener("click", () => toggleIndex(true));
$("index-close").addEventListener("click", () => toggleIndex(false));
$("index-list").addEventListener("click", (e) => {
  const b = e.target.closest("button[data-id]");
  if (!b) return;
  const p = pickables.find((q) => q.id === b.dataset.id && (q.id !== "galaxy" || q.galaxy === 0));
  toggleIndex(false);
  if (!p) return;
  lenis.scrollTo(rail.timeOf(p.id) * lenis.limit, { duration: 2.2, onComplete: () => setTimeout(() => open(p), 250) });
});
const toTop = (e) => { e.preventDefault(); close(); lenis.scrollTo(0, { duration: 3 }); };
$("home").addEventListener("click", toTop);
$("outro-top").addEventListener("click", toTop);
$("hero-down").addEventListener("click", (e) => { e.preventDefault(); lenis.scrollTo(rail.timeOf("iscr") * lenis.limit, { duration: 2 }); });
addEventListener("keydown", (e) => {
  if (e.key !== "Escape") return;
  if (closeDemo()) return;
  if (indexOpen) toggleIndex(false); else close();
});

// ---------- resize + loop ----------
addEventListener("resize", () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

// Adaptive resolution: if frames run long, step the pixel ratio down (never below 1).
const frameTimes = [];
let lastT = 0, lastAdapt = 0;
function adapt(t) {
  if (t - lastAdapt < 1500 || frameTimes.length < 60) return;
  lastAdapt = t;
  const a = frameTimes.slice(-60).sort((x, y) => x - y), med = a[30];
  if (med > 21 && dpr > 1) { dpr = Math.max(1, dpr - 0.25); renderer.setPixelRatio(dpr); frameTimes.length = 0; }
}
window.__perf = () => { const a = frameTimes.slice(-120).sort((x, y) => x - y); return { median: a[a.length >> 1], p90: a[Math.floor(a.length * 0.9)], calls: renderer.info.render.calls, tris: renderer.info.render.triangles, programs: renderer.info.programs.length, dpr: renderer.getPixelRatio() }; };

let scrolledOnce = false;
renderer.setAnimationLoop((t) => {
  if (lastT) { frameTimes.push(t - lastT); if (frameTimes.length > 240) frameTimes.splice(0, 120); }
  lastT = t;
  adapt(t);
  const pr = progress();
  if (!scrolledOnce && pr > 0.004) { scrolledOnce = true; document.body.classList.add("scrolled"); }
  applyCamera(pr);
  camera.updateMatrixWorld();
  camera.getWorldDirection(camDir);
  if (band === "space") space.update(t);
  else { sky.update(t, camera); surface.update(t); under.update(t); }
  if (pointerDirty && !focus.active && !indexOpen && pr <= OUTRO_FROM) { setHover(pick(pointerX, pointerY)); pointerDirty = false; }
  trackReticle();
  updateTags();
  renderer.render(scene, camera);
});

await renderer.compileAsync(scene, camera);
requestAnimationFrame(() => document.body.classList.add("ready"));
const rest = loadRest();

window.__site = { space, get surface() { return surface; }, get under() { return under; }, get sky() { return sky; }, get terrain() { return terrain; }, camera, rail, rest };
window.__lenis = lenis;
// Debug/screenshot hooks: ?t=0.5 jumps the rail, ?open=<id> opens a panel (?g=3 picks a galaxy), ?demo=<url>.
const qs = new URLSearchParams(location.search);
await rest;
document.body.classList.add("loaded");
for (const h of (qs.get("hide") || "").split(",").filter(Boolean)) ({ space, surface, under, sky, terrain })[h].group.visible = false;
if (qs.has("t")) lenis.scrollTo(parseFloat(qs.get("t")) * lenis.limit, { immediate: true });
if (qs.has("open")) {
  const id = qs.get("open");
  const p = pickables.find((q) => q.id === id && (q.id !== "galaxy" || q.galaxy === parseInt(qs.get("g") || "0", 10)));
  if (p) setTimeout(() => open(p), 300);
}
if (qs.has("demo")) openDemo(qs.get("demo"), "");
