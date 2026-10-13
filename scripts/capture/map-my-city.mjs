// Map My City shots (PLAN §7, Appendix B2): City Hall hero for CityDraw's match-cut, the lookup loop, the imagery-history loop, the buffer + labels still
import { createRecorder } from './recorder.mjs'
import { go, openApp, still, until, waitIdle } from './session.mjs'

const READY = 'window.map && window.parcelLayer && document.readyState === "complete"'

// Opens the app for stills (real time, reduced motion so no transition is caught mid-way)
const openStill = ({ app, config }) =>
  openApp({ app, root: config.root, port: config.port, cdpPort: config.cdpPort, width: config.viewport[0], height: config.viewport[1], dpr: config.dpr, seed: config.seed, reducedMotion: true })

// Opens a fresh app session on the virtual clock for one loop (the app's own motion plays, frame by frame)
const openLoop = ({ app, config }, shot) =>
  openApp({ app, root: config.root, port: config.port, cdpPort: config.cdpPort, width: config.viewport[0], height: config.viewport[1], dpr: config.dpr, seed: { ...config.seed, ...shot.seed }, virtualTime: true })

// Real mouse click at viewport px (stills drive the app the way a person would)
async function clickPx(ctx, [x, y]) {
  for (const type of ['mouseMoved', 'mousePressed', 'mouseReleased']) {
    await ctx.page.send('Input.dispatchMouseEvent', { type, x, y, button: type === 'mouseMoved' ? 'none' : 'left', buttons: type === 'mousePressed' ? 1 : 0, clickCount: 1 })
  }
}

// Inside the SJUSD downtown school parcel (APN 434130011), a public-agency owner
const SCHOOL = [33.78907, -116.9629]

// Proximity buffer: 300 ft around the school parcel, then the Avery 5160 sheet (private owners blurred by redact.js, the public ones readable)
async function f3(ctx, shot) {
  await go(ctx, shot.path)
  await until(ctx, `${READY} && window._proximityBuffer`, { label: 'map ready', timeout: 60000 })
  await waitIdle(ctx, { label: 'f3 map' })
  await clickPx(ctx, await centre(ctx, '#proximityBufferToggle'))
  await until(ctx, 'window.isPanelShowing(document.getElementById("proximityBufferContainer"))', { label: 'buffer panel' })
  await clickPx(ctx, await centre(ctx, '#bufferDistanceInput'))
  await ctx.page.send('Input.insertText', { text: '300' })
  await ctx.page.evaluate('document.getElementById("bufferDistanceInput").dispatchEvent(new Event("change", { bubbles: true }))')
  await clickPx(ctx, await ctx.page.evaluate(`window.__wp6.project(${JSON.stringify(SCHOOL)})`))
  await until(ctx, '/Buffered 300 ft/.test(document.getElementById("proximityBufferStatus").textContent)', { label: 'buffer drawn', timeout: 60000 })
  await waitIdle(ctx, { label: 'f3 buffer' })
  const status = await ctx.page.evaluate('document.getElementById("proximityBufferStatus").textContent.trim()')
  // The ring state: the parcel's assessor sidebar closed so the map carries the frame
  if (await ctx.page.evaluate('window.isPanelShowing(document.getElementById("parcelSidebar"))')) {
    await clickPx(ctx, await centre(ctx, '#closeParcelSidebar'))
    await waitIdle(ctx, { quiet: 800, label: 'f3 sidebar closed' })
  }
  await ctx.page.evaluate('document.activeElement && document.activeElement.blur()')
  await still(ctx, 'f3', { extra: { basemap: shot.basemap ?? ctx.basemap, apn: shot.apn, bufferFeet: 300, status, state: shot.state, path: shot.path } })
  await clickPx(ctx, await centre(ctx, '#mailingLabelsBtn'))
  await until(ctx, 'document.getElementById("mailingLabelsOverlay").classList.contains("open") && document.querySelectorAll("#mailingLabelsSheet .mail-label").length > 0', { label: 'labels open', timeout: 60000 })
  await waitIdle(ctx, { label: 'f3 labels' })
  const labels = await ctx.page.evaluate(`(() => {
    const all = [...document.querySelectorAll('#mailingLabelsSheet .mail-label-inner')]
    const open = all.filter((l) => l.children[1] && l.children[1].dataset.private === '')
    return { total: all.length, readable: open.length }
  })()`)
  if (!labels.readable) throw new Error('map-my-city/f3: no public-agency label is readable')
  await ctx.page.evaluate('document.activeElement && document.activeElement.blur()')
  return still(ctx, 'f3-labels', { extra: { basemap: shot.basemap ?? ctx.basemap, apn: shot.apn, bufferFeet: 300, labels, status, alternate: true, state: 'alternate to f3: the Avery 5160 sheet from the same buffer (public-agency labels readable, private ones blurred by redact.js)', path: shot.path } })
}

