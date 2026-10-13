// Derives CityDraw's data from the Map My City video studio data (PLAN §6.1): city.json, city.meta.json, the parcel rasters and the seal (--help for usage)
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { parseArgs } from 'node:util'
import { gzipSync } from 'node:zlib'
import { launch } from './lib/cdp.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

const USAGE = `Usage: node scripts/derive-city.mjs [options]

  --data <dir>          Map My City video/data folder (env MMC_VIDEO_DATA; default C:\\dev\\mapMyCity\\video\\data)
  --out <dir>           output folder (default src/assets/map-my-city)
  --seal <png>          seal master (env MMC_SEAL)
  --view lat,lng,zoom   the hero capture's view: precision, reveal and street growth centre here (default City Hall, 33.78227,-116.95852,20)
  --only <list>         json,raster,seal (default all three)
  --cdp-port <n>        DevTools port for the raster render (default 9373)
  --tmin <px> --k <n>   precision: max(tmin, distance / k) z18 px (defaults 0.35, 1000)
  --dry                 print city.json size and error only, write nothing

Env: FFMPEG (ffmpeg with libwebp), BROWSER (Chromium for the raster render)`

const { values: args } = parseArgs({
  options: {
    data: { type: 'string' },
    out: { type: 'string' },
    seal: { type: 'string' },
    view: { type: 'string' },
    'cdp-port': { type: 'string' },
    only: { type: 'string' },
    tmin: { type: 'string' },
    k: { type: 'string' },
    dry: { type: 'boolean' },
    help: { type: 'boolean' },
  },
})

if (args.help) {
  console.log(USAGE)
  process.exit(0)
}

const DATA = resolve(args.data ?? process.env.MMC_VIDEO_DATA ?? 'C:\\dev\\mapMyCity\\video\\data')
const OUT = resolve(ROOT, args.out ?? 'src/assets/map-my-city')
const SEAL_SRC = args.seal ?? process.env.MMC_SEAL ?? 'C:\\dev\\mapMyCity\\image\\San Jacinto 4 Quadrant Seal 2020 FINAL-COLOR.png'
const FFMPEG = process.env.FFMPEG ?? 'C:\\dev\\mapMyCity\\video\\node_modules\\@ffmpeg-installer\\win32-x64\\ffmpeg.exe'
const CDP_PORT = Number(args['cdp-port'] ?? 9373)
const ONLY = new Set((args.only ?? 'json,raster,seal').split(','))
// The match-cut target: City Hall, where the Map My City hero capture lands (PLAN Appendix B2); re-run with the sidecar view if it moves
const [VIEW_LAT, VIEW_LNG, VIEW_ZOOM] = (args.view ?? '33.78227,-116.95852,20').split(',').map(Number)

// Budgets from BRIEFS WP3 / PLAN §6.1, in bytes
const BUDGET = { cityGz: 12 * 1024, raster: 100 * 1024, raster1x: 35 * 1024, seal: 50 * 1024 }

// Precision in z18 px, graded by distance d from the anchor: the push shows far geometry only while zoomed out, so tolerance = max(tMin, d / k)
const T_MIN = Number(args.tmin ?? 0.35)
const K = Number(args.k ?? 1000)
// Share of a path's tolerance its grid rounding may use; Douglas-Peucker gets whatever the rounding leaves
const ROUND_SHARE = 0.3
const GRIDS = [4, 2, 1, 0.5, 0.25]
// The error check assumes a 1440 px frame (the capture viewport) landing at the target zoom
const CHECK = { width: 1440, height: 900 }
const CLASSES = [['Limited Access Highway', 'Highway'], ['Major', 'Major'], ['Arterial', 'Arterial'], ['Collector', 'Collector'], ['Local', 'Local']]

