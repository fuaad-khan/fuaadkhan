import { Children } from 'react'
import { accentVar } from '../../styles/accent'
import styles from './DeviceFrame.module.css'

// Browser-style frame for app media; each child becomes a full-bleed layer, stacked in order over the screen; ref lands on the frame
export default function DeviceFrame({ ref, title, accent = 'gold', aspect = '16 / 10', className, children }) {
  return (
    <div
      ref={ref}
      className={className ? `${styles.frame} ${className}` : styles.frame}
      style={{ '--frame-accent': accentVar(accent) }}
    >
      <div className={styles.bar} aria-hidden="true">
        <span className={styles.dots}>
          <span />
          <span />
          <span />
        </span>
        {title && <span className={styles.title}>{title}</span>}
      </div>
      <div className={styles.screen} style={{ aspectRatio: String(aspect) }}>
        {Children.toArray(children).map((child, i) => (
          <div key={child.key ?? i} className={styles.layer}>
            {child}
          </div>
        ))}
      </div>
    </div>
  )
}
