# samuelindyk.com

One continuous 3D scene. Scrolling descends from low Earth orbit, through the atmosphere, onto a plaza at dusk, and into the tunnels below. Work is shown as objects in the scene: hover for a label, click to fly in and open details. The design spec is in [docs/DESIGN.md](docs/DESIGN.md).

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
| `src/main.js` | Renderer, post-processing, stage switching, picking, reticle, panel, Index |
| `src/rail.js` | Scroll progress → camera pose, veils between stages, zone label |
| `src/world/space.js` | Earth shader, stars, real galaxies, ISCR array, telescope, Crew Dragon |
| `src/world/surface.js` | HDR dusk sky, Austin Union chamber, White House, rotunda, trees |
| `src/world/underground.js` | Loop-scale tunnel (TBC), reception shaft, DN600 from CadQuery, Polytopia fossil |
| `src/eigen.js` | Eigen-decomposition panel for any sky galaxy |
| `src/content.js` | All copy |
| `public/demos/` | Deblurring app, DN600 assembly viewer, Polytopia-Zero replays, legacy EigenGalaxy explorer |
| `tools/` | Asset builders (galaxy atlas, DN600 binary, Earth textures, Poly Haven fetch) |

## Regenerating assets

```sh
python tools/build_assets.py tbm public/demos/tbm-viewer/data/I.json
python tools/build_assets.py galaxies ../EigenGalactic        # EigenGalactic venv
python tools/earth_textures.py <folder of NASA / Solar System Scope maps>
python tools/fetch_polyhaven.py
```

Polytopia replays come from `polytopia-zero/scripts/record_replay.py --p0 net --net <best.pt> --p1 osla`.

## Credits

Earth: NASA Blue Marble. Night lights, clouds, normal and specular maps: Solar System Scope (CC BY 4.0). Galaxies: Galaxy Zoo 2 / SDSS. Sky, ground, plaster, stone, concrete, asphalt, rock and wood: Poly Haven (CC0).