// Parcel raster: 1600 / 800 px wide, rings stroked once at 0.8 px in the parcel colour on black, composited additively by the painter
const RASTER = { width: 1600, width1x: 800, lineWidth: 0.8, color: '#9ec3e2', outsideAlpha: 0.34, margin: 0.15 }
// A transparent WebP is ~480 KB (Chromium keeps alpha lossless); lines on black quantised to 3 levels fit losslessly, lossy dimmer lines are the fallback
const ENCODINGS = [
  { levels: 3, intensity: 1, quality: 1 },
  { levels: 2, intensity: 1, quality: 1 },
  { intensity: 0.35, quality: 0.7 },
  { intensity: 0.35, quality: 0.6 },
  { intensity: 0.3, quality: 0.6 },
]
const encodingName = (e) => (e.quality === 1 ? `lossless ${e.levels} levels` : `lossy q${e.quality} intensity ${e.intensity}`)
const QUANTILES = 64

// Leaflet's EPSG:3857 projection to world px at zoom z (same as the video engine, intro.js:63-69)
function project(lat, lng, z) {
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

const readJson = (name) => JSON.parse(readFileSync(join(DATA, name), 'utf8'))

// Delta-coded integer paths at the file's zoom to absolute z18 world px (decoder of intro.js:77-85)
function decodeAbs(file, list) {
  const k = Math.pow(2, 18 - file.zoom)
  const [ox, oy] = file.origin
  return list.map((f) => {
    const a = new Float64Array(f.length)
    let x = 0
    let y = 0
    for (let i = 0; i < f.length; i += 2) {
      x += f[i]
      y += f[i + 1]
      a[i] = (x + ox) * k
      a[i + 1] = (y + oy) * k
    }
    return a
  })
}

function bboxOf(paths) {
  const b = [Infinity, Infinity, -Infinity, -Infinity]
  for (const p of paths) {
    for (let i = 0; i < p.length; i += 2) {
      if (p[i] < b[0]) b[0] = p[i]
      if (p[i + 1] < b[1]) b[1] = p[i + 1]
      if (p[i] > b[2]) b[2] = p[i]
      if (p[i + 1] > b[3]) b[3] = p[i + 1]
    }
  }
  return b
}

// Distance from point (px, py) to segment (ax, ay)-(bx, by)
function segDist(px, py, ax, ay, bx, by) {
  const dx = bx - ax
  const dy = by - ay
  const len2 = dx * dx + dy * dy
  const u = len2 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2)) : 0
  return Math.hypot(px - (ax + u * dx), py - (ay + u * dy))
}

function distToPolyline(p, x, y) {
  if (p.length < 4) return Math.hypot(p[0] - x, p[1] - y)
  let best = Infinity
  for (let i = 2; i < p.length; i += 2) best = Math.min(best, segDist(x, y, p[i - 2], p[i - 1], p[i], p[i + 1]))
  return best
}

// Douglas-Peucker where each vertex carries its own tolerance: a vertex is dropped only if it lies within its own tolerance
function simplifyRange(p, a, b, tolAt, keep) {
  const stack = [[a, b]]
  while (stack.length) {
    const [i0, i1] = stack.pop()
    let worst = -1
    let excess = 0
    for (let i = i0 + 1; i < i1; i++) {
      const e = segDist(p[2 * i], p[2 * i + 1], p[2 * i0], p[2 * i0 + 1], p[2 * i1], p[2 * i1 + 1]) - tolAt(i)
      if (e > excess) {
        excess = e
        worst = i
      }
    }
    if (worst > 0) {
      keep[worst] = 1
      stack.push([i0, worst], [worst, i1])
    }
  }
}

function simplify(p, tolAt, closed) {
  const n = p.length / 2
  const keep = new Uint8Array(n)
  keep[0] = 1
  keep[n - 1] = 1
  if (closed && n > 3) {
    // A ring splits at its vertex farthest from the first, so both halves simplify as open chains
    let far = 1
    let best = -1
    for (let i = 1; i < n; i++) {
      const d = Math.hypot(p[2 * i] - p[0], p[2 * i + 1] - p[1])
      if (d > best) {
        best = d
        far = i
      }
    }
    keep[far] = 1
    simplifyRange(p, 0, far, tolAt, keep)
    simplifyRange(p, far, n - 1, tolAt, keep)
  } else if (n > 2) {
    simplifyRange(p, 0, n - 1, tolAt, keep)
  }
  const out = []
  for (let i = 0; i < n; i++) if (keep[i]) out.push(p[2 * i], p[2 * i + 1])
  return out
}

