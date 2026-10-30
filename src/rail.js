// The scroll rail for the cross-section: progress t∈[0,1] -> camera position. The camera always faces
// straight ahead (-z) and only translates: down through the bands, dollying in underground, then
// pulling back at the end to show the whole column.
import * as THREE from "three";

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const smooth = (x) => x * x * (3 - 2 * x);

const KEYS = [
  { t: 0.0, pos: V(0, 600, 95) },
  { t: 0.09, pos: V(0, 528, 95), at: ["iscr", "telescope", "capsule", "galaxy"] },
  { t: 0.17, pos: V(0, 470, 100) },
  { t: 0.27, pos: V(0, 300, 112) },
  { t: 0.36, pos: V(0, 140, 118) },
  { t: 0.45, pos: V(0, 17, 118), at: ["union", "whitehouse", "rotunda"] },
  { t: 0.52, pos: V(0, 14, 118) },
  { t: 0.6, pos: V(-3, -6, 70) },
  { t: 0.68, pos: V(-2, -17, 34), at: ["tunnel"] },
  { t: 0.76, pos: V(3, -27, 20), at: ["polytopia"] },
  { t: 0.84, pos: V(12.3, -27.35, -8.6), at: ["dn600"] },
  { t: 0.89, pos: V(12.3, -27.35, -8.6) },
  { t: 1.0, pos: V(0, 150, 1150) },
];
// Phones: the orbit band is laid out taller (see space.js); on the surface the camera pans along
// the row, one building at a time, so nothing is shrunk to fit a narrow screen.
const PORTRAIT_KEYS = [
  { t: 0.0, pos: V(0, 600, 120) },
  { t: 0.09, pos: V(0, 532, 120), at: ["iscr", "telescope", "capsule", "galaxy"] },
  { t: 0.17, pos: V(0, 470, 125) },
  { t: 0.27, pos: V(-20, 300, 130) },
  { t: 0.36, pos: V(-50, 120, 110) },
  { t: 0.41, pos: V(-62, 15, 72), at: ["whitehouse"] },
  { t: 0.47, pos: V(0, 17, 118), at: ["union"] },
  { t: 0.53, pos: V(60, 14, 78), at: ["rotunda"] },
  { t: 0.6, pos: V(20, -8, 60) },
  { t: 0.68, pos: V(-6, -17, 26), at: ["tunnel"] },
  { t: 0.76, pos: V(-6.6, -27.2, 9.5), at: ["polytopia"] },
  { t: 0.84, pos: V(12.3, -27.35, -8.6), at: ["dn600"] },
  { t: 0.89, pos: V(12.3, -27.35, -8.6) },
  { t: 1.0, pos: V(0, 150, 1350) },
];
export const OUTRO_FROM = 0.92;

export class Rail {
  constructor({ portrait = false, aspect = 1.6 } = {}) {
    // Narrow landscape windows back the camera off so each band still fits across.
    const zScale = portrait ? 1 : Math.min(1.5, Math.max(1, 1.5 / aspect));
    this.keys = (portrait ? PORTRAIT_KEYS : KEYS).map((k) => ({
      ...k, pos: k.t < 1 ? V(k.pos.x, k.pos.y, k.pos.z * (k.pos.z > 10 ? zScale : 1)) : k.pos.clone(),
    }));
    this.curve = new THREE.CatmullRomCurve3(this.keys.map((k) => k.pos), false, "centripetal");
  }

  timeOf(id) {
    const k = this.keys.find((key) => key.at && key.at.includes(id));
    return k ? k.t : 0;
  }

  pose(t) {
    const keys = this.keys;
    let i = 0;
    while (i < keys.length - 2 && t > keys[i + 1].t) i++;
    const f = THREE.MathUtils.clamp((t - keys[i].t) / (keys[i + 1].t - keys[i].t), 0, 1);
    const u = (i + (f * 0.4 + smooth(f) * 0.6)) / (keys.length - 1);
    const pos = this.curve.getPoint(u);
    const target = pos.clone().add(V(0, 0, -100));

    const y = pos.y;
    let zone;
    if (t > OUTRO_FROM) zone = "";
    else if (y > 330) zone = "Low Earth orbit · 408 km";
    else if (y > 150) zone = `Atmosphere · ${Math.round(2 + ((y - 150) / 180) * 78)} km`;
    else if (y > 0) zone = "Surface";
    else zone = `Below ground · −${Math.round(-y)} m`;
    return { pos, target, zone };
  }
}
