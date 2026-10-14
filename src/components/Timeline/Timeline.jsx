import { site } from '../../content/site'
import styles from './Timeline.module.css'

// The three career stops as cards under the Journey map: a row on wide screens, stacked below that
export default function Timeline({ stops, label, onPointStop }) {
  // The card under the pointer names its stop (null between and outside cards), so the map can light the matching pin
  const point = (event) => onPointStop?.(event.target.closest?.('[data-stop-card]')?.dataset.stopCard ?? null)

  return (
    <ol className={styles.stops} aria-label={label} onPointerOver={point} onPointerLeave={() => onPointStop?.(null)}>
      {stops.map((stop, i) => (
        <li key={stop.id} className={styles.stop} data-stop-card={i} data-reveal>
          <p className={`eyebrow ${styles.eyebrow}`}>
            <span>{stop.kind}</span>
            <span className={styles.sep} aria-hidden="true">
              {site.ui.sep}
            </span>
            <span>{stop.dates}</span>
          </p>
          <h3 className={styles.headline}>{stop.headline}</h3>
          <p className={styles.role}>
            <strong>{stop.role}</strong>
            <span className={styles.org}>
              {stop.org} {site.ui.sep} {stop.location}
            </span>
          </p>
          <ul className={styles.bullets}>
            {stop.bullets.map((b) => (
              <li key={b}>{b}</li>
            ))}
          </ul>
        </li>
      ))}
    </ol>
  )
}
