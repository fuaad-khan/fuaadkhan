# fuaadkhan.com

Single-page, scroll-driven portfolio for Fuaad Khan. Vite + React, GSAP ScrollTrigger, CSS modules. See `PROJECT_GUIDELINES.md` for the content outline and `CLAUDE.md` for working conventions.

## Commands

```
npm install
npm run dev       # local dev server
npm run build     # production build to /dist, prerendered
npm run preview   # serve /dist locally (with the production headers and CSP)
npm run lint      # eslint
npm run og        # redraw public/og.jpg and public/apple-touch-icon.png
```

## Build

`npm run build` runs three steps (Node 22):

1. `vite build` builds the client bundle into `dist/`.
2. `vite build --ssr src/entry-prerender.jsx --outDir dist/.ssr` builds the same `<App/>` for Node.
3. `node scripts/prerender.mjs` renders it with React's `react-dom/static` `prerender` and writes the HTML into `<div id="root">` in `dist/index.html`, with no whitespace. Then it deletes `dist/.ssr`, even when a check fails. For a build in another folder, pass `--dist <dir>` (the SSR bundle goes to `<dir>/.ssr`).

So the page is complete before any script runs, and with JavaScript off. `src/main.jsx` hydrates the prerendered markup, or renders from scratch when `#root` is empty (the dev server). The prerender step fails the build when:

- a class in the markup is missing from the stylesheet `index.html` links. The CSS module names (`[local]_[hash]`) differ between the two builds, or a `className` is undefined. Give every class a rule, or use a `data-*` attribute for script hooks.
- the markup contains a `<script>` (the CSP allows no inline scripts), lacks `<main>`, `<h1>` or `<footer>`, or React puts anything other than an image preload ahead of it. Image preloads are dropped: each image is already in the markup.
- the `og:image`, `twitter:image` or icon files the head points at are missing, or the JSON-LD carries an email address or phone number.

Prerender rules for components: render the same markup on the server and on the first client render. Read `window`, `matchMedia` and the DOM only in effects, and gate client-only parts on `useMotionOK()` / `useNearViewport()`, which are `false` on the server and during hydration.

## Social card and touch icon

`public/og.jpg` (1200×630) and `public/apple-touch-icon.png` (180×180) are committed. Run `npm run og` again after changing the name, identity, career stops, app names or palette. `scripts/og-card.mjs` reads them from `src/content` and the `:root` tokens in `src/styles/global.css`, draws `scripts/og/card.html` in headless Chrome (`scripts/lib/cdp.mjs`, `--cdp-port` to pick the DevTools port), and renders the icon from `public/favicon.svg`. The card's coastline and framing live in `card.html`.

## Where things live

- `src/content/site.js` — hero, transition, close, footer copy
- `src/content/timeline.js` — career stops (`coords` are `[lon, lat]`)
- `src/content/apps.js` — the three app showcases and their media
- `src/content/TODO.md` — placeholders and open items
- `src/assets/` — compressed media (WebP / MP4)
- `public/Fuaad_Khan_Resume.pdf` — résumé download

## Deploy (Cloudflare Pages)

- Build command: `npm run build`
- Output directory: `dist`
- Production branch: `main`
- `public/_redirects` sends `www` to the apex once both custom domains are attached to the project.