// One path as [L, sx, sy, dx, dy, ...] in integers at zoom L (z18 px = value * 2^(18 - L)); its start is relative to the previous path's start
function encodePath(pts, grid, prev) {
  const level = 18 - Math.log2(grid)
  const out = [level]
  let px = 0
  let py = 0
  for (let i = 0; i < pts.length; i += 2) {
    const x = Math.round(pts[i] / grid)
    const y = Math.round(pts[i + 1] / grid)
    if (i > 0 && x === px && y === py) continue
    out.push(i === 0 ? x - Math.round(prev[0] / grid) : x - px, i === 0 ? y - Math.round(prev[1] / grid) : y - py)
    px = x
    py = y
  }
  return out.length >= 5 ? out : null
}

// Inverse of encodePath (the runtime decoder in CityDraw/mercator.js mirrors it); returns z18 px relative to the origin
function decodePath(path, prev) {
  const k = Math.pow(2, 18 - path[0])
  const out = []
  let x = path[1] + Math.round(prev[0] / k)
  let y = path[2] + Math.round(prev[1] / k)
  out.push(x * k, y * k)
  for (let i = 3; i < path.length; i += 2) {
    x += path[i]
    y += path[i + 1]
    out.push(x * k, y * k)
  }
  return out
}

// Greedy nearest-neighbour order over path starts, from the start nearest the anchor, so consecutive start deltas stay small
function spatialOrder(paths, anchor) {
  const left = paths.map((p, i) => i)
  const order = []
  let [cx, cy] = anchor
  while (left.length) {
    let best = 0
    let bd = Infinity
    for (let j = 0; j < left.length; j++) {
      const p = paths[left[j]]
      const d = (p[0] - cx) ** 2 + (p[1] - cy) ** 2
      if (d < bd) {
        bd = d
        best = j
      }
    }
    const i = left.splice(best, 1)[0]
    order.push(paths[i])
    ;[cx, cy] = paths[i]
  }
  return order
}

const kb = (n) => `${(n / 1024).toFixed(1)} KB`

