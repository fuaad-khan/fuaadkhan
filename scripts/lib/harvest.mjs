// Overlay harvest for the intros (CONTRACTS §9): camera and rects, layer geometry projected to capture-viewport CSS px, SVG path data through the pane transforms
// All helpers call the in-page library from scripts/capture/page/hooks.js (window.__wp6), installed before the app's own scripts

const round = (v) => Math.round(v * 10) / 10

// { view: { lat, lng, zoom }, mapRect: [x, y, w, h], viewport: [w, h] } of the app's main map
export async function mapState(page) {
  const state = await page.evaluate('window.__wp6.mapState()')
  if (!state) throw new Error('No Leaflet map found on the page')
  return state
}

// Every vector layer and marker on the map: { type, pane, className, color, dashArray, rings | latlng, radius }
export const layers = (page) => page.evaluate('window.__wp6.layers()')

// [[lat, lng], ...] (or one pair) to viewport px with the live camera
export const project = (page, latlngs) => page.evaluate(`window.__wp6.project(${JSON.stringify(latlngs)})`)

// Absolute SVG path data for a list of [x, y] points
export function pathD(pts, closed = true) {
  if (!pts.length) return ''
  const body = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${round(x)} ${round(y)}`).join('')
  return closed ? `${body}Z` : body
}

// Area-weighted centroid of a ring of [x, y] points (falls back to the vertex mean for a degenerate ring)
export function centroid(pts) {
  let a = 0
  let cx = 0
  let cy = 0
  for (let i = 0; i < pts.length; i++) {
    const [x0, y0] = pts[i]
    const [x1, y1] = pts[(i + 1) % pts.length]
    const f = x0 * y1 - x1 * y0
    a += f
    cx += (x0 + x1) * f
    cy += (y0 + y1) * f
  }
  if (Math.abs(a) < 1e-6) {
    const n = pts.length || 1
    return [round(pts.reduce((s, p) => s + p[0], 0) / n), round(pts.reduce((s, p) => s + p[1], 0) / n)]
  }
  return [round(cx / (3 * a)), round(cy / (3 * a))]
}

// Projects lat/lng rings to viewport px and returns { d, pts } (pts without the repeated first vertex)
export async function ringShape(page, rings) {
  const out = []
  for (const ring of rings) {
    const open = ring.length > 1 && ring[0][0] === ring.at(-1)[0] && ring[0][1] === ring.at(-1)[1] ? ring.slice(0, -1) : ring
    out.push(await project(page, open))
  }
  return { d: out.map((pts) => pathD(pts, true)).join(''), pts: out[0] ?? [] }
}

// SVG paths matching a selector as absolute path data in viewport px, through each path's screen CTM (pane transforms included)
export const svgPaths = (page, selector) => page.evaluate(`window.__wp6.paths(${JSON.stringify(selector)})`)

// Named element rects ({ name: selector }) as [x, y, w, h] in viewport px; absent elements map to null
export async function rects(page, named) {
  const out = {}
  for (const [name, selector] of Object.entries(named)) out[name] = await page.evaluate(`window.__wp6.rect(${JSON.stringify(selector)})`)
  return out
}
