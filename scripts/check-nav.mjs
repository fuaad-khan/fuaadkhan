// Floating nav check (CONTRACTS-v2 §2): per profile, puts each section under the active band and checks the lens, the app morph and aria-current, then clicks the links
import { mkdirSync, writeFileSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { parseArgs } from 'node:util'
import { launch, sleep } from './lib/cdp.mjs'

const PROFILES = {
  desktop: { width: 1440, height: 900, dpr: 1, mobile: false, reduced: false },
  phone: { width: 390, height: 844, dpr: 2, mobile: true, reduced: false },
  reduced: { width: 1440, height: 900, dpr: 1, mobile: false, reduced: true },
}
// Share of the expected item's box the lens must cover
const MIN_OVERLAP = 0.6
// At or below this width an app section shows only the three app items (Nav.module.css: five items need about 520px)
const APPS_ONLY = 559
const HYDRATION = /hydrat|did not match|Minified React error #(418|419|421|422|423|425)\b/i

const USAGE = `Usage: node scripts/check-nav.mjs [options]

  --url <url>          site to check, already running (default http://localhost:4181/)
  --cdp-port <n>       Chrome DevTools port (default 9361)
  --out <dir>          screenshots and summary.json (default audit/nav)
  --profiles <list>    comma list of ${Object.keys(PROFILES).join(', ')} (default: all)
  --settle <ms>        wait after each scroll for the lens and the morph (default 1100)`

class UsageError extends Error {}

function readOptions() {
  let values
  try {
    ;({ values } = parseArgs({
      options: {
        url: { type: 'string', default: 'http://localhost:4181/' },
        'cdp-port': { type: 'string', default: '9361' },
        out: { type: 'string', default: join('audit', 'nav') },
        profiles: { type: 'string', default: Object.keys(PROFILES).join(',') },
        settle: { type: 'string', default: '1100' },
        help: { type: 'boolean', short: 'h', default: false },
      },
    }))
  } catch (err) {
    throw new UsageError(err.message)
  }
  if (values.help) {
    console.log(USAGE)
    process.exit(0)
  }
  if (!/^https?:\/\//i.test(values.url)) throw new UsageError(`--url must start with http:// or https:// (got ${values.url})`)
  const profiles = values.profiles.split(',').map((name) => name.trim()).filter(Boolean)
  const unknown = profiles.filter((name) => !PROFILES[name])
  if (unknown.length || !profiles.length) throw new UsageError(`unknown profile(s): ${unknown.join(', ') || '(none given)'}`)
  const cdpPort = Number(values['cdp-port'])
  const settle = Number(values.settle)
  if (!Number.isInteger(cdpPort) || cdpPort < 0 || cdpPort > 65535) throw new UsageError(`--cdp-port must be a port number (got ${values['cdp-port']})`)
  if (!Number.isInteger(settle) || settle < 0) throw new UsageError(`--settle must be a whole number of ms (got ${values.settle})`)
  return { url: new URL(values.url).href, cdpPort, out: resolve(values.out), profiles, settle }
}

// In the page: the section under the band, the lens and the item it should cover, the morph state and aria-current
function readNav() {
  const win = globalThis
  const doc = win.document
  const style = (el) => win.getComputedStyle(el)
  const vh = win.innerHeight
  const band = [0.45 * vh, 0.5 * vh]
  const sections = [...doc.querySelectorAll('[data-section]')]
  // Same rule as Nav/useActiveSection: the last section in page order that crosses the band
  const under = sections.filter((s) => {
    const r = s.getBoundingClientRect()
    return r.top < band[1] && r.bottom > band[0]
  })
  const expected = under.length ? under[under.length - 1].dataset.section : null
  const nav = doc.querySelector('nav')
  const lens = nav.querySelector('[data-lens]')
  const links = [...nav.querySelectorAll('ul a')]
  const box = (r) => ({ x: r.left, y: r.top, w: r.width, h: r.height })
  const shows = (el) => el.getClientRects().length > 0 && style(el).visibility === 'visible' && Number(style(el.parentElement).opacity) * Number(style(el).opacity) > 0.9
  const link = (id) => links.find((a) => a.getAttribute('href') === `#${id}`)
  const apps = [...nav.querySelectorAll('li[data-kind="app"] a')]
  // The hub keeps its own item (the bar stays collapsed there), so every section's lens target is its own link
  const item = !expected || expected === 'top' ? null : link(expected) ? box(link(expected).getBoundingClientRect()) : null
  const lensStyle = style(lens)
  return {
    scrollY: Math.round(win.scrollY),
    expected,
    hash: win.location.hash,
    lens: { ...box(lens.getBoundingClientRect()), opacity: Number(lensStyle.opacity), visibility: lensStyle.visibility, accent: lens.hasAttribute('data-accent') },
    item,
    shown: Object.fromEntries(links.map((a) => [a.getAttribute('href').slice(1), shows(a)])),
    current: links.filter((a) => a.getAttribute('aria-current') === 'location').map((a) => a.getAttribute('href').slice(1)),
    apps: apps.map((a) => a.getAttribute('href').slice(1)),
    focus: doc.activeElement?.id || doc.activeElement?.tagName.toLowerCase() || null,
  }
}

// In the page: scrolls instantly so the band falls inside the section, at its natural landing spot (the root's scroll-padding-top, the nav line) when the section covers the band there
function placeSection(id) {
  const win = globalThis
  const el = win.document.getElementById(id)
  if (!el) return null
  const root = win.document.documentElement
  root.style.scrollBehavior = 'auto'
  const vh = win.innerHeight
  const r = el.getBoundingClientRect()
  const top = r.top + win.scrollY
  const margin = parseFloat(win.getComputedStyle(root).scrollPaddingTop) || 0
  let y = top - margin
  if (!(margin <= 0.45 * vh && r.height + margin >= 0.5 * vh)) y = top + r.height / 2 - 0.475 * vh
  if (id === 'top') y = 0
  win.scrollTo({ top: Math.max(0, Math.min(root.scrollHeight - vh, y)), behavior: 'instant' })
  return Math.round(win.scrollY)
}

function restoreScrollBehavior() {
  globalThis.document.documentElement.style.scrollBehavior = ''
}

// In the page: where a section rests after a nav click, relative to the nav line, whether the scroll could go further, and whether it reaches the band
function landing(id) {
  const win = globalThis
  const el = win.document.getElementById(id)
  const r = el.getBoundingClientRect()
  const margin = parseFloat(win.getComputedStyle(win.document.documentElement).scrollPaddingTop) || 0
  const max = win.document.documentElement.scrollHeight - win.innerHeight
  return {
    offset: Math.round(r.top - margin),
    scrollY: Math.round(win.scrollY),
    atEnd: win.scrollY >= max - 1,
    atTop: win.scrollY <= 0,
    short: r.bottom < 0.5 * win.innerHeight,
    height: Math.round(r.height),
  }
}

const overlap = (a, b) => {
  if (!a || !b || !b.w || !b.h) return 0
  const w = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x))
  const h = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y))
  return (w * h) / (b.w * b.h)
}

