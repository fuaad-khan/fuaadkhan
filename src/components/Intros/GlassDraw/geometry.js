// Yard Plan's desktop layout in CSS px (yardplan.css): the map window is the #map-wrap box, its corners are --frame-r fillets
export const APP = { headerH: 64, railW: 200, frameR: 120, inset: 36 }

// Leaflet's theme button centre (zoom + Home + theme stack at left: rail + inset, top: 184 px); the cursor clicks it for the night beat
export const THEME_BUTTON = [252, 310]

// Built-in plan in the 1600x1000 capture space until media.js carries the sidecar: a front lawn and a driveway sharing one corner
export const DEMO_PLAN = {
  demo: true,
  viewport: [1600, 1000],
  turf: [[580, 550], [830, 542], [826, 686], [604, 686], [580, 664]],
  concrete: [[830, 542], [935, 542], [938, 700], [828, 700]],
  snap: [830, 542],
}

const isPoint = (p) => Array.isArray(p) && p.length >= 2 && Number.isFinite(p[0]) && Number.isFinite(p[1])
const readRing = (ring) => (Array.isArray(ring?.pts) && ring.pts.length >= 3 && ring.pts.every(isPoint) ? ring.pts.map(([x, y]) => [x, y]) : null)
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1])

// Index of the ring vertex closest to p
function nearest(ring, p) {
  let best = 0
  ring.forEach((v, i) => {
    if (dist(v, p) < dist(ring[best], p)) best = i
  })
  return best
}

// The capture sidecar's rings (media.hero.intro), with the concrete ring starting at the shared corner; null when absent or malformed
export function readPlan(hero, target) {
  const intro = hero?.intro
  const turf = readRing(intro?.turf)
  const concrete = readRing(intro?.concrete)
  const viewport = hero?.viewport ?? target?.viewport
  if (!turf || !concrete || !isPoint(viewport) || viewport[0] <= 0 || viewport[1] <= 0) return null
  // Without an explicit snap point, the shared corner is the concrete vertex closest to the turf ring
  const snap = isPoint(intro.snap) ? [intro.snap[0], intro.snap[1]] : concrete.reduce((a, v) => (dist(v, turf[nearest(turf, v)]) < dist(a, turf[nearest(turf, a)]) ? v : a))
  const start = nearest(concrete, snap)
  return { demo: false, viewport: [viewport[0], viewport[1]], turf, concrete: [...concrete.slice(start), ...concrete.slice(0, start)], snap }
}

// Area-weighted centre of a ring, where Leaflet anchors a polygon's tooltip
export function centroid(ring) {
  let a = 0
  let cx = 0
  let cy = 0
  ring.forEach(([x0, y0], i) => {
    const [x1, y1] = ring[(i + 1) % ring.length]
    const cross = x0 * y1 - x1 * y0
    a += cross
    cx += (x0 + x1) * cross
    cy += (y0 + y1) * cross
  })
  if (Math.abs(a) < 1e-6) return ring.reduce(([sx, sy], [x, y]) => [sx + x / ring.length, sy + y / ring.length], [0, 0])
  return [cx / (3 * a), cy / (3 * a)]
}

const r2 = (v) => Math.round(v * 100) / 100

// Port of updateGlassFrame (YardPlan js/draw.js): the window outline, drawn counter-clockwise so a nonzero fill leaves it open
export function holePath(x1, y1, x2, y2, rMax) {
  const r = r2(Math.max(0, Math.min(rMax, (x2 - x1) / 2, (y2 - y1) / 2)))
  const [a, b, c, d] = [x1, y1, x2, y2].map(r2)
  return `M${r2(a + r)} ${b} A${r} ${r} 0 0 0 ${a} ${r2(b + r)} V${r2(d - r)} A${r} ${r} 0 0 0 ${r2(a + r)} ${d} H${r2(c - r)} A${r} ${r} 0 0 0 ${c} ${r2(d - r)} V${r2(b + r)} A${r} ${r} 0 0 0 ${r2(c - r)} ${b} Z`
}

// The glass sheet's clip-path at scale s (px per capture px): the whole sheet minus the rounded map window
export function glassClip([vw, vh], s) {
  const hole = holePath(APP.railW * s, APP.headerH * s, vw * s, vh * s, APP.frameR * s)
  return `path("M0 0 H${r2(vw * s)} V${r2(vh * s)} H0 Z ${hole}")`
}

export const ringPath = (ring) => `M${ring.map(([x, y]) => `${r2(x)} ${r2(y)}`).join(' L')} Z`
