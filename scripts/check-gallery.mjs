// Highlight gallery check (CONTRACTS-v2 §3): per app section, autoplay, advance, dot jump, pause, off-screen pause and resume, end state; reduced motion; console errors
import { existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { parseArgs } from 'node:util'
import { launch, sleep } from './lib/cdp.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const { apps } = await import(pathToFileURL(join(ROOT, 'src/content/apps.js')).href)
const { site } = await import(pathToFileURL(join(ROOT, 'src/content/site.js')).href)

const PROFILES = {
  desktop: { width: 1440, height: 900, dpr: 1, mobile: false, reduced: false },
  phone: { width: 390, height: 844, dpr: 2, mobile: true, reduced: false },
  reduced: { width: 1440, height: 900, dpr: 1, mobile: false, reduced: true },
}
const STILL_SECONDS = 6
const HYDRATION = /hydrat|did not match|Minified React error #(418|419|421|422|423|425)\b/i
const FRAME_FILE = /^(desktop|phone|reduced)-[a-z-]+-[a-z0-9-]+\.jpg$/

const USAGE = `Usage: node scripts/check-gallery.mjs [--url <http://...>] [options]

  --url <url>         a running server with the built site (default http://localhost:4173)
  --cdp-port <n>      Chrome DevTools port (default 9360)
  --out <dir>         frames folder (default audit/gallery)
  --profiles <list>   comma list of ${Object.keys(PROFILES).join(', ')} (default: all)
  --apps <list>       comma list of app ids (default: all)`

function readOptions() {
  const { values } = parseArgs({
    options: {
      url: { type: 'string', default: 'http://localhost:4173' },
      'cdp-port': { type: 'string', default: '9360' },
      out: { type: 'string', default: 'audit/gallery' },
      profiles: { type: 'string', default: Object.keys(PROFILES).join(',') },
      apps: { type: 'string', default: apps.map((a) => a.id).join(',') },
      help: { type: 'boolean', short: 'h', default: false },
    },
  })
  if (values.help) {
    console.log(USAGE)
    process.exit(0)
  }
  const profiles = values.profiles.split(',').map((p) => p.trim()).filter(Boolean)
  const ids = values.apps.split(',').map((a) => a.trim()).filter(Boolean)
  const bad = [...profiles.filter((p) => !PROFILES[p]), ...ids.filter((id) => !apps.some((a) => a.id === id))]
  if (bad.length) {
    console.error(`Unknown profile or app: ${bad.join(', ')}\n\n${USAGE}`)
    process.exit(2)
  }
  return { url: values.url, port: Number(values['cdp-port']), out: resolve(ROOT, values.out), profiles, ids }
}

const fill = (template, values) => String(template).replace(/\{(\w+)\}/g, (m, k) => (values[k] == null ? m : String(values[k])))
const seconds = (h) => h.duration ?? STILL_SECONDS

// UI strings the page must use, from site.js
const UI = site.ui.gallery
const LABELS = { play: UI.play, pause: UI.pause, replay: UI.replay, showPrefix: UI.show.split('{')[0] }

// The Next cue each section must end on: the next app, or Contact after the last one
function expectedNext(index) {
  const following = apps[index + 1]
  return following
    ? { href: `#${following.id}`, text: fill(UI.next, { name: following.name }) }
    : { href: '#contact', text: fill(UI.next, { name: site.nav.contact }) }
}

// Runs in the page: the gallery's exposed state plus what a viewer would see of it
function readState(id, labels) {
  const win = globalThis
  const doc = win.document
  const sec = doc.getElementById(id)
  const region = sec?.querySelector('[aria-roledescription="carousel"]')
  if (!region) return { missing: true }
  const buttons = [...region.querySelectorAll('button')]
  const dots = buttons.filter((b) => (b.getAttribute('aria-label') ?? '').startsWith(labels.showPrefix))
  const toggle = buttons.find((b) => [labels.play, labels.pause, labels.replay].includes(b.getAttribute('aria-label')))
  const track = region.querySelector('ul')
  const cards = track ? [...track.children] : []
  const active = Number(region.dataset.active)
  const card = cards[active]
  const tr = track?.getBoundingClientRect()
  const cr = card?.getBoundingClientRect()
  const video = card?.querySelector('video')
  const next = region.querySelector('a[href^="#"]')
  const ns = next && win.getComputedStyle(next)
  const rr = region.getBoundingClientRect()
  return {
    state: region.dataset.state,
    running: region.dataset.running === 'true',
    active,
    current: dots.findIndex((d) => d.getAttribute('aria-current') === 'true'),
    count: cards.length,
    dots: dots.length,
    progress: Number(dots[active]?.style.getPropertyValue('--progress') || 0),
    offCenter: cr && tr ? Math.round(Math.abs(cr.left + cr.width / 2 - (tr.left + tr.width / 2))) : null,
    toggle: toggle?.getAttribute('aria-label') ?? null,
    toggleShown: toggle ? win.getComputedStyle(toggle).display !== 'none' : false,
    video: video ? { paused: video.paused, time: Math.round(video.currentTime * 100) / 100 } : null,
    videos: sec.querySelectorAll('video').length,
    introChildren: sec.querySelector('[data-intro-layer]')?.childElementCount ?? null,
    next: next ? { href: next.getAttribute('href'), text: next.textContent.trim(), visible: ns.visibility === 'visible' && Number(ns.opacity) > 0.9 } : null,
    navCurrent: doc.querySelector('nav a[aria-current="location"]')?.getAttribute('href') ?? null,
    regionTop: Math.round(rr.top),
    regionBottom: Math.round(rr.bottom),
  }
}

// Runs in the page: rect of dot i, the play/pause/replay toggle, or the track
function targetRect(id, labels, what, i) {
  const region = globalThis.document.getElementById(id)?.querySelector('[aria-roledescription="carousel"]')
  if (!region) return null
  const buttons = [...region.querySelectorAll('button')]
  let el
  if (what === 'dot') el = buttons.filter((b) => (b.getAttribute('aria-label') ?? '').startsWith(labels.showPrefix))[i]
  else if (what === 'toggle') el = buttons.find((b) => [labels.play, labels.pause, labels.replay].includes(b.getAttribute('aria-label')))
  else el = region.querySelector('ul')
  if (!el) return null
  const r = el.getBoundingClientRect()
  return { x: r.x, y: r.y, width: r.width, height: r.height }
}

// Runs in the page: scrolls the section to where snapping leaves it (its top just under the nav), or the page top
function scrollToSection(id) {
  const win = globalThis
  const doc = win.document
  const probe = doc.createElement('div')
  probe.style.cssText = 'position:absolute;visibility:hidden;height:var(--nav-space)'
  doc.body.append(probe)
  const navSpace = probe.offsetHeight
  probe.remove()
  const top = id ? doc.getElementById(id).getBoundingClientRect().top + win.scrollY - navSpace : 0
  win.scrollTo({ top, behavior: 'instant' })
  return Math.round(win.scrollY)
}

async function run() {
  const opts = readOptions()
  try {
    const res = await fetch(opts.url)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
  } catch (err) {
    console.error(`Cannot reach ${opts.url}: ${err.message}`)
    process.exit(2)
  }
  mkdirSync(opts.out, { recursive: true })
  const results = []
  for (const name of opts.profiles) {
    for (const file of readdirSync(opts.out)) if (FRAME_FILE.test(file) && file.startsWith(`${name}-`)) rmSync(join(opts.out, file))
    try {
      await runProfile(name, PROFILES[name], opts, results)
    } catch (err) {
      record(results, name, '-', 'profile run', false, err.message)
    }
  }
  const failed = results.filter((r) => !r.pass)
  const skipped = results.filter((r) => r.skip)
  console.log(`\n${results.length - skipped.length} checks, ${failed.length} failed, ${skipped.length} skipped · frames in ${relative(ROOT, opts.out) || '.'}`)
  console.log(failed.length ? 'GALLERY FAIL' : 'GALLERY PASS')
  process.exit(failed.length ? 1 : 0)
}

function record(results, profile, app, check, pass, detail = '', skip = false) {
  results.push({ profile, app, check, pass, detail, skip })
  console.log(`[${profile}] ${skip ? 'SKIP' : pass ? 'PASS' : 'FAIL'}  ${app}  ${check}${detail ? `  ${detail}` : ''}`)
}

async function runProfile(name, profile, opts, results) {
  const s = await launch({ port: opts.port, width: profile.width, height: profile.height, dpr: profile.dpr, mobile: profile.mobile })
  try {
    await s.setMedia({ reducedMotion: profile.reduced ? 'reduce' : 'no-preference' })
    await s.navigate(opts.url, { waitUntil: 'load' })
    await s.waitFor('document.fonts.status === "loaded"', 5000).catch(() => {})
    await sleep(400)

    const state = (id) => s.evaluate(readState, id, LABELS)
    // Polls the gallery state until pred holds; returns it, or null on timeout
    const until = async (id, pred, timeout) => {
      const deadline = Date.now() + timeout
      for (;;) {
        const st = await state(id)
        if (pred(st)) return st
        if (Date.now() > deadline) return null
        await sleep(100)
      }
    }
    // A real tap (touch on phones, mouse elsewhere) at the centre of a gallery control
    const tap = async (id, what, i) => {
      const r = await s.evaluate(targetRect, id, LABELS, what, i)
      if (!r) throw new Error(`no ${what}${i ?? ''} in #${id}`)
      const x = r.x + r.width / 2
      const y = r.y + r.height / 2
      if (profile.mobile) {
        await s.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] })
        await s.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
      } else {
        await s.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y })
        await s.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 })
        await s.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 })
      }
    }
    const shot = (app, step) => s.screenshot({ path: join(opts.out, `${name}-${app}-${step}.jpg`), quality: 80 })

    for (const id of opts.ids) {
      const index = apps.findIndex((a) => a.id === id)
      const app = apps[index]
      const count = app.highlights.length
      const check = (label, pass, detail) => record(results, name, id, label, pass, detail)
      const want = expectedNext(index)

      await s.evaluate(scrollToSection, id)
      const first = await until(id, (st) => !st.missing, 3000)
      if (!first) {
        check('gallery present', false, 'no carousel region in the section')
        continue
      }
      check('cards and dots', first.count === count && first.dots === count, `${first.count} cards, ${first.dots} dots, ${count} highlights`)

      if (profile.reduced) {
        await sleep(2500)
        const st = await state(id)
        check('no autoplay', st.state === 'static' && !st.running && st.active === 0 && !st.progress, `state ${st.state}, running ${st.running}, active ${st.active}`)
        check('stills only', st.videos === 0 && !st.introChildren, `${st.videos} videos, intro layer children ${st.introChildren}`)
        check('no play button', !st.toggleShown, `toggle ${st.toggle ?? 'absent'} shown ${st.toggleShown}`)
        await shot(id, 'static')
        await tap(id, 'dot', count - 1)
        const jumped = await until(id, (x) => x.active === count - 1 && x.offCenter !== null && x.offCenter < 4, 1000)
        check('dot jumps instantly', !!jumped, jumped ? `card ${count} centred` : JSON.stringify(await state(id)))
        await sleep(400)
        const end = await state(id)
        check('Next on the last card', !!end.next?.visible && end.next.href === want.href && end.next.text === want.text, JSON.stringify(end.next))
        await shot(id, 'last')
        continue
      }

      // Scroll in: autoplay starts on the first card and its progress moves
      const started = await until(id, (st) => st.state === 'playing' && st.running, 3000)
      check('autoplay starts', !!started, started ? `card ${started.active + 1}` : JSON.stringify(await state(id)))
      const p0 = (await state(id)).progress
      await sleep(700)
      const p1 = (await state(id)).progress
      check('progress runs', p1 > p0, `${p0} → ${p1}`)
      await shot(id, 'playing')

      // Without input the active card advances when the first one ends
      const advanced = await until(id, (st) => st.active === 1, (seconds(app.highlights[0]) + 4) * 1000)
      check('advances without input', !!advanced, advanced ? `card 2 after ~${seconds(app.highlights[0])} s` : JSON.stringify(await state(id)))
      await sleep(900)
      await shot(id, 'advanced')

      // A dot jumps to its card and autoplay carries on from there
      const k = 2
      await tap(id, 'dot', k)
      const jumped = await until(id, (st) => st.active === k && st.current === k, 1500)
      const settled = jumped && (await until(id, (st) => st.offCenter !== null && st.offCenter < 4, 1500))
      check('dot jumps', !!settled && settled.state === 'playing', settled ? `card ${k + 1} centred, ${settled.state}` : JSON.stringify(await state(id)))

      // Arrow keys on desktop, a swipe on phones, move one card on; the swipe is a raw touch drag (headless ignores synthesized touch scrolls)
      if (profile.mobile) {
        const r = await s.evaluate(targetRect, id, LABELS, 'track')
        const y = Math.round(r.y + r.height / 2)
        const x0 = Math.round(r.x + r.width * 0.78)
        await s.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: x0, y }] })
        for (let step = 1; step <= 12; step++) {
          await s.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x0 - step * 18, y }] })
          await sleep(16)
        }
        await s.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
        const swiped = await until(id, (st) => st.active === k + 1 && st.offCenter < 4, 2500)
        check('swipe moves a card', !!swiped, swiped ? `card ${k + 2}` : JSON.stringify(await state(id)))
      } else {
        await s.evaluate((sel) => globalThis.document.querySelector(sel).focus(), `#${id} [aria-roledescription="carousel"] ul`)
        await s.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'ArrowRight', code: 'ArrowRight', windowsVirtualKeyCode: 39 })
        await s.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'ArrowRight', code: 'ArrowRight', windowsVirtualKeyCode: 39 })
        const keyed = await until(id, (st) => st.active === k + 1 && st.offCenter < 4, 2000)
        check('arrow key moves a card', !!keyed, keyed ? `card ${k + 2}` : JSON.stringify(await state(id)))
      }

      // Pause holds the card and its progress; play resumes
      await tap(id, 'toggle')
      const paused = await until(id, (st) => st.state === 'paused' && !st.running && st.toggle === LABELS.play, 1500)
      const held = paused && (await sleep(1500), await state(id))
      check(
        'pause stops',
        !!held && held.active === paused.active && held.progress === paused.progress && (!held.video || held.video.paused),
        held ? `card ${held.active + 1} held at ${held.progress}${held.video ? `, clip paused at ${held.video.time} s` : ''}` : JSON.stringify(await state(id)),
      )
      await shot(id, 'paused')
      await tap(id, 'toggle')
      const resumed = await until(id, (st) => st.state === 'playing' && st.running && st.toggle === LABELS.pause, 1500)
      check('play resumes', !!resumed, resumed ? `card ${resumed.active + 1}` : JSON.stringify(await state(id)))

      // Off screen the clock stops without leaving the playing state; back on screen it resumes where it was
      await sleep(600)
      await s.evaluate(scrollToSection, null)
      const away = await until(id, (st) => !st.running, 1500)
      const awayLater = away && (await sleep(1200), await state(id))
      check(
        'off-screen pauses',
        !!awayLater && awayLater.state === 'playing' && awayLater.progress === away.progress && awayLater.active === away.active,
        awayLater ? `held at ${awayLater.progress} on card ${awayLater.active + 1}` : JSON.stringify(await state(id)),
      )
      await s.evaluate(scrollToSection, id)
      const back = await until(id, (st) => st.running, 2000)
      const backLater = back && (await sleep(700), await state(id))
      check(
        'back on screen resumes',
        !!backLater && backLater.active === awayLater?.active && backLater.progress > awayLater.progress,
        backLater ? `card ${backLater.active + 1}, ${awayLater?.progress} → ${backLater.progress}` : JSON.stringify(await state(id)),
      )

      // The last card ends the gallery: replay button and the Next cue
      await tap(id, 'dot', count - 1)
      const ended = await until(id, (st) => st.state === 'ended', (seconds(app.highlights[count - 1]) + 4) * 1000)
      await sleep(700)
      const end = await state(id)
      check('ends with replay', !!ended && end.toggle === LABELS.replay && !end.running && end.active === count - 1, `state ${end.state}, toggle ${end.toggle}`)
      check('Next cue appears', !!end.next?.visible && end.next.href === want.href && end.next.text === want.text, JSON.stringify(end.next))
      await shot(id, 'end')

      // The page nav (when present) marks this section as current
      if (end.navCurrent === null) record(results, name, id, 'nav marks the section', true, 'no nav link with aria-current yet', true)
      else check('nav marks the section', end.navCurrent === `#${id}`, `aria-current on ${end.navCurrent}`)

      // Replay starts again from the first card
      await tap(id, 'toggle')
      const replay = await until(id, (st) => st.active === 0 && st.state === 'playing', 2000)
      check('replay restarts', !!replay, replay ? 'card 1, playing' : JSON.stringify(await state(id)))
    }

    const messages = s.consoleMessages()
    const errors = messages.filter((m) => m.level === 'error')
    const hydration = messages.filter((m) => HYDRATION.test(m.text))
    record(results, name, '-', 'console errors', errors.length === 0, errors.slice(0, 5).map((m) => `${m.source}: ${m.text.slice(0, 160)}`).join(' | '))
    record(results, name, '-', 'hydration warnings', hydration.length === 0, hydration.slice(0, 3).map((m) => m.text.slice(0, 160)).join(' | '))
  } finally {
    await s.close()
  }
}

if (!existsSync(join(ROOT, 'src/content/apps.js'))) {
  console.error('Run from the repository (src/content/apps.js not found)')
  process.exit(2)
}
await run()
