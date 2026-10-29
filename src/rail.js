// The scroll rail: scroll progress t∈[0,1] -> camera pose, active stage, veil and zone label.
import * as THREE from "three";

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const smooth = (x) => x * x * (3 - 2 * x);

export class Rail {
  constructor({ R, eye: E, galaxyDir, tunnelLen: L, shaft: S, pickables }) {
    const obj = (id) => pickables.find((p) => p.id === id);
    const center = (id) => new THREE.Box3().setFromObject(obj(id).object).getCenter(new THREE.Vector3());
    const look = (from, dir, d = 10) => from.clone().addScaledVector(dir, d);

    // Keyframes per stage. `at` names the pickable this frame is "about" (for Index jumps).
    this.stages = [
      {
        name: "space", from: 0, to: 0.33,
        keys: [
          { t: 0.0, pos: V(0, E, 2.5), target: V(0, E - 3.4, -12) },
          { t: 0.075, pos: V(0.5, E + 0.25, 1.6), target: center("iscr"), at: "iscr" },
          { t: 0.145, pos: V(-0.35, E + 0.45, 0.25), target: center("telescope"), at: "telescope" },
          { t: 0.205, pos: V(0.1, E + 0.12, 2.4), target: center("capsule"), at: "capsule" },
          { t: 0.26, pos: V(0, E + 0.3, 0.6), target: look(V(0, E + 0.3, 0.6), galaxyDir, 10), at: "galaxy" },
          { t: 0.33, pos: V(0, R + 1.6, -3.0), target: V(0, R - 3, -11) },
        ],
      },
      {
        name: "surface", from: 0.33, to: 0.68,
        keys: [
          { t: 0.33, pos: V(0, 1500, 4300), target: V(0, 700, 0) },
          { t: 0.375, pos: V(0, 560, 1800), target: V(0, 60, 0) },
          { t: 0.415, pos: V(0, 110, 430), target: V(0, 12, 0) },
          { t: 0.45, pos: V(0, 24, 112), target: V(0, 7, 0) },
          { t: 0.505, pos: V(5, 7, 36), target: V(0, 6, -2), at: "union" },
          { t: 0.565, pos: V(-16, 9, 40), target: V(-48, 10, -6), at: "whitehouse" },
          { t: 0.625, pos: V(22, 8, 32), target: V(48, 9, -8), at: "rotunda" },
          { t: 0.68, pos: V(0, 5, 26), target: V(0, -40, -6) },
        ],
      },
      {
        name: "underground", from: 0.68, to: 1,
        keys: [
          { t: 0.68, pos: V(0, 0.1, 3), target: V(0, 0.05, -20) },
          { t: 0.745, pos: V(-0.25, 0.12, -12.5), target: V(1.1, -0.35, -18.5), at: "tunnel" },
          { t: 0.82, pos: V(0, 0.15, -60), target: V(0, 0.1, -85) },
          { t: 0.875, pos: V(0, 0.2, -L + 3), target: V(S.x, 0, S.z) },
          { t: 0.935, pos: V(S.x + 1.7, -0.2, S.z - 3.1), target: center("dn600"), at: "dn600" },
          { t: 1.0, pos: V(S.x - 2.4, 0.25, S.z + 3.4), target: center("polytopia"), at: "polytopia" },
        ],
      },
    ];
    for (const s of this.stages) {
      s.pos = new THREE.CatmullRomCurve3(s.keys.map((k) => k.pos), false, "centripetal");
      s.tgt = new THREE.CatmullRomCurve3(s.keys.map((k) => k.target), false, "centripetal");
    }
    this.eye = E; this.R = R;
  }

  timeOf(id) {
    for (const s of this.stages) for (const k of s.keys) if (k.at === id) return k.t;
    return 0;
  }

  pose(t) {
    const s = this.stages.find((st) => t <= st.to) || this.stages[this.stages.length - 1];
    const keys = s.keys;
    let i = 0;
    while (i < keys.length - 2 && t > keys[i + 1].t) i++;
    const a = keys[i], b = keys[i + 1];
    const f = THREE.MathUtils.clamp((t - a.t) / (b.t - a.t), 0, 1);
    // Mostly linear with a gentle dwell near each keyframe.
    const u = (i + (f * 0.55 + smooth(f) * 0.45)) / (keys.length - 1);
    const pos = s.pos.getPoint(u), target = s.tgt.getPoint(u);

    // Veil between stages: warm atmosphere glow into the sky, black into the ground.
    // Entering the atmosphere brightens (screen blend); going underground darkens.
    let veil = 0, veilColor = "#000", veilBlend = "normal";
    const near = (x, c, w) => Math.max(0, 1 - Math.abs(x - c) / w);
    if (Math.abs(t - 0.33) < 0.022) { veil = Math.pow(smooth(near(t, 0.33, 0.022)), 0.6); veilColor = "#f3ece6"; veilBlend = "screen"; }
    if (Math.abs(t - 0.68) < 0.028) { veil = smooth(near(t, 0.68, 0.028)); veilColor = "#030303"; }

    let zone;
    if (s.name === "space") zone = `Low Earth orbit · ${Math.round(408 - Math.max(0, t - 0.27) * 1800)} km`;
    else if (s.name === "surface") zone = pos.y > 60 ? `Atmosphere · ${(pos.y / 1000).toFixed(1)} km` : "Surface";
    else zone = `Below ground · −${Math.round(12 + (t - 0.68) * 22)} m`;

    return { stage: s.name, pos, target, veil, veilColor, veilBlend, zone };
  }
}
