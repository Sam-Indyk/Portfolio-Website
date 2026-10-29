# samuelindyk.com

My portfolio site. Scrolling is a descent: it starts in orbit, falls through the atmosphere, lands on the White House lawn, then bores into the tunnels underneath while an altimeter tracks your height and depth.

Plain HTML, CSS, and JavaScript with no build step, hosted on GitHub Pages.

## Layout

| Path | What it is |
|---|---|
| `index.html` | The page. Content is split into four `.zone` wrappers (space, sky, surface, underground) |
| `js/world.js` | The scroll-driven canvas background: galaxy, Earth, clouds, White House, strata, tunnels, TBM |
| `js/main.js` | Reveal animations, the demo modal, galleries |
| `js/galaxies.js` | Procedural galaxy generator (homepage preview + demo fallback) |
| `js/photos.js` | Photo gallery lists; empty lists stay hidden |
| `demos/eigengalaxy/` | EigenGalaxy Explorer. Loads `data/eigengalaxies.{json,bin}` exported by [EigenGalactic](https://github.com/Sam-Indyk/EigenGalactic)'s `export_web.py` |
| `demos/deblurring/` | Richardson–Lucy deblurring app, from EigenGalactic |
| `demos/tbm-viewer/` | UATXcavators DN600 spindle-mount viewer, from [uatxcavators-tbm](https://github.com/Sam-Indyk/uatxcavators-tbm) |
| `assets/resume.html` | Source for `Samuel_Indyk_Resume.pdf` (print with Edge/Chrome → Save as PDF) |

## Run locally

```sh
python -m http.server 8000
# open http://localhost:8000
```

A server is needed rather than `file://` because the demos `fetch` their data.

`?at=<section-id>` jumps straight to a section, e.g. `/?at=union`.

## Updating the demos

- **EigenGalaxy basis:** in EigenGalactic, run `python export_web.py`, then copy `web_export/eigengalaxies.json` and `.bin` into `demos/eigengalaxy/data/`.
- **TBM viewer / deblurring:** copy the latest `viewer/` or `Deblurring.html` from their repos.
