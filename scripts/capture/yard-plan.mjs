// Yard Plan shots (PLAN §7, Appendix B2; PLAN-v2 Media): City Hall (never the default Home residence) in the theme shots.json names, shapes injected through the app's own plEncode into the permalink
import { mapState, pathD, project, rects } from '../lib/harvest.mjs'
import { createRecorder } from './recorder.mjs'
import { go, openApp, still, until, waitIdle } from './session.mjs'

// City Hall (APN 437076013) framed so the traced areas sit in the glass window beside the Draw panel
const VIEW = { lat: 33.782382, lng: -116.95846, zoom: 21 }
const APN = '437076013'
// Turf 1: the landscaped strip along City Hall's north edge, its east end following the curb return (traced on Nearmap at the view above; 6 decimals, the permalink's precision)
const TURF = [[33.78248, -116.958744], [33.78248, -116.958354], [33.782438, -116.958312], [33.782438, -116.958744]]
// Concrete 1: the staff parking inside the parcel, drawn SW, SE, NE (the turf's corner: vertex snap), NW (on the turf's edge: edge snap)
const CONCRETE = [[33.782323, -116.95859], [33.782323, -116.958312], [33.782438, -116.958312], [33.782438, -116.95859]]
// The app's chrome; the base still drops it because GlassDraw redraws glass, header, rail, dock and panel itself
const CHROME = ['#glass-frame', '#glass-edge', '#header', '#rail', '#panel', '#about-panel', '#share-panel', '#map-toolbar', '#status-bar', '#corner-flag']
const READY = 'window.map && typeof parcelHighlight !== "undefined" && parcelHighlight && typeof plEncode === "function"'

const viewHash = () => `#v=1&c=${VIEW.lat},${VIEW.lng}&z=${VIEW.zoom}&apn=${APN}`

const openSession = ({ app, config }, { virtualTime = false } = {}) =>
  openApp({ app, root: config.root, port: config.port, cdpPort: config.cdpPort, width: config.viewport[0], height: config.viewport[1], dpr: config.dpr, seed: config.seed, reducedMotion: !virtualTime, virtualTime, colorScheme: config.theme === 'dark' ? 'dark' : 'light' })

// The permalink shape list, encoded in the page with the app's own plEncode
async function shapesParam(ctx, shapes) {
  const encoded = await ctx.page.evaluate(`(${JSON.stringify(shapes)}).map(([kind, ring]) => kind + ',,' + plEncode(ring.map(([lat, lng]) => ({ lat, lng })))).join(';')`)
  return `&s=${encoded}`
}

// Loads the view, encodes the shapes in that page, then loads again with them in the hash so the app restores them as a shared plan
async function openPlan(ctx, shapes, settle = () => until(ctx, 'typeof plEncode === "function"', { label: 'app scripts', timeout: 60000 })) {
  await go(ctx, `/index.html${viewHash()}`)
  await settle()
  const s = await shapesParam(ctx, shapes)
  // A hash-only change would not reload, and the app applies a permalink only at start-up
  await ctx.page.navigate('about:blank')
  await go(ctx, `/index.html${viewHash()}${s}`)
  return s
}

// Values as the Draw panel prints them (integers)
const totals = (ctx) =>
  ctx.page.evaluate('(() => { const t = getAreaTotals(); return { turf: t.turfSqFt, concrete: t.concreteSqFt, total: t.totalSqFt, turfPct: t.ratio === null ? 0 : 100 - t.ratio, pct: t.ratio === null ? 0 : t.ratio } })()')

// The theme the page booted in must be the one shots.json asks for
async function assertTheme(ctx, theme) {
  const now = await ctx.page.evaluate('document.documentElement.dataset.theme')
  if (now !== theme) throw new Error(`yard-plan: theme is ${now}, expected ${theme}`)
}

const blur = (ctx) => ctx.page.evaluate('document.activeElement && document.activeElement.blur && document.activeElement.blur(); true')

