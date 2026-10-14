// Map My City shots (PLAN §7, Appendix B2; PLAN-v2 Media): City Hall hero for CityDraw's match-cut, and the lookup, layers, measure, createmap and buffer loops
import { createRecorder } from './recorder.mjs'
import { go, openApp, still, until, waitIdle } from './session.mjs'

const READY = 'window.map && window.parcelLayer && document.readyState === "complete"'

// Opens the app for stills (real time, reduced motion so no transition is caught mid-way)
const openStill = ({ app, config }) =>
  openApp({ app, root: config.root, port: config.port, cdpPort: config.cdpPort, width: config.viewport[0], height: config.viewport[1], dpr: config.dpr, seed: config.seed, reducedMotion: true })

// Opens a fresh app session on the virtual clock for one loop (the app's own motion plays, frame by frame)
const openLoop = ({ app, config }, shot) =>
  openApp({ app, root: config.root, port: config.port, cdpPort: config.cdpPort, width: config.viewport[0], height: config.viewport[1], dpr: config.dpr, seed: { ...config.seed, ...shot.seed }, virtualTime: true })

// Real mouse click at viewport px (pre-roll steps drive the app the way a person would)
async function clickPx(ctx, [x, y]) {
  for (const type of ['mouseMoved', 'mousePressed', 'mouseReleased']) {
    await ctx.page.send('Input.dispatchMouseEvent', { type, x, y, button: type === 'mouseMoved' ? 'none' : 'left', buttons: type === 'mousePressed' ? 1 : 0, clickCount: 1 })
  }
}

// Centre of an element in viewport px
async function centre(ctx, selector) {
  const r = await ctx.page.evaluate(`window.__wp6.rect(${JSON.stringify(selector)})`)
  if (!r) throw new Error(`${ctx.app}: ${selector} is not on screen`)
  return [r[0] + r[2] / 2, r[1] + r[3] / 2]
}

const blur = (ctx) => ctx.page.evaluate('document.activeElement && document.activeElement.blur && document.activeElement.blur(); true')
const project = (ctx, latlngs) => ctx.page.evaluate(`window.__wp6.project(${JSON.stringify(latlngs)})`)

// Lookup loop: type the City Hall address, pick the suggestion, the map flies in and the rows fill, then the property report opens
async function lookup(ctx, shot) {
  const rec = createRecorder(ctx, { name: 'lookup' })
  await go(ctx, shot.path)
  await rec.settle({ min: 30 })
  await until(ctx, READY, { label: 'map ready' })
  await blur(ctx)
  await rec.settle({ min: 20 })
  await rec.place(760, 560)
  await rec.live(0.4)
  const input = await centre(ctx, '#parcelQueryInput')
  await rec.clickAt(input[0] - 60, input[1], 0.7)
  await rec.type('595 S San Jacinto', 10)
  await rec.until('document.querySelectorAll("#parcelQuerySuggestions li").length > 0', { label: 'suggestions' })
  await rec.live(0.35)
  const first = await centre(ctx, '#parcelQuerySuggestions li')
  await rec.clickAt(first[0] - 40, first[1], 0.5)
  await rec.until(`window.selectedApn === ${JSON.stringify(shot.apn)}`, { label: 'City Hall selected' })
  await rec.live(1.2)
  const report = await centre(ctx, '#ReportBtn')
  await rec.clickAt(report[0], report[1], 0.6)
  await rec.until('document.getElementById("propertyReportOverlay").classList.contains("open")', { label: 'report open' })
  await rec.live(0.45)
  rec.mark('poster')
  await rec.live(1.4)
  return rec.finish({ apn: shot.apn, basemap: 'nearmap', state: shot.state, path: shot.path })
}

