// Green Check shots (PLAN §3, §7, Appendix B2; PLAN-v2 Media): 438 S State St with Microbusiness (95 ft automatic fail, verified by hand to Eligible), a typo-tolerant lookup at an industrial parcel, the building chooser at a commercial one, and the Guidelines and About tour
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { sleep } from '../lib/cdp.mjs'
import { centroid, layers, pathD, project, rects } from '../lib/harvest.mjs'
import { SCRUBS } from '../lib/privacy.mjs'
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
// Every v2 loop also runs the suggestion scrub (scripts/capture/page/privacy.js)
const LOOP_SCRUBS = [...SCRUBS['green-check'], 'search suggestions other than the subject parcel blurred']
// Allows only the subject's own row in the search suggestions
const allowApns = (ctx, apns) => ctx.page.evaluate(`window.__wp6AllowApns = ${JSON.stringify(apns)}; true`)

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


// hero (verified, aerial) and base (hero view without overlays or verdict rows)
async function verifyStills(ctx, names) {
  const auto = await automatic(ctx)
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

// Parcels matching a use-type clause inside the given 2022 zones, largest first
async function candidates({ where, zones, limit = 30 }) {
  const svc = cityServices()
  const q = async (url, params) => {
    const res = await fetch(`${url}/query?${new URLSearchParams({ f: 'json', ...params })}`, { signal: AbortSignal.timeout(30000) })
    if (!res.ok) throw new Error(`green-check: City GIS query failed (${res.status})`)
    return res.json()
  }
  const parcels = await q(svc.parcels, { where, outFields: 'APN,USETYPE', returnGeometry: 'true', outSR: '4326', resultRecordCount: '600' })
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
    if (zones.includes(zone)) out.push({ ...c, zone })
    if (out.length >= limit) break
  }
  return out
}

// The Property Details card as label -> text (the first line of each value)
const details = (ctx) =>
  ctx.page.evaluate(`(() => {
    const out = {}
    for (const row of document.querySelectorAll('#resultPanel .details-card .details-row')) {
      const label = row.querySelector('.details-label')
      const value = row.querySelector('.details-value')
      if (label && value) out[label.textContent.trim()] = (value.firstChild ? value.firstChild.textContent : value.textContent).replace(/\\s+/g, ' ').trim()
    }
    return out
  })()`)

// Residential use types (100-199 and their labels) never qualify as a subject
const RESIDENTIAL_USE = /\b1\d\d\b|Residential|Single-family|Condominium|Apartments|Mobile home|2-4 units/i

// Building rows of the chooser: list index, key, the sq ft its label prints, and its rect
const chooserRows = (ctx) =>
  ctx.page.evaluate(`[...document.querySelectorAll('#resultPanel .building-choice')].map((b, i) => ({
    i,
    key: b.dataset.buildingId,
    sqft: Number(((b.textContent.match(/([\\d,]+) sq ft/) || [])[1] || '0').replace(/,/g, '')),
    hover: b.classList.contains('building-hover'),
    rect: window.__wp6.rect(b),
  }))`)

// Each footprint outline on the map, projected: centre and px box (Overture areas rank them like the list's sq ft)
async function footprints(ctx) {
  const polys = (await layers(ctx.page)).filter((l) => l.pane === 'siteFootprints' && l.type === 'polygon')
  const out = []
  for (const p of polys) {
    const pts = await project(ctx.page, p.rings[0])
    const xs = pts.map((q) => q[0])
    const ys = pts.map((q) => q[1])
    out.push({ centre: centroid(pts), box: [Math.min(...xs), Math.min(...ys), Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)] })
  }
  return out.sort((a, b) => b.box[2] * b.box[3] - a.box[2] * a.box[3])
}

