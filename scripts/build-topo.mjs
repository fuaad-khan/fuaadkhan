// Generates src/assets/topo-redlands.svg: contour lines for Redlands, CA from AWS Terrain Tiles
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { PNG } from 'pngjs'
import { contours } from 'd3-contour'
import { blur2 } from 'd3-array'

// Redlands plus Crafton Hills, the San Bernardino foothills, and San Timoteo Canyon
const BBOX = { west: -117.25, south: 33.95, east: -117.13, north: 34.17 }
const Z = 13
const INTERVAL = 20
const INDEX_EVERY = 5
const PAD = 16
const BLUR = 2
const TOLERANCE = 1.2
const MIN_RING = 24
const MAX_BYTES = 220_000
const OUT = resolve(dirname(fileURLToPath(import.meta.url)), '../src/assets/topo-redlands.svg')

const TILE = 256
const tileUrl = (x, y) => `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${Z}/${x}/${y}.png`

const lon2px = (lon) => ((lon + 180) / 360) * TILE * 2 ** Z
const lat2px = (lat) => {
  const s = Math.sin((lat * Math.PI) / 180)
  return (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * TILE * 2 ** Z
}

// Pixel rect of the bbox, padded so frame-closing artifacts land outside the viewBox
const x0 = Math.round(lon2px(BBOX.west))
const x1 = Math.round(lon2px(BBOX.east))
const y0 = Math.round(lat2px(BBOX.north))
const y1 = Math.round(lat2px(BBOX.south))
const W = x1 - x0
const H = y1 - y0
const cw = W + 2 * PAD
const ch = H + 2 * PAD
const px0 = x0 - PAD
const py0 = y0 - PAD
const tx0 = Math.floor(px0 / TILE)
const tx1 = Math.floor((px0 + cw - 1) / TILE)
const ty0 = Math.floor(py0 / TILE)
const ty1 = Math.floor((py0 + ch - 1) / TILE)

async function fetchTile(x, y, attempt = 0) {
  const res = await fetch(tileUrl(x, y))
  if (!res.ok) {
    if (attempt < 2) {
      await new Promise((r) => setTimeout(r, 600 * (attempt + 1)))
      return fetchTile(x, y, attempt + 1)
    }
    throw new Error(`Tile ${Z}/${x}/${y} failed: HTTP ${res.status}`)
  }
  return PNG.sync.read(Buffer.from(await res.arrayBuffer()))
}

async function fetchAll(coords, concurrency = 4) {
  const out = new Array(coords.length)
  let next = 0
  const worker = async () => {
    while (next < coords.length) {
      const i = next++
      out[i] = await fetchTile(...coords[i])
    }
  }
  await Promise.all(Array.from({ length: concurrency }, worker))
  return out
}

// Iterative Douglas–Peucker; rings can be thousands of points deep
function simplify(pts, tol2) {
  const keep = new Uint8Array(pts.length)
  keep[0] = 1
  keep[pts.length - 1] = 1
  const stack = [[0, pts.length - 1]]
  while (stack.length) {
    const [a, b] = stack.pop()
    const [ax, ay] = pts[a]
    const [bx, by] = pts[b]
    const dx = bx - ax
    const dy = by - ay
    const len2 = dx * dx + dy * dy
    let maxD = 0
    let idx = -1
    for (let i = a + 1; i < b; i++) {
      const [px, py] = pts[i]
      let d
      if (len2 === 0) {
        d = (px - ax) ** 2 + (py - ay) ** 2
      } else {
        const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2))
        d = (px - (ax + t * dx)) ** 2 + (py - (ay + t * dy)) ** 2
      }
      if (d > maxD) {
        maxD = d
        idx = i
      }
    }
    if (maxD > tol2) {
      keep[idx] = 1
      stack.push([a, idx], [idx, b])
    }
  }
  return pts.filter((_, i) => keep[i])
}

const fmt = (v) => v.toFixed(1).replace(/\.0$/, '')

