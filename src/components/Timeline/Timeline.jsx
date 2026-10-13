import styles from './Timeline.module.css'

// The career beats, flowing beside the Journey map; each eyebrow carries the rail node its stop lights
export default function Timeline({ stops, label }) {
  return (
    <ol className={styles.beats} aria-label={label}>
      {stops.map((stop, i) => (
        <li key={stop.id} className={styles.beat} data-beat={i} data-fade>
          <div className={styles.body}>
            <p className={`eyebrow ${styles.eyebrow}`}>
              <span className={styles.node} aria-hidden="true">
                <span className={styles.nodeFill} data-node-fill={i} />
              </span>
              <span>{stop.kind}</span>
              <span className={styles.sep} aria-hidden="true">
                ·
              </span>
              <span>{stop.dates}</span>
            </p>
            <h2 id={`${stop.id}-title`} className={styles.headline}>
              {stop.headline}
            </h2>
            <p className={styles.role}>
              <strong>{stop.role}</strong>
              <span className={styles.org}>
                {stop.org} · {stop.location}
              </span>
            </p>
            <ul className={styles.bullets}>
              {stop.bullets.map((b) => (
                <li key={b}>{b}</li>
              ))}
            </ul>
          </div>
        </li>
      ))}
    </ol>
  )
}
