# samuelindyk.com: design spec (v2)

Agreed with Sam on 2026-10-29. This replaces the v1 prototype ("stacked slides").

## v3 changes (agreed 2026-11-01, branch `v3`)

- **Descent:** the camera tips ~25° down and dives at Austin on the globe (North America facing, Texas
  map blended in), re-entry haze covers a cut to the local sky, a sunset cloud sea, then a drop
  through the clouds over real Austin terrain (USGS 3DEP + NAIP, `tools/austin_terrain.py`), levelling
  out at eye height in front of the Union. Ground runs to the horizon; no floating slab.
- **Surface:** Union close and dominant; White House and rotunda well back to either side; banner in
  deep maroon. Plaza site: the upland west of MoPac, east of the Mount Bonnell bluff, facing the sunset.
- **Union click:** flies inside the hall; the banner shows the motion and a gold/blue tally, the
  lecterns light gold (Aye) and blue (No), the leading side brighter. Five past motions rotate per
  visit; visitors vote and can change their vote; tallies in Supabase (capped per network). The panel
  carries the Union's mission in maroon and gold ("Truth through debate."), as v1 did.
- **Polytopia:** a floating island above the cloud sea replaying the real game from the replay data
  (trained agent, blue, vs. lookahead bot, red), looping. The fossil is gone.
- **Underground:** the cut face sits in front of the plaza; a soil wipe on the way down; formations
  with survey marks every 10 m to −100 m; the Loop tunnel finished with cars driving through; the DN600
  bores across with the scroll and finishes centred, with the closing words over it.
- **ISCR:** bigger and forward; turns toward the cursor; compute pulses across the cells and edges;
  laser downlinks to Austin and a second station.
- **Loading:** the opening shows once orbit is in; scrolling stays locked until everything (including
  material textures) has loaded and been drawn once offscreen. Panel, Index and demos scroll with the
  wheel (`data-lenis-prevent`).

## Concept

One continuous 3D scene. Scrolling moves a camera on a fixed cinematic rail
(~8 screen-heights) from low Earth orbit, down through the atmosphere, to a
surface scene at dusk, then below ground into tunnels. Work is shown as
**objects in the scene**. The page itself carries almost no text.

- **Hover** an object: bracket reticle snaps around it, with a small mono label + year.
- **Click**: the camera flies in to frame it; a slim glass panel slides in from the side
  (2–3 lines, links, "Launch demo" where one exists). Esc / click-away flies back.
- **At rest**: name (top-left), a tiny zone marker (e.g. `LOW EARTH ORBIT · 408 km`),
  an **Index** button, contact links. Nothing else.
- **Index** overlay: a clean list of everything (year · org · role) for people who want facts fast.
- **Mobile**: same descent at reduced detail; first tap = hover, second tap = open.
- No sound.

## Look

- Photoreal: real-time 3D where it is strongest (Earth, TBM, buildings), lit physically
  (PBR, environment lighting, shadows, bloom, ACES tone mapping).
- Grade follows the descent: cold blue-black in orbit → warm dusk at the surface → sodium
  amber underground. UI chrome stays neutral (white on dark, hairlines).
- Type: light neo-grotesk for the name/headlines, a serif italic for rare accents, mono for labels.
- Copy: minimalist and factual. No self-praise.

## Opening

Load straight into photoreal Earth from ~400 km, sun rising over the limb. "Samuel Indyk"
fades in, small. The ISCR satellite drifts into frame.

## Objects

### Orbit
| Object | Work | Click |
|---|---|---|
| ISCR satellite (long array of solar/compute/radiator panels) | arXiv:2604.07760 | paper link, 3 figures |
| Sky full of real Galaxy Zoo 2 galaxies | EigenGalactic | pick any galaxy → grid of its eigengalaxy components + reconstruction slider |
| Space telescope | Deblurring (Richardson–Lucy) | launch demo |
| Dragon capsule | Torchlight (Inspiration4 risk profiles) | live dashboard |

### Surface (dusk)
| Object | Work |
|---|---|
| **Austin Union chamber at the centre** (open pavilion, two lecterns facing off, AU seal banner, chairs). Most prominent object. | President, Austin Union Society |
| White House, one side (north facade, waving flag) | Policy Intern, OSTP 2025 |
| Classical rotunda, other side (nods to 8VC's temple; not a copy of their artwork) | Defense Team Intern, 8VC |

AlphaX is **not** included.

### Underground
| Object | Work |
|---|---|
| One TBM only (Claude's call): the UATXcavators DN600 microTBM rendered from the real CadQuery model, boring through rock | Team Lead & Mechanical Lead, UATXcavators (NABC 2027); launches the 3D assembly viewer |
| A finished, lit tunnel lined with cameras + network switches (what Sam built testing for) | Software Engineering Intern, The Boring Company |
| Polytopia-Zero "fossil": a board-shaped slab in the strata. Click → comes alive and replays agent games in Sam's own isometric viewer | Polytopia-Zero |

ARES / Marketplace live only in the Index.

## Status (end of first build pass)

Done and screenshot-verified at 1440×900 and 390×844:
- Orbit: physically shaded Earth over Washington at sunrise, ISCR array front-lit, telescope,
  Crew Dragon, 256 real GZ2 galaxies (any one opens its eigen-decomposition).
- Descent: atmospheric-entry flash, plane-like approach through cloud, HDR sky with matched fog.
- Surface: golden hour from behind the buildings; Union chamber (seal on pediment + banner,
  lecterns, chairs), White House with full waving flag, rotunda, leaf-card trees.
- Underground: textured Loop tunnel with cameras/switch cabinets, rock shaft, DN600 breaking
  through (real CadQuery geometry, cutterhead spinning), carved Polytopia fossil -> live replay.
- Hover reticle, fly-in panels, Index, mobile tap-to-hover.

Next review pass:
- Load weight (~30 MB on first visit): compress textures (KTX2/Basis), load the surface and
  underground stages after the opening frame, 1k HDR on slower connections.
- ISCR still reads as one flat sheet; add truss/bus detail and tilt for a sun glint.
- White House: roof detail, cornice mouldings, south-lawn context; columns need fluting.
- Union chamber interior: figures at the lecterns? (ask Sam), warmer interior bounce light.
- Rail pacing on a real trackpad/mouse wheel; check that every object is hoverable at its stop.
- Accessibility pass: keyboard focus to objects, reduced-motion path.

## Facts to use (from the résumé; keep TBC at résumé level)

- UATX B.S. Liberal Studies (STEM), 2024–2028; Founders + Lonsdale-Magaro scholarships.
- ISCR: ~500 W/kg (~5×), 16 MW / 16,000 panels, one Starship payload.
- TBC: first automated network integration testing for TBM cameras/switches; PowerShell agent +
  web app for TV displays; daily tunnel ops / gap-sensing reliability. Nothing internal.
- Polytopia-Zero: Numba engine of the current ruleset, PPO self-play with masked auto-regressive
  heads, PFSP league (94% vs ScriptedBot at it 225; 96% vs held-out OSLA at final, 6×6 smoke config).