function deriveJson() {
  const bj = readJson('boundary.json')
  const sj = readJson('streets.json')
  const pj = readJson('parcels.json')

  const boundaryAbs = decodeAbs(bj, bj.rings)
  const bAbs = bboxOf(boundaryAbs)
  const origin = [Math.floor(bAbs[0]), Math.floor(bAbs[1])]
  const rel = (paths) => paths.map((p) => p.map((v, i) => v - origin[i % 2]))
  const target = project(VIEW_LAT, VIEW_LNG, 18)
  const anchor = [target[0] - origin[0], target[1] - origin[1]]
  const tolAt = (d) => Math.max(T_MIN, d / K)
  const levels = {}
  // Worst screen error on a 1440 px frame: a point d from the anchor shows at most at the target scale, or where d spans the frame diagonal
  const finalScale = Math.pow(2, VIEW_ZOOM - 18)
  const diagonal = Math.hypot(CHECK.width, CHECK.height)
  const screenScaleAt = (d) => Math.min(finalScale, diagonal / Math.max(d, 1e-9))
  const worst = { px: 0, near: 0 }

  // A vertex is judged at the nearest point of its two segments to the anchor, so the tolerance never exceeds what that stretch allows
  const vertexTolerances = (p, closed, slack) => {
    const n = p.length / 2
    const out = new Float64Array(n)
    for (let i = 0; i < n; i++) {
      let d = Math.hypot(p[2 * i] - anchor[0], p[2 * i + 1] - anchor[1])
      const prev = i > 0 ? i - 1 : closed ? n - 1 : -1
      const next = i < n - 1 ? i + 1 : closed ? 0 : -1
      if (prev >= 0) d = Math.min(d, segDist(anchor[0], anchor[1], p[2 * prev], p[2 * prev + 1], p[2 * i], p[2 * i + 1]))
      if (next >= 0) d = Math.min(d, segDist(anchor[0], anchor[1], p[2 * i], p[2 * i + 1], p[2 * next], p[2 * next + 1]))
      out[i] = Math.max(0, tolAt(d) - slack)
    }
    return out
  }

  // Coarsest grid the path's nearest point allows (the source grid is lossless), then Douglas-Peucker with what the rounding leaves
  const encode = (pts, closed, sourceGrid, prev) => {
    const nearest = tolAt(distToPolyline(pts, anchor[0], anchor[1]))
    const grid = GRIDS.find((g) => g >= sourceGrid && (g === sourceGrid || (g * Math.SQRT2) / 2 <= ROUND_SHARE * nearest)) ?? sourceGrid
    const slack = grid > sourceGrid ? (grid * Math.SQRT2) / 2 : 0
    const tols = vertexTolerances(pts, closed, slack)
    const path = encodePath(simplify(pts, (i) => tols[i], closed), grid, prev)
    if (!path) return null
    levels[path[0]] = (levels[path[0]] ?? 0) + 1
    // Measured error of every source vertex against the encoded path, scaled to the largest screen size it can appear at
    const decoded = decodePath(path, prev)
    for (let i = 0; i < pts.length; i += 2) {
      const d = Math.hypot(pts[i] - anchor[0], pts[i + 1] - anchor[1])
      const e = distToPolyline(decoded, pts[i], pts[i + 1]) * screenScaleAt(d)
      if (e > worst.px) worst.px = e
      if (d * finalScale <= diagonal && e > worst.near) worst.near = e
    }
    prev[0] = decoded[0]
    prev[1] = decoded[1]
    return path
  }
  // Encodes one list (the boundary, or a street class) in spatial order; each list's first start is relative to the origin
  const encodeList = (paths, closed, sourceGrid) => {
    const prev = [0, 0]
    return spatialOrder(paths, anchor)
      .map((p) => encode(p, closed, sourceGrid, prev))
      .filter(Boolean)
  }

  const boundaryRel = rel(boundaryAbs)
  const boundary = encodeList(boundaryRel, true, Math.pow(2, 18 - bj.zoom))

  const streets = {}
  const streetCounts = {}
  for (const [source, name] of CLASSES) {
    // Each street starts at the end nearer the anchor, so the draw-on grows outward from City Hall
    const paths = rel(decodeAbs(sj, sj.classes[source] ?? [])).map((p) => {
      const n = p.length / 2
      const d0 = Math.hypot(p[0] - anchor[0], p[1] - anchor[1])
      const d1 = Math.hypot(p[2 * n - 2] - anchor[0], p[2 * n - 1] - anchor[1])
      if (d1 >= d0) return p
      const r = new Float64Array(p.length)
      for (let k = 0; k < n; k++) {
        r[2 * k] = p[2 * (n - 1 - k)]
        r[2 * k + 1] = p[2 * (n - 1 - k) + 1]
      }
      return r
    })
    streets[name] = encodeList(paths, false, Math.pow(2, 18 - sj.zoom))
    streetCounts[name] = streets[name].length
  }
  const dropped = Object.keys(sj.classes).filter((c) => !CLASSES.some(([s]) => s === c))

  // Parcel centroids (vertex means, as the film computes them) give the reveal's pacing quantiles and the counter
  const parcels = rel(decodeAbs(pj, pj.rings))
  const pBox = bboxOf(parcels)
  const dist = parcels
    .map((r) => {
      let x = 0
      let y = 0
      for (let i = 0; i < r.length; i += 2) {
        x += r[i]
        y += r[i + 1]
      }
      return Math.hypot((2 * x) / r.length - anchor[0], (2 * y) / r.length - anchor[1])
    })
    .sort((a, b) => a - b)
  const q = Array.from({ length: QUANTILES + 1 }, (_, i) => Math.round(dist[Math.round((i / QUANTILES) * (dist.length - 1))]))
  const corners = [[pBox[0], pBox[1]], [pBox[2], pBox[1]], [pBox[0], pBox[3]], [pBox[2], pBox[3]]]
  const rmax = Math.round(Math.max(...corners.map(([x, y]) => Math.hypot(x - anchor[0], y - anchor[1]))))

  // Raster extent: every parcel across, the city limits plus a margin down (the part a 16:10 city fit can show)
  const bRel = bboxOf(boundaryRel)
  const margin = RASTER.margin * (bRel[3] - bRel[1])
  const ext = [Math.floor(pBox[0]), Math.floor(Math.max(pBox[1], bRel[1] - margin)), Math.ceil(pBox[2]), Math.ceil(Math.min(pBox[3], bRel[3] + margin))]
  const extent = [ext[0], ext[1], ext[2] - ext[0], ext[3] - ext[1]]

  const city = {
    z: 18,
    o: origin,
    count: pj.features,
    anchor: anchor.map((v) => Math.round(v * 100) / 100),
    r: extent,
    ri: 1,
    q,
    rmax,
    b: boundary,
    s: streets,
  }

  const countPoints = (list) => list.reduce((s, p) => s + (p.length - 1) / 2, 0)
  return {
    city,
    parcels,
    boundaryRel,
    info: {
      fetched: String(pj.fetched ?? sj.fetched ?? bj.fetched ?? '').slice(0, 10),
      origin,
      anchor: city.anchor,
      boundaryBox: bRel.map((v) => Math.round(v)),
      parcelBox: pBox.map((v) => Math.round(v)),
      extent,
      rings: parcels.length,
      features: pj.features,
      streetCounts,
      dropped,
      levels,
      worst: { px: Math.round(worst.px * 100) / 100, near: Math.round(worst.near * 100) / 100 },
      points: {
        boundary: countPoints(boundary),
        sourceBoundary: bj.rings.reduce((s, p) => s + p.length / 2, 0),
        streets: countPoints(Object.values(streets).flat()),
        sourceStreets: CLASSES.reduce((s, [c]) => s + (sj.classes[c] ?? []).reduce((t, p) => t + p.length / 2, 0), 0),
      },
    },
  }
}

