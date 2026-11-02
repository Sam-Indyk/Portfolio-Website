// Polytopia-Zero as an island floating above the cloud sea: the real 9×9 board from one of the
// trained agent's games (tools/polytopia_island.py), replayed move by move on a loop. Blue is the
// trained agent, red the lookahead bot it never trained against. Units are metres; the board is
// turned so a corner points at the camera's stop (yawed ~20°), reading as Polytopia's diamond.
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

export const ISLAND = { pos: new THREE.Vector3(95, 2815, 7400), tile: 12 };
const TRIBE = [new THREE.Color(0x4da3ff), new THREE.Color(0xff6b6b)];
const TERRAIN = { ocean: 0, water: 1, field: 2, forest: 3, mountain: 4 };
// How long each kind of frame plays (s): moves and fights read, bookkeeping flicks past.
const PACE = { MOVE: 0.62, ATTACK: 0.8, TRAIN: 0.55, CAPTURE: 0.9, BUILD: 0.45, END_TURN: 0.22 };

const lambert = (hex) => new THREE.MeshLambertMaterial({ color: hex, flatShading: true });
const box = (w, h, d, x = 0, y = 0, z = 0) => new THREE.BoxGeometry(w, h, d).translate(x, y, z);
const cone = (r, h, seg, x = 0, y = 0, z = 0) => new THREE.ConeGeometry(r, h, seg).translate(x, y + h / 2, z);
const cyl = (r0, r1, h, seg, x = 0, y = 0, z = 0) => new THREE.CylinderGeometry(r0, r1, h, seg).translate(x, y + h / 2, z);
const merge = (parts) => mergeGeometries(parts.map((g) => (g.index ? g.toNonIndexed() : g)).map((g) => { g.deleteAttribute("uv"); return g; }));

// One chunky game piece per unit type, about 7 m tall on a 12 m tile: body in the tribe's colour,
// with a wooden or metal accent that tells the types apart.
function pieceGeometries() {
  const body = (r) => [cyl(r, r * 1.25, 3.2, 10), new THREE.SphereGeometry(r * 0.8, 10, 8).translate(0, 4.1, 0)];
  return {
    0: { body: merge(body(1.1)), accent: merge([box(0.35, 3.4, 0.35, 1.5, 1.6, 0.4), box(1.3, 0.3, 0.3, 1.5, 2.6, 0.4)]) },          // warrior: sword
    1: { body: merge(body(1.0)), accent: merge([new THREE.TorusGeometry(1.4, 0.16, 6, 14, Math.PI).rotateY(Math.PI / 2).translate(1.4, 2.6, 0)]) }, // archer: bow
    2: { body: merge([box(1.6, 1.8, 3.6, 0, 1.6, 0), ...body(0.95).map((g) => g.translate(0, 1.6, -0.4))]), accent: merge([box(0.5, 1.6, 0.5, 0, 0.8, 1.3), box(0.5, 1.6, 0.5, 0, 0.8, -1.3), box(0.9, 1.1, 1.2, 0, 2.6, 2.1)]) }, // rider: horse
    8: { body: merge(body(2.0).map((g) => g.scale(1, 1.5, 1))), accent: merge([box(0.6, 4.8, 0.6, 2.6, 2.6, 0)]) },                // giant
  };
}