// City Hall selected through ?apn=: lookup rows, the assessor sidebar and the legend open
async function hero(ctx, shot) {
  await go(ctx, shot.path)
  await until(ctx, READY, { label: 'map ready', timeout: 60000 })
  await until(ctx, `window.selectedApn === ${JSON.stringify(shot.apn)} && !!document.querySelector('#parcelSidebarContent .row')`, { label: 'City Hall selected', timeout: 60000 })
  await until(ctx, 'window.isPanelShowing(document.getElementById("legendContainer"))', { label: 'legend open' })
  await waitIdle(ctx, { label: 'hero' })
  await blur(ctx)
  await waitIdle(ctx, { quiet: 1000, label: 'hero' })
  return still(ctx, 'hero', { extra: { basemap: ctx.basemap, apn: shot.apn, state: shot.state, path: shot.path } })
}

// Imagery dates the scrub pauses on between 2014 and now (each pause outlasts the app's 250 ms apply delay)
const SCRUB_STOPS = ['2016-04-03', '2018-06-28', '2020-05-07', '2022-05-24', '2024-05-07']

// Imagery-history loop: zoning and its legend over post-2014 subdivisions; the date slider drags back to 2014, then forward to now
async function layers(ctx, shot) {
  const rec = createRecorder(ctx, { name: 'layers' })
  await go(ctx, shot.path)
  await rec.settle({ min: 30 })
  await rec.waitFor('window._nearmapHistory && window._nearmapHistory.dates() && !document.getElementById("nearmapHistory").hidden', { max: 30, label: 'imagery dates' })
  await blur(ctx)
  // On the virtual clock every tile lands in one step, the app drops its crossfade ghost on 'load', and Leaflet's 200 ms fade would show blank frames: swap tiles in opaque
  await ctx.page.evaluate('window.map._fadeAnimated = false')
  await rec.settle({ min: 20 })
  const dates = await ctx.page.evaluate('window._nearmapHistory.dates()')
  const [sx, sy, sw, sh] = await ctx.page.evaluate('window.__wp6.rect("#nearmapHistorySlider")')
  const max = dates.length - 1
  // Thumb centre for a slider index (16 px thumb)
  const xAt = (i) => sx + 8 + (Math.min(max, Math.max(0, i)) / max) * (sw - 16)
  const y = sy + sh / 2
  const value = () => ctx.page.evaluate('Number(document.getElementById("nearmapHistorySlider").value)')
  await rec.place(xAt(max), y)
  await rec.live(0.4)
  await rec.press()
  await rec.moveTo(xAt(0) - 10, y, 0.55)
  if ((await value()) !== 0) throw new Error(`map-my-city/layers: slider at ${await value()}, expected 0`)
  await rec.until(`window.getNearmapDate() === ${JSON.stringify(dates[0])}`, { label: 'oldest imagery applied' })
  await rec.tick(rec.seconds(0.25))
  rec.mark('poster')
  await rec.live(0.75)
  for (const stop of SCRUB_STOPS) {
    const i = dates.indexOf(stop)
    if (i < 0) throw new Error(`map-my-city/layers: no imagery date ${stop}`)
    await rec.moveTo(xAt(i), y, 0.2)
    await rec.live(0.5)
  }
  await rec.moveTo(xAt(max), y, 0.25)
  await rec.release()
  await rec.until('window.getNearmapDate() === null', { label: 'latest imagery applied' })
  await rec.live(0.5)
  return rec.finish({ basemap: 'nearmap', layers: ['parcels', 'zoning'], dates: [dates[0], ...SCRUB_STOPS, 'latest'], state: shot.state, path: shot.path })
}

// Finished measurements as the panel lists them ("Line 1: 691 ft")
const RESULTS = `[...document.querySelectorAll('#measureResults .measure-result-item')].map((e) => e.querySelector('.measure-result-label').textContent.trim() + ': ' + e.querySelector('.measure-result-value').textContent.trim())`
// Street centrelines around the Civic Center block: 6th St at Sheriff Ave, 5th St at Sheriff Ave, 5th St at San Jacinto Ave
const MEASURE_LINE = [[33.782043, -116.957742], [33.783001, -116.957742], [33.783001, -116.958863]]
// The Civic Center block (City Hall's) inside its curbs, NE, SE, SW, NW
const CIVIC_BLOCK = [[33.782928, -116.957818], [33.782104, -116.957818], [33.782104, -116.958777], [33.782928, -116.958777]]

