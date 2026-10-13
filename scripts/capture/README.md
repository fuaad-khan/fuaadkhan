# Media pipeline: captures, encoding, privacy

Real captures of the three apps for the showcases (PLAN §7), made from the local checkouts in `C:\dev` with live City GIS services and Nearmap / MapTiler basemaps. No npm dependencies: Chrome over CDP (`scripts/lib/cdp.mjs`) and the ffmpeg bundled with the Map My City video studio (`scripts/lib/ffmpeg.mjs`, env `FFMPEG` overrides).

```
node scripts/capture/index.mjs all                  # or map-my-city | yard-plan | green-check, --shots hero,f1
node scripts/encode-media.mjs                       # .cache/capture → src/assets, size table, audit/media-contact-sheet.{html,png}
node scripts/privacy-sweep.mjs --assets             # before a build; --dist after npm run build
```

| App (served from) | Port | CDP | Viewport | Shots |
|---|---|---|---|---|
| Map My City (`C:\dev\mapMyCity`) | 8796 | 9376 | 1440×900 @2 | `hero` City Hall z20 (CityDraw's match-cut target) · `f1` loop: address lookup → property report · `f2` loop: zoning + legend while the imagery slider steps 2014 → 2026 · `f3` 300 ft buffer around the SJUSD parcel (`f3-labels`, the Avery sheet, is kept as an unshipped alternate) |
| Yard Plan (`C:\dev\YardPlan`) | 8797 | 9377 | 1600×1000 @2 | `hero` City Hall z21, Turf 1 + Concrete 1 · `base` same view, no drawings, glass or chrome · `f1` loop: drawing the concrete with vertex + edge snap · `f2` Draw panel clip at 4× · `f3` Share panel |
| Green Check (`C:\dev\GreenCheck\dist-portable`) | 8798 | 9378 | 1600×1000 @2 | `f2` 438 S State St, Microbusiness: automatic Not Eligible at 95 ft · `hero` after Verify distance (drag to ≥ 100 ft, Complete): Eligible, Measured by hand · `base` same view, overlays and verdict rows hidden · `f3` loop: the verify flip · `f1` instant Eligible at an IL/BP industrial parcel found by querying the City's layers |

`shots.json` holds the manifest; the per-app drivers (`map-my-city.mjs`, `yard-plan.mjs`, `green-check.mjs`) do the driving. Raw output (PNG + sidecar JSON per still, JPEG frames + `marks.json` + a lossless `poster.png` per loop) goes to `.cache/capture/<app>/`, which is gitignored.

## How it works

- `session.mjs` serves the app with `scripts/lib/static-server.mjs`, launches Chrome, seeds localStorage (Map My City's disclaimer, Yard Plan's light theme) and registers the in-page scripts before any app script runs: `page/hooks.js` (a `window.L` trap that registers every Leaflet map, a drawn cursor, idleness and geometry helpers) and the privacy scrubs.
- Stills run in real time with reduced motion; `still()` asserts no leaks before and after the screenshot and writes the sidecar: `view`, `mapRect`, `viewport`, `dpr`, `basemap`, `apn`, `scrubs`, `leaks: []`, the app's commit, and on Yard Plan / Green Check heroes the harvested `intro` block (CONTRACTS §9).
- Loops run on the studio's virtual clock (`C:\dev\mapMyCity\video\lib\shim\virtual-time.js`, read at run time): timers, rAF and CSS animations advance one 30 fps frame per step, the network settles inside each step, real CDP mouse and key input drives the app, and every frame is leak-checked. `recorder.mjs` marks the poster frame; the encoder starts the video there so the first frame is the poster and the loop seam stays continuous.
- `scripts/lib/harvest.mjs` projects Leaflet layer geometry with the live camera into capture-viewport CSS px (and can read SVG paths through their screen CTM).

## Privacy (PLAN §3, Appendix B2)

- Map My City: the studio's `redact.js` (read at run time) blurs owner, mailing and sale rows unless the owner is a public agency, always blurs In Care of, and blurs private mailing labels; the Code Enforcement Officer value reads "—" in the lookup and the report; the disclaimer is pre-seeded.
- Green Check: the neighbouring residence's address (and any residence the rows print) is blurred in place, day-care and youth-center names are blurred, compile notes hidden; parcels used are 438 S State St (the intended subject) and a non-residential industrial parcel.
- Yard Plan: City Hall only (never the default Home view); no `addr=` in links; the status toast is hidden for stills.
- Everywhere: internal hosts, keys and local origins are blurred if a page ever prints them, and `leaks()` fails the capture if anything private is readable. The strings the scrubs hid are kept in `.cache/privacy.local.json` (untracked) so `scripts/privacy-sweep.mjs` can search shipped bytes for them; add the officer name or other strings to `privacy.local.json` at the repo root (also untracked) if needed.
- The City's parcel and zoning service URLs (for Green Check's f1 search) are read from the app's own `src/config.js` at run time and never written to this repo.