// Chooser subject (real time, before recording): the preferred APNs first, then commercial-use parcels in commercial zones, largest first; asserts the chooser, a non-residential use, legible footprints and a verdict
async function pickChooser(ctx, shot) {
  const [minB, maxB] = shot.buildings
  const zones = ['CG', 'CN', 'CR', 'OP', 'MU', 'MU-E', 'DV']
  const tried = []
  const check = async (apn) => {
    await go(ctx, '/GreenCheck.html')
    await until(ctx, 'document.getElementById("searchInput") && window.__wp6.theMap()', { label: 'app ready', timeout: 60000 })
    await selectType(ctx, shot.license)
    await search(ctx, apn)
    try {
      await until(ctx, `document.querySelectorAll('#resultPanel .building-choice').length || document.querySelector(${JSON.stringify(VERDICT)})`, { label: `chooser ${apn}`, timeout: 30000 })
    } catch {
      return 'no result'
    }
    await waitIdle(ctx, { label: `chooser ${apn}` })
    const rows = await chooserRows(ctx)
    if (rows.length < minB || rows.length > maxB) return `${rows.length} buildings`
    const d = await details(ctx)
    if (!d['Use type'] || RESIDENTIAL_USE.test(d['Use type'])) return `use ${d['Use type'] || 'unknown'}`
    if (!zones.includes(String(d.Zoning).split(' ')[0])) return `zone ${d.Zoning}`
    const map = await ctx.page.evaluate('window.__wp6.rect("#map")')
    const fps = await footprints(ctx)
    const inside = fps.every(({ box: [x, y, w, h] }) => x >= map[0] && y >= map[1] && x + w <= map[0] + map[2] && y + h <= map[1] + map[3])
    if (fps.length !== rows.length || !inside || Math.min(fps[0].box[2], fps[0].box[3]) < 40) return 'footprints not legible'
    const largest = rows.reduce((a, b) => (b.sqft > a.sqft ? b : a))
    await clickPx(ctx, [fps[0].centre[0], fps[0].centre[1] + fps[0].box[3] * 0.28])
    try {
      await until(ctx, `document.querySelector(${JSON.stringify(VERDICT)})`, { label: 'verdict', timeout: 30000 })
    } catch {
      return 'no verdict'
    }
    const v = await verdict(ctx)
    if (v !== 'Eligible') return v
    return { apn, address: d.Address, zone: d.Zoning, useType: d['Use type'], buildings: rows.length, chosen: largest.i + 1, chosenSqFt: largest.sqft, verdict: v }
  }
  for (const apn of shot.prefer ?? []) {
    const r = await check(apn)
    if (typeof r === 'object') return { ...r, tried: [...tried, apn] }
    tried.push(`${apn}: ${r}`)
  }
  for (const c of await candidates({ where: "USETYPE LIKE '2%'", zones, limit: 30 })) {
    const r = await check(c.apn)
    if (typeof r === 'object') return { ...r, tried: [...tried, c.apn] }
    tried.push(`${c.apn}: ${r}`)
  }
  throw new Error(`green-check/chooser: no candidate qualified (${tried.join('; ')})`)
}

// Waits on the virtual clock for about ms of video time (the network settles inside each step)
const vwait = (rec) => (ms) => rec.settle({ min: Math.max(1, Math.round(ms / (1000 / 30))), max: Math.round(ms / (1000 / 30)) + 1 })

// A virtual-clock session on the bare app, settled, with tiles swapping in opaque (a whole screen lands in one step; Leaflet's fade would flash the backdrop)
async function loopApp(ctx, rec) {
  await go(ctx, '/GreenCheck.html')
  await rec.settle({ min: 60, max: 3000, quiet: 30 })
  await rec.waitFor('document.getElementById("searchInput") && window.__wp6.theMap()', { max: 60, label: 'app ready' })
  await ctx.page.evaluate('window.__wp6.theMap()._fadeAnimated = false')
  await rec.settle({ min: 30 })
}

