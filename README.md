# fuaadkhan.com

Single-page, scroll-driven portfolio for Fuaad Khan. Vite + React, GSAP ScrollTrigger, CSS modules. See `PROJECT_GUIDELINES.md` for the content outline and `CLAUDE.md` for working conventions.

The page is one centred column under a floating glass nav (The Journey · My Applications · Contact Me; inside the apps it morphs into the three app names, with a lens on the current section): the hero, The Journey (a career map that draws itself plus three stop cards), My Applications (one tile per app), one section per app with an auto-playing highlights gallery (a coded intro, one clip per major feature, an at-a-glance card), and Contact. Scrolling is free; a gentle settle eases a scroll that ends near a section into place (`src/hooks/useScrollSettle.js`). Copy lives in `src/content/*.js`, media in `src/assets/`.

## Commands

```
npm install
npm run dev       # local dev server
npm run build     # production build to /dist, prerendered
npm run preview   # serve /dist locally (with the production headers and CSP)
npm run lint      # eslint
npm run og        # redraw public/og.jpg and public/apple-touch-icon.png
npm run topo      # regenerate the contour background (needs network)
```

Node 22, npm. No other global tools; Chrome or Edge must be installed for the scripts that drive a browser.

## Build

`npm run build` runs three steps:

1. `vite build` builds the client bundle into `dist/`.
2. `vite build --ssr src/entry-prerender.jsx --outDir dist/.ssr` builds the same `<App/>` for Node.
3. `node scripts/prerender.mjs` renders it with React's `react-dom/static` `prerender` and writes the HTML into `<div id="root">` in `dist/index.html`, with no whitespace. Then it deletes `dist/.ssr`, even when a check fails. For a build in another folder, pass `--dist <dir>` (the SSR bundle goes to `<dir>/.ssr`).

So the page is complete before any script runs, and with JavaScript off. `src/main.jsx` hydrates the prerendered markup, or renders from scratch when `#root` is empty (the dev server). The prerender step fails the build when:

- a class in the markup is missing from the stylesheet `index.html` links. The CSS module names (`[local]_[hash]`) differ between the two builds, or a `className` is undefined. Give every class a rule, or use a `data-*` attribute for script hooks.
- the markup contains a `<script>` (the CSP allows no inline scripts), lacks `<main>`, `<h1>` or `<footer>`, or React puts anything other than an image preload ahead of it. Image preloads are dropped: each image is already in the markup.
- the `og:image`, `twitter:image` or icon files the head points at are missing, or the JSON-LD carries an email address or phone number.

Prerender rules for components: render the same markup on the server and on the first client render. Read `window`, `matchMedia` and the DOM only in effects, and gate client-only parts on `useMotionOK()` / `useNearViewport()`, which are `false` on the server and during hydration.

Animation setup runs after hydration has painted: `useChapter`, `useReveal` and the topo drift queue their GSAP work through `afterPaint()` (`src/hooks/useChapter.js`), one chapter per task, so no single long task blocks input. Anything visible in a chapter's first viewport therefore has to be declared in CSS first (`.wp/CONTRACTS.md` §1). A chapter whose width or height changes inside a breakpoint rebuilds its timeline after the next ScrollTrigger refresh.

## Media

App captures come from local builds of the three apps in `C:\dev` (they are never modified; the capture scripts inject their scrubs at run time). The pipeline writes raw frames to the gitignored `.cache/`, then encodes them into `src/assets/<app>/`, which `src/content/media.js` imports.

```
node scripts/capture/index.mjs <map-my-city|yard-plan|green-check|all> [--shots hero,f1]   # raw frames → .cache/capture/<app>/
node scripts/encode-media.mjs [app ...] [--only hero,f1]                                    # → src/assets/<app>/ + audit/media-contact-sheet.html
```

- Stills ship as `<name>.webp` (800 px) and `<name>@2x.webp` (1600 px); loops as VP9 WebM plus H.264 MP4 with a poster pair. Each asset has a JSON sidecar (camera, scrubs, `leaks: []`; the hero's carries the intro's measured values, which override `apps.js → intro.values`).
- Review every image in `audit/media-contact-sheet.html` before committing.
- `scripts/capture/README.md` lists the shots, the scrubs and the ports.

### Coded intro data

