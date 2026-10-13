// Shared capture plumbing: serve one app, open Chrome with the shims, wait for idle, and write stills with their sidecars
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { launch, sleep } from '../lib/cdp.mjs'
import { serve } from '../lib/static-server.mjs'
import { assertNoLeaks, installPrivacy, recordForbidden, SCRUBS, STUDIO } from '../lib/privacy.mjs'
import { mapState } from '../lib/harvest.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
export const ROOT = resolve(HERE, '..', '..')
export const CACHE = join(ROOT, '.cache', 'capture')
export const FORBIDDEN_FILE = join(ROOT, '.cache', 'privacy.local.json')
const HOOKS = join(HERE, 'page', 'hooks.js')

// The studio's virtual clock and window.open/print stubs, read at run time like redact.js
const studioShim = (name) => readFileSync(join(STUDIO, 'lib', 'shim', name), 'utf8')

// Short commit of the app checkout a capture came from (read-only), for the sidecar
function commitOf(dir) {
  try {
    return execFileSync('git', ['-C', dir, 'rev-parse', '--short', 'HEAD'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
  } catch {
    return null
  }
}

// Serves the app, launches Chrome and registers seeds and shims; virtualTime freezes timers, rAF and animations until stepped
export async function openApp({ app, root, port, cdpPort, width, height, dpr = 2, virtualTime = false, seed = {}, reducedMotion = false }) {
  if (!existsSync(root)) throw new Error(`${app}: app folder not found: ${root}`)
  const server = await serve({ root, port })
  let page
  try {
    page = await launch({
      port: cdpPort,
      width,
      height,
      dpr,
      timeout: 60000,
      extraArgs: ['--force-color-profile=srgb', '--lang=en-US', '--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--autoplay-policy=no-user-gesture-required'],
    })
    // DPR from the launch flag only: an emulated scale factor makes Chrome drop :hover during layout-driven re-checks
    await page.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 0, mobile: false, screenWidth: width, screenHeight: height })
    await page.send('Emulation.setFocusEmulationEnabled', { enabled: true }).catch(() => {})
    await page.send('Emulation.setLocaleOverride', { locale: 'en-US' }).catch(() => {})
    await page.send('Emulation.setTimezoneOverride', { timezoneId: 'America/Los_Angeles' }).catch(() => {})
    await page.send('Browser.setDownloadBehavior', { behavior: 'deny' }).catch(() => {})
    await page.setMedia({ reducedMotion: reducedMotion ? 'reduce' : 'no-preference', colorScheme: 'light' })
    const seeds = Object.entries(seed).map(([k, v]) => `try { localStorage.setItem(${JSON.stringify(k)}, ${JSON.stringify(v)}) } catch (e) {}`)
    const early = [...seeds]
    if (virtualTime) early.push(studioShim('virtual-time.js'))
    early.push(studioShim('stubs.js'), readFileSync(HOOKS, 'utf8'))
    await page.send('Page.addScriptToEvaluateOnNewDocument', { source: early.join('\n;\n') })
    await installPrivacy(page, app)
  } catch (err) {
    await page?.close()
    await server.close()
    throw err
  }
  const dir = join(CACHE, app)
  mkdirSync(dir, { recursive: true })
  return {
    app,
    page,
    server,
    base: server.url,
    dir,
    dpr,
    width,
    height,
    commit: commitOf(root),
    // Stops Chrome and the server; safe to call twice
    async close() {
      await page.close()
      await server.close()
    },
  }
}

// Navigates to a path on the app server and waits for its load event
export async function go(ctx, path) {
  await ctx.page.navigate(ctx.base + path, { waitUntil: 'load', timeout: 90000 })
}

// Real-time wait until no tiles, images or requests are pending for `quiet` ms, then decodes images
export async function waitIdle(ctx, { quiet = 1500, timeout = 90000, label = 'page' } = {}) {
  const deadline = Date.now() + timeout
  let calmSince = null
  for (;;) {
    const busy = await ctx.page.evaluate('window.__wp6.busy()')
    if (busy.total === 0) {
      calmSince ??= Date.now()
      if (Date.now() - calmSince >= quiet) break
    } else calmSince = null
    if (Date.now() > deadline) throw new Error(`${label}: still busy after ${timeout} ms (${JSON.stringify(busy)})`)
    await sleep(150)
  }
  await ctx.page.evaluate('window.__wp6.decode()')
}

// Polls a page expression until truthy (coerced to a boolean, so app objects never cross CDP); the shot name lands in the error
export async function until(ctx, expression, { timeout = 30000, label = 'condition' } = {}) {
  try {
    return await ctx.page.waitFor(`!!(${expression})`, timeout, { interval: 150 })
  } catch (err) {
    throw new Error(`${ctx.app}: ${label} not reached: ${err.message}`)
  }
}

// Writes <name>.png (asserted leak-free before and after) and <name>.json with the camera, scrubs and any extra fields
export async function still(ctx, name, { clip, extra = {}, map = true } = {}) {
  // No focus ring in a still: apps move focus to results for screen readers
  await ctx.page.evaluate('window.__wp6.hideCursor(); document.activeElement && document.activeElement.blur && document.activeElement.blur(); true')
  const leaks = await assertNoLeaks(ctx.page, `${ctx.app}/${name}`)
  const file = join(ctx.dir, `${name}.png`)
  await ctx.page.screenshot({ path: file, format: 'png', clip })
  await assertNoLeaks(ctx.page, `${ctx.app}/${name} (after)`)
  const camera = map ? await mapState(ctx.page) : {}
  const [vw, vh] = clip ? [clip.width, clip.height] : [ctx.width, ctx.height]
  const sidecar = {
    app: ctx.app,
    name,
    kind: 'still',
    width: vw,
    height: vh,
    dpr: ctx.dpr * (clip?.scale ?? 1),
    ...camera,
    viewport: [vw, vh],
    ...(clip ? { clip: [clip.x, clip.y, clip.width, clip.height], captureViewport: [ctx.width, ctx.height] } : {}),
    scrubs: SCRUBS[ctx.app],
    leaks,
    appCommit: ctx.commit,
    capturedAt: new Date().toISOString(),
    ...extra,
  }
  writeFileSync(join(ctx.dir, `${name}.json`), JSON.stringify(sidecar, null, 2))
  await recordForbidden(ctx.page, FORBIDDEN_FILE)
  console.log(`  still ${ctx.app}/${name}.png  ${vw}x${vh} @${sidecar.dpr}x`)
  return sidecar
}
