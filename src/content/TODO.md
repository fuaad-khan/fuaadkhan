# Content TODO

What remains after the foundation package (WP0). Resolve, then delete the line.

## Media captures (pipeline: `scripts/capture`, `scripts/encode-media.mjs` → `src/assets/<app>/`, wired in `src/content/media.js`)

- [ ] **Map My City** — `hero` still (City Hall, lookup rows + assessor sidebar, "Code Enforcement Officer" value blanked, "In Care of" blurred), `f1` search-to-report loop, `f2` zoning + legend with the imagery time slider, `f3` 300 ft buffer with the mailing-labels sheet. Until then `media.js` holds `null` and the page shows the neutral parcel-grid placeholder.
- [ ] **Yard Plan** — `base` and `hero` stills at City Hall (never the default residential Home view), `f1` concrete-snap loop, `f2` Draw panel with the donut, `f3` Share panel. Until then: placeholder.
- [ ] **Green Check** — the 438 S State St Microbusiness `base`/`hero` stills, an instant-verdict `f1` on a commercial or industrial parcel (or an honest "Needs More Data"), the automatic-verdict `f2`, and the verify-distance `f3` loop. Blur the neighbouring residence's address wherever the app prints it. Until then: placeholder.
- [ ] **Privacy** — the three old test captures in `src/assets/green-check/` show residential addresses. `media.js` no longer references them and the pipeline deletes them, but `main` still imports them, so the live deployment may serve them until this branch ships.

## Coded intros (`src/components/Intros`, one lazy chunk per app)

- [ ] `Intros/CityDraw` — vector city drawn from data and pushed into the Map My City hero capture (stub shows the driver's progress today).
- [ ] `Intros/GlassDraw` — Yard Plan map-under-glass drawing sequence (stub today).
- [ ] `Intros/MeasuredLine` — Green Check measured line and verify-by-hand flip (stub today). Its numbers come from the capture sidecar (`hero.intro.values`) over the demo values in `apps.js` → `intro.values`; the Green Check feature copy (95 ft, 100 ft) must be aligned with the sidecar by hand.

## Sections still on the interim layout

- [ ] Journey (hero + timeline around one sticky map) replaces the pinned Hero/Timeline pair.
- [ ] Transition app cards, the Showcase shell (replaces AppIntro/AppFeatures) and Close on the shared `Rail`.
- [ ] Topographic background moves to a tokenised `mask-image`.

## Build and launch

- [ ] Build-time prerender (`react-dom/static`) so the page is complete without JavaScript; `main.jsx` already hydrates when `#root` has children.
- [ ] Social card `public/og.jpg` (1200×630) and `public/apple-touch-icon.png` (180×180); `index.html` already points at both.
- [ ] Out of scope here: hosting and DNS cut-over (fuaadkhan.com still serves the old host). `public/_redirects` cannot express a domain-level `www` → apex redirect on Cloudflare Pages; use a Cloudflare redirect rule when cutting over.

## Copy to confirm

- [ ] UCLA bullets — degree and minor are from the résumé; the "cartography, spatial analysis" line is from PROJECT_GUIDELINES, not the transcript.
- [ ] Yard Plan "Staff upload it back for review" — the app has a GeoJSON upload; confirm staff use it for review.

## Decisions taken (revisit if needed)

- Repositories stay private, so showcases carry no repository links (`apps[].links` is empty).
- Statuses: Map My City "In production · internal" (deployed as Map My San Jacinto), Yard Plan "In development", Green Check "Pilot · internal preview".
- Résumé PDF is hosted in-repo at `public/Fuaad_Khan_Resume.pdf` and includes a phone number by the owner's choice; the page itself never prints it (only email, GitHub and LinkedIn).
- Inter 800/600 is self-hosted from `public/fonts` (SIL OFL, `public/fonts/OFL.txt`); body text stays on the system font.
- Timeline map inset is pre-rendered SVG, not Leaflet, to keep the bundle small and avoid tile requests.
- Page background is a pre-generated contour SVG (`src/assets/topo-redlands.svg`): Redlands + Crafton Hills + San Timoteo Canyon, z13 terrain tiles, 20 m interval. Regenerate with `npm run topo` (needs the `d3-contour`/`d3-array`/`pngjs` devDeps and network access).