- **Map My City** (`CityDraw`): `node scripts/derive-city.mjs [--view lat,lng,zoom]` derives `city.json`, `city.meta.json`, the parcel rasters and the seal in `src/assets/map-my-city/` from the Map My City video studio data (`--help` for options; env `MMC_VIDEO_DATA`, `MMC_SEAL`, `FFMPEG`, `BROWSER` override the defaults). Re-run it if the hero capture's view moves.
- **Yard Plan** (`GlassDraw`) and **Green Check** (`MeasuredLine`) read their geometry and numbers from the hero sidecars written by `encode-media.mjs`.
- `dev/intro-harness.html` (on the dev server) scrubs any intro by hand; see `scripts/README.md`.

### Contour background and social card

- `npm run topo` (`scripts/build-topo.mjs`) regenerates `src/assets/topo-redlands.svg` from Mapzen terrain tiles (needs network and the `d3-contour`, `d3-array` and `pngjs` devDependencies). Keep the attribution string in `site.js` unchanged.
- `npm run og` redraws `public/og.jpg` (1200×630) and `public/apple-touch-icon.png` (180×180) from `src/content` and the `:root` tokens, through headless Chrome (`--cdp-port` picks the DevTools port). Re-run it after changing the name, identity, career stops, app names or palette.

## Checks before a release

```
npm run lint
rm -rf dist && npm run build
node scripts/privacy-sweep.mjs --assets                 # src/assets + media.js
node scripts/privacy-sweep.mjs --dist                   # every file in dist/
node scripts/audit-scroll.mjs --dist dist --port 4192 --out audit/<name>
node scripts/check-nav.mjs --url http://localhost:4192 --out audit/<name>/nav          # with npm run preview -- --port 4192
node scripts/check-gallery.mjs --url http://localhost:4192 --out audit/<name>/gallery  # ~4 min: cards play at real speed
npx lighthouse http://localhost:4192/ --output=json --output-path=audit/<name>/lh-mobile.json   # with npm run preview -- --port 4192
```

- **Privacy sweep** (`scripts/privacy-sweep.mjs`) fails on internal GIS hosts, API keys, local origins, phone numbers, the residential strings from the research, and every string in the untracked lists `.cache/privacy.local.json` (written by the capture scrubs) and `privacy.local.json` (owner-supplied, repo root). Both lists are gitignored: never commit them or print their contents. Without them the sweep cannot see the capture-time private strings.
- **Scroll audit** (`scripts/audit-scroll.mjs`) serves `dist/` with `vite preview`, scrolls five profiles (1440×900, 768×1024, 390×844, 1440 reduced motion, 1440 with JavaScript off) in half-viewport steps, saves every frame, and fails on an empty frame, a focusable element hidden at opacity 0, horizontal overflow, heading-order or landmark errors, console errors and hydration warnings. Read the frames, not only the summary. Pick a port outside the Fetch spec's blocked list (4190, for example, is blocked, so Node's `fetch` cannot reach it).
- **Nav check** (`scripts/check-nav.mjs`) scrolls to every section at desktop, phone and reduced motion and asserts the lens sits over the right item, the app-name morph, `aria-current`, link landing and focus, and no console errors.
- **Gallery check** (`scripts/check-gallery.mjs`) plays each app's highlights: autoplay, advance, dot jumps, pause, off-screen hold, the end cue, the two-column card layout, no clip preload before start, keyboard hold and reduced motion.
- **Lighthouse** runs one-off through `npx` (nothing in `package.json`); add `--preset=desktop` for desktop.

## Where things live

- `src/content/site.js` — nav, hero, UI and gallery strings, journey, applications hub, close, footer copy
- `src/content/timeline.js` — career stops (`coords` are `[lon, lat]`)
- `src/content/apps.js` — the three apps: highlight cards (captions, kinds, durations), metrics and intro copy
- `src/content/media.js` — each app’s hero (and intro backdrop) plus its clips, keyed by highlight id
- `src/content/TODO.md` — what is left for the owner
- `src/assets/` — compressed media (WebP, WebM, MP4) and the intro data
- `public/Fuaad_Khan_Resume.pdf` — résumé download
- `.wp/` — the redesign plan, contracts and briefs

## Deploy (Cloudflare Pages)

- Build command: `npm run build`
- Output directory: `dist`
- Production branch: `main`
- `public/_headers` sets the CSP and cache rules; `vite preview` enforces the same CSP locally.
- `www` to apex: `public/_redirects` holds `https://www.fuaadkhan.com/* https://fuaadkhan.com/:splat 301`, but Cloudflare Pages does not support domain-level redirects in `_redirects` (it only matches paths), so that line does nothing. Add a Cloudflare Bulk Redirect (or a Redirect Rule on the zone) for `www.fuaadkhan.com` → `https://fuaadkhan.com` when the domains are cut over.
