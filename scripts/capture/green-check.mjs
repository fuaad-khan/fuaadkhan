// Green Check shots (PLAN §3, §7, Appendix B2): 438 S State St with Microbusiness (95 ft automatic fail, verified by hand to Eligible) and an instant Eligible elsewhere
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { sleep } from '../lib/cdp.mjs'
import { centroid, layers, pathD, project, rects } from '../lib/harvest.mjs'
import { createRecorder } from './recorder.mjs'
import { go, openApp, still, until, waitIdle } from './session.mjs'

const SUBJECT = '438 S STATE ST'
const LICENSE = 'microbusiness'
const VERDICT = '#resultPanel .verdict:not(.verdict-pending) .result-status'
const ROW = (id) => `#resultPanel .check[data-check-id="${id}"]`
// Everything Leaflet draws for a result: highlight (markerPane), pin, footprints, measurement and verify layers, feet labels
const OVERLAY_PANES = ['.leaflet-marker-pane', '.leaflet-selection-pane', '.leaflet-siteFootprints-pane', '.leaflet-measure-pane', '.leaflet-userMeasure-pane', '.leaflet-verify-pane', '.leaflet-tooltip-pane']
// The verdict card and its rows (and the tip that belongs to the verdict); hidden in place so Property Details keeps its position
const VERDICT_PARTS = ['#resultPanel .verdict', '#resultPanel .why-title', '#resultPanel .check-list', '#resultPanel .passed-block', '#resultPanel .tip-card']
const HAND_TARGET_FT = 101.2

const openSession = ({ app, config }, { virtualTime = false } = {}) =>
  openApp({ app, root: config.root, port: config.port, cdpPort: config.cdpPort, width: config.viewport[0], height: config.viewport[1], dpr: config.dpr, seed: config.seed, reducedMotion: !virtualTime, virtualTime })

// Real mouse click at viewport px
async function clickPx(ctx, [x, y]) {
  for (const type of ['mouseMoved', 'mousePressed', 'mouseReleased']) {
    await ctx.page.send('Input.dispatchMouseEvent', { type, x, y, button: type === 'mouseMoved' ? 'none' : 'left', buttons: type === 'mousePressed' ? 1 : 0, clickCount: 1 })
  }
}

// Centre of the first element matching a selector, or of a row action button by its label
async function centre(ctx, selector, label) {
  const r = await ctx.page.evaluate(`(() => {
    const els = [...document.querySelectorAll(${JSON.stringify(selector)})]
    const el = ${JSON.stringify(label ?? null)} === null ? els[0] : els.find((e) => e.textContent.trim() === ${JSON.stringify(label)})
    return el && el.getClientRects().length ? window.__wp6.rect(el) : null
  })()`)
  if (!r) throw new Error(`green-check: ${label ?? selector} is not on screen`)
  return [r[0] + r[2] / 2, r[1] + r[3] / 2]
}

// The license type picked the way a person does: open the combobox, click the option
async function selectType(ctx, id, wait = (ms) => sleep(ms)) {
  await ctx.page.evaluate(`(() => { const box = document.getElementById('licenseType'); if (box.getAttribute('aria-expanded') !== 'true') box.click() })()`)
  await wait(400)
  const ok = await ctx.page.evaluate(`(() => { const o = document.querySelector('#licenseTypeList [data-value=${JSON.stringify(id)}]'); if (o) o.click(); return !!o })()`)
  if (!ok) throw new Error(`green-check: no license type ${id}`)
  await wait(600)
}

// Types the search through React's value setter and runs it (the app's own test harness does the same)
async function search(ctx, text, wait = (ms) => sleep(ms)) {
  await ctx.page.evaluate(`(() => {
    const input = document.getElementById('searchInput')
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, ${JSON.stringify(text)})
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })()`)
  await wait(1200)
  await ctx.page.evaluate("document.getElementById('searchButton').click()")
}

// Row state as the card shows it
const rowState = (ctx, id) =>
  ctx.page.evaluate(`(() => {
    const li = document.querySelector(${JSON.stringify(ROW(id))})
    if (!li) return null
    return {
      status: (li.className.match(/check-(pass|fail|unknown|info)/) || [])[1] || '',
      verifying: li.classList.contains('check-verifying'),
      feet: parseInt((li.querySelector('.check-feet')?.textContent || '').replace(/[^0-9]/g, ''), 10),
      stamped: !!li.querySelector('.check-verified'),
      buttons: [...li.querySelectorAll('.check-actions button')].map((b) => b.textContent.trim()),
    }
  })()`)

