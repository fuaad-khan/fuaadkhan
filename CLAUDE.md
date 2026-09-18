# CLAUDE.md — fuaadkhan.com

Personal resume + project portfolio for Fuaad Khan. Single-page, scroll-driven site in the style of Apple product pages: pinned sections, scroll-scrubbed animations, and a narrative that moves from career timeline into three application showcases.

Read `PROJECT_GUIDELINES.md` before starting any task. It holds the content outline, section specs, and design rules. This file holds working conventions only.

## Stack

- Vite + React (TypeScript optional; plain JSX is fine)
- GSAP + ScrollTrigger for pinning and scroll-scrubbed animation
- Plain CSS modules (no Tailwind unless explicitly added later)
- Static build deployed to Cloudflare Pages; domain and DNS on Cloudflare
- Node LTS, npm (not yarn/pnpm)

If a task would require adding a dependency, say so and confirm before installing.

## Commands

```
npm run dev       # local dev server
npm run build     # production build to /dist
npm run preview   # serve /dist locally
npm run lint      # eslint
```

## Code conventions

- **Comments are brief one-liners.** One line, above the code it describes, explaining *why* or *what* — never multi-line blocks, never restating obvious code. Remove commented-out code rather than leaving it.
- Components live in `src/components/<Name>/<Name>.jsx` with a sibling `<Name>.module.css`.
- One scroll section per component. Each section owns its own ScrollTrigger and cleans it up on unmount.
- All copy (resume entries, app descriptions) lives in `src/content/*.js` — never hardcoded in JSX. Editing text should never require touching a component.
- Media goes in `src/assets/`. Compress images before committing; prefer WebP/AVIF, and MP4/WebM for app demo clips.
- Animations must respect `prefers-reduced-motion`: fall back to static layout with simple fades.
- Keep the site fully functional with JS disabled or before scripts load (content visible, just not animated).
- No external tracking, fonts loaded from CDN at runtime, or third-party scripts without asking.

## Git

- Small, focused commits with imperative messages (`Add Yard Plan showcase section`).
- Never commit `/dist`, `.env`, or raw uncompressed media.
- Main branch deploys automatically; work on feature branches for anything larger than a copy tweak.

## Subagents and model selection

Token efficiency matters. When spinning up subagents:

- **Default to Sonnet** for scoped, well-defined work: writing a single component, CSS tweaks, content file updates, lint fixes, writing tests, summarizing files.
- **Use Haiku** for trivial mechanical tasks: renaming, formatting, grepping, listing files.
- **Reserve Opus** for tasks that need cross-file reasoning or judgment: animation architecture, debugging ScrollTrigger timing/pinning conflicts, performance profiling, restructuring the section system.
- Give each subagent a narrow brief and the specific files it may touch. Do not hand a subagent the whole repo when it needs two files.
- Prefer one well-briefed subagent over several overlapping ones.

## Before finishing any task

1. `npm run build` passes with no warnings you introduced.
2. Scroll through the affected section in `npm run preview` — animations don't jump, pin, or overlap incorrectly.
3. Check the section at 390px, 768px, and 1440px widths.
4. Confirm `prefers-reduced-motion` still renders cleanly.
