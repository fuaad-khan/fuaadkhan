// Scroll audit (PLAN.md §13.2): steps through the page per profile, saves a frame per step and flags dead, hidden-focusable and overflowing states
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { constants as osConstants } from 'node:os'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import { launch, sleep } from './lib/cdp.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

const PROFILES = {
  desktop: { width: 1440, height: 900, dpr: 1, mobile: false, reduced: false, scripts: true },
  tablet: { width: 768, height: 1024, dpr: 1, mobile: false, reduced: false, scripts: true },
  phone: { width: 390, height: 844, dpr: 2, mobile: true, reduced: false, scripts: true },
  reduced: { width: 1440, height: 900, dpr: 1, mobile: false, reduced: true, scripts: true },
  nojs: { width: 1440, height: 900, dpr: 1, mobile: false, reduced: false, scripts: false },
}

// Each of the 8x6 cells is probed at sub x sub points, so text lines that fall between cell centres still count
const SAMPLER = { cols: 8, rows: 6, sub: 3, minOpacity: 0.1, minMediaPx: 24 }
const EMPTY_BELOW = 0.1
const MAX_STEPS = 400
const MAX_LISTED = 20
const HYDRATION = /hydrat|did not match|Minified React error #(418|419|421|422|423|425)\b/i
const FRAME_FILE = /^(desktop|tablet|phone|reduced|nojs)-\d+-y\d+\.jpg$/

const USAGE = `Usage: node scripts/audit-scroll.mjs [--url <http://...> | --dist <dir>] [options]

  --url <url>             audit a server that is already running
  --dist <dir>            serve <dir> with vite preview on --port, stop it afterwards (default: dist)
  --port <n>              preview port for --dist (default 4173)
  --out <dir>             output folder (default audit/<yyyymmdd-hhmm>)
  --profiles <list>       comma list of ${Object.keys(PROFILES).join(', ')} (default: all)
  --step <fraction>       scroll step as a fraction of the viewport height (default 0.5)
  --settle <ms>           wait after load and after every scroll step (default 900)
  --allow-empty           report empty frames without failing the run
  --cdp-port <n>          Chrome DevTools port (default 9360)
  --jpeg-quality <1-100>  frame quality (default 70)`

class UsageError extends Error {}

function readOptions() {
  let parsed
  try {
    parsed = parseArgs({
      options: {
        url: { type: 'string' },
        dist: { type: 'string' },
        port: { type: 'string', default: '4173' },
        out: { type: 'string' },
        profiles: { type: 'string', default: Object.keys(PROFILES).join(',') },
        step: { type: 'string', default: '0.5' },
        settle: { type: 'string', default: '900' },
        'allow-empty': { type: 'boolean', default: false },
        'cdp-port': { type: 'string', default: '9360' },
        'jpeg-quality': { type: 'string', default: '70' },
        help: { type: 'boolean', short: 'h', default: false },
      },
    })
  } catch (err) {
    throw new UsageError(err.message)
  }
  const { values } = parsed
  if (values.help) {
    console.log(USAGE)
    process.exit(0)
  }
  const number = (name, { min, max, integer = false }) => {
    const value = Number(values[name])
    const ok = Number.isFinite(value) && value >= min && value <= max && (!integer || Number.isInteger(value))
    if (!ok) throw new UsageError(`--${name} must be ${integer ? 'an integer' : 'a number'} from ${min} to ${max} (got ${values[name]})`)
    return value
  }
  if (values.url && values.dist) throw new UsageError('pass either --url or --dist, not both')
  if (values.url && !/^https?:\/\//i.test(values.url)) throw new UsageError(`--url must start with http:// or https:// (got ${values.url})`)
  const profiles = [...new Set(values.profiles.split(',').map((name) => name.trim()).filter(Boolean))]
  const unknown = profiles.filter((name) => !PROFILES[name])
  if (unknown.length || !profiles.length) throw new UsageError(`unknown profile(s): ${unknown.join(', ') || '(none given)'}`)
  return {
    url: values.url ?? null,
    dist: values.url ? null : resolve(values.dist ?? 'dist'),
    port: number('port', { min: 1, max: 65535, integer: true }),
    out: resolve(values.out ?? join('audit', stamp(new Date()))),
    profiles,
    step: number('step', { min: 0.05, max: 2 }),
    settle: number('settle', { min: 0, max: 60000, integer: true }),
    allowEmpty: values['allow-empty'],
    cdpPort: number('cdp-port', { min: 0, max: 65535, integer: true }),
    jpegQuality: number('jpeg-quality', { min: 1, max: 100, integer: true }),
  }
}

function stamp(date) {
  const two = (n) => String(n).padStart(2, '0')
  return `${date.getFullYear()}${two(date.getMonth() + 1)}${two(date.getDate())}-${two(date.getHours())}${two(date.getMinutes())}`
}

// Serves a build folder with the local Vite CLI (what `npx vite preview` runs) without a shell, so Windows paths need no quoting
async function startPreview(dist, port) {
  if (!existsSync(join(dist, 'index.html'))) throw new UsageError(`${dist} has no index.html; run npm run build first`)
  const viteBin = join(dirname(createRequire(import.meta.url).resolve('vite/package.json')), 'bin', 'vite.js')
  const child = spawn(process.execPath, [viteBin, 'preview', '--outDir', dist, '--port', String(port), '--strictPort'], {
    cwd: ROOT,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  })
  let output = ''
  const collect = (chunk) => {
    output = (output + chunk).slice(-4000)
  }
  child.stdout.setEncoding('utf8').on('data', collect)
  child.stderr.setEncoding('utf8').on('data', collect)
  const stopNow = () => {
    if (child.exitCode === null && child.signalCode === null) child.kill()
  }
  process.on('exit', stopNow)
  const url = `http://localhost:${port}/`
  const deadline = Date.now() + 30000
  for (;;) {
    if (child.exitCode !== null) throw new Error(`vite preview exited with code ${child.exitCode}\n${output.trim()}`)
    if (await reachable(url)) break
    if (Date.now() > deadline) {
      stopNow()
      throw new Error(`vite preview did not answer on ${url} within 30 s\n${output.trim()}`)
    }
    await sleep(200)
  }
  const stop = async () => {
    if (child.exitCode !== null || child.signalCode !== null) return
    const exited = new Promise((done) => child.once('exit', done))
    stopNow()
    await Promise.race([exited, sleep(3000)])
  }
  return { url, stop }
}

async function reachable(url) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(3000) })
    return res.status < 500
  } catch {
    return false
  }
}

