# scripts

Node 22 tools with no extra dependencies. Browsers are driven over the Chrome DevTools Protocol by `lib/cdp.mjs`: env `BROWSER` if set, else installed Chrome, else Edge.

## Scroll audit: `audit-scroll.mjs`

Scrolls the page in steps for each profile, saves a JPEG per step, and checks every frame.

```
npm run build && node scripts/audit-scroll.mjs --dist dist          # vite preview on 4173, all profiles
node scripts/audit-scroll.mjs --url http://localhost:5173 --profiles desktop,phone --allow-empty --out audit/smoke
```

| Option | Default | Meaning |
|---|---|---|
| `--url <url>` / `--dist <dir>` | `--dist dist` | audit a running server, or serve a build with `vite preview` and stop it afterwards |
| `--port <n>` | 4173 | preview port for `--dist` |
| `--profiles <list>` | all | `desktop` 1440×900 · `tablet` 768×1024 · `phone` 390×844 @2x mobile · `reduced` 1440×900 reduced motion · `nojs` 1440×900 scripts off |
| `--step <f>` · `--settle <ms>` | 0.5 · 900 | scroll step as a fraction of the viewport height · wait after load and after each step |
| `--out <dir>` | `audit/<yyyymmdd-hhmm>` | output folder (gitignored) |
| `--allow-empty` | off | report empty frames without failing |
| `--cdp-port <n>` · `--jpeg-quality <q>` | 9360 · 70 | DevTools port · frame quality |

Output: `<profile>-<nn>-y<px>.jpg`, a contact sheet `<profile>.html` (tick the overlay box to see the 8×6 sampler grid), `summary.json`, `summary.md`.

Exit 1 when any profile has an empty frame (under 10 % of the 8×6 grid shows content), a tabbable in view at opacity < 0.1, horizontal overflow, a heading-order error (skipped level, no h1 or several), a console error or exception, or a React hydration warning. Landmarks (one `main`, a `footer` outside sectioning content) only warn. Exit 2 is a usage or server error.

Each grid cell is probed at 3×3 points; it is content when, at any probe, the first painted element is text, a loaded image/video/canvas/svg of 24 px or more, a `url()` background image, or a background unlike the page's. Elements under 10 % effective opacity and fixed, viewport-sized `aria-hidden` layers (the topo texture) are looked through, and a gradient-only wash as large as the viewport counts only by its colour; mark another decorative layer `data-audit="background"`.

## Intro harness: `dev/intro-harness.html`

With `npm run dev` running, open `http://localhost:5173/dev/intro-harness.html?app=map-my-city`. It is a dev-only page, never part of `vite build`. Until `media.js` carries a hero sidecar, intros receive the City Hall target (`33.78227, -116.95852` z20, mapRect `0,88,1440,812`, viewport `1440×900`).

- `app` picks the intro (`map-my-city`, `yard-plan`, `green-check`). `base=<url>` lays a still under it, and the stage takes the still's aspect unless `w` and `h` are given (default 1440×900).
- `t=<0..1>` sets the start position, `play=1` and `dur=<s>` control looping playback (default 8 s), and `opacity=<0..1>` sets the intro's opacity.
- `mode=direct` renders the intro without `IntroLayer`, which renders nothing under reduced motion. `ui=0` shows the stage alone at full width, for screenshots.
- `lat`, `lng`, `zoom`, `rect=x,y,w,h` and `vp=w,h` override the match-cut target, and `target=none` passes none at all.
- Keys: Space play/pause · R reverse · Left/Right ±0.01 (Shift ±0.1) · Home/End.
- Scripting: `await introHarness.setT(0.5)` resolves after two frames. `getT()`, `play()`, `pause()` and `stageRect()` are also available, and `<html data-harness="ready" data-intro="mounted|empty">` reports state.

## CDP driver: `lib/cdp.mjs`

```js
import { launch } from './lib/cdp.mjs'
const page = await launch({ port: 9361, width: 390, height: 844, dpr: 2, mobile: true })
await page.setMedia({ reducedMotion: 'reduce' })
await page.navigate('http://localhost:4181/', { waitUntil: 'networkidle' })
await page.screenshot({ path: 'audit/phone.png' })
await page.close()
```

Session methods:
- `send`, `on`, `waitForEvent`
- `evaluate(expr | fn, ...args)`
- `navigate`, `setViewport`, `setMedia`, `setScriptEnabled(bool)`
- `screenshot({ path, format, quality, clip })` (the clip is relative to the viewport)
- `consoleMessages()`, `waitFor(expr, ms)`, `close()`

Chrome and its temp profile are removed on `close()`, on exit and on Ctrl+C. With scripts disabled, `evaluate` still works but `requestAnimationFrame` never fires.

Firefox has no CDP endpoint, so `lib/cdp.mjs` refuses it.

## Firefox screenshots: `firefox-shot.mjs`

Drives headless Firefox over WebDriver BiDi on a throwaway profile: navigate, wait for a condition, run one step, capture the viewport. Firefox's own `--screenshot` captures at `load`, before lazy intros render, so use this instead.

```
node scripts/firefox-shot.mjs --url "http://localhost:5173/dev/intro-harness.html?app=green-check&ui=0" \
  --wait "document.documentElement.dataset.intro === 'mounted'" --eval "introHarness.setT(0.3)" --out audit/firefox.png
```

Options: `--width`/`--height` (1440×900), `--wait <js>`, `--eval <js>`, `--port` (0 = a free port), `--timeout` (30000 ms). Env `FIREFOX` overrides the executable.