// Clicks a run of vertices, double-clicking the last to finish the shape
async function trace(rec, pts, s = 0.6) {
  for (let i = 0; i < pts.length; i++) {
    await rec.moveTo(pts[i][0], pts[i][1], s)
    await rec.tick(rec.seconds(0.08))
    if (i === pts.length - 1) await rec.dblclick()
    else await rec.click()
  }
}

// Measure loop (played once from its first frame): the open Measure panel, a line along Sheriff Ave and 5th St, then Polygon and the Civic Center block; no parcel is selected
async function measure(ctx, shot) {
  const rec = createRecorder(ctx, { name: 'measure' })
  await go(ctx, shot.path)
  await rec.settle({ min: 30 })
  await until(ctx, `${READY} && window._measureTool`, { label: 'map ready', timeout: 60000 })
  await blur(ctx)
  await rec.settle({ min: 20 })
  // Pre-roll: the panel opens with a real click; its close button takes focus, which no frame should show
  await clickPx(ctx, await centre(ctx, '#measureToggle'))
  await rec.settle({ min: 20 })
  await blur(ctx)
  await rec.settle({ min: 10 })
  const line = await project(ctx, MEASURE_LINE)
  const block = await project(ctx, CIVIC_BLOCK)
  const rest = [1010, 610]
  await rec.place(...rest)
  rec.mark('poster')
  await rec.live(0.5)
  await trace(rec, line, 0.6)
  await rec.until(`${RESULTS}.length === 1`, { label: 'line measured' })
  await rec.live(0.5)
  const polygon = await centre(ctx, '#measureModeToggle label:nth-of-type(2)')
  await rec.clickAt(polygon[0] - 40, polygon[1], 0.7)
  await rec.until('document.querySelector(\'input[name="measureMode"][value="polygon"]\').checked', { label: 'polygon mode' })
  await rec.live(0.25)
  await trace(rec, block, 0.55)
  await rec.until(`${RESULTS}.length === 2`, { label: 'polygon measured' })
  await rec.moveTo(...rest, 0.6)
  await rec.live(1.1)
  const results = await ctx.page.evaluate(RESULTS)
  if (!/^Line 1: [\d,]+ ft$/.test(results[0]) || !/^Polygon 1: [\d,]+ sq ft$/.test(results[1])) throw new Error(`map-my-city/measure: unexpected results ${JSON.stringify(results)}`)
  if (await ctx.page.evaluate('!!window.selectedApn')) throw new Error('map-my-city/measure: a parcel was selected')
  return rec.finish({ basemap: 'nearmap', results, state: shot.state, path: shot.path })
}

const CM_ROWS = `[...document.querySelectorAll('#createMapList li.cm-row .cm-row-apn')].map((e) => e.textContent.replace(/-/g, '').trim())`
const CM_OVERLAY = `document.getElementById('parcelPrintMapOverlay')`

