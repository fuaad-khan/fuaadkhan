// Leaflet's EPSG:3857 projection to world px at zoom z (port of video/compose/scenes/intro.js:62-69)
export function project(lat, lng, z) {
  const R = 6378137
  const d = Math.PI / 180
  const max = 85.0511287798
  const la = Math.max(Math.min(max, lat), -max)
  const s = Math.sin(la * d)
  const x = R * lng * d
  const y = (R * Math.log((1 + s) / (1 - s))) / 2
  const k = 0.5 / (Math.PI * R)
  const w = 256 * Math.pow(2, z)
  return [w * (k * x + 0.5), w * (-k * y + 0.5)]
}

const STREET_CLASSES = ['Highway', 'Major', 'Arterial', 'Collector', 'Local']

// Adds cumulative lengths so a path can be drawn on progressively (intro.js:87-92)
function polyline(pts) {
  const n = pts.length / 2
  const cum = new Float32Array(n)
  for (let i = 1; i < n; i++) cum[i] = cum[i - 1] + Math.hypot(pts[2 * i] - pts[2 * i - 2], pts[2 * i + 1] - pts[2 * i - 1])
  return { pts, cum, len: cum[n - 1] }
}

// One city.json list of [L, sx, sy, dx, dy, ...]: integers at zoom L, each start relative to the previous one (mirrors scripts/derive-city.mjs)
function decodeList(list) {
  let px = 0
  let py = 0
  return list.map((path) => {
    const k = Math.pow(2, 18 - path[0])
    const n = (path.length - 1) / 2
    const pts = new Float32Array(2 * n)
    let x = path[1] + Math.round(px / k)
    let y = path[2] + Math.round(py / k)
    px = x * k
    py = y * k
    pts[0] = px
    pts[1] = py
    for (let i = 1; i < n; i++) {
      x += path[2 * i + 1]
      y += path[2 * i + 2]
      pts[2 * i] = x * k
      pts[2 * i + 1] = y * k
    }
    return polyline(pts)
  })
}

function bboxOf(lines) {
  const b = [Infinity, Infinity, -Infinity, -Infinity]
  for (const { pts } of lines) {
    for (let i = 0; i < pts.length; i += 2) {
      if (pts[i] < b[0]) b[0] = pts[i]
      if (pts[i + 1] < b[1]) b[1] = pts[i + 1]
      if (pts[i] > b[2]) b[2] = pts[i]
      if (pts[i + 1] > b[3]) b[3] = pts[i + 1]
    }
  }
  return b
}

// city.json -> typed geometry in z18 px relative to its origin, plus one Path2D for the whole city limits
export function decodeCity(json) {
  if (!json || json.z !== 18 || !Array.isArray(json.o) || !Array.isArray(json.b) || !json.s || !Array.isArray(json.q)) {
    throw new Error('city.json has an unexpected format')
  }
  const boundary = decodeList(json.b)
  const boundaryPath = new Path2D()
  for (const { pts } of boundary) {
    boundaryPath.moveTo(pts[0], pts[1])
    for (let i = 2; i < pts.length; i += 2) boundaryPath.lineTo(pts[i], pts[i + 1])
    boundaryPath.closePath()
  }
  const streets = {}
  for (const name of STREET_CLASSES) streets[name] = decodeList(json.s[name] ?? [])
  return {
    origin: json.o,
    count: json.count,
    anchor: json.anchor,
    extent: json.r,
    intensity: json.ri > 0 ? json.ri : 1,
    quantiles: json.q,
    rmax: json.rmax,
    boundary,
    boundaryPath,
    boundaryBox: bboxOf(boundary),
    streets,
  }
}
