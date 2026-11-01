// The scroll rail: progress t∈[0,1] -> camera position and pitch. Two stretches, joined by a cut that
// happens while the haze veil covers the screen: the orbit band (around the globe), then the local
// world (the sky over Austin, the plaza and the ground beneath it). The camera faces west (-z), into
// the sunset; pitch tips it down during the descent and levels it out at the plaza.
import * as THREE from "three";
import { EARTH, AUSTIN_DIR } from "./world/space.js";

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const smooth = (x) => x * x * (3 - 2 * x);

// The dive aims straight at Austin on the globe and stops short of the surface.
const AUSTIN = EARTH.center.clone().addScaledVector(AUSTIN_DIR, EARTH.r);
function dive(from, k) {
  const pos = from.clone().lerp(AUSTIN, k);
  const d = AUSTIN.clone().sub(pos);
  return { pos, pitch: THREE.MathUtils.radToDeg(Math.atan2(d.y, -d.z)) };
}

export const CUT_T = 0.18;     // the jump from the orbit band to the local sky
export const SURFACE_T = 0.47; // standing in front of the Union
export const OUTRO_FROM = 0.92;

const KEYS = [
  { t: 0.0, pos: V(0, 600, 95), pitch: -3 },
  { t: 0.08, pos: V(0, 535, 75), pitch: -4, at: ["iscr", "telescope", "capsule", "galaxy"] },
  { t: 0.12, pos: V(0, 520, 50), pitch: -14 },
  { t: 0.165, ...dive(V(0, 520, 50), 0.6) },
  { t: CUT_T - 0.001, ...dive(V(0, 520, 50), 0.82) },
  // Local world: metres above the plaza, which sits at the origin.
  { t: CUT_T, cut: true, pos: V(0, 3600, 10500), pitch: -24 },
  { t: 0.225, pos: V(0, 2900, 7600), pitch: -11, at: ["polytopia"] },
  { t: 0.27, pos: V(0, 2250, 5400), pitch: -26 },
  { t: 0.31, pos: V(0, 1450, 3900), pitch: -27 },
  { t: 0.37, pos: V(0, 520, 1650), pitch: -19 },
  { t: 0.42, pos: V(0, 70, 290), pitch: -8 },
  { t: SURFACE_T, pos: V(0, 4.2, 36), pitch: 2.5, at: ["union", "whitehouse", "rotunda"] },
  { t: 0.53, pos: V(0, 3.6, 31), pitch: 1 },
  { t: 0.6, pos: V(-3, -6, 50), pitch: 0 },
  { t: 0.68, pos: V(-2, -17, 34), pitch: 0, at: ["tunnel"] },
  { t: 0.84, pos: V(12.3, -27.35, -8.6), pitch: 0, at: ["dn600"] },
  { t: 0.89, pos: V(12.3, -27.35, -8.6), pitch: 0 },
  { t: 1.0, pos: V(12.3, -27.35, -8.6), pitch: 0 },
];
// Phones: the orbit band is laid out taller (see space.js); on the surface the camera pans along
// the row, one building at a time, so nothing is shrunk to fit a narrow screen.
const PORTRAIT_KEYS = [
  { t: 0.0, pos: V(0, 600, 120), pitch: -3 },
  { t: 0.09, pos: V(0, 532, 120), pitch: -4, at: ["iscr", "telescope", "capsule", "galaxy"] },
  { t: 0.12, pos: V(0, 520, 80), pitch: -14 },
  { t: 0.165, ...dive(V(0, 520, 80), 0.6) },
  { t: CUT_T - 0.001, ...dive(V(0, 520, 80), 0.82) },
  { t: CUT_T, cut: true, pos: V(0, 3600, 10500), pitch: -24 },
  { t: 0.225, pos: V(0, 2900, 7600), pitch: -11, at: ["polytopia"] },
  { t: 0.27, pos: V(0, 2250, 5400), pitch: -26 },
  { t: 0.31, pos: V(0, 1450, 3900), pitch: -27 },
  { t: 0.37, pos: V(0, 520, 1650), pitch: -19 },
  { t: 0.41, pos: V(-60, 30, 160), pitch: -4, yaw: -14, at: ["whitehouse"] },
  { t: SURFACE_T, pos: V(0, 6, 76), pitch: 4, at: ["union"] },
  { t: 0.53, pos: V(40, 12, 60), pitch: 0, yaw: 16, at: ["rotunda"] },
  { t: 0.6, pos: V(20, -8, 60), pitch: 0 },
  { t: 0.68, pos: V(-6, -17, 26), pitch: 0, at: ["tunnel"] },
  { t: 0.84, pos: V(12.3, -27.35, -8.6), pitch: 0, at: ["dn600"] },
  { t: 0.89, pos: V(12.3, -27.35, -8.6), pitch: 0 },
  { t: 1.0, pos: V(12.3, -27.35, -8.6), pitch: 0 },
];

