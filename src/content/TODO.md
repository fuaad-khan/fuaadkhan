# Content TODO

What remains after the redesign (WP0–WP9). Resolve, then delete the line.

## Owner confirmations before launch

- [ ] **Yard Plan, feature 3** — "Staff upload it back for review." The app has a GeoJSON upload; confirm planning staff actually use it to review plans, or cut the sentence in `apps.js`.
- [ ] **UCLA bullets** — degree and minor are from the résumé; the "cartography, spatial analysis" line comes from PROJECT_GUIDELINES, not the transcript.
- [ ] **Lede** — "Six-plus years in public-sector GIS" counts from Oct 2020 (City Net SoCal, a nonprofit working for the City of Anaheim). Confirm the "public-sector" framing.
- [ ] **City seal** — shown in the Map My City captures and the intro's seal sweep on the strength of permission "in hand or forthcoming". Confirm it is in hand.
- [ ] **Nearmap imagery** — the Yard Plan and Green Check captures and the Map My City loops use Nearmap aerials with the "© Nearmap" credit visible. Confirm the licence covers a public portfolio.

## Privacy and the repository

- [ ] The three old Green Check test captures (`eligibility-fail`, `eligibility-pass`, `smoke-final` WebPs) show residential addresses. This branch no longer has them, but `main` and the git history do, and the live deployment may still serve them. The history rewrite is prepared by the orchestrator; the owner force-pushes `main` and `redesign/apple-scroll` and redeploys.
- [ ] Keep the repository private until that rewrite is pushed.

## Hosting (out of scope for the redesign)

- [ ] Cut fuaadkhan.com over to Cloudflare Pages (it still serves the old host).
- [ ] `www` → apex: `public/_redirects` cannot do a domain-level redirect on Cloudflare Pages. Add a Bulk Redirect or a Redirect Rule for `www.fuaadkhan.com`, then delete the line from `_redirects`.
- [ ] If Cloudflare Web Analytics or Rocket Loader is switched on, the CSP in `public/_headers` blocks it; adjust the CSP deliberately.

## Not verified on this machine

- [ ] Safari (desktop and iOS): `backdrop-filter` with `clip-path: path()` in the Yard Plan intro, `@property` colour tokens, the dashed march in the Green Check intro, and the address bar during the Transition pin.
- [ ] Real-GPU frame timings; every measurement so far is headless Chrome without a GPU.

## Optional polish

- [ ] Green Check intro: the pass rows have no `detail` strings, so they are shorter than the hero still's and shift slightly during the dissolve. Add the app's exact strings to `apps.js → green-check.intro.rows` for a tighter match.
- [ ] Lucide icon paths (ISC licence) are copied into `Intros/MeasuredLine/Icon.jsx` with an attribution comment; add the ISC notice to the README if a formal credit is wanted.
- [ ] Media weight: a full scroll transfers about 3.1 MB at 1x but 4.3–4.4 MB on 2x/3x screens, over the 4 MB page budget (1600w stills and about 2 MB of WebM loops). Re-encoding the largest loops (`map-my-city/f1.webm`, `map-my-city/f2.webm`) with `encode-media.mjs`, or adding a 400w thumbnail size, would bring it under.

## Decisions taken (revisit if needed)

- Repositories stay private, so showcases carry no repository links (`apps[].links` is empty).
- Statuses: Map My City "In production · internal" (deployed as Map My San Jacinto), Yard Plan "In development", Green Check "Pilot · internal preview".
- Every number on the page traces to the app sources or the measured captures (PLAN §11, Appendix B; the Yard Plan and Green Check intro values come from the capture sidecars, and `apps.js` keeps the same numbers as a fallback).
- Résumé PDF is hosted in-repo at `public/Fuaad_Khan_Resume.pdf` and includes a phone number by the owner's choice; the page itself never prints it (only email, GitHub and LinkedIn).
- Inter 800/600 is self-hosted from `public/fonts` (SIL OFL, `public/fonts/OFL.txt`); body text stays on the system font.
- The career map is pre-rendered SVG, not Leaflet, to keep the bundle small and avoid tile requests.
- Page background is a pre-generated contour SVG (`src/assets/topo-redlands.svg`): Redlands, Crafton Hills and San Timoteo Canyon, z13 terrain tiles, 20 m interval, drawn at about 1.8:1 against the background so it stays behind the copy. Regenerate with `npm run topo`.
