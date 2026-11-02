# samuelindyk.com

One continuous 3D scene. Scrolling dives from low Earth orbit toward Austin, through a sunset cloud sea, over the real terrain onto the Austin Union's plaza, follows a car down into the Loop, and drops to a clearing where a micro-TBM breaks through. Work is shown as objects in the scene: hover for a label, click to fly in and open details. The design spec is in [docs/DESIGN.md](docs/DESIGN.md).

Built with Vite, three.js, GSAP and Lenis.

## Run

```sh
npm install
npm run dev        # http://127.0.0.1:5173
npm run build      # -> dist/
```

Debug hooks: `?t=0.5` jumps the scroll rail, and `?open=union` opens a panel (`?open=galaxy&g=3` opens galaxy #3).

## Layout

| Path | What it is |
|---|---|
| `src/main.js` | Renderer, loading and the scroll lock, band switching, veils, picking, reticle, panel, Index |
| `src/rail.js` | Scroll progress → camera position and pitch, the cut from orbit to the local sky, the chase down the Loop, zone label |
| `src/world/loop.js` | The Loop route (portal ramp, bored curve, straight tunnel) shared by the camera and the tunnel |
| `src/world/space.js` | Earth shader (Texas blended in for the dive), stars, real galaxies, ISCR array, telescope, Crew Dragon |
| `src/world/sky.js` | Camera-centred sunset sky, the haze everything fades into, the cloud sea |
| `src/world/terrain.js` | Real Austin elevation and aerial imagery out to the horizon, lawn near the plaza |
| `src/world/polytopia.js` | Polytopia-Zero island above the clouds, replaying a real game move by move |
| `src/world/surface.js` | Austin Union chamber (banner and lecterns for the vote), White House, rotunda, trees |
| `src/world/underground.js` | Strata, the Loop with traffic (TBC), the clearing with the control station's GUI, DN600 from CadQuery breaking through |
| `src/union.js`, `src/votes.js` | The Union's motions and votes; tallies in Supabase |
| `src/eigen.js` | Eigen-decomposition panel for any sky galaxy |
| `src/content.js` | All copy, including the Union's motions |
| `supabase/migrations/` | The vote tables and functions |
| `public/demos/` | Deblurring app, DN600 assembly viewer, Polytopia-Zero replays, legacy EigenGalaxy explorer |
| `tools/` | Asset builders (galaxy atlas, DN600 binary, Earth textures, Poly Haven fetch, Austin terrain, Polytopia game) |

## Regenerating assets

```sh
python tools/build_assets.py tbm public/demos/tbm-viewer/data/I.json
python tools/build_assets.py galaxies ../EigenGalactic        # EigenGalactic venv
python tools/earth_textures.py <folder of NASA / Solar System Scope maps>
python tools/fetch_polyhaven.py
python tools/austin_terrain.py [cache-dir]                     # NAIP imagery, 3DEP elevation, Texas map
python tools/polytopia_island.py                               # game record for the island, from the replay
```

## Union votes

Tallies live in Supabase. The schema is `supabase/migrations/20261101120000_union_votes.sql`: two tables
behind row level security and two functions (`union_tallies`, `union_vote`), which are all the public
key can reach. With the Supabase GitHub integration set to deploy to production, it is applied when this
merges to `main`; it is also safe to paste into the SQL editor by hand. To add a motion, add it to
`UNION_MOTIONS` in `src/content.js` and add its row in a new migration.

Polytopia replays come from `polytopia-zero/scripts/record_replay.py --p0 net --net <best.pt> --p1 osla`.

## Credits

Earth and Texas: NASA Blue Marble. Night lights, clouds, normal and specular maps: Solar System Scope (CC BY 4.0). Galaxies: Galaxy Zoo 2 / SDSS. Austin imagery: USDA NAIP via USGS; elevation: USGS 3DEP (public domain). Sky, ground, plaster, stone, concrete, asphalt, rock and wood: Poly Haven (CC0).
