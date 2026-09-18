# Content TODO

Placeholders and open items that block a "final" site. Resolve, then delete the line.

## Media (placeholder boxes are live on the page)

- [ ] **Map My City** — no screenshots exist in the repo. Capture: (1) parcel selected with sidebar report, (2) layers + legend + measure tool, (3) proximity buffer with mailing-label dialog. Save as WebP in `src/assets/map-my-city/`, then set `hero` and each `features[].media` in `apps.js`.
- [ ] **Yard Plan** — no screenshots exist in the repo. Capture: (1) drawn turf/hardscape on Nearmap imagery, (2) composition donut, (3) PDF export or permalink share. Save as WebP in `src/assets/yard-plan/`.
- [ ] **Green Check** — currently using the headless test captures from `greenCheck/tests/*.png`. Replace with a curated "Eligible" result (the pass capture shows "Needs More Data") once the youth-center list is compiled.

## Links

- [ ] LinkedIn URL — not on the résumé PDF; add to `site.js` → `close.links`.
- [ ] Live demo URLs for all three apps, if any are reachable outside the city network. Add to `apps.js` → `links.live`.

## Copy to confirm

- [ ] Yard Plan status line ("Shipped · redesign in progress") — résumé says shipped; `yardPlan/HANDOFF.md` says the UI overhaul is not yet signed off.
- [ ] Green Check status line ("In development") — rules verified end to end, deployment status unknown.
- [ ] UCLA bullets — degree and minor are from the résumé; the "cartography, spatial analysis" line is from PROJECT_GUIDELINES, not the transcript.

## Decisions taken (revisit if needed)

- Résumé PDF is hosted in-repo at `public/Fuaad_Khan_Resume.pdf` (copied from `resumeMap/documents/`). It includes a phone number.
- Timeline map inset is pre-rendered SVG, not Leaflet, to keep the bundle small and avoid tile requests.
- Page background is a pre-generated contour SVG (`src/assets/topo-redlands.svg`): Redlands + Crafton Hills + San Timoteo Canyon, z13 terrain tiles, 20 m interval. Regenerate with `npm run topo` (needs the `d3-contour`/`d3-array`/`pngjs` devDeps and network access). Layer height in `TopoBackground.module.css` sets the parallax speed.
- Phone number is not shown on the page; only email and GitHub.
