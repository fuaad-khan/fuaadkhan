// Yard Plan shots (PLAN §7, Appendix B2): City Hall (never the default Home residence), shapes injected through the app's own plEncode into the permalink
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
  openApp({ app, root: config.root, port: config.port, cdpPort: config.cdpPort, width: config.viewport[0], height: config.viewport[1], dpr: config.dpr, seed: config.seed, reducedMotion: !virtualTime, virtualTime })

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

// Hero (turf + concrete + Draw panel) and base (same view: drawings, glass and chrome hidden), plus the overlay harvest for GlassDraw
async function heroAndBase(ctx, shots) {
  const s = await openPlan(ctx, [['t1', TURF], ['c1', CONCRETE]])
  await until(ctx, `${READY} && drawHistory.length === 2 && !document.getElementById('panel').hidden`, { label: 'plan restored', timeout: 60000 })
  await waitIdle(ctx, { label: 'yard-plan hero' })
  await ctx.page.evaluate('window.__wp6.hide(["#status-bar"])')
  await ctx.page.evaluate('document.activeElement && document.activeElement.blur()')
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
  const common = { basemap: 'nearmap', apn: APN, theme: 'light', permalink: `/index.html${viewHash()}${s}` }
  if (shots.has('hero')) await still(ctx, 'hero', { extra: { ...common, state: 'City Hall at z21: Turf 1 and Concrete 1 drawn, Draw panel with rows and donut', intro } })
  if (shots.has('base')) {
    // Drawings come off the shared canvas (their labels go with them); chrome is hidden in place, so nothing reflows
    await ctx.page.evaluate('map.removeLayer(turfGroup); map.removeLayer(concreteGroup); true')
    await ctx.page.evaluate(`window.__wp6.hide(${JSON.stringify(CHROME)})`)
    await waitIdle(ctx, { quiet: 800, label: 'yard-plan base' })
    await still(ctx, 'base', { extra: { ...common, state: 'the hero view with Turf 1, Concrete 1, their labels, the glass sheet and the app chrome hidden (Leaflet controls, legend and attribution kept)', hidden: CHROME } })
    await ctx.page.evaluate('window.__wp6.unhide(); turfGroup.addTo(map); concreteGroup.addTo(map); window.__wp6.hide(["#status-bar"])')
    await waitIdle(ctx, { quiet: 800, label: 'yard-plan restore' })
  }
  return intro
}

// Draw panel and the traced areas, a 16:10 clip rendered at 4x
async function f2(ctx) {
  const panel = await ctx.page.evaluate('window.__wp6.rect("#panel")')
  const width = 960
  const height = 600
  const clip = { x: panel[0] + panel[2] + 16 - width, y: 90, width, height, scale: 2 }
  return still(ctx, 'f2', { clip, extra: { basemap: 'nearmap', apn: APN, state: 'Draw panel (rows and donut) beside the traced areas, clipped at 4x', values: await totals(ctx) } })
}

// Share panel: PDF, GeoJSON, Copy link, Print
async function f3(ctx) {
  await ctx.page.evaluate('document.getElementById("rail-share").click()')
  await until(ctx, '!document.getElementById("share-panel").hidden', { label: 'share panel' })
  await waitIdle(ctx, { quiet: 800, label: 'yard-plan f3' })
  await ctx.page.evaluate('document.activeElement && document.activeElement.blur()')
  return still(ctx, 'f3', { extra: { basemap: 'nearmap', apn: APN, state: 'Share panel: PDF report, GeoJSON, Copy link, Print' } })
}

// Centre of an element in viewport px
async function centre(ctx, selector) {
  const r = await ctx.page.evaluate(`window.__wp6.rect(${JSON.stringify(selector)})`)
  if (!r) throw new Error(`yard-plan: ${selector} is not on screen`)
  return [r[0] + r[2] / 2, r[1] + r[3] / 2]
}

// Drawing loop: Add Concrete, four corners (the third snaps to the turf's corner, the fourth to its edge), close, rows and donut update
async function f1(ctx) {
  const rec = createRecorder(ctx, { name: 'f1' })
  await openPlan(ctx, [['t1', TURF]], () => rec.settle({ min: 10 }))
  await rec.settle({ min: 60, max: 1500, quiet: 30 })
  await rec.waitFor(`${READY} && drawHistory.length === 1 && !document.getElementById('panel').hidden`, { max: 30, label: 'turf restored' })
  await ctx.page.evaluate('document.activeElement && document.activeElement.blur()')
  await rec.settle({ min: 20 })
  const px = async (ll) => project(ctx.page, ll)
  const [sw, se, ne, nw] = await Promise.all(CONCRETE.map(px))
  const button = await centre(ctx, '#btn-add-concrete')
  // Resting pose over the open map (not over a button), the same at both ends so the loop seam is still
  const rest = [840, 700]
  await rec.place(...rest)
  await rec.live(0.3)
  await rec.clickAt(button[0], button[1], 0.6)
  await rec.until('isDrawing && currentDrawMode === "concrete"', { label: 'concrete draw mode' })
  await rec.clickAt(sw[0], sw[1], 0.7)
  await rec.clickAt(se[0], se[1], 0.65)
  // Approach the turf's corner and stop inside the 12 px snap radius with the tip just off the ring, so the ring stays in view
  await rec.moveTo(ne[0] - 10, ne[1] + 18, 0.6)
  await rec.moveTo(ne[0] - 7, ne[1] + 8, 0.25)
  await rec.until('snapCueLayer && snapCueLayer.getLayers().length > 0', { label: 'snap ring' })
  rec.mark('poster')
  await rec.live(0.35)
  await rec.click()
  // Straight below the turf's lower edge, so the edge snap lands exactly on the traced corner
  await rec.moveTo(nw[0], nw[1] + 7, 0.65)
  await rec.live(0.2)
  await rec.click()
  await rec.clickAt(sw[0], sw[1], 0.55)
  await rec.until('drawHistory.length === 2', { label: 'concrete closed' })
  await rec.moveTo(...rest, 0.6)
  await rec.live(0.6)
  const values = await totals(ctx)
  const result = await rec.finish({ apn: APN, basemap: 'nearmap', values, state: 'Add Concrete; four corners, the third snapping to the turf corner and the fourth to its edge; the polygon closes and the rows and donut update' })
  return { ...result, values }
}

export async function capture({ app, config, shots }) {
  const names = new Set(shots.map((s) => s.name))
  if (['hero', 'base', 'f2', 'f3'].some((n) => names.has(n))) {
    const ctx = await openSession({ app, config })
    try {
      await heroAndBase(ctx, names)
      if (names.has('f2')) await f2(ctx)
      if (names.has('f3')) await f3(ctx)
    } finally {
      await ctx.close()
    }
  }
  if (names.has('f1')) {
    const ctx = await openSession({ app, config }, { virtualTime: true })
    try {
      const out = await f1(ctx)
      console.log(`  f1 values ${JSON.stringify(out.values)}`)
    } finally {
      await ctx.close()
    }
  }
}