// Renders both parcel rasters in headless Chrome from scripts/city/raster.html, walking ENCODINGS until the budgets hold
async function deriveRaster(derived) {
  const { parcels, boundaryRel, info } = derived
  const [x0, y0, w, h] = info.extent
  const shift = (paths, digits) => paths.map((p) => Array.from(p, (v, i) => Number((v - (i % 2 ? y0 : x0)).toFixed(digits))))
  const rings = shift(parcels, 0)
  const boundary = shift(boundaryRel, 2)
  const session = await launch({ port: CDP_PORT, width: 1200, height: 800 })
  try {
    await session.navigate(pathToFileURL(join(ROOT, 'scripts/city/raster.html')).href)
    await session.waitFor('document.documentElement.dataset.ready === "1"')
    const render = async (width, encoding) => {
      const scale = width / w
      const height = Math.round(h * scale)
      const job = { width, height, scale, rings, boundary, color: RASTER.color, lineWidth: RASTER.lineWidth, outsideAlpha: RASTER.outsideAlpha, ...encoding }
      const url = await session.evaluate((j) => globalThis.renderParcels(j), job)
      if (!url.startsWith('data:image/webp')) throw new Error('This browser cannot encode WebP from a canvas')
      return { width, height, scale, encoding, bytes: Buffer.from(url.slice(url.indexOf(',') + 1), 'base64') }
    }
    const pick = async (width, budget, ladder, name) => {
      for (const encoding of ladder) {
        const r = await render(width, encoding)
        console.log(`  ${name.padEnd(21)} ${encodingName(encoding).padEnd(26)} ${kb(r.bytes.length)}`)
        if (r.bytes.length <= budget) return r
      }
      throw new Error(`${name} stays over ${kb(budget)} at every encoding`)
    }
    const x2 = await pick(RASTER.width, BUDGET.raster, ENCODINGS, 'parcels-city.webp')
    // The 1x file starts from the 2x file's encoding, so both look alike under the painter's single intensity
    const x1 = await pick(RASTER.width1x, BUDGET.raster1x, ENCODINGS.slice(ENCODINGS.indexOf(x2.encoding)), 'parcels-city@1x.webp')
    if (x1.encoding.intensity !== x2.encoding.intensity) throw new Error('parcels-city@1x.webp needs a different intensity than the 2x file')
    writeFileSync(join(OUT, 'parcels-city.webp'), x2.bytes)
    writeFileSync(join(OUT, 'parcels-city@1x.webp'), x1.bytes)
    return { x2, x1 }
  } finally {
    await session.close()
  }
}

