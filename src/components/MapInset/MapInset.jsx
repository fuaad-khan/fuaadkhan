import styles from './MapInset.module.css'

// Equirectangular frame around the route plus a margin (about 2.65:1, width-corrected for latitude): the coast and the ocean stay, the empty south and east go
const BOUNDS = { lonMin: -118.95, lonMax: -116.5, latMin: 33.5, latMax: 34.27 }
const W = 400
const H = Math.round(
  (W * (BOUNDS.latMax - BOUNDS.latMin)) /
    ((BOUNDS.lonMax - BOUNDS.lonMin) * Math.cos((((BOUNDS.latMin + BOUNDS.latMax) / 2) * Math.PI) / 180)),
)

const project = ([lon, lat]) => [
  ((lon - BOUNDS.lonMin) / (BOUNDS.lonMax - BOUNDS.lonMin)) * W,
  ((BOUNDS.latMax - lat) / (BOUNDS.latMax - BOUNDS.latMin)) * H,
]

const round = (n) => Math.round(n * 10) / 10
const px = (n) => `${round(n)}px`

// Coastline from Point Conception to the Mexican border, simplified by hand
const COAST = [
  [-120.47, 34.45], [-120.2, 34.47], [-119.85, 34.41], [-119.69, 34.41], [-119.5, 34.38], [-119.3, 34.27],
  [-119.22, 34.15], [-119.1, 34.09], [-118.95, 34.04], [-118.8, 34.02], [-118.6, 34.03], [-118.5, 34.01],
  [-118.45, 33.97], [-118.42, 33.9], [-118.41, 33.8], [-118.38, 33.73], [-118.3, 33.71], [-118.24, 33.75],
  [-118.15, 33.76], [-118.1, 33.72], [-118.0, 33.65], [-117.92, 33.6], [-117.85, 33.56], [-117.75, 33.49],
  [-117.68, 33.43], [-117.6, 33.39], [-117.5, 33.32], [-117.4, 33.2], [-117.33, 33.1], [-117.29, 33.0],
  [-117.26, 32.9], [-117.26, 32.82], [-117.2, 32.72], [-117.15, 32.68], [-117.12, 32.6], [-117.12, 32.53],
]

const pathFrom = (pts) => pts.map(([x, y], i) => `${i ? 'L' : 'M'}${round(x)} ${round(y)}`).join(' ')

// Only the stretch of coast near the frame, so the line enters at the edge instead of off-screen
const coastPts = COAST.filter(([lon, lat]) => lon >= BOUNDS.lonMin - 0.3 && lat >= BOUNDS.latMin - 0.3).map(project)
const coastPath = pathFrom(coastPts)
const first = coastPts[0]
const last = coastPts[coastPts.length - 1]
const landPath = `${coastPath} L${W + 40} ${round(last[1])} L${W + 40} -40 L-40 -40 L-40 ${round(first[1])} Z`

// Half-degree graticule, unlabelled
const GRID = 0.5
const steps = (min, max) => {
  const out = []
  for (let v = Math.ceil(min / GRID) * GRID; v < max; v += GRID) out.push(v)
  return out
}
const MERIDIANS = steps(BOUNDS.lonMin, BOUNDS.lonMax)
const PARALLELS = steps(BOUNDS.latMin, BOUNDS.latMax)

// The ocean name, one word per line, out in the Pacific off Santa Monica Bay
const OCEAN_AT = project([-118.7, 33.75])

// Gentle arc between two stops so the route reads as travel, not a ruler line
function routePath([x1, y1], [x2, y2]) {
  const k = 0.12
  const cx = (x1 + x2) / 2 + (y2 - y1) * k
  const cy = (y1 + y2) / 2 - (x2 - x1) * k
  return `M${round(x1)} ${round(y1)} Q${round(cx)} ${round(cy)} ${round(x2)} ${round(y2)}`
}

// Label offsets in screen px (pins are drawn at screen scale), clear of the numbered badge and the marker halo
const LABEL = {
  right: { dx: 17, dy: 0, em: '0.35em', anchor: 'start' },
  left: { dx: -17, dy: 0, em: '0.35em', anchor: 'end' },
  above: { dx: 0, dy: -18, em: '0', anchor: 'middle' },
  below: { dx: 0, dy: 18, em: '0.75em', anchor: 'middle' },
}

// The career map drawn complete (no JS, reduced motion); under scripts + motion its CSS rewinds the route for the Journey's draw
export default function MapInset({ ref, stops, journey, sep }) {
  const pts = stops.map((s) => project(s.coords))
  const [startX, startY] = pts[0]
  const [endX, endY] = pts[pts.length - 1]
  const [oceanX, oceanY] = OCEAN_AT

  return (
    <figure ref={ref} className={styles.map} aria-hidden="true">
      <div className={styles.frame}>
        <svg viewBox={`0 0 ${W} ${H}`} className={styles.svg}>
          <path d={landPath} className={styles.land} />
          <path d={coastPath} className={styles.coast} />

          <g className={styles.graticule}>
            {MERIDIANS.map((lon) => {
              const [x] = project([lon, BOUNDS.latMin])
              return <line key={lon} x1={round(x)} y1={0} x2={round(x)} y2={H} />
            })}
            {PARALLELS.map((lat) => {
              const [, y] = project([BOUNDS.lonMin, lat])
              return <line key={lat} x1={0} y1={round(y)} x2={W} y2={round(y)} />
            })}
          </g>

          <g className={styles.place} style={{ '--x': px(oceanX), '--y': px(oceanY) }}>
            <text textAnchor="middle" className={styles.ocean}>
              {journey.ocean.split(' ').map((word, i) => (
                <tspan key={word} x="0" dy={i ? '1.35em' : 0}>
                  {word}
                </tspan>
              ))}
            </text>
          </g>

          {pts.slice(1).map((p, i) => (
            <path key={stops[i + 1].id} d={routePath(pts[i], p)} className={styles.route} data-route={i + 1} />
          ))}

          {/* Under the pins: at rest the marker hides beneath the last badge and only its halo rings it */}
          <g
            className={styles.marker}
            style={{ '--start-x': px(startX), '--start-y': px(startY), '--end-x': px(endX), '--end-y': px(endY) }}
            data-marker
          >
            <circle r={13} className={styles.halo} data-halo />
            <circle r={5.5} className={styles.active} />
          </g>

          {pts.map(([x, y], i) => {
            const stop = stops[i]
            const l = LABEL[stop.mapPlacement] ?? LABEL.right
            return (
              <g key={stop.id} className={i ? `${styles.place} ${styles.late}` : styles.place} style={{ '--x': px(x), '--y': px(y) }} data-pin={i}>
                <circle r={9} className={styles.badge} />
                <text dy="0.35em" textAnchor="middle" className={styles.number}>
                  {i + 1}
                </text>
                <text x={l.dx} y={l.dy} dy={l.em} textAnchor={l.anchor} className={styles.label}>
                  {stop.place}
                  <tspan className={styles.year}>{` ${sep} ${stop.year}`}</tspan>
                </text>
              </g>
            )
          })}
        </svg>
      </div>
      <figcaption className={styles.caption}>{journey.mapCaption}</figcaption>
    </figure>
  )
}