export class Rail {
  constructor({ portrait = false, aspect = 1.6 } = {}) {
    // Narrow landscape windows back the camera off so each band still fits across (orbit band only:
    // the local world is framed by distance, not by a flat band).
    const zScale = portrait ? 1 : Math.min(1.5, Math.max(1, 1.5 / aspect));
    this.keys = (portrait ? PORTRAIT_KEYS : KEYS).map((k) => ({
      yaw: 0, ...k, pos: k.t <= 0.12 ? V(k.pos.x, k.pos.y, k.pos.z * zScale) : k.pos.clone(),
    }));
    // One curve per stretch, so the camera never swings through the cut.
    this.stretches = [];
    let start = 0;
    this.keys.forEach((k, i) => {
      if (i > 0 && k.cut) { this.stretches.push(this.#stretch(start, i - 1)); start = i; }
    });
    this.stretches.push(this.#stretch(start, this.keys.length - 1));
  }

  #stretch(a, b) {
    const keys = this.keys.slice(a, b + 1);
    return { keys, curve: new THREE.CatmullRomCurve3(keys.map((k) => k.pos), false, "centripetal") };
  }

  timeOf(id) {
    const k = this.keys.find((key) => key.at && key.at.includes(id));
    return k ? k.t : 0;
  }

  pose(t) {
    const s = this.stretches.findLast((x) => t >= x.keys[0].t) || this.stretches[0];
    const keys = s.keys, n = keys.length;
    let i = 0;
    while (i < n - 2 && t > keys[i + 1].t) i++;
    const f = n > 1 ? THREE.MathUtils.clamp((t - keys[i].t) / (keys[i + 1].t - keys[i].t), 0, 1) : 0;
    const e = f * 0.4 + smooth(f) * 0.6;
    const pos = n > 1 ? s.curve.getPoint((i + e) / (n - 1)) : keys[0].pos.clone();
    const k1 = keys[Math.min(i + 1, n - 1)];
    const pitch = THREE.MathUtils.degToRad(THREE.MathUtils.lerp(keys[i].pitch, k1.pitch, e));
    const yaw = THREE.MathUtils.degToRad(THREE.MathUtils.lerp(keys[i].yaw, k1.yaw, e));
    const dir = V(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch));
    const target = pos.clone().addScaledVector(dir, 100);

    const local = t >= CUT_T;
    let zone;
    if (t > OUTRO_FROM) zone = "";
    else if (!local) zone = t < 0.12 ? "Low Earth orbit · 408 km" : `Re-entry · ${Math.round(THREE.MathUtils.lerp(408, 90, smooth(THREE.MathUtils.clamp((t - 0.12) / (CUT_T - 0.12), 0, 1))))} km`;
    else if (pos.y > 2400) zone = `Austin, Texas · ${(pos.y / 1000).toFixed(1)} km`;
    else if (pos.y > 30) zone = `Austin, Texas · ${Math.round(pos.y / 10) * 10} m`;
    else if (pos.y > 0) zone = "Austin, Texas";
    else zone = `Below ground · −${Math.round(-pos.y)} m`;
    return { pos, target, zone, local };
  }
}
