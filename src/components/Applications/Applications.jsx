import { useRef } from 'react'
import DeviceFrame from '../Media/DeviceFrame'
import Media from '../Media/Media'
import { useRise } from '../Journey/useRise'
import { media } from '../../content/media'
import { accentVar } from '../../styles/accent'
import styles from './Applications.module.css'

// My Applications: the centred heading and one tile per app; the whole tile links to that app's section
export default function Applications({ content, apps }) {
  const tilesRef = useRef(null)
  useRise(tilesRef)

  return (
    <section id="applications" data-section="applications" className={styles.hub} aria-labelledby="applications-title">
      <div className="section-head">
        <p className="eyebrow">{content.eyebrow}</p>
        <h2 id="applications-title">{content.headline}</h2>
        <p>{content.body}</p>
      </div>

      <ul ref={tilesRef} className={styles.tiles}>
        {apps.map((app) => (
          <li key={app.id} className={styles.tile} style={{ '--tile-accent': accentVar(app.accent) }} data-reveal>
            <div className={styles.thumb}>
              <DeviceFrame accent={app.accent} className={styles.frame}>
                <Media media={media[app.id]?.hero ?? null} alt="" sizes="(min-width: 1024px) 30vw, 90vw" />
              </DeviceFrame>
            </div>
            <div className={styles.info}>
              <h3 className={styles.name}>
                <a href={`#${app.id}`} className={styles.link}>
                  {app.name}
                </a>
              </h3>
              <p className={styles.kind}>{app.kind}</p>
              <p className={styles.status}>{app.status}</p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}