const pct = (v) => `${Math.round(v * 100)}%`

// Checks one nav state against the section under the band; returns failure strings
function judge(state, profile) {
  const fails = []
  const { expected } = state
  const appsOnly = profile.width <= APPS_ONLY
  if (!expected) return ['no section crosses the active band']
  if (expected === 'top') {
    if (state.lens.opacity > 0.05 && state.lens.visibility === 'visible') fails.push(`lens visible at the hero (opacity ${state.lens.opacity})`)
    if (state.current.length) fails.push(`aria-current on ${state.current.join(', ')} at the hero`)
  } else {
    if (state.lens.opacity < 0.95 || state.lens.visibility !== 'visible') fails.push(`lens hidden (opacity ${state.lens.opacity}, ${state.lens.visibility})`)
    const cover = overlap(state.lens, state.item)
    if (cover < MIN_OVERLAP) fails.push(`lens covers ${pct(cover)} of the ${expected} item (needs ${pct(MIN_OVERLAP)})`)
    if (state.current.length !== 1 || state.current[0] !== expected) fails.push(`aria-current on [${state.current.join(', ')}], expected ${expected}`)
    const wantAccent = state.apps.includes(expected)
    if (state.lens.accent !== wantAccent) fails.push(`lens accent ${state.lens.accent ? 'on' : 'off'}, expected ${wantAccent ? 'on' : 'off'}`)
  }
  // Only an app section expands the hub item into the apps; the hub itself stays collapsed with My Applications current
  const expanded = state.apps.includes(expected)
  for (const app of state.apps) if (state.shown[app] !== expanded) fails.push(`${app} item ${state.shown[app] ? 'shown' : 'hidden'} ${expanded ? 'inside' : 'outside'} My Applications`)
  if (state.shown.applications === expanded) fails.push(`My Applications item ${expanded ? 'still shown after' : 'hidden without'} the morph`)
  for (const id of ['journey', 'contact']) {
    const want = !(expanded && appsOnly)
    if (state.shown[id] !== want) fails.push(`${id} item ${state.shown[id] ? 'shown' : 'hidden'}${appsOnly ? ' (phone)' : ''}`)
  }
  return fails
}

