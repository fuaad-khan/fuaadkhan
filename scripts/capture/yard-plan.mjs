// Yard Plan shots (PLAN §7, Appendix B2; PLAN-v2 Media): the hero still at City Hall (the hub tile), and four loops at the owner's chosen front yard, whose APN, view and traced shapes live only in the gitignored privacy.local.json (capture.yardPlan)
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { mapState } from '../lib/harvest.mjs'
import { localPrivacy } from '../lib/privacy.mjs'
import { createRecorder } from './recorder.mjs'
import { answerFileChooser, go, openApp, still, until, waitIdle } from './session.mjs'

// City Hall (APN 437076013) framed so the traced areas sit beside the Draw panel; never the default Home view, which is a residence
const CITY_HALL = { lat: 33.782382, lng: -116.95846, zoom: 21 }
const APN = '437076013'
// Turf 1: the landscaped strip along City Hall's north edge; Concrete 1: the staff parking inside the parcel (traced on Nearmap at the view above; lat/lng, 6 decimals)
const TURF = [[33.78248, -116.958744], [33.78248, -116.958354], [33.782438, -116.958312], [33.782438, -116.958744]]
const CONCRETE = [[33.782323, -116.95859], [33.782323, -116.958312], [33.782438, -116.958312], [33.782438, -116.95859]]
const APP_READY = 'window.map && typeof plEncode === "function" && typeof drawHistory !== "undefined"'
// What the front yard's property card shows instead of the real address and APN (both lines are blurred by page/privacy.js)
const PLACEHOLDER = { address: '000 Sample Street', apn: '000-000-000' }
// The front yard's shapes in drawing order: permalink kind and index, the local px ring's key, and the name the app gives it
const PLAN = {
  driveway: ['c1', 'driveway'],
  porch: ['c2', 'porch'],
  band: ['c3', 'band'],
  lawnLeft: ['t1', 'lawnLeft'],
  lawnRight: ['t2', 'lawnRight'],
}

const viewHash = (v, apn) => `#v=1&c=${v.lat},${v.lng}&z=${v.zoom}${apn ? `&apn=${apn}` : ''}`

const openSession = ({ app, config }, { virtualTime = false, isPrivate = false } = {}) =>
  openApp({ app, root: config.root, port: config.port, cdpPort: config.cdpPort, width: config.viewport[0], height: config.viewport[1], dpr: config.dpr, seed: config.seed, reducedMotion: !virtualTime, virtualTime, colorScheme: config.theme === 'dark' ? 'dark' : 'light', private: isPrivate })

// The front yard's local settings; the shots refuse to run without them rather than fall back to anything committed
function house() {
  const yp = localPrivacy().capture?.yardPlan
  if (!yp?.apn || !yp?.view || !yp?.px) throw new Error('yard-plan: privacy.local.json has no capture.yardPlan { apn, view, px }; the front-yard shots read their location only from there')
  return yp
}

// The permalink shape list, encoded in the page with the app's own plEncode; rings are lat/lng pairs, or viewport px when px is set
const shapesParam = (ctx, shapes, px = false) =>
  ctx.page.evaluate(`(${JSON.stringify(shapes)}).map(([kind, ring]) => kind + ',,' + plEncode(ring.map((p) => ${px ? 'map.containerPointToLatLng(p)' : 'L.latLng(p[0], p[1])'}))).join(';')`)

// Values as the Draw panel prints them (integers)
const totals = (ctx) =>
  ctx.page.evaluate('(() => { const t = getAreaTotals(); return { turf: t.turfSqFt, concrete: t.concreteSqFt, total: t.totalSqFt, turfPct: t.ratio === null ? 0 : 100 - t.ratio, pct: t.ratio === null ? 0 : t.ratio } })()')

// The theme the page booted in must be the one shots.json asks for
async function assertTheme(ctx, theme) {
  const now = await ctx.page.evaluate('document.documentElement.dataset.theme')
  if (now !== theme) throw new Error(`yard-plan: theme is ${now}, expected ${theme}`)
}

const blur = (ctx) => ctx.page.evaluate('document.activeElement && document.activeElement.blur && document.activeElement.blur(); true')