// Runs in the page (scripts on or off): content ratio over the grid, hidden-but-focusable tabbables, horizontal overflow
function samplePage({ cols, rows, sub, minOpacity, minMediaPx }) {
  const win = globalThis
  const doc = win.document
  const root = doc.documentElement
  const vw = win.innerWidth
  const vh = win.innerHeight
  const styles = new Map()
  const opacities = new Map()
  const backdrops = new Map()
  const style = (el) => {
    if (!styles.has(el)) styles.set(el, win.getComputedStyle(el))
    return styles.get(el)
  }
  const parentOf = (el) => el.parentElement ?? el.parentNode?.host ?? null
  const opacity = (el) => {
    if (!el) return 1
    if (!opacities.has(el)) opacities.set(el, Number(style(el).opacity) * opacity(parentOf(el)))
    return opacities.get(el)
  }
  const parseColor = (value) => {
    if (!value || value === 'transparent') return [0, 0, 0, 0]
    const match = /^rgba?\(([^)]+)\)$/.exec(value)
    if (!match) return null
    const [r, g, b, a = 1] = match[1].split(/[\s,/]+/).filter(Boolean).map(Number)
    return [r, g, b, a]
  }
  const sameColor = (a, b) => [0, 1, 2].every((i) => Math.abs(a[i] - b[i]) <= 3)
  const pageBg = [doc.body, root].map((el) => el && parseColor(style(el).backgroundColor)).find((c) => c && c[3] > 0.05) ?? [255, 255, 255, 1]
  const coversViewport = (el) => {
    const r = el.getBoundingClientRect()
    const w = Math.max(0, Math.min(r.right, vw) - Math.max(r.left, 0))
    const h = Math.max(0, Math.min(r.bottom, vh) - Math.max(r.top, 0))
    return w * h >= 0.9 * vw * vh
  }
  // Decorative page backdrops (fixed, viewport-sized, aria-hidden) are see-through for the content test
  const isBackdrop = (el) => {
    if (!backdrops.has(el)) {
      let verdict = false
      for (let node = el; node && node !== doc.body && node !== root; node = parentOf(node)) {
        if (node.dataset?.audit === 'background') verdict = true
        else if (style(node).position === 'fixed' && node.closest('[aria-hidden="true"]') && coversViewport(node)) verdict = true
        if (verdict) break
      }
      backdrops.set(el, verdict)
    }
    return backdrops.get(el)
  }
  const ownText = (el) => [...el.childNodes].some((node) => node.nodeType === 3 && node.nodeValue.trim())
  const mediaOf = (el) => {
    if (el instanceof win.SVGElement) {
      let svg = el
      while (svg.ownerSVGElement) svg = svg.ownerSVGElement
      return svg
    }
    return /^(IMG|VIDEO|CANVAS|IFRAME|OBJECT|EMBED)$/.test(el.tagName) ? el : null
  }
  const mediaShows = (el) => {
    const r = el.getBoundingClientRect()
    if (r.width < minMediaPx || r.height < minMediaPx) return false
    if (el.tagName === 'IMG') return el.complete && el.naturalWidth > 0
    if (el.tagName === 'VIDEO') return Boolean(el.poster) || el.readyState >= 2
    return true
  }
  // Walks the hit stack top-down: the first element that paints something decides the cell
  const contentAt = (x, y) => {
    for (const el of doc.elementsFromPoint(x, y)) {
      if (el === doc.body || el === root) return false
      if (style(el).visibility !== 'visible' || opacity(el) < minOpacity || isBackdrop(el)) continue
      if (ownText(el) || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)) return true
      const media = mediaOf(el)
      if (media) {
        if (mediaShows(media)) return true
        continue
      }
      const st = style(el)
      // Pictures count; a gradient-only wash as large as the viewport is judged by its colour, like a backdrop
      if (st.backgroundImage && st.backgroundImage !== 'none' && (/url\(/.test(st.backgroundImage) || !coversViewport(el))) return true
      const bg = parseColor(st.backgroundColor)
      if (!bg) return true
      if (bg[3] > 0.05 && !sameColor(bg, pageBg)) return true
      if (bg[3] >= 0.95) return false
    }
    return false
  }
  const describe = (el) => {
    if (!el) return ''
    const id = el.id ? `#${el.id}` : ''
    const cls = typeof el.className === 'string' && el.className.trim() ? `.${el.className.trim().split(/\s+/)[0]}` : ''
    return `${el.tagName.toLowerCase()}${id}${cls}`
  }
  const label = (el) => (el.getAttribute('aria-label') || el.textContent || el.getAttribute('title') || '').replace(/\s+/g, ' ').trim().slice(0, 60)

  // Hit-test every painted box, including layers that opt out of pointer events
  const sheet = new win.CSSStyleSheet()
  sheet.replaceSync('*, *::before, *::after { pointer-events: auto !important; }')
  // adoptedStyleSheets is a live array, so keep a plain copy to restore
  const adopted = [...doc.adoptedStyleSheets]
  doc.adoptedStyleSheets = [...adopted, sheet]
  // A cell is content as soon as one of its probe points is
  const cellHasContent = (col, row) => {
    for (let sy = 0; sy < sub; sy++) {
      for (let sx = 0; sx < sub; sx++) {
        if (contentAt(((col + (sx + 0.5) / sub) * vw) / cols, ((row + (sy + 0.5) / sub) * vh) / rows)) return true
      }
    }
    return false
  }
  let cells = ''
  try {
    for (let row = 0; row < rows; row++) {
      if (row) cells += '/'
      for (let col = 0; col < cols; col++) cells += cellHasContent(col, row) ? '1' : '0'
    }
  } finally {
    doc.adoptedStyleSheets = adopted
  }

  const hiddenFocusable = []
  const tabbable = 'a[href], area[href], button, input:not([type="hidden"]), select, textarea, summary, iframe, [tabindex], [contenteditable=""], [contenteditable="true"]'
  for (const el of doc.querySelectorAll(tabbable)) {
    if (el.tabIndex < 0 || el.matches(':disabled') || el.closest('[inert]')) continue
    if (style(el).visibility !== 'visible' || !el.getClientRects().length) continue
    const r = el.getBoundingClientRect()
    if (r.bottom <= 0 || r.top >= vh || r.right <= 0 || r.left >= vw) continue
    const alpha = opacity(el)
    if (alpha >= minOpacity) continue
    hiddenFocusable.push({
      element: describe(el),
      within: describe(el.closest('section, header, footer, nav, aside, main')),
      text: label(el),
      href: el.getAttribute('href'),
      opacity: Math.round(alpha * 1000) / 1000,
      rect: [r.left, r.top, r.width, r.height].map(Math.round),
    })
  }

  const scrollWidth = root.scrollWidth
  const overflow = scrollWidth > vw
  const offenders = []
  if (overflow) {
    const clipped = (el) => {
      for (let node = el; node && node !== doc.body; node = parentOf(node)) {
        const st = style(node)
        if (st.position === 'fixed') return true
        if (node !== el && /hidden|clip|auto|scroll/.test(st.overflowX)) return true
      }
      return false
    }
    const wide = [...doc.body.querySelectorAll('*')].filter((el) => {
      const r = el.getBoundingClientRect()
      return (r.right > vw + 1 || r.left < -1) && r.width > 0 && !clipped(el)
    })
    const set = new Set(wide)
    for (const el of wide) {
      let outermost = true
      for (let node = parentOf(el); node; node = parentOf(node)) if (set.has(node)) outermost = false
      if (!outermost) continue
      const r = el.getBoundingClientRect()
      offenders.push({ element: describe(el), within: describe(el.closest('section, header, footer, main')), left: Math.round(r.left), right: Math.round(r.right) })
      if (offenders.length === 5) break
    }
  }

  const contentCells = cells.split('').filter((c) => c === '1').length
  return {
    scrollY: Math.round(win.scrollY),
    scrollHeight: root.scrollHeight,
    innerWidth: vw,
    innerHeight: vh,
    ratio: contentCells / (cols * rows),
    cells,
    hiddenFocusable,
    overflow,
    scrollWidth,
    offenders,
  }
}

