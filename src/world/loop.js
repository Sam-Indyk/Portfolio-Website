// The Loop route the descent follows into the ground: a portal ramp east of the plaza, a bored curve
// under the lawn, then the straight tunnel along the cross-section. Shared by the camera (rail.js),
// which tails a car along it, and the tunnel itself (underground.js). Metres: +x north, +z east, the
// plaza at y = 0, the cut face at z = 30.
import * as THREE from "three";

const V = (x, y, z) => new THREE.Vector3(x, y, z);
export const CUT_Z = 30;
export const TUNNEL = { y: -14, r: 1.83, z: CUT_Z + 1.95, x0: -80, x1: 80 };
export const ROAD_Y = TUNNEL.y - 1.32;
export const RAMP = { x: 30, half: 2.3, top: 118, portal: 72 };   // open cut from z = top down to the portal

// The road's centre line, from behind the top of the ramp to the far end of the straight tunnel.
export const ROUTE = new THREE.CatmullRomCurve3([
  V(30, 0.05, 128), V(30, 0.05, 114), V(30, -2.4, 100), V(30, -5.8, 86), V(30, -9.4, 70),
  V(29.4, -12.6, 56), V(26.4, ROAD_Y + 0.05, 44), V(18, ROAD_Y, 35.4), V(6, ROAD_Y, TUNNEL.z),
  V(-20, ROAD_Y, TUNNEL.z), V(-75, ROAD_Y, TUNNEL.z),
], false, "centripetal");
export const LENGTH = ROUTE.getLength();

// Arc fraction where the route first passes a condition (sampled once).
function find(test) {
  for (let i = 0; i <= 2000; i++) if (test(ROUTE.getPointAt(i / 2000))) return i / 2000;
  return 1;
}
export const S_START = find((p) => p.z < 114.5);          // the car waiting at the top of the ramp
export const S_PORTAL = find((p) => p.z < RAMP.portal);    // into the bored tunnel
export const S_JOIN = find((p) => p.z < TUNNEL.z + 1.6);   // onto the straight tunnel
export const S_END = find((p) => p.x < -1);                // where the camera lets the car go

// The chase camera for a car at arc fraction s: a little behind and above it, looking down the road.
const tmp = new THREE.Vector3();
export function chase(s) {
  const car = ROUTE.getPointAt(s);
  const pos = ROUTE.getPointAt(Math.max(0, s - 8.5 / LENGTH)).add(tmp.set(0, 2.25, 0));
  const target = ROUTE.getPointAt(Math.min(1, s + 9 / LENGTH)).add(tmp.set(0, 1.05, 0));
  const d = target.clone().sub(pos).normalize();
  return {
    pos, target, car,
    yaw: THREE.MathUtils.radToDeg(Math.atan2(d.x, -d.z)), pitch: THREE.MathUtils.radToDeg(Math.asin(d.y)),
  };
}
