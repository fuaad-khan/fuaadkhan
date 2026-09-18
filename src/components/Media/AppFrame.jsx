import styles from './Media.module.css'

// Deterministic pseudo-random so the placeholder never shifts between renders
function lcg(seed) {
  let s = (seed * 9301 + 49297) % 233280
  return () => {
    s = (s * 9301 + 49297) % 233280
    return s / 233280
  }
}

const W = 640
const H = 400
const PANEL_W = 150

function buildParcels(seed) {
  const rand = lcg(seed)
  const parcels = []
  for (let by = 0; by < 5; by++) {
    for (let bx = 0; bx < 5; bx++) {
      const x0 = PANEL_W + 26 + bx * 96
      const y0 = 44 + by * 72
      for (let r = 0; r < 2; r++) {
        for (let c = 0; c < 4; c++) {
          const w = 18 + Math.round(rand() * 4)
          parcels.push({ x: x0 + c * 22, y: y0 + r * 31, w, h: 27, roll: rand() })
        }
      }
    }
  }
  return parcels
}

// Cartographic stand-in for a screenshot: parcel grid, streets, a panel, one highlighted lot
export default function AppFrame({ label, seed = 1 }) {
  const parcels = buildParcels(seed)
  const hi = parcels[Math.floor(parcels.length * 0.46)]
  const cx = hi.x + hi.w / 2
  const cy = hi.y + hi.h / 2

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className={styles.placeholder} role="img" aria-label={`${label} screenshot pending`}>
      <rect width={W} height={H} rx="8" className={styles.phBg} />
      <g className={styles.phStreets}>
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <line key={`v${i}`} x1={PANEL_W + 18 + i * 96} y1={0} x2={PANEL_W + 18 + i * 96} y2={H} />
        ))}
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <line key={`h${i}`} x1={PANEL_W} y1={36 + i * 72} x2={W} y2={36 + i * 72} />
        ))}
      </g>
      <g className={styles.phParcels}>
        {parcels.map((p, i) => (
          <rect key={i} x={p.x} y={p.y} width={p.w} height={p.h} />
        ))}
      </g>
      <circle cx={cx} cy={cy} r={64} className={styles.phBuffer} />
      <rect x={hi.x} y={hi.y} width={hi.w} height={hi.h} className={styles.phHighlight} />
      <rect x={0} y={0} width={PANEL_W} height={H} className={styles.phPanel} />
      <g className={styles.phPanelLines}>
        <rect x={16} y={20} width={90} height={9} rx={2} />
        <rect x={16} y={48} width={118} height={16} rx={4} className={styles.phSearch} />
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <rect key={i} x={16} y={88 + i * 22} width={60 + ((i * 37) % 50)} height={6} rx={2} />
        ))}
      </g>
      <text x={W - 14} y={H - 14} textAnchor="end" className={styles.phLabel}>
        screenshot pending
      </text>
    </svg>
  )
}