// Hero: City Hall with turf and concrete drawn and the Draw panel open (the Applications hub tile)
async function hero(ctx, theme) {
  await go(ctx, `/index.html${viewHash(CITY_HALL, APN)}`)
  await until(ctx, APP_READY, { label: 'app scripts', timeout: 60000 })
  const s = await shapesParam(ctx, [['t1', TURF], ['c1', CONCRETE]])
  // A hash-only change would not reload, and the app applies a permalink only at start-up
  await ctx.page.navigate('about:blank')
  await go(ctx, `/index.html${viewHash(CITY_HALL, APN)}&s=${s}`)
  await until(ctx, `${APP_READY} && parcelHighlight && drawHistory.length === 2 && !document.getElementById('panel').hidden`, { label: 'plan restored', timeout: 60000 })
  await assertTheme(ctx, theme)
  await waitIdle(ctx, { label: 'yard-plan hero' })
  await ctx.page.evaluate('window.__wp6.hide(["#status-bar"]); document.getElementById("searchInput").value = ""; true')
  await blur(ctx)
  const state = await mapState(ctx.page)
  if (Math.abs(state.view.zoom - CITY_HALL.zoom) > 1e-9) throw new Error(`yard-plan: zoom ${state.view.zoom}, expected ${CITY_HALL.zoom}`)
  await still(ctx, 'hero', { extra: { basemap: 'nearmap', apn: APN, theme, permalink: `/index.html${viewHash(CITY_HALL, APN)}&s=${s}`, state: `City Hall at z21 (${theme} theme): Turf 1 and Concrete 1 drawn, Draw panel with rows and donut` } })
}

// Centre of an element in viewport px
async function centre(ctx, selector) {
  const r = await ctx.page.evaluate(`window.__wp6.rect(${JSON.stringify(selector)})`)
  if (!r) throw new Error(`yard-plan: ${selector} is not on screen`)
  return [r[0] + r[2] / 2, r[1] + r[3] / 2]
}

// A virtual-clock session at the front yard: the view (and any shapes) from a view-only permalink, then the parcel highlighted with its details cleared and placeholders in the card; parcel clicks are switched off so no other address can load
async function housePlan(ctx, rec, yp, names, theme) {
  const hash = viewHash(yp.view)
  await go(ctx, `/index.html${hash}`)
  await rec.settle({ min: 10 })
  await rec.waitFor(APP_READY, { max: 60, label: 'app scripts' })
  if (names.length) {
    const s = await shapesParam(ctx, names.map((n) => [PLAN[n][0], yp.px[PLAN[n][1]]]), true)
    await ctx.page.navigate('about:blank')
    await go(ctx, `/index.html${hash}&s=${s}`)
  }
  await rec.settle({ min: 60, max: 1500, quiet: 30 })
  await rec.waitFor(`${APP_READY} && parcelFeatureLayer && drawHistory.length === ${names.length} && !document.getElementById('panel').hidden`, { max: 30, label: 'plan restored' })
  await assertTheme(ctx, theme)
  await ctx.page.evaluate(`parcelFeatureLayer.off('click'); queryFeatures('parcels', ${JSON.stringify(`APN = '${yp.apn}'`)}, { geometry: true, limit: 1 }, (f) => { f[0].properties = {}; selectParcelFeature(f[0], { address: ${JSON.stringify(PLACEHOLDER.address)}, fit: false, note: 'Shared view opened' }) }); true`)
  await rec.waitFor('parcelHighlight', { max: 20, label: 'parcel highlight' })
  await ctx.page.evaluate(`document.getElementById('prop-apn').textContent = ${JSON.stringify(PLACEHOLDER.apn)}; document.getElementById('searchInput').value = ''; true`)
  await blur(ctx)
  await rec.settle({ min: 20, max: 900, quiet: 20 })
}

// A short click (one frame held), enough for Leaflet Draw, which needs about 50 ms between clicks: every move before the next is at least two frames
async function tap(rec) {
  await rec.press()
  await rec.tick()
  await rec.release()
  await rec.tick()
}

// Glides to each corner and taps it, then taps the first corner again to close the shape; the glide time grows with the distance
async function trace(rec, at, ring) {
  for (const [x, y] of [...ring, ring[0]]) {
    await rec.moveTo(x, y, Math.min(0.45, Math.max(0.067, Math.hypot(x - at.x, y - at.y) / 700)))
    at.x = x
    at.y = y
    await tap(rec)
  }
}

