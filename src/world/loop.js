// The Loop route the descent follows into the ground, all in the plane of the cross-section: a portal
// ramp cut down through the lawn east of the plaza, then the straight tunnel along the cut face.
// Shared by the camera (rail.js), which tracks a car down it side-on, and the tunnel (underground.js).
// Metres: +x north, +z east, the plaza at y = 0, the cut face at z = 30.
import * as THREE from "three";

const V = (x, y, z) => new THREE.Vector3(x, y, z);
export const CUT_Z = 30;
export const TUNNEL = { y: -14, r: 1.83, z: CUT_Z + 1.95, x0: -80, x1: 25 };   // the straight tunnel; its portal is at x1
export const ROAD_Y = TUNNEL.y - 1.32;
export const RAMP = { x0: TUNNEL.x1, x1: 95, z0: CUT_Z, z1: CUT_Z + 3.9 };      // the open cut, portal (x0) up to the lawn (x1)

// The ramp's road level: eased at both ends, so it leaves the lawn and meets the tunnel gently.
export function rampY(x) {
  const f = THREE.MathUtils.clamp((x - RAMP.x0) / (RAMP.x1 - RAMP.x0), 0, 1);
  return ROAD_Y * (1 - f * f * (3 - 2 * f));
}

// The road's centre line, from the lawn east of the ramp to the far end of the tunnel.
const points = [];
for (let x = 116; x > RAMP.x0; x -= 3) points.push(V(x, rampY(x), TUNNEL.z));
points.push(V(RAMP.x0, ROAD_Y, TUNNEL.z), V(0, ROAD_Y, TUNNEL.z), V(-40, ROAD_Y, TUNNEL.z), V(-78, ROAD_Y, TUNNEL.z));
export const ROUTE = new THREE.CatmullRomCurve3(points, false, "centripetal");
export const LENGTH = ROUTE.getLength();

// Arc fraction where the route first passes a condition (sampled once).
function find(test) {
  for (let i = 0; i <= 2000; i++) if (test(ROUTE.getPointAt(i / 2000))) return i / 2000;
  return 1;
}
export const S_START = find((p) => p.x < 101);       // the car waiting on the lawn at the top of the ramp
export const S_JOIN = find((p) => p.x < RAMP.x0);   // through the portal into the tunnel
export const S_END = find((p) => p.x < -2);         // where the camera lets the car go

// The tracking camera for a car at arc fraction s: off to the side (in front of the cut face), a
// little above, looking straight at the face like every other shot below ground.
export function chase(s, back = 22) {
  const car = ROUTE.getPointAt(s);
  return { car, pos: V(car.x - 1.2, car.y + 4.2, CUT_Z + back), pitch: -9, yaw: 0 };
}