// Create Map loop (played once): rectangle pick of the City-owned 432-190-011/012/013, Create Map, Hatch fill, the Planning template, then down to its title block
async function createmap(ctx, shot) {
  const rec = createRecorder(ctx, { name: 'createmap' })
  await go(ctx, shot.path)
  await rec.settle({ min: 30 })
  await until(ctx, READY, { label: 'map ready', timeout: 60000 })
  await blur(ctx)
  await rec.settle({ min: 20 })
  // Pre-roll: Create Map open in rectangle mode
  await clickPx(ctx, await centre(ctx, '#createMapToggle'))
  await rec.settle({ min: 20 })
  await clickPx(ctx, await centre(ctx, '#createMapModeToggle .cm-mode-btn[data-mode=rectangle]'))
  await rec.settle({ min: 10 })
  await blur(ctx)
  await rec.settle({ min: 10 })
  const [a, b] = await project(ctx, shot.box)
  // At rest over the City parcels themselves, never over a private one
  await rec.place((a[0] + b[0]) / 2 + 30, b[1] - 40)
  rec.mark('poster')
  await rec.live(0.4)
  await rec.moveTo(a[0], a[1], 0.6)
  await rec.live(0.1)
  await rec.press()
  await rec.moveTo(b[0], b[1], 1.0)
  await rec.live(0.15)
  await rec.release()
  await rec.until(`${CM_ROWS}.length >= ${shot.apns.length}`, { label: 'parcels picked' })
  const picked = await ctx.page.evaluate(CM_ROWS)
  if (picked.slice().sort().join() !== shot.apns.slice().sort().join()) throw new Error(`map-my-city/createmap: picked ${picked.join(', ')}, expected only ${shot.apns.join(', ')}`)
  await rec.live(0.5)
  const create = await centre(ctx, '#createMapBtn')
  await rec.clickAt(create[0], create[1], 0.7)
  await rec.until(`${CM_OVERLAY}.classList.contains('open') && !document.getElementById('printParcelMapBtn').disabled`, { label: 'exhibit ready', max: 15 })
  await rec.live(0.4)
  const hatch = await centre(ctx, '#pmStyleGroup .pm-segmented label:has(input[value=hatch])')
  await rec.clickAt(hatch[0], hatch[1], 0.7)
  await rec.until(`document.querySelector('input[name="pmFillType"][value="hatch"]').checked`, { label: 'hatch fill' })
  await rec.live(0.35)
  const planning = await centre(ctx, 'label:has(#pmTplPlanning)')
  await rec.clickAt(planning[0] - 10, planning[1], 0.6)
  await rec.until(`document.getElementById('pmTplPlanning').checked`, { label: 'Planning template' })
  await rec.live(0.6)
  const sheet = await centre(ctx, '#parcelMapSheet')
  await rec.moveTo(sheet[0] + 150, Math.min(sheet[1] + 120, ctx.height - 120), 0.5)
  await rec.scroll('#parcelPrintMapOverlay', 'end', 1.3)
  await rec.live(1.1)
  const title = await ctx.page.evaluate(`[...document.querySelectorAll('#parcelMapTitle .pm-title-apn, #parcelMapTitle .pm-title-kind')].map((e) => e.textContent.trim()).join(' / ')`)
  return rec.finish({ basemap: shot.basemap ?? 'nearmap', apns: shot.apns, picked, template: 'planning', fill: 'hatch', title: title.replace(/\s+/g, ' ').trim(), state: shot.state, path: shot.path })
}

// Inside the SJUSD downtown school parcel (APN 434130011), a public-agency owner
const SCHOOL = [33.78907, -116.9629]
const LABELS_OPEN = `document.getElementById('mailingLabelsOverlay').classList.contains('open')`
const SITE_OPEN = `document.getElementById('subjectSiteMapOverlay').classList.contains('open')`

