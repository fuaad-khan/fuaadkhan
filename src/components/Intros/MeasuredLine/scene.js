import { introValues } from '../values'

// The demo world mirrors Green Check at 1600×1000: header 88 px, nav rail 232 px, result column 420 px (greenCheck.css:42-83)
export const DEMO_VIEWPORT = [1600, 1000]
export const DEMO_MAP_RECT = [250, 172, 914, 812]
export const HEADER_H = 88
export const COLUMN_W = 420

// Demo scale (about zoom 20): 2 px per foot, so each drawn line is as long as the feet it reports
const PX_PER_FT = 2
// Both demo lines start on the subject building's east wall
const WALL = [640, 525]
// Separation the residence rule requires; it only sizes the demo exclusion zone and is never printed
const REQUIRED_FT = 100

// Text-heavy views aim for these on-screen scales (CSS px per capture px); bigger frames never zoom past 1
export const MAP_SCALE = 0.8
export const CARD_SCALE = 0.9

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v))
export const lerp = (a, b, f) => a + (b - a) * f
export const lerpPoint = (p, q, f) => [lerp(p[0], q[0], f), lerp(p[1], q[1], f)]
export const linePath = (a, b) => `M${a[0]} ${a[1]}L${b[0]} ${b[1]}`

// Rectangle outward-buffered by r: what a turf buffer of a rectangular lot looks like
function bufferedRect([x, y, w, h], r) {
  return `M${x} ${y - r}H${x + w}A${r} ${r} 0 0 1 ${x + w + r} ${y}V${y + h}A${r} ${r} 0 0 1 ${x + w} ${y + h + r}H${x}A${r} ${r} 0 0 1 ${x - r} ${y + h}V${y}A${r} ${r} 0 0 1 ${x} ${y - r}Z`
}

// Demo set for 438 S State St: subject parcel and building west of State St, the residential lot east of it, both lines along one row
export function demoGeometry(values) {
  const auto = clamp(Number(values.auto) || 95, 60, 130)
  const hand = clamp(Number(values.hand) || auto, auto - 20, auto + 20)
  const lotX = WALL[0] + auto * PX_PER_FT
  const fenceX = WALL[0] + hand * PX_PER_FT
  const lot = [lotX, 470, 200, 140]
  return {
    parcel: { d: 'M362 401L660 400L660 640L362 641Z' },
    footprint: { d: 'M470 440H640V590H540V566H470Z' },
    neighbour: { d: `M${lot[0]} ${lot[1]}H${lot[0] + lot[2]}V${lot[1] + lot[3]}H${lot[0]}Z` },
    ring: { d: bufferedRect(lot, REQUIRED_FT * PX_PER_FT) },
    pin: [511, 520],
    auto: { a: WALL, b: [lotX, WALL[1]] },
    hand: { a: WALL, b: [fenceX, WALL[1]] },
    lotX,
    fenceX,
  }
}

// Vertices of an absolute M/L/Z path, the shape Leaflet writes for polygons
function pointsOf(d) {
  const nums = String(d ?? '').match(/-?\d*\.?\d+(?:e[-+]?\d+)?/gi)?.map(Number) ?? []
  const pts = []
  for (let i = 0; i + 1 < nums.length; i += 2) pts.push([nums[i], nums[i + 1]])
  return pts
}

// Area-weighted centroid of a ring, or the vertex average when the ring is degenerate
function centroid(d) {
  const pts = pointsOf(d)
  if (!pts.length) return [0, 0]
  let a = 0
  let cx = 0
  let cy = 0
  pts.forEach(([x0, y0], i) => {
    const [x1, y1] = pts[(i + 1) % pts.length]
    const k = x0 * y1 - x1 * y0
    a += k
    cx += (x0 + x1) * k
    cy += (y0 + y1) * k
  })
  if (Math.abs(a) < 1e-6) return pts.reduce((s, p) => [s[0] + p[0] / pts.length, s[1] + p[1] / pts.length], [0, 0])
  return [cx / (3 * a), cy / (3 * a)]
}

// Everything the intro draws: the capture sidecar over its base still when both exist, else the demo set over the built-in replica
export function sceneFor(app, media, target) {
  const values = introValues(app, media)
  const intro = media?.hero?.intro
  const poster = media?.base?.poster
  const still = poster?.x2 ?? poster?.x1
  if (still && intro?.parcel?.d && intro?.auto?.a && intro?.auto?.b) {
    const viewport = media.hero.viewport ?? target?.viewport ?? [media.base.width, media.base.height]
    return {
      real: true,
      still,
      viewport,
      mapRect: media.hero.mapRect ?? target?.mapRect ?? [0, HEADER_H, viewport[0] - COLUMN_W, viewport[1] - HEADER_H],
      values,
      geo: {
        parcel: intro.parcel,
        footprint: intro.footprint ?? null,
        neighbour: intro.neighbour ?? null,
        ring: intro.ring ?? null,
        pin: intro.pin ?? centroid(intro.parcel.d),
        auto: intro.auto,
        hand: intro.hand ?? intro.auto,
      },
    }
  }
  return { real: false, still: null, viewport: DEMO_VIEWPORT, mapRect: DEMO_MAP_RECT, values, geo: demoGeometry(values) }
}