// The seal master at 400 px with its alpha kept, encoded by the studio's bundled ffmpeg
function deriveSeal() {
  if (!existsSync(SEAL_SRC)) throw new Error(`Seal master not found: ${SEAL_SRC}`)
  if (!existsSync(FFMPEG)) throw new Error(`ffmpeg not found: ${FFMPEG} (set env FFMPEG)`)
  const tmp = mkdtempSync(join(tmpdir(), 'seal-'))
  try {
    for (const quality of [85, 80, 75, 70]) {
      const file = join(tmp, `seal-${quality}.webp`)
      execFileSync(FFMPEG, ['-hide_banner', '-loglevel', 'error', '-y', '-i', SEAL_SRC, '-vf', 'scale=400:400:flags=lanczos', '-pix_fmt', 'yuva420p', '-c:v', 'libwebp', '-quality', String(quality), '-compression_level', '6', file])
      const bytes = readFileSync(file)
      if (bytes.length <= BUDGET.seal) {
        writeFileSync(join(OUT, 'seal.webp'), bytes)
        return { size: 400, quality, bytes: bytes.length }
      }
    }
    throw new Error(`seal.webp stays over ${kb(BUDGET.seal)}`)
  } finally {
    rmSync(tmp, { recursive: true, force: true })
  }
}

const fileOrNull = (file) => (existsSync(file) ? readFileSync(file) : null)