export async function buildPolytopia({ base, fetchAs }) {
  const game = await fetchAs(`${base}assets/polytopia-game.json`, "json");
  const N = game.size, T = ISLAND.tile;
  const group = new THREE.Group();
  group.position.copy(ISLAND.pos);
  const board = new THREE.Group();
  board.rotation.y = Math.PI / 4 - 0.35;
  group.add(board);
  const at = (i, y = 0) => new THREE.Vector3((i % N - (N - 1) / 2) * T, y, (Math.floor(i / N) - (N - 1) / 2) * T);
  let seed = 9;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

  // ---------- the board: tiles, the rock it floats on, trees and mountains ----------
  const tops = { ocean: [], water: [], field: [], forest: [], mountain: [] }, rock = [], trees = [], peaks = [], snow = [];
  const top = { 0: -1.6, 1: -0.9, 2: 0, 3: 0, 4: 0 };
  game.terrain.forEach((t, i) => {
    const p = at(i), name = Object.keys(TERRAIN)[t], g = T - 0.5;
    tops[name].push(box(g, 2.2, g, p.x, top[t] - 1.1, p.z));
    // A jagged block of rock under every tile, deeper toward the middle of the island.
    const d = Math.hypot(p.x, p.z) / (T * N * 0.5);
    const depth = (t <= 1 ? 7 : 12) + (1 - d) * 26 + rnd() * 10;
    rock.push(new THREE.ConeGeometry(T * 0.72, depth, 5).rotateX(Math.PI).rotateY(rnd() * 6).translate(p.x, top[t] - 2.2 - depth / 2, p.z));
    if (t === TERRAIN.forest) for (let k = 0; k < 3; k++) {
      const x = p.x + (rnd() - 0.5) * 7, z = p.z + (rnd() - 0.5) * 7, h = 4 + rnd() * 2.5;
      trees.push(cone(1.6, h, 6, x, 0.6, z), cyl(0.3, 0.35, 0.8, 5, x, 0, z));
    }
    if (t === TERRAIN.mountain) {
      const h = 9 + rnd() * 3;
      peaks.push(cone(4.8, h, 5, p.x, 0, p.z).rotateY(0));
      snow.push(cone(1.9, h * 0.38, 5, p.x, h * 0.62 + 0.05, p.z));
    }
  });
  const colours = { ocean: 0x2f86d6, water: 0x48c2d8, field: 0x8cc657, forest: 0x77b54c, mountain: 0x8fbf5a };
  for (const [name, parts] of Object.entries(tops)) if (parts.length) board.add(new THREE.Mesh(merge(parts), lambert(colours[name])));
  board.add(new THREE.Mesh(merge(rock), lambert(0x8a6a4a)));
  if (trees.length) board.add(new THREE.Mesh(merge(trees), lambert(0x2f7d3a)));
  if (peaks.length) board.add(new THREE.Mesh(merge(peaks), lambert(0x9aa1a8)), new THREE.Mesh(merge(snow), lambert(0xf4f6f8)));

  // ---------- territory: a thin frame in the owner's colour around each claimed tile ----------
  const frameGeo = merge([box(T - 0.6, 0.35, 0.5, 0, 0, -(T - 1.1) / 2), box(T - 0.6, 0.35, 0.5, 0, 0, (T - 1.1) / 2), box(0.5, 0.35, T - 0.6, -(T - 1.1) / 2), box(0.5, 0.35, T - 0.6, (T - 1.1) / 2)]);
  const frames = new THREE.InstancedMesh(frameGeo, new THREE.MeshLambertMaterial({ color: 0xffffff }), N * N);
  const m4 = new THREE.Matrix4(), zero = new THREE.Matrix4().makeScale(0, 0, 0);
  board.add(frames);
  function territory(own) {
    for (let i = 0; i < N * N; i++) {
      if (own[i] === ".") { frames.setMatrixAt(i, zero); continue; }
      frames.setMatrixAt(i, m4.makeTranslation(at(i, top[game.terrain[i]] + 0.2)));
      frames.setColorAt(i, TRIBE[Number(own[i])]);
    }
    frames.instanceMatrix.needsUpdate = true;
    if (frames.instanceColor) frames.instanceColor.needsUpdate = true;
  }

  // ---------- cities and improvements, rebuilt when they change ----------
  const wallMat = lambert(0xd9cbb0), roofMats = TRIBE.map((c) => lambert(c)), stone = lambert(0xb5aea3), farmMat = lambert(0xe2c25a);
  const towns = new THREE.Group();
  board.add(towns);
  let townKey = "";
  function buildTowns(f) {
    const key = JSON.stringify([f.cities, f.imp]);
    if (key === townKey) return;
    townKey = key;
    towns.clear();
    for (const [tile, owner, level, capital, walls] of f.cities) {
      const p = at(tile), houses = [], roofs = [];
      // Houses ring the tile and the capital's tower stands in a corner, leaving the middle for a unit.
      const n = Math.min(2 + level, 6);
      for (let k = 0; k < n; k++) {
        const a = (k / n) * Math.PI * 2 + 0.4, x = p.x + Math.cos(a) * 3.9, z = p.z + Math.sin(a) * 3.9;
        houses.push(box(2.6, 2.4, 2.6, x, 1.2, z));
        roofs.push(cone(2.3, 1.8, 4, x, 2.4, z).rotateY(0));
      }
      if (capital) { houses.push(box(2.2, 6, 2.2, p.x - 3.6, 3, p.z - 3.6)); roofs.push(cone(1.9, 2.6, 4, p.x - 3.6, 6, p.z - 3.6)); }
      if (walls) houses.push(...[0, 1, 2, 3].map((s) => box(s % 2 ? 0.6 : T - 1.5, 1.2, s % 2 ? T - 1.5 : 0.6, p.x + (s === 1 ? 5.2 : s === 3 ? -5.2 : 0), 0.6, p.z + (s === 0 ? 5.2 : s === 2 ? -5.2 : 0))));
      if (owner < 0) continue;
      towns.add(new THREE.Mesh(merge(houses), wallMat), new THREE.Mesh(merge(roofs), roofMats[owner]));
    }
    const farms = [], marks = [];
    for (const [tile, imp] of f.imp) {
      const name = game.improvement_names[imp], p = at(tile, top[game.terrain[tile]]);
      if (name === "farm") farms.push(box(T - 3, 0.3, T - 3, p.x, p.y + 0.15, p.z));
      else if (name === "lighthouse") marks.push(cyl(0.9, 1.2, 5, 8, p.x, p.y, p.z));
      else if (name === "ruin") for (let k = 0; k < 3; k++) marks.push(box(1.4, 1 + k * 0.6, 1.4, p.x - 2 + k * 2, p.y + 0.5, p.z + (k % 2) * 1.5));
      else if (name !== "road") marks.push(box(2.4, 2.4, 2.4, p.x, p.y + 1.2, p.z), cone(1.9, 2, 4, p.x, p.y + 2.4, p.z));
    }
    if (farms.length) towns.add(new THREE.Mesh(merge(farms), farmMat));
    if (marks.length) towns.add(new THREE.Mesh(merge(marks), stone));
  }

  // ---------- units: one piece per unit, moved, trained and removed as the record says ----------
  const shapes = pieceGeometries();
  const bodyMats = TRIBE.map((c) => new THREE.MeshLambertMaterial({ color: c, flatShading: true, emissive: c, emissiveIntensity: 0.15 }));
  const accentMat = lambert(0x6b4a2b);
  const pieces = new Map();   // tile -> { obj, type, owner, from, to, scale, target, lunge }
  const leaving = new Set();  // pieces taken off the board, shrinking away
  const units = new THREE.Group();
  board.add(units);
  function makePiece(tile, type, owner) {
    const s = shapes[type] || shapes[0];
    const obj = new THREE.Group();
    obj.add(new THREE.Mesh(s.body, bodyMats[owner]), new THREE.Mesh(s.accent, accentMat));
    obj.position.copy(at(tile, top[game.terrain[tile]]));
    obj.rotation.y = owner === 0 ? -Math.PI / 4 : (3 * Math.PI) / 4;
    obj.scale.setScalar(0.001);
    obj.userData.size = type === 8 ? 1.25 : 1.35;
    units.add(obj);
    return { obj, type, owner, from: obj.position.clone(), to: obj.position.clone(), scale: 0, target: 1, lunge: null };
  }
  function moveTo(p, tile) {
    p.from.copy(p.obj.position);
    p.to.copy(at(tile, top[game.terrain[tile]]));
  }

  let frame = 0, clock = 0, hold = 0;
  function apply(k) {
    const f = game.frames[k], act = f.act;
    territory(f.own);
    buildTowns(f);
    const next = new Map(f.units.map((u) => [u[0], u]));
    // A move (or a kill that steps into the tile) carries the piece across.
    if (act && (act[0] === "MOVE" || act[0] === "ATTACK") && pieces.has(act[1])) {
      const p = pieces.get(act[1]), u = next.get(act[2]);
      if (act[0] === "ATTACK") p.lunge = { toward: at(act[2], top[game.terrain[act[2]]]), t: 0 };
      if (!next.has(act[1]) && u && u[1] === p.type && u[2] === p.owner) {
        const victim = pieces.get(act[2]);
        if (victim && victim !== p) { leaving.add(victim); pieces.delete(act[2]); }
        pieces.delete(act[1]);
        pieces.set(act[2], p);
        moveTo(p, act[2]);
        p.lunge = null;
      }
    }
    for (const [tile, p] of pieces) {
      const u = next.get(tile);
      if (!u || u[1] !== p.type || u[2] !== p.owner) { leaving.add(p); pieces.delete(tile); }
    }
    for (const [tile, u] of next) if (!pieces.has(tile)) pieces.set(tile, makePiece(tile, u[1], u[2]));
  }
  function reset() {
    units.clear();
    pieces.clear();
    leaving.clear();
    frame = 0;
    apply(0);
  }
  reset();

  const pickTarget = new THREE.Mesh(new THREE.BoxGeometry(N * T, 30, N * T).translate(0, -10, 0));
  const tagAt = new THREE.Mesh(new THREE.BoxGeometry(10, 4, 10).translate(0, 18, 0));   // big enough to clear the 6 px cut-off at this distance
  pickTarget.visible = tagAt.visible = false;
  board.add(pickTarget, tagAt);
  group.updateMatrixWorld(true);

  return {
    group,
    pickables: [{ id: "polytopia", object: pickTarget, tagAnchor: tagAt, focus: { pos: ISLAND.pos.clone().add(new THREE.Vector3(-38, 62, 120)), target: ISLAND.pos.clone().add(new THREE.Vector3(0, 4, 0)) } }],
    update(t, dt) {
      group.position.y = ISLAND.pos.y + Math.sin(t * 0.0006) * 1.2;
      // Advance the game.
      clock += dt;
      const f = game.frames[frame];
      const pace = (f.act && PACE[f.act[0]]) || 0.12;
      if (frame === game.frames.length - 1) {
        hold += dt;
        if (hold > 4) { hold = 0; clock = 0; reset(); }
      } else if (clock > pace) {
        clock = 0;
        frame++;
        apply(frame);
      }
      const k = Math.min(1, clock / Math.max(0.2, pace * 0.8)), e = k * k * (3 - 2 * k);
      for (const p of pieces.values()) {
        p.scale += (p.target - p.scale) * Math.min(1, dt * 8);
        p.obj.scale.setScalar(Math.max(0.001, p.scale) * p.obj.userData.size);
        if (!p.from.equals(p.to)) {
          p.obj.position.lerpVectors(p.from, p.to, e);
          p.obj.position.y += Math.sin(e * Math.PI) * 3;
          if (e >= 1) p.from.copy(p.to);
        }
        if (p.lunge) {
          const s = Math.sin(Math.min(1, k) * Math.PI) * 0.35;
          p.obj.position.lerpVectors(p.to, p.lunge.toward, s);
          if (k >= 1) { p.obj.position.copy(p.to); p.lunge = null; }
        }
      }
      for (const p of leaving) {
        p.scale += (0 - p.scale) * Math.min(1, dt * 8);
        p.obj.scale.setScalar(Math.max(0.001, p.scale));
        if (p.scale < 0.02) { units.remove(p.obj); leaving.delete(p); }
      }
    },
  };
}