// The visible part of the world for one region of interest: zoomed in only as far as legibility needs and the region allows
export function viewFor(roi, W, H, vw, vh) {
  const s0 = Math.max(W / vw, H / vh)
  const w0 = W / s0
  const h0 = H / s0
  if (!roi) return { x: 0, y: 0, w: w0, h: h0 }
  const fit = Math.min(W / (roi.w * s0), H / (roi.h * s0))
  const want = roi.scale / s0
  let zoom = Math.max(1, Math.min(want, fit))
  // A region inside a container (the map card) that needs any zoom at all zooms far enough to stay inside it, so no chrome is sliced
  const box = want > 1 ? roi.within : null
  if (box) zoom = Math.max(1, Math.min(fit, Math.max(want, W / (box[2] * s0), H / (box[3] * s0))))
  const w = w0 / zoom
  const h = h0 / zoom
  // A region may name the view top it prefers (a clean edge between UI parts), taken only when the whole region still fits under it
  const anchored = roi.top != null && roi.top <= roi.y && roi.top + h >= roi.y + roi.h
  let x = roi.x + roi.w / 2 - w / 2
  let y = anchored ? roi.top : roi.y + roi.h / 2 - h / 2
  if (box && w <= box[2]) x = clamp(x, box[0], box[0] + box[2] - w)
  if (box && h <= box[3]) y = clamp(y, box[1], box[1] + box[3] - h)
  return { x: clamp(x, 0, vw - w), y: clamp(y, 0, vh - h), w, h }
}

// On-screen scale (CSS px per world px) a region gets in this frame, so a caller can fall back to a tighter one
export function reach(roi, W, H, vw, vh) {
  const s0 = Math.max(W / vw, H / vh)
  if (!roi) return s0
  const fit = Math.min(W / (roi.w * s0), H / (roi.h * s0))
  return s0 * Math.max(1, Math.min(roi.scale / s0, fit))
}

// Between two views: width eases geometrically, the centre linearly, so the frame never leaves the world
export function blendViews(A, B, f) {
  if (f <= 0) return A
  if (f >= 1) return B
  const w = A.w * Math.pow(B.w / A.w, f)
  const h = w * (A.h / A.w)
  const cx = lerp(A.x + A.w / 2, B.x + B.w / 2, f)
  const cy = lerp(A.y + A.h / 2, B.y + B.h / 2, f)
  return { x: cx - w / 2, y: cy - h / 2, w, h }
}

// A CSS cubic-bezier() as a GSAP ease, so the app's own timing curves carry over
export function cubicBezier(x1, y1, x2, y2) {
  const cx = 3 * x1
  const bx = 3 * (x2 - x1) - cx
  const ax = 1 - cx - bx
  const cy = 3 * y1
  const by = 3 * (y2 - y1) - cy
  const ay = 1 - cy - by
  const x = (u) => ((ax * u + bx) * u + cx) * u
  const y = (u) => ((ay * u + by) * u + cy) * u
  const dx = (u) => (3 * ax * u + 2 * bx) * u + cx
  return (p) => {
    if (p <= 0) return 0
    if (p >= 1) return 1
    let u = p
    for (let i = 0; i < 8; i++) {
      const err = x(u) - p
      const slope = dx(u)
      if (Math.abs(err) < 1e-6 || Math.abs(slope) < 1e-6) break
      u -= err / slope
    }
    // Bisection when Newton's steps stalled or left the unit interval
    if (u < 0 || u > 1 || Math.abs(x(u) - p) > 1e-4) {
      let lo = 0
      let hi = 1
      u = p
      for (let i = 0; i < 30; i++) {
        if (x(u) < p) lo = u
        else hi = u
        u = (lo + hi) / 2
      }
    }
    return y(u)
  }
}

// Box of an element in world px, from layout offsets (unaffected by the camera transform or tweens)
export function worldBox(el, world) {
  let x = 0
  let y = 0
  let node = el
  while (node && node !== world) {
    x += node.offsetLeft
    y += node.offsetTop
    node = node.offsetParent
  }
  return { x, y, w: el.offsetWidth, h: el.offsetHeight }
}

// Green Check's banner clip (src/ui/Banner.jsx slantPath): the bottom edge slants up to the right, every corner rounded
export function slantPath(w, h, r = 12, drop = 0.16) {
  const yR = h * (1 - drop)
  const len = Math.hypot(-w, h - yR)
  const ux = -w / len
  const uy = (h - yR) / len
  const tBR = r / Math.tan(Math.acos(-uy) / 2)
  const tBL = r / Math.tan(Math.acos(uy) / 2)
  const n = (v) => Math.round(v * 100) / 100
  return (
    `M${r},0 H${n(w - r)} Q${w},0 ${w},${r} V${n(yR - tBR)} Q${w},${n(yR)} ${n(w + ux * tBR)},${n(yR + uy * tBR)} ` +
    `L${n(-ux * tBL)},${n(h - uy * tBL)} Q0,${h} 0,${n(h - tBL)} V${r} Q0,0 ${r},0 Z`
  )
}
