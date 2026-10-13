import { useRef } from 'react'
import { useReveal } from '../../hooks/useChapter'
import Rail from '../Rail/Rail'
import { apps } from '../../content/apps'
import { accentVar } from '../../styles/accent'
import styles from './Close.module.css'

// The rail arrives in the last showcase's accent and turns back to the career gold at the final node
const RAIL_FILL = `linear-gradient(${accentVar(apps[apps.length - 1]?.accent)}, var(--accent))`

export default function Close({ site }) {
  const ref = useRef(null)
  const { close } = site
  // Only the link rows and the résumé pill rise in; eyebrow, headline and body stay put
  useReveal(ref, '[data-reveal]')

  return (
    <footer ref={ref} className={styles.close} id="contact" aria-labelledby="close-title">
      <Rail className={styles.rail} style={{ '--rail-fill': RAIL_FILL }} nodes={[{ at: '100%', lit: true }]} />

      <div className={styles.inner}>
        <div>
          <p className="eyebrow">{close.eyebrow}</p>
          <h2 id="close-title" className={styles.headline}>
            {close.headline}
          </h2>
          <p className={styles.body}>{close.body}</p>
        </div>

        <div className={styles.contact}>
          <ul className={styles.links}>
            {close.links.map((link) => (
              <li key={link.label} data-reveal>
                <a
                  href={link.href}
                  target={link.external ? '_blank' : undefined}
                  rel={link.external ? 'noopener noreferrer' : undefined}
                  className={styles.link}
                >
                  <span className={styles.linkLabel}>{link.label}</span>
                  <span className={styles.linkValue}>{link.text}</span>
                </a>
              </li>
            ))}
          </ul>
          <a href={close.resume.href} download className={styles.resume} data-reveal>
            {close.resume.label}
            <span aria-hidden="true"> {site.ui.downloadMark}</span>
          </a>
        </div>
      </div>

      <div className={styles.footer}>
        <p>{site.footer}</p>
        <p>{site.attribution}</p>
      </div>
    </footer>
  )
}