async function main() {
  const derived = deriveJson()
  const { city, info } = derived
  const json = JSON.stringify(city)
  console.log(`city.json ${kb(json.length)} raw, ${kb(gzipSync(json, { level: 9 }).length)} gz · tMin ${T_MIN} k ${K} · grids ${JSON.stringify(info.levels)}`)
  console.log(`screen error on a ${CHECK.width} px frame: ≤ ${info.worst.near} px inside the final view, ≤ ${info.worst.px} px anywhere during the push`)
  if (args.dry) return

  mkdirSync(OUT, { recursive: true })
  const metaFile = join(OUT, 'city.meta.json')
  const previous = existsSync(metaFile) ? JSON.parse(readFileSync(metaFile, 'utf8')) : {}
  const raster = ONLY.has('raster') ? await deriveRaster(derived) : null
  const seal = ONLY.has('seal') ? deriveSeal() : null
  const rasterMeta = raster
    ? {
        files: { x2: 'parcels-city.webp', x1: 'parcels-city@1x.webp' },
        extent: info.extent,
        scale: Number(raster.x2.scale.toFixed(6)),
        width: raster.x2.width,
        height: raster.x2.height,
        encoding: encodingName(raster.x2.encoding),
        x1: { width: raster.x1.width, height: raster.x1.height, encoding: encodingName(raster.x1.encoding) },
        lineWidth: RASTER.lineWidth,
        color: RASTER.color,
        background: '#000000, composited additively (lighter) by CityDraw',
        intensity: raster.x2.encoding.intensity,
        outsideAlpha: RASTER.outsideAlpha,
      }
    : previous.raster
  // The painter divides its parcel alpha by the baked line intensity, so a dimmer fallback encoding still lands on the same look
  city.ri = rasterMeta?.intensity ?? 1
  if (ONLY.has('json') || raster) writeFileSync(join(OUT, 'city.json'), JSON.stringify(city))

  const meta = {
    generatedBy: 'scripts/derive-city.mjs',
    source: {
      data: 'Map My City video studio data (video/data: boundary.json, streets.json, parcels.json)',
      publisher: 'City of San Jacinto GIS: public city limits, road centerline classification and parcel layers',
      fetched: info.fetched,
    },
    units: 'EPSG:3857 (Leaflet) world px at zoom 18, relative to origin',
    origin: info.origin,
    anchor: { at: info.anchor, view: { lat: VIEW_LAT, lng: VIEW_LNG, zoom: VIEW_ZOOM }, note: "City Hall: the hero capture's map centre; the reveal, the street growth and the precision grading centre here" },
    bbox: { boundary: info.boundaryBox, parcels: info.parcelBox },
    raster: rasterMeta,
    parcelCount: info.features,
    rings: info.rings,
    streets: { classes: info.streetCounts, dropped: info.dropped },
    precision: {
      rule: 'per vertex, max(tMin, distance from the anchor / k) z18 px; each path takes the coarsest grid its nearest point allows (roundShare of the tolerance, or the lossless source grid) and Douglas-Peucker uses the rest',
      tMin: T_MIN,
      k: K,
      roundShare: ROUND_SHARE,
      pathsPerLevel: info.levels,
      points: info.points,
      measuredScreenErrorPx: { frame: `${CHECK.width}x${CHECK.height}`, insideFinalView: info.worst.near, anywhereDuringPush: info.worst.px },
    },
    encoding: 'b (boundary rings) and s.<class> (street paths) are lists of [L, sx, sy, dx, dy, ...]: integers at zoom L, so z18 px = value * 2^(18 - L) relative to o; the start (sx, sy) is relative to round(previous start / 2^(18 - L)) in the same list (the origin for the first), later points are deltas; streets run outward from the anchor; q = parcel-centroid distances from the anchor at 64 even quantiles; r = raster extent [x, y, w, h]; ri = line intensity baked into the raster (lines on black, added with lighter); rmax = farthest parcel-box corner',
    seal: seal ? { file: 'seal.webp', size: seal.size, quality: seal.quality } : previous.seal,
  }
  writeFileSync(metaFile, `${JSON.stringify(meta, null, 2)}\n`)

  // Size table and budget check over whatever is on disk now
  const rows = [
    ['city.json', fileOrNull(join(OUT, 'city.json')), BUDGET.cityGz, true],
    ['city.meta.json', fileOrNull(metaFile), null, true],
    ['parcels-city.webp', fileOrNull(join(OUT, 'parcels-city.webp')), BUDGET.raster, false],
    ['parcels-city@1x.webp', fileOrNull(join(OUT, 'parcels-city@1x.webp')), BUDGET.raster1x, false],
    ['seal.webp', fileOrNull(join(OUT, 'seal.webp')), BUDGET.seal, false],
  ]
  let over = false
  console.log(`\n${relative(ROOT, OUT)}`)
  console.log('file                      bytes     gzip  budget')
  for (const [name, buf, budget, text] of rows) {
    if (!buf) {
      console.log(`${name.padEnd(22)}  missing`)
      over = true
      continue
    }
    const gz = text ? gzipSync(buf, { level: 9 }).length : null
    const measured = text ? gz : buf.length
    const fail = budget != null && measured > budget
    over ||= fail
    console.log(`${name.padEnd(22)} ${String(buf.length).padStart(7)}  ${gz == null ? '      -' : String(gz).padStart(7)}  ${budget == null ? '' : `${fail ? 'OVER ' : 'ok   '}${kb(budget)}${text ? ' gz' : ''}`}`)
  }
  console.log(`\nstreets: ${info.points.streets} of ${info.points.sourceStreets} source points kept; boundary ${info.points.boundary} of ${info.points.sourceBoundary}`)
  if (over) {
    console.error('Budget check failed')
    process.exitCode = 1
  }
}

main().catch((err) => {
  console.error(err.stack ?? String(err))
  process.exitCode = 1
})