// Moves to a control, dwells briefly and taps it
async function press(rec, ctx, at, selector, s = 0.35) {
  const [x, y] = await centre(ctx, selector)
  await rec.moveTo(x, y, s)
  at.x = x
  at.y = y
  await rec.live(0.05)
  await tap(rec)
}

const SHAPES = 'drawHistory.length'
const drawing = (mode) => `isDrawing && currentDrawMode === "${mode}"`

// Digitize loop (played once): with Add Concrete already pressed, the driveway, then the curved band, then the lawn around it, its edge snapping onto the band's corners; the composition fills in
async function digitize(ctx, shot, theme) {
  const yp = house()
  const rec = createRecorder(ctx, { name: 'digitize' })
  await housePlan(ctx, rec, yp, [], theme)
  await ctx.page.evaluate('document.getElementById("tb-concrete").click()')
  await rec.waitFor(drawing('concrete'), { max: 5, label: 'concrete draw mode' })
  await blur(ctx)
  await rec.settle({ min: 10 })
  const rest = [700, 330]
  const at = { x: rest[0], y: rest[1] }
  await rec.place(...rest)
  rec.mark('poster')
  await rec.live(0.25)
  await trace(rec, at, yp.px.driveway)
  await rec.until(`${SHAPES} === 1`, { label: 'driveway closed' })
  await press(rec, ctx, at, '#tb-concrete')
  await rec.until(drawing('concrete'), { label: 'concrete again' })
  await trace(rec, at, yp.px.band)
  await rec.until(`${SHAPES} === 2`, { label: 'band closed' })
  await press(rec, ctx, at, '#tb-turf')
  await rec.until(drawing('turf'), { label: 'turf draw mode' })
  await trace(rec, at, yp.px.lawnLeft)
  await rec.until(`${SHAPES} === 3`, { label: 'lawn closed' })
  await rec.moveTo(...rest, 0.4)
  await rec.live(0.5)
  const values = await totals(ctx)
  const result = await rec.finish({ basemap: 'nearmap', theme, values, state: shot.state })
  return { ...result, values }
}

// Approaches a corner that should snap, waits on the orange cue, then taps
async function snapTo(rec, at, [x, y]) {
  await rec.moveTo(x + 14, y + 10, Math.min(0.45, Math.max(0.12, Math.hypot(x + 14 - at.x, y + 10 - at.y) / 700)))
  await rec.moveTo(x + 5, y + 4, 0.12)
  at.x = x + 5
  at.y = y + 4
  await rec.until('snapCueLayer && snapCueLayer.getLayers().length > 0', { label: 'snap cue' })
  await rec.live(0.15)
  await tap(rec)
}

// Draw loop (played once): Concrete, then Turf picked in the panel; the right lawn traced with four corners snapping onto the driveway's; then the porch walk removed from Drawn Areas, and the totals follow
async function draw(ctx, shot, theme) {
  const yp = house()
  const rec = createRecorder(ctx, { name: 'draw' })
  await housePlan(ctx, rec, yp, ['driveway', 'porch', 'band', 'lawnLeft'], theme)
  const rest = [1100, 820]
  const at = { x: rest[0], y: rest[1] }
  await rec.place(...rest)
  rec.mark('poster')
  await rec.live(0.4)
  await press(rec, ctx, at, '#btn-add-concrete', 0.5)
  await rec.until(drawing('concrete'), { label: 'concrete picked' })
  await rec.live(0.3)
  await press(rec, ctx, at, '#btn-add-turf', 0.3)
  await rec.until(drawing('turf'), { label: 'turf picked' })
  await rec.live(0.25)
  // Corners 1-2 land free on the lawn's edge; 3-6 snap onto the driveway's corners
  const [r2, r3, r4, r5, r6, r1] = yp.px.lawnRight
  for (const p of [r2, r3]) {
    await rec.moveTo(p[0], p[1], Math.min(0.45, Math.max(0.12, Math.hypot(p[0] - at.x, p[1] - at.y) / 700)))
    at.x = p[0]
    at.y = p[1]
    await tap(rec)
  }
  for (const p of [r4, r5, r6, r1]) await snapTo(rec, at, p)
  await rec.moveTo(r2[0], r2[1], 0.3)
  at.x = r2[0]
  at.y = r2[1]
  await tap(rec)
  await rec.until(`${SHAPES} === 5`, { label: 'right lawn closed' })
  await rec.live(0.4)
  const remove = 'button.feature-remove[aria-label="Remove Concrete 2"]'
  const row = await ctx.page.evaluate(`window.__wp6.rect(document.querySelector(${JSON.stringify(remove)}).closest('.feature-row'))`)
  await rec.moveTo(row[0] + row[2] * 0.4, row[1] + row[3] / 2, 0.55)
  await rec.live(0.3)
  await press(rec, ctx, at, remove, 0.3)
  await rec.until(`document.querySelectorAll('#feature-list .feature-row').length === 4`, { label: 'porch walk removed' })
  await rec.moveTo(...rest, 0.45)
  await rec.live(0.8)
  const values = await totals(ctx)
  const result = await rec.finish({ basemap: 'nearmap', theme, values, state: shot.state })
  return { ...result, values }
}