// Runs in the page once per profile: heading outline and landmark counts
function inspectDocument() {
  const doc = globalThis.document
  const rendered = (el) => el.getClientRects().length > 0 && !el.closest('[hidden], [aria-hidden="true"]')
  const text = (el) => el.textContent.replace(/\s+/g, ' ').trim().slice(0, 80)
  const headings = [...doc.querySelectorAll('h1, h2, h3, h4, h5, h6')]
    .filter(rendered)
    .map((el) => ({ level: Number(el.tagName[1]), text: text(el) }))
  const errors = []
  const h1Count = headings.filter((h) => h.level === 1).length
  if (!h1Count) errors.push('no h1')
  if (h1Count > 1) errors.push(`${h1Count} h1 elements`)
  let previous = 0
  for (const h of headings) {
    if (h.level > previous + 1) errors.push(`skipped level: ${previous ? `h${previous}` : 'start'} -> h${h.level} "${h.text}"`)
    previous = h.level
  }
  // footer/header are contentinfo/banner only outside sectioning content (HTML-AAM)
  const scoped = 'article, aside, main, nav, section, [role="article"], [role="complementary"], [role="main"], [role="navigation"], [role="region"]'
  const count = (selector, role) => [...doc.querySelectorAll(selector)]
    .filter((el) => rendered(el) && (el.getAttribute('role') === role || !el.parentElement?.closest(scoped)))
    .length
  const landmarks = {
    main: [...doc.querySelectorAll('main, [role="main"]')].filter(rendered).length,
    contentinfo: count('footer:not([role]), [role="contentinfo"]', 'contentinfo'),
    banner: count('header:not([role]), [role="banner"]', 'banner'),
    navigation: [...doc.querySelectorAll('nav, [role="navigation"]')].filter(rendered).length,
  }
  return { headings, headingErrors: errors, landmarks }
}

