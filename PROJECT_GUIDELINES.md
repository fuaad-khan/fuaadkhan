# PROJECT_GUIDELINES.md — fuaadkhan.com

## Purpose

A portfolio that reads as a story, not a list. The visitor scrolls once, top to bottom, and the page carries them from Fuaad's education through his career into three applications he built. Target audience: hiring managers and technical leads evaluating GIS development work, plus collaborators and clients.

Primary goal: make it obvious within 30 seconds that Fuaad builds real, deployed GIS software — not just maps.

## Experience model (Apple-style scroll)

The page is a sequence of **chapters**. Each chapter is a full-viewport section that pins while the user scrolls, and its internal animation is scrubbed by scroll position (not time). Releasing the pin hands off to the next chapter.

Rules:
- Scroll is the only navigation. No carousels, no tabs, no click-to-advance.
- Each chapter has one idea. If a chapter needs two headlines, it's two chapters.
- Animation should reveal information in the order a reader would naturally want it: headline → context → detail → visual.
- Pins should feel short. If a chapter needs more than ~2.5 viewport heights of scroll, split it.
- Transitions between chapters should imply continuity (a map zooms from one place to the next, a timeline line extends) rather than hard cuts.
- Motion is restrained. Ease-outs, opacity, translate, scale. No bounce, no spin, no parallax gimmicks.

## Page structure

### 0. Hero
- Name, one-line identity: *GIS Supervisor · GIS Developer · Inland Empire, CA*
- Subtle cue that the page scrolls (a thin line that begins to draw downward).
- Sets the visual language for the timeline that follows.

### 1. Career timeline (three chapters)

A single continuous timeline line runs through all three. As the user scrolls, the line draws forward and each stop lights up. A small map inset moves between locations to reinforce "journey."

**1a. UCLA — B.A. Geography**
- Where it started: spatial thinking, cartography, analysis.
- Tone: foundation.

**1b. City Net SoCal — GIS / Data Analysis**
- Bridge chapter: GIS meets data engineering. Applied mapping to real operational problems.
- Show a shift from "making maps" to "building data pipelines that feed maps."

**1c. City of San Jacinto — GIS Coordinator → GIS Supervisor (July 2021 – present)**
- Built the city's enterprise GIS infrastructure from the ground up as the sole GIS staff member; now supervises staff.
- The payoff chapter: architecture, integrations, ownership. This is what sets up the applications that follow.

Content for each stop lives in `src/content/timeline.js`: `{ id, org, role, dates, location, coords, headline, bullets[], media }`.

### 2. Transition — "Things I've built"
- Short chapter. The timeline line resolves into three nodes, one per application. Establishes that the next three chapters are products, not jobs.

### 3. Application showcases (three chapters, same template)

Each showcase follows the same beat so the rhythm is predictable:
1. App name + one-sentence problem statement
2. Who it's for
3. Hero visual (screenshot or short looping clip) that scales/reveals on scroll
4. Three feature callouts that pin in sequence
5. Stack line + link (live demo, repo, or case study)

**3a. Map My City** — parcel lookup application
- Problem: residents and staff need fast, self-serve answers about any parcel.
- Feature callouts: parcel query and property reports · layers, legend, and measurement tools · proximity buffer and mailing labels.
- Stack: JavaScript, Leaflet, bundled production build.

**3b. Yard Plan** — web-based drafter for residential yards
- Problem: homeowners want to sketch a yard layout without CAD.
- Feature callouts: draw-to-scale on the parcel footprint · placeable elements (beds, hardscape, trees) · export/share the plan.
- Stack: fill in once finalized.

**3c. Green Check** — cannabis site eligibility
- Problem: can a cannabis business legally be established at a given property? Answering that today means cross-referencing zoning and buffer rules by hand.
- Feature callouts: address lookup → eligibility verdict · buffer checks against sensitive uses (schools, parks, etc.) · plain-language explanation of *why* a site passes or fails.
- Stack: fill in once finalized.

Content for each app lives in `src/content/apps.js`: `{ id, name, tagline, problem, audience, features[{title, body, media}], stack[], links{} }`.

### 4. Close
- Brief "what I'm looking for" line (GIS development roles and collaborations), contact links (email, GitHub, LinkedIn), and a resume download.
- The timeline line ends here with a final node.

## Visual and content rules

- **Typography:** one display face for headlines, one system/sans face for body. Large headlines, generous whitespace, high contrast.
- **Color:** near-monochrome base (off-white / near-black) with one accent per app so each showcase feels distinct without breaking the whole.
- **Maps as motif:** the timeline map inset and the app visuals should share cartographic cues (thin lines, parcel outlines, muted basemap).
- **Copy:** short. Headlines under 8 words. Bullets under 15 words. Write for someone skimming on a phone.
- **Honesty:** only claim what is true and shippable. If an app is in progress, say "in progress" rather than implying it's released.
- **Media:** every showcase needs at least one real screenshot or clip. Placeholder boxes are acceptable during build but flagged in a `TODO` list in `src/content/`.

## Accessibility and performance

- All content readable without JS and with `prefers-reduced-motion` (fades only, no pinning).
- Semantic headings in document order (`h1` hero, `h2` per chapter, `h3` per feature).
- Keyboard-reachable links; visible focus states.
- Lighthouse targets on mobile: Performance ≥ 90, Accessibility ≥ 95.
- Lazy-load media below the fold; the hero should render in under one second on 4G.

## Deployment

- Cloudflare Pages, connected to the GitHub repo; `main` → production, branches → preview URLs.
- Build command `npm run build`, output `dist`.
- Domain `fuaadkhan.com` (registered and DNS-managed on Cloudflare). Add `www` → apex redirect.

## Open decisions (resolve before the relevant chapter is built)

- Final stack lines and links for Yard Plan and Green Check.
- Whether the timeline map inset uses a live Leaflet map or pre-rendered SVG (SVG is lighter; Leaflet is more on-brand).
- Resume PDF: host in-repo or link out.