// Verify loop (played once from its first frame): from the automatic verdict, Verify distance, drag the far endpoint 95 -> 101 ft, Complete, Measured by hand, Eligible
async function verify(ctx, shot) {
  const rec = createRecorder(ctx, { name: 'verify' })
  await loopApp(ctx, rec)
  await selectType(ctx, LICENSE, vwait(rec))
  await search(ctx, SUBJECT, vwait(rec))
  await rec.waitFor(`document.querySelector(${JSON.stringify(VERDICT)}) && document.querySelector("#map .gc-measure-zone")`, { max: 90, label: 'automatic verdict' })
  await rec.settle({ min: 60, max: 3000, quiet: 30 })
  await ctx.page.evaluate('document.activeElement && document.activeElement.blur()')
  await rec.settle({ min: 10 })
  const auto = await rowState(ctx, 'residential')
  const verifyBtn = await centre(ctx, `${ROW('residential')} .check-actions button`, 'Verify distance')
  const rest = [verifyBtn[0] - 40, verifyBtn[1] + 120]
  await rec.place(...rest)
  rec.mark('poster')
  await rec.live(0.7)
  await rec.clickAt(verifyBtn[0], verifyBtn[1], 0.55)
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
  if (!(during.feet >= 100)) throw new Error(`green-check/verify: the dragged line reads ${during.feet} ft`)
  const complete = await centre(ctx, `${ROW('residential')} .check-actions button`, 'Complete')
  await rec.moveTo(complete[0] - 70, complete[1] + 26, 0.45)
  await rec.live(0.3)
  await rec.clickAt(complete[0], complete[1], 0.35)
  await rec.until(`document.querySelector(${JSON.stringify(ROW('residential'))} + ' .check-verified')`, { label: 'Measured by hand' })
  await rec.live(0.5)
  const v = await verdict(ctx)
  if (v !== 'Eligible') throw new Error(`green-check/verify: verdict ${v} after Complete`)
  await rec.moveTo(...rest, 0.5)
  await rec.live(1.1)
  const hand = (await rowState(ctx, 'residential')).feet
  return rec.finish({ basemap: 'maptiler streets, then nearmap after Verify distance', search: SUBJECT, license: LICENSE, values: { auto: auto.feet, hand }, state: shot.state, scrubs: LOOP_SCRUBS })
}

// Lookup loop (played once): pick the license type, type a misspelled address, take the corrected suggestion, the instant verdict at a one-building industrial parcel
async function lookupLoop(ctx, shot) {
  const rec = createRecorder(ctx, { name: 'lookup' })
  await loopApp(ctx, rec)
  await ctx.page.evaluate('document.activeElement && document.activeElement.blur()')
  await rec.settle({ min: 10 })
  await allowApns(ctx, [shot.apn])
  const box = await centre(ctx, '#licenseType')
  const input = await centre(ctx, '#searchInput')
  // At rest in the sidebar's empty lower half, never over a parcel (the map outlines whatever it hovers)
  const rest = [125, 640]
  await rec.place(...rest)
  rec.mark('poster')
  await rec.live(0.55)
  await rec.clickAt(box[0] - 30, box[1], 0.6)
  await rec.until('document.getElementById("licenseType").getAttribute("aria-expanded") === "true"', { label: 'license list' })
  await rec.live(0.3)
  const option = await centre(ctx, `#licenseTypeList [data-value="${shot.license}"]`)
  await rec.clickAt(option[0] - 60, option[1], 0.5)
  await rec.until(`document.querySelector('#licenseTypeList [data-value="${shot.license}"]') === null || document.getElementById("licenseType").getAttribute("aria-expanded") !== "true"`, { label: 'license picked' })
  await rec.live(0.3)
  await rec.clickAt(input[0] - 200, input[1], 0.6)
  await rec.live(0.25)
  await rec.type(shot.type, 10)
  await rec.until('document.querySelectorAll("#searchSuggestions li").length > 0', { label: 'suggestions', max: 8 })
  const suggestion = await ctx.page.evaluate('document.querySelector("#searchSuggestions li").textContent.trim()')
  if (!suggestion.includes(`(${shot.apn})`)) throw new Error(`green-check/lookup: first suggestion is ${suggestion}, expected APN ${shot.apn}`)
  await rec.live(0.5)
  const li = await ctx.page.evaluate('window.__wp6.rect("#searchSuggestions li")')
  await rec.clickAt(li[0] + 150, li[1] + li[3] / 2, 0.5)
  await rec.until(`document.querySelector(${JSON.stringify(VERDICT)}) || document.querySelectorAll('#resultPanel .building-choice').length`, { label: 'verdict', max: 20 })
  if (await ctx.page.evaluate('document.querySelectorAll("#resultPanel .building-choice").length')) throw new Error('green-check/lookup: the parcel has several buildings (the chooser opened)')
  const v = await verdict(ctx)
  if (v !== 'Eligible') throw new Error(`green-check/lookup: verdict ${v}`)
  await rec.live(0.5)
  await rec.moveTo(...rest, 0.7)
  await rec.live(1.4)
  const d = await details(ctx)
  if (RESIDENTIAL_USE.test(d['Use type'] || '')) throw new Error(`green-check/lookup: use type ${d['Use type']}`)
  const typed = await ctx.page.evaluate('document.getElementById("searchInput").value')
  return rec.finish({ basemap: 'maptiler streets', license: shot.license, typed: shot.type, suggestion, shown: typed, apn: shot.apn, zone: d.Zoning, useType: d['Use type'], buildings: d.Buildings, verdict: v, state: shot.state, scrubs: LOOP_SCRUBS })
}