async function waitForRest(session, timeout = 5000) {
  const started = Date.now()
  let last = null
  let still = 0
  while (Date.now() - started < timeout) {
    const y = await session.evaluate('Math.round(window.scrollY)')
    still = y === last ? still + 1 : 0
    if (still >= 4) return y
    last = y
    await sleep(100)
  }
  return last
}

const linkFor = (id) => (id === 'top' ? 'nav a[href="#top"]' : `nav ul a[href="#${id}"]`)

// In the page: the ids of the app items and of every section, in page order
const pageIds = () => ({
  apps: [...globalThis.document.querySelectorAll('nav li[data-kind="app"] a')].map((a) => a.hash.slice(1)),
  sections: [...globalThis.document.querySelectorAll('[data-section]')].map((s) => s.dataset.section),
})

async function click(session, profile, id) {
  const box = await session.evaluate((sel) => {
    const el = globalThis.document.querySelector(sel)
    if (!el || !el.getClientRects().length) return null
    const r = el.getBoundingClientRect()
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 }
  }, linkFor(id))
  if (!box) return false
  // Desktops get a real mouse click; under touch emulation synthetic taps proved unreliable, so phones get the element's own click()
  if (profile.mobile) await session.evaluate((sel) => globalThis.document.querySelector(sel).click(), linkFor(id))
  else {
    for (const type of ['mousePressed', 'mouseReleased']) await session.send('Input.dispatchMouseEvent', { type, x: box.x, y: box.y, button: 'left', clickCount: 1 })
  }
  return true
}

