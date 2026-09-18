# fuaadkhan.com

Single-page, scroll-driven portfolio for Fuaad Khan. Vite + React, GSAP ScrollTrigger, CSS modules. See `PROJECT_GUIDELINES.md` for the content outline and `CLAUDE.md` for working conventions.

## Commands

```
npm install
npm run dev       # local dev server
npm run build     # production build to /dist
npm run preview   # serve /dist locally
npm run lint      # eslint
```

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
