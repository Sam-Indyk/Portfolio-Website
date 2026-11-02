"""
Compact game record for the Polytopia-Zero island in the sky (src/world/polytopia.js).

  python tools/polytopia_island.py [public/demos/polytopia/replay.html]

Reads the replay viewer's embedded BOOT record and keeps only what the 3D board shows: terrain,
territory, cities and units per frame, and each frame's action. Writes public/assets/polytopia-game.json.
"""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / "public/demos/polytopia/replay.html"
OUT = ROOT / "public/assets/polytopia-game.json"

html = SRC.read_text(encoding="utf-8")
start = html.index("const BOOT = ") + len("const BOOT = ")
boot, _ = json.JSONDecoder().raw_decode(html[start:])

frames = []
for f in boot["frames"]:
    n = len(f["unit_type"])
    frames.append({
        "turn": f["turn"],
        # Territory as one string of owner digits ("." = nobody), to keep the file small.
        "own": "".join("." if o < 0 else str(o) for o in f["owner"]),
        # [tile, owner, level, capital, walls]
        "cities": [[i, f["city_owner"][i], f["city_level"][i], f["city_capital"][i], f["city_walls"][i]]
                   for i in range(n) if f["city_owner"][i] >= 0],
        # [tile, type, owner, hp, facing]
        "units": [[i, f["unit_type"][i], f["unit_owner"][i], f["unit_hp"][i], f["unit_facing"][i]]
                  for i in range(n) if f["unit_type"][i] >= 0 and f["unit_carried"][i] < 0],
        # [tile, improvement] for farms, mines, huts, temples...
        "imp": [[i, f["improvement"][i]] for i in range(n) if f["improvement"][i] >= 0],
        "act": [f["action"]["name"], f["action"]["src"], f["action"]["dst"]] if f.get("action") else None,
    })

game = {
    "size": boot["size"], "terrain": boot["terrain"], "tribes": boot["tribes"], "agents": boot["agents"],
    "winner": boot["winner"], "unit_names": boot["unit_names"], "improvement_names": boot["improvement_names"],
    "resource": boot["frames"][0]["resource"], "frames": frames,
}
OUT.write_text(json.dumps(game, separators=(",", ":")))
print(f"{len(frames)} frames, {boot['frames'][-1]['turn']} turns -> {OUT.relative_to(ROOT)} ({OUT.stat().st_size / 1e3:.0f} kB)")
