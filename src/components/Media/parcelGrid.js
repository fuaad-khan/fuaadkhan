// Deterministic pseudo-random so the motif is identical on the server and the client
function lcg(seed) {
  let s = (seed * 9301 + 49297) % 233280
  return () => {
    s = (s * 9301 + 49297) % 233280
    return s / 233280
  }
}

// Parcel-grid motif as SVG path data: streets, blocks of lots, one highlighted lot and its buffer ring
export function parcelGrid({ seed = 1, width = 640, height = 400 } = {}) {
  const rand = lcg(seed)
  const pitchX = 96
  const pitchY = 72
  const lots = []
  for (let by = -1; by * pitchY + 44 < height; by++) {
    for (let bx = 0; bx * pitchX + 26 < width; bx++) {
      for (let r = 0; r < 2; r++) {
        for (let c = 0; c < 4; c++) {
          lots.push({ x: 26 + bx * pitchX + c * 22, y: 44 + by * pitchY + r * 31, w: 18 + Math.round(rand() * 4), h: 27 })
        }
      }
    }
  }

  let streets = ''
  for (let x = 18; x < width; x += pitchX) streets += `M${x} 0V${height}`
  for (let y = 36; y < height; y += pitchY) streets += `M0 ${y}H${width}`

  const rect = (p) => `M${p.x} ${p.y}h${p.w}v${p.h}h${-p.w}z`
  const centre = (p) => [p.x + p.w / 2, p.y + p.h / 2]
  const dist = (p) => Math.hypot(centre(p)[0] - width * 0.56, centre(p)[1] - height * 0.5)
  const hi = lots.reduce((best, p) => (dist(p) < dist(best) ? p : best))
  const [cx, cy] = centre(hi)

  return {
    viewBox: `0 0 ${width} ${height}`,
    width,
    height,
    streets,
    parcels: lots.map(rect).join(''),
    highlight: rect(hi),
    buffer: { cx, cy, r: 64 },
  }
}
