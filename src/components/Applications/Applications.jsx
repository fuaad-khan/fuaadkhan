import { useRef } from 'react'
import DeviceFrame from '../Media/DeviceFrame'
import Media from '../Media/Media'
import { useRise } from '../Journey/useRise'
import { media } from '../../content/media'
import { site } from '../../content/site'
import { accentVar } from '../../styles/accent'
import styles from './Applications.module.css'

// Each thumbnail zooms into a legible detail of its hero capture: focus is the point that stays put (and the crop's anchor), zoom the scale around it
const THUMB = {
  'map-my-city': { focus: '80% 30%', zoom: 1.8 },
  'yard-plan': { focus: '96% 26%', zoom: 1.6 },
  'green-check': { focus: '97% 24%', zoom: 1.6 },
}
const NO_THUMB = { focus: 'center', zoom: 1 }

// The zoomed image is about 1.7x its slot (265px in the desktop row, 235px in a tablet row, 70% of a phone tile), so sizes asks for that much
const SIZES = '(min-width: 1024px) 450px, (min-width: 640px) 400px, 100vw'

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
        {apps.map((app) => {
          const thumb = THUMB[app.id] ?? NO_THUMB
          return (
            <li
              key={app.id}
              className={styles.tile}
              style={{ '--app-accent': accentVar(app.accent), '--media-focus': thumb.focus, '--thumb-zoom': thumb.zoom }}
              data-reveal
            >
              <div className={styles.thumb}>
                <DeviceFrame accent={app.accent} aspect="4 / 3" className={styles.frame}>
                  <Media media={media[app.id]?.hero ?? null} alt="" sizes={SIZES} />
                </DeviceFrame>
              </div>
              <div className={styles.info}>
                <p className={styles.kind}>{app.kind}</p>
                <h3 className={styles.name}>
                  <a href={`#${app.id}`} className={styles.link}>
                    {app.name}
                  </a>
                </h3>
                {app.tagline && <p className={styles.tagline}>{app.tagline}</p>}
                <p className={`status-chip ${styles.status}`}>{app.status}</p>
                <p className={styles.cue} aria-hidden="true">
                  {content.cue}
                  <span className={styles.chevron}>{site.ui.moreMark}</span>
                </p>
              </div>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