const verdict = (ctx) => ctx.page.evaluate(`(document.querySelector(${JSON.stringify(VERDICT)})?.textContent || '').trim()`)

// The automatic result: Not Eligible on the residence rule alone, the measurement and its exclusion zone drawn
async function automatic(ctx) {
  await go(ctx, '/GreenCheck.html')
  await until(ctx, 'document.getElementById("searchInput") && window.__wp6.theMap()', { label: 'app ready', timeout: 60000 })
  await selectType(ctx, LICENSE)
  await search(ctx, SUBJECT)
  await until(ctx, `document.querySelector(${JSON.stringify(VERDICT)})`, { label: 'verdict', timeout: 90000 })
  await until(ctx, 'document.querySelector("#map .gc-measure-zone")', { label: 'exclusion zone', timeout: 60000 })
  await waitIdle(ctx, { label: 'green-check automatic' })
  const v = await verdict(ctx)
  const row = await rowState(ctx, 'residential')
  const passed = await ctx.page.evaluate('document.querySelectorAll("#resultPanel .check.check-pass").length')
  if (v !== 'Not Eligible' || row?.status !== 'fail' || !row.buttons.includes('Verify distance')) throw new Error(`green-check: expected Not Eligible on the residence rule, got ${v} / ${JSON.stringify(row)}`)
  const all = await layers(ctx.page)
  const line = all.find((l) => l.pane === 'measure' && l.className.includes('gc-measure-line'))
  if (!line) throw new Error('green-check: no automatic measurement line')
  return { verdict: v, feet: row.feet, passed, line: line.rings[0] }
}

// Great-circle feet between two [lat, lng] points, as the app measures them (turf.distance: haversine, R = 6,371,008.8 m)
function feetBetween([lat1, lng1], [lat2, lng2]) {
  const rad = Math.PI / 180
  const h = Math.sin(((lat2 - lat1) * rad) / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(((lng2 - lng1) * rad) / 2) ** 2
  return 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h)) * 6371008.8 * 3.28084
}

// Verify distance: the far endpoint (residence side) moves straight away from the building until the line measures HAND_TARGET_FT
async function dragTarget(ctx) {
  const handles = (await layers(ctx.page)).filter((l) => l.pane === 'verify' && l.type === 'marker')
  if (handles.length !== 2) throw new Error(`green-check: ${handles.length} verify handles`)
  const [la, lb] = handles.map((h) => h.latlng)
  const [a, b] = await project(ctx.page, [la, lb])
  const feet = feetBetween(la, lb)
  const k = HAND_TARGET_FT / feet
  return { a, b, to: [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k], feet }
}

// The verified state: the hand-measured line, Measured by hand, Eligible
async function verified(ctx) {
  await clickPx(ctx, await centre(ctx, `${ROW('residential')} .check-actions button`, 'Verify distance'))
  await until(ctx, 'document.querySelectorAll("#map .gc-handle").length === 2', { label: 'handles', timeout: 30000 })
  await until(ctx, 'document.getElementById("map").dataset.parcelColor === "#ffffff"', { label: 'Nearmap basemap', timeout: 30000 })
  await waitIdle(ctx, { label: 'green-check verify' })
  const drag = await dragTarget(ctx)
  const steps = 12
  await ctx.page.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: drag.b[0], y: drag.b[1], button: 'none', buttons: 0 })
  await ctx.page.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: drag.b[0], y: drag.b[1], button: 'left', buttons: 1, clickCount: 1 })
  for (let i = 1; i <= steps; i++) {
    const x = drag.b[0] + ((drag.to[0] - drag.b[0]) * i) / steps
    const y = drag.b[1] + ((drag.to[1] - drag.b[1]) * i) / steps
    await ctx.page.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, button: 'left', buttons: 1 })
    await sleep(30)
  }
  await ctx.page.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: drag.to[0], y: drag.to[1], button: 'left', buttons: 0, clickCount: 1 })
  await sleep(500)
  const during = await rowState(ctx, 'residential')
  if (!(during.feet >= 100)) throw new Error(`green-check: the dragged line reads ${during.feet} ft, expected at least 100`)
  await clickPx(ctx, await centre(ctx, `${ROW('residential')} .check-actions button`, 'Complete'))
  await until(ctx, `document.querySelector(${JSON.stringify(ROW('residential'))} + ' .check-verified')`, { label: 'Measured by hand', timeout: 30000 })
  await waitIdle(ctx, { label: 'green-check verified' })
  const v = await verdict(ctx)
  const row = await rowState(ctx, 'residential')
  // PLAN §3: the flip to Eligible after verification is asserted, never assumed
  if (v !== 'Eligible' || row.status !== 'pass' || !row.stamped) throw new Error(`green-check: expected Eligible with the residence row measured by hand, got ${v} / ${JSON.stringify(row)}`)
  return { verdict: v, feet: row.feet }
}