// Hero (turf + concrete + Draw panel) and base (same view: drawings, glass and chrome hidden), plus the overlay harvest for GlassDraw
async function heroAndBase(ctx, shots, theme) {
  const s = await openPlan(ctx, [['t1', TURF], ['c1', CONCRETE]])
  await until(ctx, `${READY} && drawHistory.length === 2 && !document.getElementById('panel').hidden`, { label: 'plan restored', timeout: 60000 })
  await assertTheme(ctx, theme)
  await waitIdle(ctx, { label: 'yard-plan hero' })
  await ctx.page.evaluate('window.__wp6.hide(["#status-bar"])')
  await blur(ctx)
  const state = await mapState(ctx.page)
  if (Math.abs(state.view.zoom - VIEW.zoom) > 1e-9) throw new Error(`yard-plan: zoom ${state.view.zoom}, expected ${VIEW.zoom}`)
  const ring = (group) => ctx.page.evaluate(`${group}.getLayers()[0].getLatLngs().flat(3).map((ll) => [ll.lat, ll.lng])`)
  const turfPts = await project(ctx.page, await ring('turfGroup'))
  const concretePts = await project(ctx.page, await ring('concreteGroup'))
  // The vertex both restored rings share: where the concrete snaps onto the turf
  const snap = concretePts.find(([x, y]) => turfPts.some(([u, v]) => Math.hypot(x - u, y - v) < 0.2))
  if (!snap) throw new Error('yard-plan: the rings share no vertex')
  const values = await totals(ctx)
  const shown = await ctx.page.evaluate('[document.getElementById("turf-area").textContent, document.getElementById("concrete-area").textContent, document.getElementById("total-area").textContent, document.getElementById("donut-pct").textContent]')
  const ui = {
    ...(await rects(ctx.page, { window: '#map-wrap', panel: '#panel', donut: '#donut', composition: '#composition', header: '#header', rail: '#rail', dock: '#map-toolbar', search: '#search-container', legend: '.leaflet-bottom.leaflet-left .leaflet-control' })),
    frameRadius: await ctx.page.evaluate('parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--frame-r")) || null'),
    glassPath: await ctx.page.evaluate('document.querySelector("#glass-edge path").getAttribute("d")'),
  }
  const intro = {
    turf: { d: pathD(turfPts), pts: turfPts },
    concrete: { d: pathD(concretePts), pts: concretePts },
    snap,
    values,
    labels: { turf: 'Turf 1', concrete: 'Concrete 1' },
    printed: { turf: shown[0], concrete: shown[1], total: shown[2], donut: shown[3] },
    ui,
  }
  const common = { basemap: 'nearmap', apn: APN, theme, permalink: `/index.html${viewHash()}${s}` }
  if (shots.has('hero')) await still(ctx, 'hero', { extra: { ...common, state: `City Hall at z21 (${theme} theme): Turf 1 and Concrete 1 drawn, Draw panel with rows and donut`, intro } })
  if (shots.has('base')) {
    // Drawings come off the shared canvas (their labels go with them); chrome is hidden in place, so nothing reflows
    await ctx.page.evaluate('map.removeLayer(turfGroup); map.removeLayer(concreteGroup); true')
    await ctx.page.evaluate(`window.__wp6.hide(${JSON.stringify(CHROME)})`)
    await waitIdle(ctx, { quiet: 800, label: 'yard-plan base' })
    await still(ctx, 'base', { extra: { ...common, state: `the hero view (${theme} theme) with Turf 1, Concrete 1, their labels, the glass sheet and the app chrome hidden (Leaflet controls, legend and attribution kept)`, hidden: CHROME } })
    await ctx.page.evaluate('window.__wp6.unhide(); turfGroup.addTo(map); concreteGroup.addTo(map); window.__wp6.hide(["#status-bar"])')
    await waitIdle(ctx, { quiet: 800, label: 'yard-plan restore' })
  }
  return intro
}

// Centre of an element in viewport px
async function centre(ctx, selector) {
  const r = await ctx.page.evaluate(`window.__wp6.rect(${JSON.stringify(selector)})`)
  if (!r) throw new Error(`yard-plan: ${selector} is not on screen`)
  return [r[0] + r[2] / 2, r[1] + r[3] / 2]
}

// Cursor travel time that grows with distance, so long and short moves both read naturally
const pace = (from, to, min = 0.3, max = 0.7) => Math.min(max, Math.max(min, 0.25 + Math.hypot(to[0] - from[0], to[1] - from[1]) / 1500))

