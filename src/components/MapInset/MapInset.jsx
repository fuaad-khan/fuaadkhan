import styles from './MapInset.module.css'

// Equirectangular frame centred on the three stops (they span ~60 % of the width), width-corrected for latitude
const BOUNDS = { lonMin: -118.977, lonMax: -116.427, latMin: 33.25, latMax: 34.55 }
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

// Coastline from Point Conception to the Mexican border, simplified by hand
const COAST = [
  [-120.47, 34.45], [-120.2, 34.47], [-119.85, 34.41], [-119.69, 34.41], [-119.5, 34.38], [-119.3, 34.27],
  [-119.22, 34.15], [-119.1, 34.09], [-118.95, 34.04], [-118.8, 34.02], [-118.6, 34.03], [-118.5, 34.01],
  [-118.45, 33.97], [-118.42, 33.9], [-118.41, 33.8], [-118.38, 33.73], [-118.3, 33.71], [-118.24, 33.75],
  [-118.15, 33.76], [-118.1, 33.72], [-118.0, 33.65], [-117.92, 33.6], [-117.85, 33.56], [-117.75, 33.49],
  [-117.68, 33.43], [-117.6, 33.39], [-117.5, 33.32], [-117.4, 33.2], [-117.33, 33.1], [-117.29, 33.0],
  [-117.26, 32.9], [-117.26, 32.82], [-117.2, 32.72], [-117.15, 32.68], [-117.12, 32.6], [-117.12, 32.53],
]

// Santa Catalina, the only island inside the frame; it runs north-west to south-east
const CATALINA = { c: [-118.42, 33.38], rx: 22, ry: 5, rot: 33 }

const pathFrom = (pts) => pts.map(([x, y], i) => `${i ? 'L' : 'M'}${round(x)} ${round(y)}`).join(' ')

// Only the stretch of coast near the frame, so the drawn line enters at the edge instead of off-screen
const coastPts = COAST.filter(([lon, lat]) => lon >= BOUNDS.lonMin - 0.3 && lat >= BOUNDS.latMin - 0.3).map(project)
const coastPath = pathFrom(coastPts)
const first = coastPts[0]
const last = coastPts[coastPts.length - 1]
const landPath = `${coastPath} L${W + 40} ${round(last[1])} L${W + 40} -40 L-40 -40 L-40 ${round(first[1])} Z`

// Half-degree graticule, unlabelled: the camera's push would crop edge labels
const GRID = 0.5
const steps = (min, max) => {
  const out = []
  for (let v = Math.ceil(min / GRID) * GRID; v < max; v += GRID) out.push(v)
  return out
}
const MERIDIANS = steps(BOUNDS.lonMin, BOUNDS.lonMax)
const PARALLELS = steps(BOUNDS.latMin, BOUNDS.latMax)

// The ocean name, one word per line, in the San Pedro Channel between Palos Verdes and Catalina
const OCEAN_AT = project([-118.62, 33.6])

// Gentle arc between two stops so the route reads as travel, not a ruler line
function routePath([x1, y1], [x2, y2]) {
  const k = 0.12
  const cx = (x1 + x2) / 2 + (y2 - y1) * k
  const cy = (y1 + y2) / 2 - (x2 - x1) * k
  return `M${round(x1)} ${round(y1)} Q${round(cx)} ${round(cy)} ${round(x2)} ${round(y2)}`
}

// Marker halo radius; labels clear it in viewBox units, then an em baseline shift scales with the label size
const HALO = 10
const LABEL = {
  right: { dx: HALO + 3, dy: 0, em: '0.35em', anchor: 'start' },
  left: { dx: -HALO - 3, dy: 0, em: '0.35em', anchor: 'end' },
  above: { dx: 0, dy: -HALO - 4, em: '-0.3em', anchor: 'middle' },
  below: { dx: 0, dy: HALO + 2, em: '0.95em', anchor: 'middle' },
}

// The career map drawn complete (no-JS, reduced motion); under scripts + motion its CSS rewinds it for the Journey timeline
export default function MapInset({ stops, journey }) {
  const pts = stops.map((s) => project(s.coords))
  const [startX, startY] = pts[0]
  const [endX, endY] = pts[pts.length - 1]
  const markerVars = {
    '--start-x': `${round(startX)}px`,
    '--start-y': `${round(startY)}px`,
    '--end-x': `${round(endX)}px`,
    '--end-y': `${round(endY)}px`,
  }
  const [cx, cy] = project(CATALINA.c)
  const [oceanX, oceanY] = OCEAN_AT

  return (
    <div className={styles.map} aria-hidden="true">
      <div className={styles.frame} style={{ aspectRatio: `${W} / ${H}` }}>
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid slice" className={styles.svg}>
          <g className={styles.view} data-map-view>
            <path d={landPath} className={styles.land} />
            <ellipse
              cx={round(cx)}
              cy={round(cy)}
              rx={CATALINA.rx}
              ry={CATALINA.ry}
              transform={`rotate(${CATALINA.rot} ${round(cx)} ${round(cy)})`}
              className={styles.island}
            />
            <path d={coastPath} pathLength="1" className={styles.coast} />

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

            <text x={round(oceanX)} y={round(oceanY)} textAnchor="middle" className={styles.ocean} data-ocean>
              {journey.ocean.split(' ').map((word, i) => (
                <tspan key={word} x={round(oceanX)} dy={i ? '1.3em' : 0}>
                  {word}
                </tspan>
              ))}
            </text>

            {pts.slice(1).map((p, i) => (
              <path key={stops[i + 1].id} d={routePath(pts[i], p)} className={styles.route} data-route={i + 1} />
            ))}

            {pts.map(([x, y], i) => (
              <circle
                key={stops[i].id}
                cx={round(x)}
                cy={round(y)}
                r={3.5}
                className={i ? `${styles.stop} ${styles.late}` : styles.stop}
                data-stop={i}
              />
            ))}

            {pts.map(([x, y], i) => {
              const l = LABEL[stops[i].labelPlacement] ?? LABEL.right
              return (
                <text
                  key={stops[i].id}
                  x={round(x + l.dx)}
                  y={round(y + l.dy)}
                  dy={l.em}
                  textAnchor={l.anchor}
                  className={i ? `${styles.label} ${styles.late}` : styles.label}
                  data-label={i}
                >
                  {stops[i].location}
                </text>
              )
            })}

            <g className={styles.marker} style={markerVars} data-marker>
              <circle r={HALO} className={styles.halo} />
              <circle r={4.5} className={styles.active} />
            </g>
          </g>
        </svg>
      </div>
      <p className={styles.caption}>{journey.mapCaption}</p>
    </div>
  )
}