// Ring in padded grid coords → "M x y L x y … Z" in viewBox coords; null when it should be dropped
function ringToPath(ring) {
  let perim = 0
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (let i = 0; i < ring.length; i++) {
    const [x, y] = ring[i]
    if (i) perim += Math.hypot(x - ring[i - 1][0], y - ring[i - 1][1])
    if (x < minX) minX = x
    if (x > maxX) maxX = x
    if (y < minY) minY = y
    if (y > maxY) maxY = y
  }
  if (perim < MIN_RING) return null
  if (maxX < PAD || minX > PAD + W || maxY < PAD || minY > PAD + H) return null
  const pts = simplify(ring, TOLERANCE * TOLERANCE)
  if (pts.length < 4) return null
  // Last point repeats the first; Z closes the ring
  const body = pts.slice(0, -1).map(([x, y]) => `${fmt(x - PAD)} ${fmt(y - PAD)}`)
  return { d: `M${body[0]}L${body.slice(1).join(' ')}Z`, n: body.length }
}

const coords = []
for (let ty = ty0; ty <= ty1; ty++) for (let tx = tx0; tx <= tx1; tx++) coords.push([tx, ty])
console.log(`Fetching ${coords.length} tiles (x ${tx0}–${tx1}, y ${ty0}–${ty1}) at z${Z}…`)
const tiles = await fetchAll(coords)

const gw = (tx1 - tx0 + 1) * TILE
const gh = (ty1 - ty0 + 1) * TILE
const grid = new Float32Array(gw * gh)
tiles.forEach((png, i) => {
  const [tx, ty] = coords[i]
  const ox = (tx - tx0) * TILE
  const oy = (ty - ty0) * TILE
  for (let row = 0; row < TILE; row++) {
    for (let col = 0; col < TILE; col++) {
      const p = (row * TILE + col) * 4
      grid[(oy + row) * gw + ox + col] = png.data[p] * 256 + png.data[p + 1] + png.data[p + 2] / 256 - 32768
    }
  }
})

// Crop the padded rect out of the stitched tiles
const sub = new Float32Array(cw * ch)
const cx = px0 - tx0 * TILE
const cy = py0 - ty0 * TILE
for (let row = 0; row < ch; row++) {
  const start = (cy + row) * gw + cx
  sub.set(grid.subarray(start, start + cw), row * cw)
}
blur2({ data: sub, width: cw, height: ch }, BLUR)

let min = Infinity
let max = -Infinity
for (const v of sub) {
  if (v < min) min = v
  if (v > max) max = v
}
const levels = []
for (let t = Math.ceil(min / INTERVAL) * INTERVAL; t <= max; t += INTERVAL) levels.push(t)

const features = contours().size([cw, ch]).thresholds(levels)(sub)

const minor = []
const index = []
let rings = 0
let vertices = 0
for (const f of features) {
  const isIndex = Math.round(f.value / INTERVAL) % INDEX_EVERY === 0
  for (const polygon of f.coordinates) {
    for (const ring of polygon) {
      rings++
      const r = ringToPath(ring)
      if (!r) continue
      vertices += r.n
      ;(isIndex ? index : minor).push(r.d)
    }
  }
}

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" fill="none" stroke="#000" stroke-linejoin="round" stroke-linecap="round">
<metadata>${INTERVAL} m contours, Redlands CA (${BBOX.west},${BBOX.south} to ${BBOX.east},${BBOX.north}). Elevation: Mapzen Terrain Tiles via AWS Open Data; sources include USGS 3DEP and SRTM. Generated by scripts/build-topo.mjs.</metadata>
<path vector-effect="non-scaling-stroke" stroke-width="1" stroke-opacity="0.72" d="${minor.join('')}"/>
<path vector-effect="non-scaling-stroke" stroke-width="1.6" d="${index.join('')}"/>
</svg>
`

const bytes = Buffer.byteLength(svg)
console.log(`Elevation ${min.toFixed(0)}–${max.toFixed(0)} m · ${levels.length} levels · rings ${rings} → ${minor.length + index.length} kept (${index.length} index) · ${vertices} vertices · ${(bytes / 1024).toFixed(0)} KB`)
if (bytes > MAX_BYTES) {
  console.error(`Output is ${bytes} bytes, over the ${MAX_BYTES} guard. Raise TOLERANCE or MIN_RING, or widen INTERVAL, and rerun.`)
  process.exit(1)
}
mkdirSync(dirname(OUT), { recursive: true })
writeFileSync(OUT, svg)
console.log(`Wrote ${OUT}`)
