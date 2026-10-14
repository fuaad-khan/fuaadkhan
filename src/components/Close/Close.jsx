import { useRef } from 'react'
import { useRise } from '../Journey/useRise'
import styles from './Close.module.css'

// Contact Me, the contentinfo footer: a centred pitch, the three contact links, the résumé and the colophon
export default function Close({ site }) {
  const ref = useRef(null)
  const { close } = site
  // Only the link row and the résumé pill rise in; eyebrow, headline and body stay put
  useRise(ref)

  return (
    <footer ref={ref} id="contact" data-section="contact" className={styles.close} aria-labelledby="close-title">
      <div className={styles.inner}>
        <div className="section-head">
          <p className="eyebrow">{close.eyebrow}</p>
          <h2 id="close-title">{close.headline}</h2>
          <p>{close.body}</p>
        </div>

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

      <div className={styles.footer}>
        <p>{site.footer}</p>
        <p>{site.attribution}</p>
      </div>
    </footer>
  )
}