// A virtual-clock session on the plan restored from the permalink (no shapes, or turf + concrete), settled with nothing in focus
async function loopPlan(ctx, rec, shapes, theme) {
  if (shapes.length) await openPlan(ctx, shapes, () => rec.settle({ min: 10 }))
  else await go(ctx, `/index.html${viewHash()}`)
  await rec.settle({ min: 60, max: 1500, quiet: 30 })
  await rec.waitFor(`${READY} && drawHistory.length === ${shapes.length} && !document.getElementById('panel').hidden`, { max: 30, label: 'plan restored' })
  await assertTheme(ctx, theme)
  await blur(ctx)
  await rec.settle({ min: 20 })
}

// Draw loop (played once from its first frame): with Add Turf already active, the turf's four corners, then Add Concrete, the third corner snapping to the turf's corner and the fourth to its edge
async function draw(ctx, shot, theme) {
  const rec = createRecorder(ctx, { name: 'draw' })
  await loopPlan(ctx, rec, [], theme)
  // Pre-roll: Add Turf pressed, so the first frame already shows the tool
  await ctx.page.evaluate('document.getElementById("btn-add-turf").click()')
  await rec.settle({ min: 10 })
  await rec.waitFor('isDrawing && currentDrawMode === "turf"', { max: 5, label: 'turf draw mode' })
  await blur(ctx)
  await rec.settle({ min: 10 })
  const turf = await project(ctx.page, TURF)
  const [sw, se, ne, nw] = await project(ctx.page, CONCRETE)
  const rest = [560, 240]
  const at = { x: rest[0], y: rest[1] }
  const go2 = async (p, dwell = 0.06, click = true) => {
    const s = pace([at.x, at.y], p)
    at.x = p[0]
    at.y = p[1]
    if (click) await rec.clickAt(p[0], p[1], s, dwell)
    else await rec.moveTo(p[0], p[1], s)
  }
  await rec.place(...rest)
  rec.mark('poster')
  await rec.live(0.35)
  for (const p of turf) await go2(p)
  // Clicking the first corner again closes the shape
  await go2(turf[0])
  await rec.until('drawHistory.length === 1', { label: 'turf closed' })
  await rec.live(0.25)
  await go2(await centre(ctx, '#btn-add-concrete'), 0.1)
  await rec.until('isDrawing && currentDrawMode === "concrete"', { label: 'concrete draw mode' })
  await go2(sw)
  await go2(se)
  // Approach the turf's corner and stop inside the 12 px snap radius with the tip just off the ring, so the ring stays in view
  await go2([ne[0] - 10, ne[1] + 18], 0, false)
  await rec.moveTo(ne[0] - 7, ne[1] + 8, 0.18)
  await rec.until('snapCueLayer && snapCueLayer.getLayers().length > 0', { label: 'snap ring' })
  await rec.live(0.3)
  await rec.click()
  // Straight below the turf's lower edge, so the edge snap lands exactly on the traced corner
  at.x = ne[0] - 7
  at.y = ne[1] + 8
  await go2([nw[0], nw[1] + 7], 0, false)
  await rec.live(0.12)
  await rec.click()
  await go2(sw)
  await rec.until('drawHistory.length === 2', { label: 'concrete closed' })
  await rec.moveTo(rest[0] + 300, rest[1] + 470, 0.45)
  await rec.live(0.75)
  const values = await totals(ctx)
  const result = await rec.finish({ apn: APN, basemap: 'nearmap', theme, values, state: shot.state })
  return { ...result, values }
}