async function checkProfile(name, opts) {
  const profile = PROFILES[name]
  const results = []
  const log = (status, label, detail = '') => {
    results.push({ status, label, detail })
    console.log(`[${name}] ${status}  ${label}${detail ? `  ${detail}` : ''}`)
  }
  const shoot = async (file) => {
    const height = await session.evaluate('Math.ceil(document.querySelector("nav").getBoundingClientRect().bottom + 12)')
    await session.screenshot({ path: join(opts.out, `${name}-${file}.png`), clip: { x: 0, y: 0, width: profile.width, height } })
  }

  const session = await launch({ port: opts.cdpPort, width: profile.width, height: profile.height, dpr: profile.dpr, mobile: profile.mobile })
  try {
    await session.setMedia({ reducedMotion: profile.reduced ? 'reduce' : 'no-preference' })
    await session.navigate(opts.url, { waitUntil: 'load', timeout: 60000 })
    await session.waitFor('!document.fonts || document.fonts.status === "loaded"', 5000).catch(() => {})
    await sleep(opts.settle)
    const settle = profile.reduced ? 300 : opts.settle
    // Mobile emulation zooms out over horizontal overflow, which also throws every landing position off
    const layout = await session.evaluate('window.innerWidth')
    log(layout > profile.width ? 'FAIL' : 'PASS', 'layout width', `${layout}px for a ${profile.width}px viewport`)

    // 1. Each section under the band: lens, morph and aria-current
    const { apps, sections } = await session.evaluate(pageIds)
    for (const [i, id] of sections.entries()) {
      await session.evaluate(placeSection, id)
      await sleep(settle)
      const state = await session.evaluate(readNav)
      const fails = state.expected === id ? judge(state, profile) : [`${id} could not be placed under the band (found ${state.expected} at y=${state.scrollY})`]
      const detail = id === 'top' ? `lens opacity ${state.lens.opacity}` : `lens over ${pct(overlap(state.lens, state.item))} of the item · y=${state.scrollY}`
      log(fails.length ? 'FAIL' : 'PASS', `section ${id}`, fails.length ? fails.join('; ') : detail)
      await shoot(`${String(i).padStart(2, '0')}-${id}`)
    }
    await session.evaluate(restoreScrollBehavior)

    // 2. Clicks: the page lands on the section under the nav, the lens rests on the clicked item, the hash and focus follow
    await session.evaluate('window.scrollTo({ top: 0, behavior: "instant" })')
    await sleep(settle)
    const plan = ['journey', 'applications', ...[...apps].reverse(), 'contact', 'top']
    for (const id of plan) {
      let clicked = await click(session, profile, id)
      // An item the current state hides is reached from a state that shows it: app items from an app section, the others from the top
      if (!clicked && id !== 'top') {
        await session.evaluate(apps.includes(id) ? placeSection : 'window.scrollTo({ top: 0, behavior: "instant" })', apps[0])
        await session.evaluate(restoreScrollBehavior)
        await sleep(settle)
        clicked = await click(session, profile, id)
      }
      if (!clicked) {
        log('SKIP', `click ${id}`, 'link not shown at this width')
        continue
      }
      await sleep(150)
      await waitForRest(session)
      await sleep(settle)
      const state = await session.evaluate(readNav)
      const spot = await session.evaluate(landing, id)
      const fails = []
      let note = ''
      if (id === 'top' ? !spot.atTop : Math.abs(spot.offset) > 2 && !spot.atEnd) fails.push(`section rests ${spot.offset}px from the nav line at y=${spot.scrollY}`)
      if (state.hash !== `#${id}`) fails.push(`hash ${state.hash || '(none)'}`)
      if (state.focus !== id) fails.push(`focus on ${state.focus}`)
      // A section too short to reach the band from the nav line (an interim stub) leaves the next one under it; the nav must then show that one
      if (state.expected !== id && !spot.short) fails.push(`the band shows ${state.expected} after the jump`)
      else if (state.expected !== id) note = `${id} is ${spot.height}px tall, too short to reach the band; the nav shows ${state.expected}`
      fails.push(...judge(state, profile))
      const status = fails.length ? 'FAIL' : note ? 'WARN' : 'PASS'
      log(status, `click ${id}`, fails.length ? fails.join('; ') : note || `y=${spot.scrollY}${spot.atEnd ? ' (end of page)' : ''}`)
      await shoot(`click-${id}`)
    }

    // 3. A load straight into an app section (prerendered build: the browser lands on the fragment): morph and lens applied in place
    const appId = apps[0] ?? null
    if (appId) {
      await session.navigate('about:blank')
      await session.navigate(new URL(`#${appId}`, opts.url).href, { waitUntil: 'load', timeout: 60000 })
      await sleep(settle)
      const state = await session.evaluate(readNav)
      const spot = await session.evaluate(landing, appId)
      const fails = Math.abs(spot.offset) > 2 && !spot.atEnd ? [`the page did not land on #${appId} (it rests ${spot.offset}px from the nav line)`] : judge(state, profile)
      if (!fails.length && state.expected !== appId && !spot.short) fails.push(`the band shows ${state.expected}`)
      const note = state.expected !== appId ? ` (${appId} is ${spot.height}px tall, too short to reach the band)` : ''
      const status = fails.length ? 'FAIL' : note ? 'WARN' : 'PASS'
      log(status, `load at #${appId}`, fails.length ? fails.join('; ') : `band on ${state.expected} · y=${state.scrollY}${note}`)
      await shoot(`load-${appId}`)
    }

    const messages = session.consoleMessages()
    const errors = messages.filter((m) => m.level === 'error')
    const hydration = messages.filter((m) => HYDRATION.test(m.text))
    log(errors.length ? 'FAIL' : 'PASS', 'console errors', errors.length ? errors.slice(0, 5).map((m) => m.text.slice(0, 200)).join(' | ') : 'none')
    log(hydration.length ? 'FAIL' : 'PASS', 'hydration warnings', hydration.length ? hydration.slice(0, 3).map((m) => m.text.slice(0, 200)).join(' | ') : 'none')
  } catch (err) {
    log('FAIL', 'profile run', err.message)
  } finally {
    await session.close()
  }
  return { name, viewport: profile, results, pass: results.every((r) => r.status !== 'FAIL') }
}

async function main() {
  const opts = readOptions()
  mkdirSync(opts.out, { recursive: true })
  console.log(`check-nav · ${opts.url} · profiles ${opts.profiles.join(', ')} · out ${relative(process.cwd(), opts.out) || '.'}`)
  const profiles = []
  for (const name of opts.profiles) profiles.push(await checkProfile(name, opts))
  const pass = profiles.every((p) => p.pass)
  writeFileSync(join(opts.out, 'summary.json'), JSON.stringify({ tool: 'check-nav', url: opts.url, at: new Date().toISOString(), pass, profiles }, null, 2))
  console.log(pass ? 'NAV PASS' : 'NAV FAIL')
  process.exit(pass ? 0 : 1)
}

main().catch((err) => {
  console.error(err instanceof UsageError ? `check-nav: ${err.message}\n\n${USAGE}` : `check-nav failed: ${err.stack ?? err.message}`)
  process.exit(2)
})