// Corner handles in edit mode, in viewport px
const handles = (ctx) => ctx.page.evaluate('[...document.querySelectorAll(".leaflet-editing-icon")].filter((m) => m.getClientRects().length).map((m) => { const r = m.getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2, Number(getComputedStyle(m).opacity)] })')
const nearest = (list, [x, y]) => list.reduce((best, h) => (Math.hypot(h[0] - x, h[1] - y) < Math.hypot(best[0] - x, best[1] - y) ? h : best))

// Drags from one point to another with the button held
async function drag(rec, from, to, s = 0.8) {
  await rec.moveTo(from[0], from[1], 0.45)
  await rec.live(0.12)
  await rec.press()
  await rec.tick(2)
  await rec.moveTo(to[0], to[1], s)
  await rec.live(0.1)
  await rec.release()
  await rec.live(0.3)
}

// Edit loop (a close-up, played once): Edit, the right lawn's top corner dragged out to the fence line, a new corner pulled out of its side edge, then clicked away again, Done; the rows and donut follow live
async function edit(ctx, shot, theme) {
  const yp = house()
  const [x, y, width, height] = shot.clip
  const rec = createRecorder(ctx, { name: 'edit', clip: { x, y, width, height } })
  await housePlan(ctx, rec, yp, ['driveway', 'porch', 'band', 'lawnLeft', 'lawnRight'], theme)
  const before = await totals(ctx)
  const [r2, r3] = yp.px.lawnRight
  const rest = [x + width * 0.42, y + height * 0.9]
  const at = { x: rest[0], y: rest[1] }
  await rec.place(...rest)
  rec.mark('poster')
  await rec.live(0.45)
  await press(rec, ctx, at, '#btn-edit', 0.6)
  await rec.until('isEditing', { label: 'edit mode' })
  await rec.live(0.35)
  // Drag a corner: the top-right corner up the side lawn
  const corner = nearest(await handles(ctx), r2)
  const moved = [r2[0], r2[1] - 30]
  await drag(rec, corner, moved, 0.75)
  // Add a corner: pull the faded midpoint of the right edge outward
  const mid = [(moved[0] + r3[0]) / 2, (moved[1] + r3[1]) / 2]
  const ghost = nearest((await handles(ctx)).filter((h) => h[2] < 0.9), mid)
  const added = [ghost[0] + 24, ghost[1]]
  await drag(rec, ghost, added, 0.6)
  const during = await totals(ctx)
  if (during.turf === before.turf) throw new Error('yard-plan/edit: the turf total did not change while editing')
  // Delete a corner: click the one just added
  await rec.moveTo(added[0], added[1], 0.35)
  await rec.live(0.15)
  await tap(rec)
  await rec.live(0.4)
  await press(rec, ctx, at, '#btn-edit', 0.6)
  await rec.until('!isEditing', { label: 'edits saved' })
  await rec.moveTo(...rest, 0.45)
  await rec.live(0.75)
  const values = await totals(ctx)
  const result = await rec.finish({ basemap: 'nearmap', theme, before, values, state: shot.state })
  return { ...result, values }
}