const scrollStep = (y, waitFrames) => `new Promise((resolve) => {
  window.scrollTo({ top: ${y}, left: 0, behavior: 'instant' })
  ${waitFrames ? 'requestAnimationFrame(() => requestAnimationFrame(() => resolve(window.scrollY)))' : 'resolve(window.scrollY)'}
})`

const pct = (ratio) => `${Math.round(ratio * 100)}%`
const viewportLabel = (p) => `${p.width}x${p.height} @${p.dpr}x${p.mobile ? ' mobile' : ''}`

// Removes this profile's frames from an earlier run so the folder matches the contact sheet
function clearFrames(outDir, name) {
  for (const file of readdirSync(outDir)) {
    if (FRAME_FILE.test(file) && file.startsWith(`${name}-`)) rmSync(join(outDir, file), { force: true })
  }
}

async function auditProfile(name, url, opts) {
  const profile = PROFILES[name]
  const log = (msg) => console.log(`[${name}] ${msg}`)
  const started = Date.now()
  const result = {
    name,
    viewport: { width: profile.width, height: profile.height, dpr: profile.dpr, mobile: profile.mobile },
    reducedMotion: profile.reduced,
    scripts: profile.scripts,
    url,
    docHeight: 0,
    docHeightFinal: 0,
    steps: 0,
    frames: [],
    empties: [],
    hiddenFocusable: [],
    overflow: false,
    overflowDetail: { maxScrollWidth: 0, innerWidth: profile.width, steps: [], offenders: [] },
    headings: { list: [], errors: [] },
    landmarks: null,
    consoleErrors: [],
    hydrationWarnings: [],
    error: null,
    durationSec: 0,
  }
  clearFrames(opts.out, name)
  log(`${viewportLabel(profile)} · reduced motion ${profile.reduced ? 'on' : 'off'} · scripts ${profile.scripts ? 'on' : 'off'} · launching browser`)

  let session = null
  try {
    session = await launch({ port: opts.cdpPort, width: profile.width, height: profile.height, dpr: profile.dpr, mobile: profile.mobile })
    // Explicit no-preference so the host OS animation setting never leaks into the other profiles
    await session.setMedia({ reducedMotion: profile.reduced ? 'reduce' : 'no-preference' })
    if (!profile.scripts) await session.setScriptEnabled(false)
    await session.navigate(url, { waitUntil: 'load', timeout: 60000 })
    await session
      .waitFor('!document.fonts || document.fonts.status === "loaded"', 5000)
      .catch(() => log('fonts still loading after 5 s; continuing'))
    await sleep(opts.settle)
    result.docHeight = await session.evaluate('document.documentElement.scrollHeight')
    const stepPx = Math.max(1, Math.round(profile.height * opts.step))
    log(`loaded in ${((Date.now() - started) / 1000).toFixed(1)} s · document ${result.docHeight} px · ${stepPx} px steps (~${Math.ceil(Math.max(0, result.docHeight - profile.height) / stepPx) + 1} frames)`)

    const seenFocusable = new Map()
    let y = 0
    for (let index = 0; ; index++) {
      // Page scripts are off in the nojs profile, and requestAnimationFrame never fires there
      await session.evaluate(scrollStep(y, profile.scripts))
      await sleep(opts.settle)
      const sample = await session.evaluate(samplePage, SAMPLER)
      const file = `${name}-${String(index).padStart(2, '0')}-y${sample.scrollY}.jpg`
      await session.screenshot({ path: join(opts.out, file), format: 'jpeg', quality: opts.jpegQuality })
      const ratio = Math.round(sample.ratio * 1000) / 1000
      const frame = { step: index, y: sample.scrollY, ratio, cells: sample.cells, overflow: sample.overflow, hiddenFocusable: sample.hiddenFocusable.length, file }
      result.frames.push(frame)
      result.docHeightFinal = sample.scrollHeight

      const flags = []
      if (sample.ratio < EMPTY_BELOW) {
        result.empties.push({ step: index, y: sample.scrollY, ratio, file })
        flags.push(`EMPTY (content ${pct(sample.ratio)})`)
      }
      for (const item of sample.hiddenFocusable) {
        const key = `${item.element}|${item.text}|${item.href}`
        const known = seenFocusable.get(key)
        if (known) known.frames += 1
        else {
          const entry = { ...item, step: index, y: sample.scrollY, file, frames: 1 }
          seenFocusable.set(key, entry)
          result.hiddenFocusable.push(entry)
          flags.push(`hidden focusable ${item.element} "${item.text}"`)
        }
      }
      if (sample.overflow) {
        const detail = result.overflowDetail
        result.overflow = true
        detail.steps.push(index)
        detail.maxScrollWidth = Math.max(detail.maxScrollWidth, sample.scrollWidth)
        // Mobile emulation zooms out to fit overflowing content, widening the layout viewport
        detail.innerWidth = Math.max(detail.innerWidth, sample.innerWidth)
        for (const off of sample.offenders) {
          if (!detail.offenders.some((known) => known.element === off.element)) detail.offenders.push({ ...off, step: index })
        }
        if (detail.steps.length === 1) flags.push(`horizontal overflow (scrollWidth ${sample.scrollWidth} > ${sample.innerWidth})`)
      }

      const maxY = Math.max(0, sample.scrollHeight - sample.innerHeight)
      if (flags.length) log(`step ${index} y=${sample.scrollY}: ${flags.join('; ')}`)
      else if (index % 10 === 0) log(`step ${index} y=${sample.scrollY}/${maxY} · content ${pct(sample.ratio)}`)
      if (y >= maxY || index + 1 >= MAX_STEPS) {
        if (index + 1 >= MAX_STEPS && y < maxY) log(`stopped at the ${MAX_STEPS}-step cap before the end of the document`)
        break
      }
      y = Math.min(y + stepPx, maxY)
    }

    const docInfo = await session.evaluate(inspectDocument)
    result.headings = { list: docInfo.headings, errors: docInfo.headingErrors }
    result.landmarks = docInfo.landmarks
  } catch (err) {
    result.error = err.message
    log(`ERROR ${err.message}`)
  } finally {
    if (session) {
      const messages = session.consoleMessages()
      result.consoleErrors = messages.filter((m) => m.level === 'error')
      result.hydrationWarnings = messages.filter((m) => HYDRATION.test(m.text))
      await session.close()
    }
  }
  result.steps = result.frames.length
  result.durationSec = Math.round((Date.now() - started) / 100) / 10
  result.checks = judge(result, opts)
  result.pass = result.checks.every((check) => check.status !== 'FAIL')
  return result
}