// Chooser loop (played once): the chooser after the search, hover two other rows (list -> map), hover the largest building on the map (map -> list), click it, the verdict
async function chooserLoop(ctx, shot, pick) {
  const rec = createRecorder(ctx, { name: 'chooser' })
  await loopApp(ctx, rec)
  await allowApns(ctx, [pick.apn])
  await selectType(ctx, shot.license, vwait(rec))
  await search(ctx, pick.apn, vwait(rec))
  await rec.waitFor(`document.querySelectorAll('#resultPanel .building-choice').length === ${pick.buildings}`, { max: 60, label: 'chooser' })
  await rec.settle({ min: 60, max: 3000, quiet: 30 })
  await ctx.page.evaluate('document.activeElement && document.activeElement.blur()')
  await rec.settle({ min: 10 })
  const rows = await chooserRows(ctx)
  const fps = await footprints(ctx)
  const chosen = rows.find((r) => r.i === pick.chosen - 1)
  const others = rows.filter((r) => r !== chosen).slice(0, 2)
  // At rest in the chooser card's empty top-right corner, never over a parcel or over text
  const card = await ctx.page.evaluate('window.__wp6.rect("#resultPanel .chooser-card")')
  const rest = [card[0] + card[2] - 26, card[1] + 20]
  await rec.place(...rest)
  rec.mark('poster')
  await rec.live(0.6)
  for (const r of others) {
    const [x, y, w, h] = r.rect
    await rec.moveTo(x + w * 0.42, y + h / 2, 0.55)
    await rec.live(0.65)
    if (!(await chooserRows(ctx)).find((q) => q.i === r.i).hover) throw new Error(`green-check/chooser: row ${r.i + 1} did not take the hover`)
  }
  // Below the footprint's centre, clear of the parcel's pin
  await rec.moveTo(fps[0].centre[0], fps[0].centre[1] + fps[0].box[3] * 0.28, 0.85)
  await rec.live(0.75)
  const synced = (await chooserRows(ctx)).find((q) => q.hover)
  if (!synced || synced.i !== chosen.i) throw new Error(`green-check/chooser: hovering the largest footprint highlighted row ${synced ? synced.i + 1 : 'none'}, expected ${chosen.i + 1}`)
  await rec.click()
  await rec.until(`document.querySelector(${JSON.stringify(VERDICT)})`, { label: 'verdict', max: 15 })
  const v = await verdict(ctx)
  if (v !== pick.verdict) throw new Error(`green-check/chooser: verdict ${v}, expected ${pick.verdict}`)
  await rec.live(0.5)
  await rec.moveTo(...rest, 0.6)
  await rec.live(1.3)
  return rec.finish({ basemap: 'maptiler streets', license: shot.license, ...pick, state: shot.state, scrubs: LOOP_SCRUBS })
}