// The plan as a GeoJSON file the app can load back (its own import format), written next to the frames under .cache (gitignored)
async function writeFixture(ctx, yp, names) {
  const features = await ctx.page.evaluate(`(${JSON.stringify(names.map((n) => [PLAN[n][0], yp.px[PLAN[n][1]]]))}).map(([kind, ring]) => {
    const pts = ring.map((p) => map.containerPointToLatLng(p)).map((ll) => [Number(ll.lng.toFixed(7)), Number(ll.lat.toFixed(7))])
    return { type: 'Feature', properties: { type: kind[0] === 't' ? 'turf' : 'concrete', name: (kind[0] === 't' ? 'Turf ' : 'Concrete ') + kind.slice(1) }, geometry: { type: 'Polygon', coordinates: [[...pts, pts[0]]] } }
  })`)
  const file = join(ctx.dir, 'front-yard.geojson')
  writeFileSync(file, JSON.stringify({ type: 'FeatureCollection', features }))
  return file
}

// Share loop (played once): Share, the download options hovered, Copy Link and its toast (the clipboard write is stubbed), then Clear All and Upload: the saved plan's GeoJSON loads back and the map fits it
async function share(ctx, shot, theme) {
  const yp = house()
  const names = ['driveway', 'porch', 'band', 'lawnLeft', 'lawnRight']
  const rec = createRecorder(ctx, { name: 'share' })
  await housePlan(ctx, rec, yp, names, theme)
  const fixture = await writeFixture(ctx, yp, names)
  await answerFileChooser(ctx, fixture)
  await ctx.page.evaluate('navigator.clipboard && (navigator.clipboard.writeText = () => Promise.resolve()); window.confirm = () => true; true')
  const rest = [1000, 820]
  const at = { x: rest[0], y: rest[1] }
  await rec.place(...rest)
  rec.mark('poster')
  await rec.live(0.45)
  await press(rec, ctx, at, '#btn-open-share-modal', 0.6)
  await rec.until('!document.getElementById("share-panel").hidden', { label: 'share panel' })
  await rec.live(0.35)
  for (const sel of ['#btn-dl-pdf', '#btn-dl-geojson']) {
    const [bx, by] = await centre(ctx, sel)
    await rec.moveTo(bx - 40, by, 0.35)
    at.x = bx - 40
    at.y = by
    await rec.live(0.3)
  }
  await press(rec, ctx, at, '#btn-copy-link', 0.3)
  await rec.until('document.getElementById("status-message").textContent.startsWith("Shareable link copied")', { label: 'link copied' })
  await rec.live(0.6)
  if (await ctx.page.evaluate('document.getElementById("panel").hidden')) {
    await press(rec, ctx, at, '#rail-draw', 0.55)
    await rec.until('!document.getElementById("panel").hidden', { label: 'draw panel' })
    await rec.live(0.25)
  }
  await press(rec, ctx, at, '#btn-clear-all', 0.5)
  await rec.until(`${SHAPES} === 0`, { label: 'cleared' })
  await rec.live(0.45)
  await press(rec, ctx, at, '#rail-upload', 0.6)
  await rec.until(`${SHAPES} === ${names.length}`, { label: 'geojson loaded', max: 8 })
  await rec.live(0.3)
  await rec.moveTo(...rest, 0.5)
  await rec.live(0.9)
  const toast = await ctx.page.evaluate('document.getElementById("status-message").textContent')
  if (!/loaded from front-yard\.geojson/.test(toast)) throw new Error(`yard-plan/share: toast reads "${toast}"`)
  const downloads = await ctx.page.evaluate('window.__stubs.log.filter((l) => l.type === "download").length')
  if (downloads) throw new Error('yard-plan/share: a download was triggered')
  return rec.finish({ basemap: 'nearmap', theme, toast, state: shot.state })
}

const LOOPS = { digitize, draw, edit, share }

export async function capture({ app, config, shots }) {
  const theme = config.theme ?? 'light'
  if (shots.some((s) => s.name === 'hero')) {
    const ctx = await openSession({ app, config })
    try {
      await hero(ctx, theme)
    } finally {
      await ctx.close()
    }
  }
  for (const shot of shots.filter((s) => s.kind === 'loop')) {
    const ctx = await openSession({ app, config }, { virtualTime: true, isPrivate: !!shot.private })
    try {
      const out = await LOOPS[shot.name](ctx, shot, theme)
      if (out.values) console.log(`  ${shot.name} values ${JSON.stringify(out.values)}`)
    } finally {
      await ctx.close()
    }
  }
}