// Buffer loop (played once): with 300 ft entered, click the school, the ring and its parcels, the Avery sheet (private labels blurred by redact.js), then the site map
async function buffer(ctx, shot) {
  const rec = createRecorder(ctx, { name: 'buffer' })
  await go(ctx, shot.path)
  await rec.settle({ min: 30 })
  await until(ctx, `${READY} && window._proximityBuffer`, { label: 'map ready', timeout: 60000 })
  await blur(ctx)
  await rec.settle({ min: 20 })
  // Pre-roll: the Proximity Buffer open with 300 ft entered
  await clickPx(ctx, await centre(ctx, '#proximityBufferToggle'))
  await rec.settle({ min: 20 })
  await clickPx(ctx, await centre(ctx, '#bufferDistanceInput'))
  await ctx.page.send('Input.insertText', { text: String(shot.bufferFeet) })
  await ctx.page.evaluate('document.getElementById("bufferDistanceInput").dispatchEvent(new Event("change", { bubbles: true }))')
  await blur(ctx)
  await rec.settle({ min: 10 })
  const school = await project(ctx, SCHOOL)
  // The cursor rests on the panel, never over a private parcel (the map outlines whatever it hovers)
  const [px, py, pw, ph] = await ctx.page.evaluate('window.__wp6.rect("#proximityBufferContainer")')
  await rec.place(px + pw * 0.62, py + ph + 40)
  rec.mark('poster')
  await rec.live(0.5)
  await rec.clickAt(school[0], school[1], 0.85)
  await rec.until(`/Buffered ${shot.bufferFeet} ft/.test(document.getElementById('proximityBufferStatus').textContent)`, { label: 'buffer drawn', max: 10 })
  await rec.live(0.3)
  const labelsBtn = await centre(ctx, '#mailingLabelsBtn')
  await rec.moveTo(labelsBtn[0] + 30, labelsBtn[1] + 34, 0.7)
  await rec.live(0.9)
  const status = await ctx.page.evaluate('document.getElementById("proximityBufferStatus").textContent.trim()')
  await rec.clickAt(labelsBtn[0], labelsBtn[1], 0.3)
  await rec.until(`${LABELS_OPEN} && document.querySelectorAll('#mailingLabelsSheet .mail-label-inner').length > 0`, { label: 'labels open', max: 10 })
  const labels = await ctx.page.evaluate(`(() => {
    const all = [...document.querySelectorAll('#mailingLabelsSheet .mail-label-inner')]
    const open = all.filter((l) => l.children[1] && l.children[1].dataset.private === '')
    const agency = /\\b(CITY OF|COUNTY OF|STATE OF|UNITED STATES|SCHOOL DIST|UNIFIED|COMMUNITY COLLEGE|WATER DIST|MUNICIPAL WATER|FLOOD CONTROL|HOUSING AUTHORITY|SUCCESSOR AGENCY|REDEVELOPMENT)\\b/i
    return { total: all.length, readable: open.length, readableArePublic: open.every((l) => agency.test(l.children[1].textContent)) }
  })()`)
  if (!labels.readable || !labels.readableArePublic) throw new Error(`map-my-city/buffer: readable labels must all be public agencies (${JSON.stringify(labels)})`)
  await rec.live(1.6)
  const siteBtn = await centre(ctx, '#subjectMapBtn')
  await rec.clickAt(siteBtn[0], siteBtn[1], 0.6)
  await rec.until(`${SITE_OPEN} && !document.getElementById('printSubjectMapBtn').disabled`, { label: 'site map ready', max: 15 })
  const site = await centre(ctx, '#subjectMapSheet')
  await rec.moveTo(site[0] + 420, site[1] + 160, 0.6)
  await rec.live(1.6)
  return rec.finish({ basemap: shot.basemap ?? 'nearmap', apn: shot.apn, bufferFeet: shot.bufferFeet, status, labels, state: shot.state, path: shot.path })
}

const LOOPS = { lookup, layers, measure, createmap, buffer }

export async function capture({ app, config, shots }) {
  const stills = shots.filter((s) => s.kind === 'still')
  if (stills.length) {
    const ctx = await openStill({ app, config })
    ctx.basemap = config.basemap
    try {
      for (const shot of stills) {
        if (shot.name === 'hero') await hero(ctx, shot)
      }
    } finally {
      await ctx.close()
    }
  }
  for (const shot of shots.filter((s) => s.kind === 'loop')) {
    const ctx = await openLoop({ app, config }, shot)
    try {
      await LOOPS[shot.name](ctx, shot)
    } finally {
      await ctx.close()
    }
  }
}