// Composition loop (a close-up, played once): Edit, the concrete's south-west corner dragged out while the rows, total and donut follow, Edit again to save
async function composition(ctx, shot, theme) {
  const [x, y, width, height] = shot.clip
  const rec = createRecorder(ctx, { name: 'composition', clip: { x, y, width, height } })
  await loopPlan(ctx, rec, [['t1', TURF], ['c1', CONCRETE]], theme)
  const before = await totals(ctx)
  const [sw] = await project(ctx.page, CONCRETE)
  const edit = await centre(ctx, '#btn-edit')
  const rest = [x + width * 0.3, y + height * 0.86]
  await rec.place(...rest)
  rec.mark('poster')
  await rec.live(0.5)
  await rec.clickAt(edit[0], edit[1], 0.65)
  await rec.until('isEditing', { label: 'edit mode' })
  await rec.live(0.35)
  await rec.moveTo(sw[0], sw[1], 0.65)
  await rec.live(0.15)
  await rec.press()
  await rec.tick(2)
  // Down and a little out, staying well inside the close-up
  await rec.moveTo(sw[0] - 58, sw[1] + 100, 1.4)
  await rec.live(0.25)
  await rec.release()
  await rec.live(0.35)
  const during = await totals(ctx)
  if (!(during.concrete > before.concrete)) throw new Error(`yard-plan/composition: concrete ${before.concrete} -> ${during.concrete} sq ft, expected it to grow`)
  await rec.clickAt(edit[0], edit[1], 0.7)
  await rec.until('!isEditing', { label: 'edits saved' })
  await rec.moveTo(...rest, 0.5)
  await rec.live(0.7)
  const values = await totals(ctx)
  const result = await rec.finish({ apn: APN, basemap: 'nearmap', theme, before, values, state: shot.state })
  return { ...result, values }
}

// Share loop (a close-up, played once): Share in the Draw panel's Quick Actions, the Download & Share panel, Copy Link and its status toast; the clipboard write is stubbed so this machine's clipboard is untouched, and no PDF is generated
async function share(ctx, shot, theme) {
  const [x, y, width, height] = shot.clip
  const rec = createRecorder(ctx, { name: 'share', clip: { x, y, width, height } })
  await loopPlan(ctx, rec, [['t1', TURF], ['c1', CONCRETE]], theme)
  await ctx.page.evaluate('navigator.clipboard && (navigator.clipboard.writeText = () => Promise.resolve()); true')
  const rest = [x + width * 0.36, y + height * 0.72]
  await rec.place(...rest)
  rec.mark('poster')
  await rec.live(0.6)
  const open = await centre(ctx, '#btn-open-share-modal')
  await rec.clickAt(open[0], open[1], 0.8)
  await rec.until('!document.getElementById("share-panel").hidden', { label: 'share panel' })
  await rec.live(0.5)
  const pdf = await centre(ctx, '#btn-dl-pdf')
  await rec.moveTo(pdf[0] - 40, pdf[1], 0.65)
  await rec.live(0.45)
  const geo = await centre(ctx, '#btn-dl-geojson')
  await rec.moveTo(geo[0] - 40, geo[1], 0.3)
  await rec.live(0.35)
  const copy = await centre(ctx, '#btn-copy-link')
  await rec.clickAt(copy[0] - 40, copy[1], 0.4)
  await rec.until('document.getElementById("status-message").textContent.startsWith("Shareable link copied")', { label: 'link copied' })
  await rec.live(0.7)
  await rec.moveTo(...rest, 0.6)
  await rec.live(1.1)
  const toast = await ctx.page.evaluate('document.getElementById("status-message").textContent')
  const downloads = await ctx.page.evaluate('window.__stubs.log.filter((l) => l.type === "download").length')
  if (downloads) throw new Error('yard-plan/share: a download was triggered')
  return rec.finish({ apn: APN, basemap: 'nearmap', theme, toast, state: shot.state })
}

const LOOPS = { draw, composition, share }

export async function capture({ app, config, shots }) {
  const theme = config.theme ?? 'light'
  const names = new Set(shots.map((s) => s.name))
  if (names.has('hero') || names.has('base')) {
    const ctx = await openSession({ app, config })
    try {
      await heroAndBase(ctx, names, theme)
    } finally {
      await ctx.close()
    }
  }
  for (const shot of shots.filter((s) => s.kind === 'loop')) {
    const ctx = await openSession({ app, config }, { virtualTime: true })
    try {
      const out = await LOOPS[shot.name](ctx, shot, theme)
      if (out.values) console.log(`  ${shot.name} values ${JSON.stringify(out.values)}`)
    } finally {
      await ctx.close()
    }
  }
}
