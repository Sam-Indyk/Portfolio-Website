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
  { t: 0.27, pos: V(0, 300, 115) },
  { t: 0.36, pos: V(0, 140, 122) },
  { t: 0.45, pos: V(0, 16, 125), at: ["union", "whitehouse", "rotunda"] },
  { t: 0.52, pos: V(0, 13, 125) },
  { t: 0.6, pos: V(-3, -6, 70) },
  { t: 0.68, pos: V(-2, -17, 34), at: ["tunnel"] },
  { t: 0.76, pos: V(3, -27, 20), at: ["polytopia"] },
  { t: 0.84, pos: V(12.3, -27.35, -8.6), at: ["dn600"] },
  { t: 0.89, pos: V(12.3, -27.35, -8.6) },
  { t: 1.0, pos: V(0, 150, 1150) },
];
export const OUTRO_FROM = 0.92;

export class Rail {
  constructor({ zScale = 1 } = {}) {
    // Narrow (portrait) screens back the camera off so each band still fits across.
    this.keys = KEYS.map((k) => ({ ...k, pos: k.t < 1 ? V(k.pos.x, k.pos.y, k.pos.z * zScale) : k.pos }));
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
