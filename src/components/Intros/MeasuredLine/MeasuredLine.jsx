import { useSyncExternalStore } from 'react'
import { accentVar } from '../../../styles/accent'
import styles from './MeasuredLine.module.css'

// Stub until the measured-line intro lands: shows the driver's t so the Showcase wiring can be checked
export default function MeasuredLine({ app, driver }) {
  const t = useSyncExternalStore(driver.subscribe, driver.get, driver.get)

  return (
    <div className={styles.stub} style={{ '--intro-accent': accentVar(app.accent) }} aria-hidden="true">
      <span className={styles.name}>{app.frameTitle}</span>
      <span className={styles.t}>{t.toFixed(3)}</span>
      <span className={styles.bar} style={{ transform: `scaleX(${t})` }} />
    </div>
  )
}