// Projected overlays for MeasuredLine in the hero view (CONTRACTS §9 green-check hero.intro)
async function harvest(ctx, autoLine, values) {
  const all = await layers(ctx.page)
  const one = (pred, what) => {
    const found = all.filter(pred)
    if (!found.length) throw new Error(`green-check: harvest found no ${what}`)
    return found[0]
  }
  // Leaflet polygons never repeat their first vertex, so a ring projects as is
  const ringOf = async (layer) => {
    const pts = await project(ctx.page, layer.rings[0])
    return { d: pathD(pts), pts }
  }
  const parcel = await ringOf(one((l) => l.pane === 'markerPane' && l.type === 'polygon', 'subject parcel'))
  const footprint = await ringOf(one((l) => l.pane === 'siteFootprints' && l.type === 'polygon', 'footprint'))
  const zoneLayer = one((l) => l.pane === 'measure' && l.className.includes('gc-measure-zone'), 'exclusion zone')
  const neighbour = await ringOf(one((l) => l.pane === 'measure' && l.type === 'polygon' && !l.className.includes('gc-measure-zone'), 'neighbouring lot'))
  const handLine = one((l) => l.pane === 'measure' && l.type === 'polyline' && !l.className.includes('gc-measure-zone'), 'hand-measured line')
  const zone = await ringOf(zoneLayer)
  const [cx, cy] = centroid(zone.pts)
  const r = zone.pts.reduce((s, [x, y]) => s + Math.hypot(x - cx, y - cy), 0) / zone.pts.length
  const pinLayer = all.find((l) => l.pane === 'selection' && l.type === 'marker')
  const [autoA, autoB] = await project(ctx.page, autoLine)
  const [handA, handB] = await project(ctx.page, handLine.rings[0])
  const ui = await rects(ctx.page, {
    map: '#map',
    header: 'header',
    nav: 'nav',
    search: '#searchInput',
    license: '#licenseType',
    panel: '#resultPanel',
    banner: '#resultHeader',
    verdict: '#resultPanel .verdict',
    why: '#resultPanel .why-title',
    rows: '#resultPanel .check-list',
    details: '#resultPanel .details-card',
    legend: '.map-legend',
  })
  ui.rowRects = await ctx.page.evaluate('[...document.querySelectorAll("#resultPanel .check-list > .check")].map((li) => [li.dataset.checkId, window.__wp6.rect(li)])')
  return {
    parcel: { d: parcel.d },
    footprint: { d: footprint.d },
    neighbour: { d: neighbour.d },
    ring: { cx, cy, r: Math.round(r * 10) / 10, d: zone.d },
    ...(pinLayer ? { pin: await project(ctx.page, pinLayer.latlng) } : {}),
    auto: { a: autoA, b: autoB },
    hand: { a: handA, b: handB },
    values,
    ui,
  }
}

// f2 (automatic verdict), hero (verified, aerial) and base (hero view without overlays or verdict rows)
async function verifyStills(ctx, names) {
  const auto = await automatic(ctx)
  const common = { basemap: 'maptiler streets', search: SUBJECT, license: LICENSE }
  if (names.has('f2')) await still(ctx, 'f2', { extra: { ...common, verdict: auto.verdict, feet: auto.feet, passed: auto.passed, state: 'automatic verdict: Not Eligible, the 95 ft line, exclusion zone and Why? rows' } })
  if (!names.has('hero') && !names.has('base')) return null
  const hand = await verified(ctx)
  const values = { auto: auto.feet, hand: hand.feet }
  const intro = await harvest(ctx, auto.line, values)
  const heroExtra = { basemap: 'nearmap', search: SUBJECT, license: LICENSE, verdict: hand.verdict, values }
  if (names.has('hero')) await still(ctx, 'hero', { extra: { ...heroExtra, state: 'Verify distance: the far endpoint dragged to the property line, Complete: Measured by hand, Eligible', intro } })
  if (names.has('base')) {
    await ctx.page.evaluate(`window.__wp6.hide(${JSON.stringify([...OVERLAY_PANES, ...VERDICT_PARTS])})`)
    await waitIdle(ctx, { quiet: 800, label: 'green-check base' })
    await still(ctx, 'base', { extra: { ...heroExtra, state: 'the hero view with the result overlays and the verdict card, rows and tip hidden', hidden: [...OVERLAY_PANES, ...VERDICT_PARTS] } })
    await ctx.page.evaluate('window.__wp6.unhide()')
  }
  return values
}