const firstLine = (text) => String(text).split('\n')[0].slice(0, 160)

// Turns one profile's findings into PASS/WARN/FAIL checks; landmarks warn only, as PLAN.md §13.2 does not gate on them
function judge(result, opts) {
  const checks = []
  const add = (id, label, failed, detail, { warnOnly = false } = {}) =>
    checks.push({ id, label, status: failed ? (warnOnly ? 'WARN' : 'FAIL') : 'PASS', detail })
  if (result.error) {
    add('run', 'profile run', true, result.error)
    if (!result.frames.length) return checks
  }
  const empties = result.empties.length
  add('empties', 'empty frames', empties > 0, `${empties}/${result.steps} frames below ${pct(EMPTY_BELOW)} content${empties && opts.allowEmpty ? ' (allowed by --allow-empty)' : ''}`, { warnOnly: opts.allowEmpty })
  const focusable = result.hiddenFocusable
  add('hiddenFocusable', 'hidden focusable', focusable.length > 0, focusable.length
    ? `${focusable.length} tabbable(s) at opacity < ${SAMPLER.minOpacity}: ${focusable.slice(0, 3).map((f) => `${f.element} "${f.text}" (step ${f.step})`).join(', ')}${focusable.length > 3 ? ', ...' : ''}`
    : 'no tabbables at opacity < 0.1 inside the viewport')
  const over = result.overflowDetail
  const zoomed = over.innerWidth > result.viewport.width ? `; layout viewport widened to ${over.innerWidth} px (page zoomed out)` : ''
  add('overflow', 'horizontal overflow', result.overflow, result.overflow
    ? `scrollWidth up to ${over.maxScrollWidth} > ${result.viewport.width} in ${over.steps.length} frame(s)${zoomed}${over.offenders.length ? `; widest: ${over.offenders.map((o) => `${o.element} (${o.left}..${o.right})`).join(', ')}` : ''}`
    : 'scrollWidth never exceeded innerWidth')
  if (result.landmarks) {
    const errors = result.headings.errors
    add('headings', 'heading order', errors.length > 0, errors.length ? errors.slice(0, 4).join('; ') : `${result.headings.list.length} headings in order`)
    const lm = result.landmarks
    const missing = [lm.main !== 1 && `main x${lm.main}`, lm.contentinfo < 1 && 'no contentinfo footer'].filter(Boolean)
    add('landmarks', 'landmarks', missing.length > 0, `${missing.length ? `${missing.join(', ')}; ` : ''}main ${lm.main} · contentinfo ${lm.contentinfo} · banner ${lm.banner} · nav ${lm.navigation}`, { warnOnly: true })
  }
  const errors = result.consoleErrors
  add('consoleErrors', 'console errors', errors.length > 0, errors.length
    ? `${errors.length}: ${errors.slice(0, 2).map((m) => firstLine(m.text)).join(' | ')}`
    : 'no console errors or uncaught exceptions')
  const hydration = result.hydrationWarnings
  add('hydration', 'hydration warnings', hydration.length > 0, hydration.length ? `${hydration.length}: ${firstLine(hydration[0].text)}` : 'none')
  return checks
}

