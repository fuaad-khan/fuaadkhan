import styles from './MapInset.module.css'

// Plate carrée over Southern California, width-corrected for latitude so shapes read true
const BOUNDS = { lonMin: -120.75, lonMax: -116.05, latMin: 32.45, latMax: 34.85 }
const W = 400
const H = Math.round(
  W * ((BOUNDS.latMax - BOUNDS.latMin) / ((BOUNDS.lonMax - BOUNDS.lonMin) * Math.cos((33.65 * Math.PI) / 180))),
)

const project = ([lon, lat]) => [
  ((lon - BOUNDS.lonMin) / (BOUNDS.lonMax - BOUNDS.lonMin)) * W,
  ((BOUNDS.latMax - lat) / (BOUNDS.latMax - BOUNDS.latMin)) * H,
]

// Coastline from Point Conception to the Mexican border, simplified by hand
const COAST = [
  [-120.47, 34.45], [-120.2, 34.47], [-119.85, 34.41], [-119.69, 34.41], [-119.5, 34.38], [-119.3, 34.27],
  [-119.22, 34.15], [-119.1, 34.09], [-118.95, 34.04], [-118.8, 34.02], [-118.6, 34.03], [-118.5, 34.01],
  [-118.45, 33.97], [-118.42, 33.9], [-118.41, 33.8], [-118.38, 33.73], [-118.3, 33.71], [-118.24, 33.75],
  [-118.15, 33.76], [-118.1, 33.72], [-118.0, 33.65], [-117.92, 33.6], [-117.85, 33.56], [-117.75, 33.49],
  [-117.68, 33.43], [-117.6, 33.39], [-117.5, 33.32], [-117.4, 33.2], [-117.33, 33.1], [-117.29, 33.0],
  [-117.26, 32.9], [-117.26, 32.82], [-117.2, 32.72], [-117.15, 32.68], [-117.12, 32.6], [-117.12, 32.53],
]

const ISLANDS = [
  { c: [-118.42, 33.38], rx: 18, ry: 5, rot: -40 },
  { c: [-119.75, 34.0], rx: 22, ry: 6, rot: -10 },
  { c: [-118.5, 32.9], rx: 12, ry: 4, rot: -50 },
]

const pathFrom = (pts) => pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ')

const coastPts = COAST.map(project)
const border = project([BOUNDS.lonMax + 1, 32.53])
const landPath = `${pathFrom(coastPts)} L${border[0]} ${border[1]} L${border[0]} -20 L-20 -20 Z`
const borderPath = pathFrom([project([-117.12, 32.53]), border])

// Gentle arc between two stops so the route reads as travel, not a ruler line
function routePath(a, b) {
  const [x1, y1] = a
  const [x2, y2] = b
  const mx = (x1 + x2) / 2
  const my = (y1 + y2) / 2
  const dx = x2 - x1
  const dy = y2 - y1
  const k = 0.18
  return `M${x1} ${y1} Q${mx + dy * k} ${my - dx * k} ${x2} ${y2}`
}

export default function MapInset({ stops, activeIndex }) {
  const pts = stops.map((s) => project(s.coords))
  const [ax, ay] = pts[activeIndex]
  const labelLeft = ax > W * 0.72

  return (
    <div className={styles.map} aria-hidden="true">
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid slice" className={styles.svg}>
        <g data-map-view data-origin={`${ax.toFixed(1)} ${ay.toFixed(1)}`}>
          <path d={landPath} className={styles.land} />
          {ISLANDS.map(({ c, rx, ry, rot }) => {
            const [x, y] = project(c)
            return <ellipse key={c.join()} cx={x} cy={y} rx={rx} ry={ry} transform={`rotate(${rot} ${x} ${y})`} className={styles.land} />
          })}
          <path d={borderPath} className={styles.border} />
          <g className={styles.graticule}>
            {[-120, -119, -118, -117].map((lon) => {
              const [x] = project([lon, 33])
              return (
                <g key={lon}>
                  <line x1={x} y1={0} x2={x} y2={H} />
                  <text x={x + 3} y={H - 5}>{Math.abs(lon)}°W</text>
                </g>
              )
            })}
            {[33, 34].map((lat) => {
              const [, y] = project([-118, lat])
              return (
                <g key={lat}>
                  <line x1={0} y1={y} x2={W} y2={y} />
                  <text x={4} y={y - 3}>{lat}°N</text>
                </g>
              )
            })}
          </g>
          <text x={project([-119.6, 33.3])[0]} y={project([-119.6, 33.3])[1]} className={styles.ocean}>
            Pacific Ocean
          </text>

          {pts.slice(1, activeIndex + 1).map((p, i) => (
            <path
              key={stops[i + 1].id}
              d={routePath(pts[i], p)}
              className={styles.route}
              data-route={i + 1 === activeIndex ? '' : undefined}
            />
          ))}

          {pts.slice(0, activeIndex).map(([x, y], i) => (
            <circle key={stops[i].id} cx={x} cy={y} r={3.5} className={styles.visited} />
          ))}

          <g data-marker>
            <circle cx={ax} cy={ay} r={10} className={styles.halo} />
            <circle cx={ax} cy={ay} r={4.5} className={styles.active} />
          </g>
          <text
            x={labelLeft ? ax - 14 : ax + 14}
            y={ay + 3.5}
            textAnchor={labelLeft ? 'end' : 'start'}
            className={styles.label}
            data-marker-label
          >
            {stops[activeIndex].location}
          </text>
        </g>
      </svg>
      <span className={styles.caption}>Career map · Southern California</span>
    </div>
  )
}