// The City's parcels and zoning services, read from the app's own config at run time (the internal host never lands in this repo)
function cityServices() {
  const root = process.env.GC_SRC || 'C:\\dev\\GreenCheck'
  const src = readFileSync(join(root, 'src', 'config.js'), 'utf8')
  const pick = (key) => {
    const m = new RegExp(`\\b${key}:\\s*'([^']+)'`).exec(src)
    if (!m) throw new Error(`green-check: services.${key} not found in the app config`)
    return m[1]
  }
  return { parcels: pick('parcels'), zoning: pick('zoning') }
}

// Industrial-use parcels in IL/BP zoning, largest first: candidates for an instant Eligible (residential uses never qualify)
async function candidates(limit = 30) {
  const svc = cityServices()
  const q = async (url, params) => {
    const res = await fetch(`${url}/query?${new URLSearchParams({ f: 'json', ...params })}`, { signal: AbortSignal.timeout(30000) })
    if (!res.ok) throw new Error(`green-check: City GIS query failed (${res.status})`)
    return res.json()
  }
  const parcels = await q(svc.parcels, { where: "USETYPE LIKE '3%'", outFields: 'APN,USETYPE', returnGeometry: 'true', outSR: '4326', resultRecordCount: '400' })
  const list = []
  for (const f of parcels.features ?? []) {
    const ring = f.geometry?.rings?.[0]
    if (!ring || !f.attributes?.APN) continue
    let area = 0
    for (let i = 0; i < ring.length - 1; i++) area += ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1]
    const cx = ring.reduce((s, p) => s + p[0], 0) / ring.length
    const cy = ring.reduce((s, p) => s + p[1], 0) / ring.length
    list.push({ apn: String(f.attributes.APN), use: String(f.attributes.USETYPE), area: Math.abs(area / 2), at: [cx, cy] })
  }
  list.sort((a, b) => b.area - a.area)
  const out = []
  for (const c of list) {
    const z = await q(svc.zoning, { geometry: `${c.at[0]},${c.at[1]}`, geometryType: 'esriGeometryPoint', inSR: '4326', spatialRel: 'esriSpatialRelIntersects', outFields: 'Zon2022', returnGeometry: 'false' })
    const zone = z.features?.[0]?.attributes?.Zon2022
    if (zone === 'IL' || zone === 'BP') out.push({ ...c, zone })
    if (out.length >= limit) break
  }
  return out
}

// f1: the first industrial candidate whose verdict is Eligible for Manufacturing, else the best Needs More Data (the copy then stays honest)
async function instant(ctx, shot) {
  const list = await candidates()
  console.log(`  f1: ${list.length} IL/BP industrial candidates`)
  let fallback = null
  for (const c of list) {
    await go(ctx, '/GreenCheck.html')
    await until(ctx, 'document.getElementById("searchInput") && window.__wp6.theMap()', { label: 'app ready', timeout: 60000 })
    await selectType(ctx, shot.license)
    await search(ctx, c.apn)
    await sleep(1500)
    // A parcel with several buildings asks which one houses the business: take the first, as the app's tests do
    if (await ctx.page.evaluate('document.querySelectorAll("#resultPanel .building-choice").length')) {
      await ctx.page.evaluate('document.querySelector("#resultPanel .building-choice").click()')
    }
    try {
      await until(ctx, `document.querySelector(${JSON.stringify(VERDICT)})`, { label: 'verdict', timeout: 60000 })
    } catch {
      continue
    }
    await waitIdle(ctx, { label: `f1 ${c.apn}` })
    const v = await verdict(ctx)
    const use = await ctx.page.evaluate('(document.querySelector("#resultPanel .details-card")?.textContent || "")')
    console.log(`  f1 candidate ${c.apn} (${c.zone}, use ${c.use}): ${v}`)
    if (/Residential|Single-family|Condominium|Apartments|Mobile home/i.test(use)) continue
    if (v === 'Eligible') {
      return still(ctx, 'f1', { extra: { basemap: 'maptiler streets', apn: c.apn, zone: c.zone, useType: c.use, license: shot.license, verdict: v, tried: list.indexOf(c) + 1, state: 'instant verdict: Eligible for Manufacturing at an industrial-use parcel zoned IL/BP' } })
    }
    if (v === 'Needs More Data' && !fallback) fallback = c
  }
  if (!fallback) throw new Error('green-check: no candidate reached Eligible or Needs More Data')
  throw new Error(`green-check: no Eligible candidate; ${fallback.apn} gives Needs More Data (capture it deliberately and keep the copy honest)`)
}