const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])
const mdCell = (value) => String(value ?? '').replace(/\|/g, '\\|').replace(/\s+/g, ' ')

// Writes the per-profile contact sheet; empty frames are outlined and the 8x6 sampler grid can be overlaid without scripts
function writeContactSheet(result, run) {
  const profile = PROFILES[result.name]
  const minWidth = Math.round(240 * Math.max(0.6, profile.width / profile.height))
  const others = run.profiles.filter((name) => name !== result.name).map((name) => `<a href="${name}.html">${name}</a>`).join(' ')
  const figures = result.frames.map((frame) => {
    const empty = frame.ratio < EMPTY_BELOW
    const grid = frame.cells.replace(/\//g, '').split('').map((c) => `<i class="${c === '1' ? 'on' : 'off'}"></i>`).join('')
    const flags = [empty && 'EMPTY', frame.overflow && 'overflow', frame.hiddenFocusable && `${frame.hiddenFocusable} hidden focusable`].filter(Boolean)
    return `<figure class="${empty ? 'empty' : ''}" id="s${frame.step}">
  <a href="${esc(frame.file)}"><span class="shot"><img src="${esc(frame.file)}" alt="${esc(`${result.name} step ${frame.step} at y ${frame.y}`)}" loading="lazy"><span class="cells">${grid}</span></span></a>
  <figcaption><b>#${frame.step}</b> y ${frame.y} · ${pct(frame.ratio)}${flags.length ? ` <span class="flag">${esc(flags.join(' · '))}</span>` : ''}</figcaption>
</figure>`
  }).join('\n')
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(result.name)} · scroll audit</title>
<style>
  body { margin: 0; padding: 24px; background: #111318; color: #e8e6e1; font: 14px/1.45 system-ui, sans-serif; }
  h1 { font-size: 18px; margin: 0 0 4px; }
  p { margin: 0 0 12px; color: #a9a59c; }
  a { color: #8ab4ff; }
  label { display: inline-flex; gap: 6px; align-items: center; margin: 0 0 16px; cursor: pointer; }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(${minWidth}px, 1fr)); gap: 16px; }
  figure { margin: 0; background: #1b1e25; border: 2px solid #1b1e25; border-radius: 6px; overflow: hidden; }
  figure.empty { border-color: #e5484d; }
  .shot { position: relative; display: block; }
  .shot img { display: block; width: 100%; height: auto; }
  .cells { position: absolute; inset: 0; display: none; grid-template-columns: repeat(${SAMPLER.cols}, 1fr); grid-template-rows: repeat(${SAMPLER.rows}, 1fr); }
  .cells i.off { background: rgba(229, 72, 77, 0.35); outline: 1px solid rgba(255, 255, 255, 0.15); }
  .cells i.on { outline: 1px solid rgba(255, 255, 255, 0.15); }
  #overlay:checked ~ .grid .cells { display: grid; }
  figcaption { padding: 6px 8px; font: 12px/1.35 ui-monospace, Consolas, monospace; }
  .flag { color: #ff8589; }
</style>
</head>
<body>
<h1>${esc(result.name)} · ${esc(viewportLabel(profile))}${profile.reduced ? ' · reduced motion' : ''}${profile.scripts ? '' : ' · scripts off'}</h1>
<p>${esc(result.url)} · ${result.steps} frames · ${result.empties.length} empty · document ${result.docHeight} px${result.error ? ` · error: ${esc(result.error)}` : ''}</p>
<p>Other profiles: ${others || '(none)'}</p>
<input type="checkbox" id="overlay"><label for="overlay">Overlay the ${SAMPLER.cols}x${SAMPLER.rows} sampler grid (red = no content)</label>
<div class="grid">
${figures}
</div>
</body>
</html>
`
  writeFileSync(join(run.out, `${result.name}.html`), html)
}

function writeSummaryMarkdown(summary, run) {
  const lines = [
    '# Scroll audit',
    '',
    `- URL: ${summary.url}`,
    `- Run: ${summary.startedAt} · ${summary.durationSec} s · step ${run.step} viewport · settle ${run.settle} ms · grid ${SAMPLER.cols}x${SAMPLER.rows} (${SAMPLER.sub}x${SAMPLER.sub} probes per cell), empty below ${pct(EMPTY_BELOW)}`,
    `- Result: **${summary.pass ? 'PASS' : 'FAIL'}**`,
    '',
    '| Profile | Viewport | Document | Frames | Empty | Hidden focusable | Overflow | Headings | Landmarks | Console errors | Hydration | Result |',
    '|---|---|---:|---:|---:|---:|---|---|---|---:|---:|---|',
  ]
  for (const result of Object.values(summary.profiles)) {
    const status = (id) => result.checks.find((check) => check.id === id)?.status ?? 'n/a'
    lines.push(`| [${result.name}](${result.name}.html) | ${viewportLabel(PROFILES[result.name])} | ${result.docHeight} px | ${result.steps} | ${result.empties.length} | ${result.hiddenFocusable.length} | ${result.overflow ? 'yes' : 'no'} | ${status('headings')} | ${status('landmarks')} | ${result.consoleErrors.length} | ${result.hydrationWarnings.length} | **${result.pass ? 'PASS' : 'FAIL'}** |`)
  }
  for (const result of Object.values(summary.profiles)) {
    lines.push('', `## ${result.name}`, '', `Contact sheet: [${result.name}.html](${result.name}.html)`, '')
    for (const check of result.checks) lines.push(`- ${check.status} ${check.label}: ${mdCell(check.detail)}`)
    if (result.empties.length) {
      lines.push('', '| Empty step | y | Content | Frame |', '|---:|---:|---:|---|')
      for (const e of result.empties) lines.push(`| ${e.step} | ${e.y} | ${pct(e.ratio)} | [${e.file}](${e.file}) |`)
    }
    if (result.hiddenFocusable.length) {
      lines.push('', 'Hidden-but-focusable tabbables:', '')
      for (const f of result.hiddenFocusable.slice(0, MAX_LISTED)) {
        const where = f.within ? ` in \`${f.within}\`` : ''
        lines.push(`- \`${f.element}\` "${mdCell(f.text)}"${f.href ? ` (${mdCell(f.href)})` : ''}${where}: opacity ${f.opacity}, first at step ${f.step} (y ${f.y}), in ${f.frames} frame(s)`)
      }
    }
    if (result.overflow) {
      lines.push('', `Horizontal overflow in steps ${result.overflowDetail.steps.join(', ')}:`, '')
      for (const o of result.overflowDetail.offenders) lines.push(`- \`${o.element}\`${o.within ? ` in \`${o.within}\`` : ''} spans x ${o.left}..${o.right} (step ${o.step})`)
    }
    if (result.headings.list.length) {
      lines.push('', 'Headings:', '')
      for (const h of result.headings.list) lines.push(`${'  '.repeat(h.level - 1)}- h${h.level} ${mdCell(h.text)}`)
    }
    if (result.consoleErrors.length || result.hydrationWarnings.length) {
      lines.push('', 'Console errors and hydration warnings:', '')
      const listed = [...new Set([...result.consoleErrors, ...result.hydrationWarnings])].slice(0, MAX_LISTED)
      for (const m of listed) lines.push(`- [${m.source}] ${mdCell(firstLine(m.text))}${m.url ? ` (${mdCell(m.url)}${m.line ? `:${m.line}` : ''})` : ''}`)
    }
  }
  writeFileSync(join(run.out, 'summary.md'), `${lines.join('\n')}\n`)
}

async function main() {
  // Exit through process.exit on Ctrl+C so the exit hooks stop Chrome and vite preview
  for (const signal of ['SIGINT', 'SIGTERM', 'SIGBREAK']) process.on(signal, () => process.exit(128 + (osConstants.signals[signal] ?? 1)))
  const opts = readOptions()
  const startedAt = new Date()
  mkdirSync(opts.out, { recursive: true })
  const outLabel = relative(process.cwd(), opts.out) || '.'
  console.log(`audit-scroll · profiles ${opts.profiles.join(', ')} · step ${opts.step} · settle ${opts.settle} ms · out ${outLabel}`)

  let server = null
  let url = opts.url
  if (url) {
    if (!(await reachable(url))) throw new UsageError(`cannot reach ${url}; is the server running?`)
  } else {
    console.log(`serving ${relative(process.cwd(), opts.dist) || '.'} with vite preview on port ${opts.port}`)
    server = await startPreview(opts.dist, opts.port)
    url = server.url
  }

  const profiles = {}
  try {
    for (const name of opts.profiles) {
      const result = await auditProfile(name, url, opts)
      profiles[name] = result
      writeContactSheet(result, opts)
    }
  } finally {
    if (server) await server.stop()
  }

  const finishedAt = new Date()
  const summary = {
    tool: 'audit-scroll',
    url,
    startedAt: startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
    durationSec: Math.round((finishedAt - startedAt) / 1000),
    options: {
      profiles: opts.profiles,
      step: opts.step,
      settle: opts.settle,
      allowEmpty: opts.allowEmpty,
      jpegQuality: opts.jpegQuality,
      cdpPort: opts.cdpPort,
      grid: [SAMPLER.cols, SAMPLER.rows],
      probesPerCell: SAMPLER.sub * SAMPLER.sub,
      emptyBelow: EMPTY_BELOW,
      minOpacity: SAMPLER.minOpacity,
    },
    pass: Object.values(profiles).every((result) => result.pass),
    profiles,
  }
  writeFileSync(join(opts.out, 'summary.json'), `${JSON.stringify(summary, null, 2)}\n`)
  writeSummaryMarkdown(summary, opts)

  console.log('')
  let failures = 0
  for (const result of Object.values(profiles)) {
    for (const check of result.checks) {
      if (check.status === 'FAIL') failures += 1
      console.log(`[${result.name}] ${check.status.padEnd(4)}  ${check.label.padEnd(19)} ${check.detail}`)
    }
  }
  console.log(`\nAUDIT ${summary.pass ? 'PASS' : `FAIL (${failures} failing check${failures === 1 ? '' : 's'})`} · ${join(outLabel, 'summary.md')}`)
  return summary.pass ? 0 : 1
}

main().then(
  (code) => process.exit(code),
  (err) => {
    console.error(err instanceof UsageError ? `audit-scroll: ${err.message}\n\n${USAGE}` : `audit-scroll failed: ${err.message}`)
    process.exit(2)
  },
)