// Centre of an element in viewport px
async function centre(ctx, selector) {
  const r = await ctx.page.evaluate(`window.__wp6.rect(${JSON.stringify(selector)})`)
  if (!r) throw new Error(`${ctx.app}: ${selector} is not on screen`)
  return [r[0] + r[2] / 2, r[1] + r[3] / 2]
}

// Lookup loop: type the City Hall address, pick the suggestion, the map flies in and the rows fill, then the property report opens
async function f1(ctx, shot) {
  const rec = createRecorder(ctx, { name: 'f1' })
  await go(ctx, shot.path)
  await rec.settle({ min: 30 })
  await until(ctx, READY, { label: 'map ready' })
  await ctx.page.evaluate('document.activeElement && document.activeElement.blur()')
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
  await ctx.page.evaluate('document.activeElement && document.activeElement.blur()')
  await waitIdle(ctx, { quiet: 1000, label: 'hero' })
  return still(ctx, 'hero', { extra: { basemap: ctx.basemap, apn: shot.apn, state: shot.state, path: shot.path } })
}

// Imagery dates the scrub pauses on between 2014 and now (each pause outlasts the app's 250 ms apply delay)
const SCRUB_STOPS = ['2016-04-03', '2018-06-28', '2020-05-07', '2022-05-24', '2024-05-07']

// Imagery-history loop: zoning and its legend over post-2014 subdivisions; the date slider drags back to 2014, then forward to now
async function f2(ctx, shot) {
  const rec = createRecorder(ctx, { name: 'f2' })
  await go(ctx, shot.path)
  await rec.settle({ min: 30 })
  await rec.waitFor('window._nearmapHistory && window._nearmapHistory.dates() && !document.getElementById("nearmapHistory").hidden', { max: 30, label: 'imagery dates' })
  await ctx.page.evaluate('document.activeElement && document.activeElement.blur()')
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
  if ((await value()) !== 0) throw new Error(`map-my-city/f2: slider at ${await value()}, expected 0`)
  await rec.until(`window.getNearmapDate() === ${JSON.stringify(dates[0])}`, { label: 'oldest imagery applied' })
  await rec.tick(rec.seconds(0.25))
  rec.mark('poster')
  await rec.live(0.75)
  for (const stop of SCRUB_STOPS) {
    const i = dates.indexOf(stop)
    if (i < 0) throw new Error(`map-my-city/f2: no imagery date ${stop}`)
    await rec.moveTo(xAt(i), y, 0.2)
    await rec.live(0.5)
  }
  await rec.moveTo(xAt(max), y, 0.25)
  await rec.release()
  await rec.until('window.getNearmapDate() === null', { label: 'latest imagery applied' })
  await rec.live(0.5)
  return rec.finish({ basemap: 'nearmap', layers: ['parcels', 'zoning'], dates: [dates[0], ...SCRUB_STOPS, 'latest'], state: shot.state, path: shot.path })
}

const LOOPS = { f1, f2 }

export async function capture({ app, config, shots }) {
  const stills = shots.filter((s) => s.kind === 'still')
  if (stills.length) {
    const ctx = await openStill({ app, config })
    ctx.basemap = config.basemap
    try {
      for (const shot of stills) {
        if (shot.name === 'hero') await hero(ctx, shot)
        if (shot.name === 'f3') await f3(ctx, shot)
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