// f3 loop: from the automatic verdict, Verify distance, drag the far endpoint 95 → 101 ft, Complete, Measured by hand, Eligible
async function f3(ctx) {
  const rec = createRecorder(ctx, { name: 'f3' })
  const wait = (ms) => rec.settle({ min: Math.max(1, Math.round(ms / (1000 / 30))), max: Math.round(ms / (1000 / 30)) + 1 })
  await go(ctx, '/GreenCheck.html')
  await rec.settle({ min: 60, max: 3000, quiet: 30 })
  await rec.waitFor('document.getElementById("searchInput") && window.__wp6.theMap()', { max: 60, label: 'app ready' })
  await selectType(ctx, LICENSE, wait)
  await search(ctx, SUBJECT, wait)
  await rec.waitFor(`document.querySelector(${JSON.stringify(VERDICT)}) && document.querySelector("#map .gc-measure-zone")`, { max: 90, label: 'automatic verdict' })
  await rec.settle({ min: 60, max: 3000, quiet: 30 })
  await ctx.page.evaluate('document.activeElement && document.activeElement.blur()')
  // On the virtual clock a whole screen of tiles lands in one step; Leaflet's 200 ms fade would flash the dark backdrop, so tiles swap in opaque
  await ctx.page.evaluate('window.__wp6.theMap()._fadeAnimated = false')
  // Recording starts on the automatic verdict
  const verify = await centre(ctx, `${ROW('residential')} .check-actions button`, 'Verify distance')
  const rest = [verify[0] - 40, verify[1] + 120]
  await rec.place(...rest)
  await rec.live(0.3)
  await rec.clickAt(verify[0], verify[1], 0.55)
  await rec.until('document.querySelectorAll("#map .gc-handle").length === 2 && document.getElementById("map").dataset.parcelColor === "#ffffff"', { label: 'verify started' })
  await rec.live(0.6)
  const drag = await dragTarget(ctx)
  await rec.moveTo(drag.b[0], drag.b[1], 0.5)
  await rec.press()
  await rec.tick(3)
  await rec.moveTo(drag.to[0], drag.to[1], 0.85)
  await rec.release()
  await rec.live(0.15)
  const during = await rowState(ctx, 'residential')
  if (!(during.feet >= 100)) throw new Error(`green-check/f3: the dragged line reads ${during.feet} ft`)
  const complete = await centre(ctx, `${ROW('residential')} .check-actions button`, 'Complete')
  await rec.moveTo(complete[0] - 70, complete[1] + 26, 0.45)
  rec.mark('poster')
  await rec.live(0.3)
  await rec.clickAt(complete[0], complete[1], 0.35)
  await rec.until(`document.querySelector(${JSON.stringify(ROW('residential'))} + ' .check-verified')`, { label: 'Measured by hand' })
  await rec.live(0.5)
  const v = await verdict(ctx)
  if (v !== 'Eligible') throw new Error(`green-check/f3: verdict ${v} after Complete`)
  await rec.moveTo(...rest, 0.5)
  await rec.live(0.8)
  const hand = (await rowState(ctx, 'residential')).feet
  return rec.finish({ basemap: 'maptiler streets, then nearmap after Verify distance', search: SUBJECT, license: LICENSE, values: { auto: Math.round(drag.feet), hand }, state: 'Verify distance, the far endpoint dragged to the property line, Complete: Measured by hand, Eligible' })
}

export async function capture({ app, config, shots }) {
  const names = new Set(shots.map((s) => s.name))
  if (['f2', 'hero', 'base', 'f1'].some((n) => names.has(n))) {
    const ctx = await openSession({ app, config })
    try {
      if (['f2', 'hero', 'base'].some((n) => names.has(n))) {
        const values = await verifyStills(ctx, names)
        if (values) console.log(`  measured: automatic ${values.auto} ft, by hand ${values.hand} ft`)
      }
      if (names.has('f1')) await instant(ctx, shots.find((s) => s.name === 'f1'))
    } finally {
      await ctx.close()
    }
  }
  if (names.has('f3')) {
    const ctx = await openSession({ app, config }, { virtualTime: true })
    try {
      await f3(ctx)
    } finally {
      await ctx.close()
    }
  }
}
