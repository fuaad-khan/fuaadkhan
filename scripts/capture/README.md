# Media pipeline: captures, encoding, privacy

Real captures of the three apps for the highlight galleries (PLAN §7, PLAN-v2 "Media"), made from the local checkouts in `C:\dev` with live City GIS services and Nearmap / MapTiler basemaps. No npm dependencies: Chrome over CDP (`scripts/lib/cdp.mjs`) and the ffmpeg bundled with the Map My City video studio (`scripts/lib/ffmpeg.mjs`, env `FFMPEG` overrides).

```
node scripts/capture/index.mjs all                  # or map-my-city | yard-plan | green-check, --shots hero,measure
node scripts/capture/index.mjs yard-plan --dpr 1    # quick draft to check choreography (the encoder refuses drafts)
node scripts/encode-media.mjs --only measure,createmap,buffer --sheet audit/v2-c   # .cache/capture -> src/assets, size table, contact sheet
node scripts/privacy-sweep.mjs --assets             # before a build; --dist after npm run build
```

Shots are named by the gallery highlight they fill (`media[app].clips[name]`, CONTRACTS-v2 §4); `hero` and `base` feed the intros.

| App (served from) | Port | CDP | Viewport | Shots |
|---|---|---|---|---|
| Map My City (`C:\dev\mapMyCity`) | 8796 | 9376 | 1440×900 @2 | `hero` City Hall z20 (CityDraw's match-cut target) · `lookup` address lookup → property report · `layers` zoning + legend while the imagery slider steps 2014 → 2026 · `measure` by City Hall: a line along Sheriff Ave and 5th St, then Polygon and the Civic Center block, no parcel selected · `createmap` rectangle pick of the City-owned 432-190-011/012/013 → Create Map → Hatch → Planning template → its title block · `buffer` 300 ft around the SJUSD parcel 434130011 → Avery labels (private owners blurred) → site map |
| Yard Plan (`C:\dev\YardPlan`), dark theme | 8797 | 9377 | 1600×1000 @2 | `hero` City Hall z21, Turf 1 + Concrete 1 · `base` same view, no drawings, glass or chrome · `draw` turf's four corners, then concrete snapping to the turf's corner and edge · `composition` 1120×700 close-up: Edit, a concrete corner dragged out while the rows and donut follow · `share` 1120×700 close-up: Share, Copy Link and its toast |
| Green Check (`C:\dev\GreenCheck\dist-portable`) | 8798 | 9378 | 1600×1000 @2 | `buffer` 438 S State St, Microbusiness: automatic Not Eligible at 95 ft · `hero` after Verify distance (101 ft, Complete): Eligible, Measured by hand · `base` same view, overlays and verdict rows hidden · `verify` the verify flip, Not Eligible → Eligible · `lookup` Manufacturing, a misspelled address ("1280 s buena vsta") for a one-building IL parcel, the corrected suggestion, Eligible · `chooser` a commercial parcel with several buildings picked from candidates (250 N Sanderson Ave, 3 buildings): hover-sync list ↔ map, the largest chosen, Eligible |

`shots.json` holds the manifest; the per-app drivers (`map-my-city.mjs`, `yard-plan.mjs`, `green-check.mjs`) do the driving. Raw output (PNG + sidecar JSON per still, JPEG frames + `marks.json` + a lossless `poster.png` per loop) goes to `.cache/capture/<app>/`, which is gitignored.

## How it works

- `session.mjs` serves the app with `scripts/lib/static-server.mjs`, launches Chrome, seeds localStorage (Map My City's disclaimer, Yard Plan's theme from `shots.json`, `dark`) and registers the in-page scripts before any app script runs: `page/hooks.js` (a `window.L` trap that registers every Leaflet map, a drawn cursor, idleness and geometry helpers) and the privacy scrubs.
- Stills run in real time with reduced motion; `still()` asserts no leaks before and after the screenshot and writes the sidecar: `view`, `mapRect`, `viewport`, `dpr`, `basemap`, `apn`, `scrubs`, `leaks: []`, the app's commit, and on Yard Plan / Green Check heroes the harvested `intro` block (CONTRACTS §9).
- Loops run on the studio's virtual clock (`C:\dev\mapMyCity\video\lib\shim\virtual-time.js`, read at run time): timers, rAF and CSS animations advance one 30 fps frame per step, the network settles inside each step, real CDP mouse and key input drives the app, and every frame is leak-checked. Set-up the clip does not show (opening a tool, a search the chooser starts from) happens in an unrecorded pre-roll with the same real input.
- The gallery plays each loop once, so v2 loops mark their poster on frame 0: the first frame is the poster and the story runs start to end. Map My City's `lookup` and `layers` are v1 seamless loops that start on their poster mid-story (the encoder rotates frames so the video begins there).
- `recorder.mjs` can record a close-up (`clip`, CSS px), double-click, and ease an element's scroll per frame (a wheel scroll would animate on the real clock).
- `scripts/lib/harvest.mjs` projects Leaflet layer geometry with the live camera into capture-viewport CSS px (and can read SVG paths through their screen CTM).

## Privacy (PLAN §3, Appendix B2)

- Map My City: the studio's `redact.js` (read at run time) blurs owner, mailing and sale rows unless the owner is a public agency, always blurs In Care of, and blurs private mailing labels; the buffer loop asserts every readable label is a public agency; the Code Enforcement Officer value reads "—" in the lookup and the report; the disclaimer is pre-seeded. Parcels selected or picked are on the studio's public allow-list (`storyboard/meta.js`); the cursor rests on panels or public parcels, never hovering a private one.
- Green Check: the neighbouring residence's address (and any residence the rows print) is blurred in place, day-care and youth-center names are blurred, compile notes hidden; search suggestions for any parcel other than the subject (`window.__wp6AllowApns`) are blurred and count as a leak if readable. Subjects: 438 S State St (the intended commercial subject), a one-building industrial parcel, and a commercial parcel whose use type is asserted non-residential.
- Yard Plan: City Hall only (never the default Home view); no `addr=` in links; the status toast is hidden for stills; the share loop stubs `navigator.clipboard.writeText` (this machine's clipboard is untouched) and never runs the PDF export; downloads are denied and logged by the studio's stubs.
- Everywhere: internal hosts, keys and local origins are blurred if a page ever prints them, and `leaks()` fails the capture if anything private is readable. The strings the scrubs hid are kept in `.cache/privacy.local.json` (untracked) so `scripts/privacy-sweep.mjs` can search shipped bytes for them; add the officer name or other strings to `privacy.local.json` at the repo root (also untracked) if needed.
- The City's parcel and zoning service URLs (for Green Check's candidate queries) are read from the app's own `src/config.js` at run time and never written to this repo.
- `encode-media.mjs` writes a contact sheet of every still and poster plus frames sampled from each shipped WebM, for a by-eye pass before anything ships.
