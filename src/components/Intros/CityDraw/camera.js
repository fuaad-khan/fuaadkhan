import { BEATS, EASE, lerp, seg } from './beats'
import { project } from './mercator'

// The capture CityDraw lands on until media.js carries the hero sidecar: City Hall as the Map My City capture opens (PLAN Appendix B2)
export const FALLBACK_TARGET = {
  view: { lat: 33.78227, lng: -116.95852, zoom: 20 },
  mapRect: [0, 88, 1440, 812],
  viewport: [1440, 900],
}

// The city fit while the beats play: the city limits centred in this share of the frame (the film's 1420 x 844 box in 1920 x 1080)
const FIT = { x: 0.13, y: 0.11, w: 0.74, h: 0.78 }
// Slow drift toward the landing point before the push (the film's 7 %)
const DRIFT = 1.07

const finite = (v) => typeof v === 'number' && Number.isFinite(v)

// Each field falls back on its own, so a partial sidecar still lands somewhere sensible
export function resolveTarget(target) {
  const v = target?.view
  const view = v && finite(v.lat) && finite(v.lng) ? { lat: v.lat, lng: v.lng, zoom: finite(v.zoom) ? v.zoom : FALLBACK_TARGET.view.zoom } : FALLBACK_TARGET.view
  const r = target?.mapRect
  const mapRect = Array.isArray(r) && r.length === 4 && r.every(finite) && r[2] > 0 && r[3] > 0 ? r : FALLBACK_TARGET.mapRect
  const p = target?.viewport
  const viewport = Array.isArray(p) && p.length === 2 && p.every((n) => finite(n) && n > 0) ? p : FALLBACK_TARGET.viewport
  return { view, mapRect, viewport }
}

// Camera that lands a Leaflet view on the frame, rounding the pixel origin as Leaflet does (port of intro.js:214-219); screen = s * p + (x, y)
export function restCamera(view, rect, rest, origin) {
  const k = Math.pow(2, view.zoom - 18)
  const P = project(view.lat, view.lng, view.zoom)
  const ox = Math.round(P[0] - rect[2] / 2)
  const oy = Math.round(P[1] - rect[3] / 2)
  return {
    s: rest.scale * k,
    x: rest.x + rest.scale * (rect[0] + origin[0] * k - ox),
    y: rest.y + rest.scale * (rect[1] + origin[1] * k - oy),
  }
}

// Camera that fits a bbox into a screen box (intro.js:221-225)
export function fitCamera(b, box) {
  const s = Math.min(box.w / (b[2] - b[0]), box.h / (b[3] - b[1]))
  return { s, x: box.x + box.w / 2 - (s * (b[0] + b[2])) / 2, y: box.y + box.h / 2 - (s * (b[1] + b[3])) / 2 }
}

// The intro camera for one frame size: the city fit with a slow drift, then a log-scale push that lands exactly on the capture's camera
export function createCamera(city, target, width, height) {
  const { view, mapRect, viewport } = resolveTarget(target)
  // The poster fills the frame with object-fit: cover from the top left, so capture px map to frame px by one scale
  const S = Math.max(width / viewport[0], height / viewport[1])
  const cam1 = restCamera(view, mapRect, { x: 0, y: 0, scale: S }, city.origin)
  const P = project(view.lat, view.lng, 18)
  const ax = P[0] - city.origin[0]
  const ay = P[1] - city.origin[1]
  const cam0 = fitCamera(city.boundaryBox, { x: FIT.x * width, y: FIT.y * height, w: FIT.w * width, h: FIT.h * height })
  // The landing point moves linearly in screen space while the scale moves geometrically (intro.js:810-817)
  const q0x = cam0.s * ax + cam0.x
  const q0y = cam0.s * ay + cam0.y
  const q1x = cam1.s * ax + cam1.x
  const q1y = cam1.s * ay + cam1.y
  const lam0 = Math.log(cam0.s)
  const lam1 = Math.log(cam1.s)
  const [p0, p1] = BEATS.push
  const drift = Math.log(DRIFT) / p0
  const lp = lam0 + drift * p0

  return {
    S,
    view,
    mapRect,
    viewport,
    cam0,
    cam1,
    // Writes the camera at t into out, without allocating
    at(t, out) {
      if (t >= p1) {
        out.s = cam1.s
        out.x = cam1.x
        out.y = cam1.y
        return out
      }
      let lam = lam0 + drift * t
      let qx = q0x
      let qy = q0y
      if (t > p0) {
        const u = seg(t, p0, p1)
        const e = EASE.inOutCubic(u)
        // The drift's momentum carries into the push so its start has no kink
        lam = lp + (lam1 - lp) * e + drift * (p1 - p0) * u * (1 - u) * (1 - u)
        qx = lerp(q0x, q1x, e)
        qy = lerp(q0y, q1y, e)
      }
      const s = Math.exp(lam)
      out.s = s
      out.x = qx - s * ax
      out.y = qy - s * ay
      return out
    },
  }
}
