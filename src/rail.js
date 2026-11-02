// The scroll rail: progress t∈[0,1] -> camera position and pitch. Two stretches, joined by a cut that
// happens while the haze veil covers the screen: the orbit band (around the globe), then the local
// world (the sky over Austin, the plaza and the ground beneath it). The camera faces west (-z), into
// the sunset; pitch tips it down during the descent and levels it out at the plaza. Going below
// ground, it tails a car down the Loop's portal ramp (loop.js) instead of following keys.
import * as THREE from "three";
import { EARTH, AUSTIN_DIR } from "./world/space.js";
import { CUT_Z as CUT, S_START, S_END, chase } from "./world/loop.js";

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const smooth = (x) => x * x * (3 - 2 * x);
// Keys are placed in screens of scrolling (#scroll-space is 900vh: 8 screens of travel).
const s = (screens) => screens / 8;

// The dive aims straight at Austin on the globe and stops short of the surface.
const AUSTIN = EARTH.center.clone().addScaledVector(AUSTIN_DIR, EARTH.r);
function dive(from, k) {
  const pos = from.clone().lerp(AUSTIN, k);
  const d = AUSTIN.clone().sub(pos);
  return { pos, pitch: THREE.MathUtils.radToDeg(Math.atan2(d.y, -d.z)) };
}
// A key that sits on the chase camera at arc fraction sr of the Loop route.
function chaseKey(t, sr, extra) {
  const c = chase(sr);
  return { t, pos: c.pos, pitch: c.pitch, yaw: c.yaw, ...extra };
}

export const CUT_T = s(1.62);       // the jump from the orbit band to the local sky
export const SURFACE_T = s(4.23);   // standing in front of the Union
export const OUTRO_FROM = s(7.24);
const DEEP = -34.2;                 // the DN600's level (BORE.y, underground.js)
// Inside the clearing, looking back at the cutterhead as it comes through the wall toward the camera.
const CLOSE = V(2.5, DEEP + 0.55, CUT - 0.55), CLOSE_YAW = -108;

const LANDSCAPE = {
  follow: [s(4.5), s(5.15)],
  keys: [
    { t: 0, pos: V(0, 600, 95), pitch: -3 },
    { t: s(0.72), pos: V(0, 535, 75), pitch: -4, at: ["iscr", "telescope", "capsule", "galaxy"] },
    { t: s(1.08), pos: V(0, 520, 50), pitch: -14 },
    { t: s(1.485), ...dive(V(0, 520, 50), 0.6) },
    { t: CUT_T - 0.001, ...dive(V(0, 520, 50), 0.82) },
    // Local world: metres above the plaza, which sits at the origin.
    { t: CUT_T, cut: true, pos: V(0, 3600, 10500), pitch: -24 },
    // Above the cloud sea, turned toward the Polytopia island (polytopia.js) off to the right.
    { t: s(2.025), pos: V(0, 2875, 7650), pitch: -12.5, yaw: 20, at: ["polytopia"] },
    { t: s(2.43), pos: V(0, 2250, 5400), pitch: -26 },
    { t: s(2.79), pos: V(0, 1450, 3900), pitch: -27 },
    { t: s(3.33), pos: V(0, 520, 1650), pitch: -19 },
    { t: s(3.78), pos: V(0, 70, 290), pitch: -8 },
    { t: SURFACE_T, pos: V(0, 4.2, 36), pitch: 2.5, at: ["union", "whitehouse", "rotunda"] },
    // Into the ground: pull back over the lawn and drop in behind a car at the top of the Loop's
    // ramp; tail it down and round into the tunnel; swing out through the tunnel's open side.
    { t: s(4.38), pos: V(16, 10, 84), pitch: -7 },
    chaseKey(s(4.5), S_START),
    chaseKey(s(5.15), S_END),
    { t: s(5.45), pos: V(-5, -13.4, CUT + 24), pitch: -1, at: ["tunnel"] },
    // Down to the clearing, where the DN600 breaks through and the control station stands.
    { t: s(5.85), pos: V(3, -24, CUT + 22), pitch: -6 },
    { t: s(6.3), pos: V(2.5, -31, CUT + 17), pitch: -6, at: ["controls"] },
    { t: s(6.8), pos: CLOSE, pitch: -9, yaw: CLOSE_YAW, at: ["dn600"] },
    { t: 1, pos: CLOSE.clone().add(V(1.1, 0.5, 0.3)), pitch: -3, yaw: CLOSE_YAW - 2 },   // drifts back under the closing words
  ],
};
// Phones: the orbit band is laid out taller (see space.js); on the surface the camera pans along
// the row, one building at a time, so nothing is shrunk to fit a narrow screen.
const PORTRAIT = {
  follow: [s(4.62), s(5.24)],
  keys: [
    { t: 0, pos: V(0, 600, 120), pitch: -3 },
    { t: s(0.81), pos: V(0, 532, 120), pitch: -4, at: ["iscr", "telescope", "capsule", "galaxy"] },
    { t: s(1.08), pos: V(0, 520, 80), pitch: -14 },
    { t: s(1.485), ...dive(V(0, 520, 80), 0.6) },
    { t: CUT_T - 0.001, ...dive(V(0, 520, 80), 0.82) },
    { t: CUT_T, cut: true, pos: V(0, 3600, 10500), pitch: -24 },
    { t: s(2.025), pos: V(0, 2900, 7850), pitch: -10, yaw: 12, at: ["polytopia"] },
    { t: s(2.43), pos: V(0, 2250, 5400), pitch: -26 },
    { t: s(2.79), pos: V(0, 1450, 3900), pitch: -27 },
    { t: s(3.33), pos: V(0, 520, 1650), pitch: -19 },
    { t: s(3.69), pos: V(-60, 18, 110), pitch: -2, yaw: -1, at: ["whitehouse"] },
    { t: SURFACE_T, pos: V(0, 6, 76), pitch: 4, at: ["union"] },
    { t: s(4.4), pos: V(35, 8, 50), pitch: -1, yaw: 6, at: ["rotunda"] },
    chaseKey(s(4.62), S_START),
    chaseKey(s(5.24), S_END),
    { t: s(5.5), pos: V(-5, -13.4, CUT + 32), pitch: -1, at: ["tunnel"] },
    { t: s(5.9), pos: V(3, -24, CUT + 28), pitch: -6 },
    { t: s(6.3), pos: V(4, -31, CUT + 22), pitch: -6, at: ["controls"] },
    // Further back for the narrow screen, so aimed a little more along the wall to keep it centred.
    { t: s(6.8), pos: CLOSE.clone().add(V(1.4, 0.2, 0.3)), pitch: -9, yaw: CLOSE_YAW + 9, at: ["dn600"] },
    { t: 1, pos: CLOSE.clone().add(V(2.6, 0.7, 0.5)), pitch: -3, yaw: CLOSE_YAW + 8 },
  ],
};

