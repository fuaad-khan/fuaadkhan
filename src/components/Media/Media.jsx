import { site } from '../../content/site'
import { parcelGrid } from './parcelGrid'
import styles from './Media.module.css'

const SIZES = '(min-width: 768px) 56vw, 92vw'
const GRID = parcelGrid()

const join = (...names) => names.filter(Boolean).join(' ')

// Responsive still from an entry's 1x/2x posters, sized up front so nothing shifts while it loads
function Still({ entry, alt, className, sizes = SIZES }) {
  const { x1, x2 } = entry.poster
  return (
    <img
      className={join(styles.img, className)}
      src={x1}
      srcSet={`${x1} 800w, ${x2} 1600w`}
      sizes={sizes}
      width={entry.width}
      height={entry.height}
      alt={alt}
      loading="lazy"
      decoding="async"
    />
  )
}

// Neutral stand-in while an app has no capture yet: the parcel-grid motif at low opacity
function Placeholder({ alt, className }) {
  // alt="" marks a decorative use: hidden from assistive tech rather than an unnamed img
  const a11y = alt === '' ? { 'aria-hidden': true } : { role: 'img', 'aria-label': alt ?? site.ui.illustration }
  return (
    <div className={join(styles.placeholder, className)} {...a11y}>
      <svg className={styles.grid} viewBox={GRID.viewBox} preserveAspectRatio="xMidYMid slice" aria-hidden="true">
        <path className={styles.streets} d={GRID.streets} />
        <path className={styles.parcels} d={GRID.parcels} />
        <circle className={styles.buffer} cx={GRID.buffer.cx} cy={GRID.buffer.cy} r={GRID.buffer.r} />
        <path className={styles.highlight} d={GRID.highlight} />
      </svg>
      <span className={styles.caption} aria-hidden="true">
        {site.ui.illustration}
      </span>
    </div>
  )
}

// Renders one media.js entry as its still (a clip shows its poster; the galleries play clips themselves), or the placeholder when the entry is null
export default function Media({ media, alt, className, sizes }) {
  if (!media) return <Placeholder alt={alt} className={className} />
  return <Still entry={media} alt={alt ?? media.alt} className={className} sizes={sizes} />
}