// Guidelines loop (played once): Guidelines from the nav, two license types (the rules follow, and the tab moves to Alcohol on its own), then About, scrolled to the municipal code link, which the cursor rests on without clicking
async function guidelinesLoop(ctx, shot) {
  const rec = createRecorder(ctx, { name: 'guidelines' })
  await loopApp(ctx, rec)
  await ctx.page.evaluate('document.activeElement && document.activeElement.blur()')
  await rec.settle({ min: 10 })
  const nav = (id) => centre(ctx, `button.nav-item[data-nav="${id}"]`)
  const lead = () => ctx.page.evaluate('(document.querySelector("#guidelinesPanel .panel-lead strong")?.textContent || "").trim()')
  const tab = () => ctx.page.evaluate('(document.querySelector("#guidelinesPanel .panel-tab.active")?.dataset.tab || "")')
  // At rest in the sidebar's empty lower half, never over the map (its pins show business tooltips on hover)
  const rest = [125, 640]
  await rec.place(...rest)
  rec.mark('poster')
  await rec.live(0.35)
  const guide = await nav('guidelines')
  await rec.clickAt(guide[0] - 40, guide[1], 0.5)
  await rec.until('document.getElementById("guidelinesPanel")', { label: 'guidelines panel' })
  await rec.live(0.85)
  const shown = [await lead()]
  for (const type of shot.types) {
    const box = await centre(ctx, '#licenseType')
    await rec.clickAt(box[0] - 30, box[1], 0.45)
    await rec.until('document.getElementById("licenseType").getAttribute("aria-expanded") === "true"', { label: 'license list' })
    await rec.live(0.25)
    const option = await centre(ctx, `#licenseTypeList [data-value="${type}"]`)
    await rec.clickAt(option[0] - 60, option[1], 0.4)
    await rec.until('document.getElementById("licenseType").getAttribute("aria-expanded") !== "true"', { label: 'license picked' })
    await rec.live(0.85)
    shown.push(await lead())
  }
  if (new Set(shown).size !== shown.length) throw new Error(`green-check/guidelines: the rules did not change with the license type (${shown.join(' -> ')})`)
  const lastTab = await tab()
  if (lastTab !== 'alcohol') throw new Error(`green-check/guidelines: tab ${lastTab}, expected alcohol after an alcohol license type`)
  const about = await nav('about')
  await rec.clickAt(about[0] - 40, about[1], 0.5)
  await rec.until('document.getElementById("aboutPanel")', { label: 'about panel' })
  await rec.live(0.3)
  const LINK = '#aboutPanel a.btn[href*="47020348"]'
  // The scroll that brings the municipal code link to the column's middle
  const to = await ctx.page.evaluate(`(() => { const col = document.querySelector('aside.right-col'); const a = document.querySelector(${JSON.stringify(LINK)}); const c = col.getBoundingClientRect(), r = a.getBoundingClientRect(); return col.scrollTop + r.top - c.top - (c.height - r.height) / 2 })()`)
  await rec.scroll('aside.right-col', to, 1)
  await rec.live(0.2)
  const link = await centre(ctx, LINK)
  await rec.moveTo(link[0], link[1], 0.6)
  await rec.live(1)
  if (!(await ctx.page.evaluate(`document.querySelector(${JSON.stringify(LINK)}).matches(':hover')`))) throw new Error('green-check/guidelines: the municipal code link is not under the cursor')
  const label = await ctx.page.evaluate(`document.querySelector(${JSON.stringify(LINK)}).textContent.trim()`)
  return rec.finish({ basemap: 'maptiler streets', types: shot.types, shown, link: label, state: shot.state, scrubs: LOOP_SCRUBS })
}

export async function capture({ app, config, shots }) {
  const names = new Set(shots.map((s) => s.name))
  const shot = (name) => shots.find((s) => s.name === name)
  let pick = null
  if (['hero', 'base', 'chooser'].some((n) => names.has(n))) {
    const ctx = await openSession({ app, config })
    try {
      if (['hero', 'base'].some((n) => names.has(n))) {
        const values = await verifyStills(ctx, names)
        if (values) console.log(`  measured: automatic ${values.auto} ft, by hand ${values.hand} ft`)
      }
      if (names.has('chooser')) {
        pick = await pickChooser(ctx, shot('chooser'))
        console.log(`  chooser: ${pick.apn} (${pick.zone}, ${pick.useType}), ${pick.buildings} buildings, building ${pick.chosen} -> ${pick.verdict}`)
      }
    } finally {
      await ctx.close()
    }
  }
  const loops = { verify: (ctx) => verify(ctx, shot('verify')), lookup: (ctx) => lookupLoop(ctx, shot('lookup')), chooser: (ctx) => chooserLoop(ctx, shot('chooser'), pick), guidelines: (ctx) => guidelinesLoop(ctx, shot('guidelines')) }
  for (const s of shots.filter((s) => s.kind === 'loop')) {
    const ctx = await openSession({ app, config }, { virtualTime: true })
    try {
      await loops[s.name](ctx)
    } finally {
      await ctx.close()
    }
  }
}