export class Rail {
  constructor({ portrait = false, aspect = 1.6 } = {}) {
    // Narrow landscape windows back the camera off so each band still fits across (orbit band only:
    // the local world is framed by distance, not by a flat band).
    const zScale = portrait ? 1 : Math.min(1.5, Math.max(1, 1.5 / aspect));
    const layout = portrait ? PORTRAIT : LANDSCAPE;
    this.follow = layout.follow;
    this.keys = layout.keys.map((k) => ({
      yaw: 0, ...k, pos: k.t <= s(1.08) ? V(k.pos.x, k.pos.y, k.pos.z * zScale) : k.pos.clone(),
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

  // Where the followed car is along the Loop route at t (eased, so it pulls away and arrives gently).
  loopS(t) {
    const [a, b] = this.follow;
    const f = THREE.MathUtils.clamp((t - a) / (b - a), 0, 1);
    return S_START + (S_END - S_START) * (f * 0.3 + smooth(f) * 0.7);
  }

  pose(t) {
    const [fa, fb] = this.follow;
    if (t > fa && t < fb) {
      const c = chase(this.loopS(t));
      return { pos: c.pos, target: c.target, zone: c.pos.y > 0 ? "Austin, Texas · The Loop" : `The Loop · −${Math.round(-c.pos.y)} m`, local: true };
    }
    const st = this.stretches.findLast((x) => t >= x.keys[0].t) || this.stretches[0];
    const keys = st.keys, n = keys.length;
    let i = 0;
    while (i < n - 2 && t > keys[i + 1].t) i++;
    const f = n > 1 ? THREE.MathUtils.clamp((t - keys[i].t) / (keys[i + 1].t - keys[i].t), 0, 1) : 0;
    const e = f * 0.4 + smooth(f) * 0.6;
    const pos = n > 1 ? st.curve.getPoint((i + e) / (n - 1)) : keys[0].pos.clone();
    const k1 = keys[Math.min(i + 1, n - 1)];
    const pitch = THREE.MathUtils.degToRad(THREE.MathUtils.lerp(keys[i].pitch, k1.pitch, e));
    const yaw = THREE.MathUtils.degToRad(THREE.MathUtils.lerp(keys[i].yaw, k1.yaw, e));
    const dir = V(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch));
    const target = pos.clone().addScaledVector(dir, 100);

    const local = t >= CUT_T, entry = s(1.08);
    let zone;
    if (t > OUTRO_FROM) zone = "";
    else if (!local) zone = t < entry ? "Low Earth orbit · 408 km" : `Re-entry · ${Math.round(THREE.MathUtils.lerp(408, 90, smooth(THREE.MathUtils.clamp((t - entry) / (CUT_T - entry), 0, 1))))} km`;
    else if (pos.y > 2400) zone = `Austin, Texas · ${(pos.y / 1000).toFixed(1)} km`;
    else if (pos.y > 30) zone = `Austin, Texas · ${Math.round(pos.y / 10) * 10} m`;
    else if (pos.y > 0) zone = "Austin, Texas";
    else zone = `Below ground · −${Math.round(-pos.y)} m`;
    return { pos, target, zone, local };
  }
}

