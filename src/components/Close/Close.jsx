import { useRef } from 'react'
import { useReveal } from '../../hooks/useChapter'
import styles from './Close.module.css'

export default function Close({ site }) {
  const ref = useRef(null)
  const { close } = site
  useReveal(ref)

  return (
    <footer ref={ref} className={styles.close} id="contact" aria-labelledby="close-title">
      <span className={styles.rail} aria-hidden="true" />
      <div className={styles.text}>
        <span className={styles.node} aria-hidden="true" />
        <p className="eyebrow" data-reveal>
          {close.eyebrow}
        </p>
        <h2 id="close-title" className={styles.headline} data-reveal>
          {close.headline}
        </h2>
        <p className={styles.body} data-reveal>
          {close.body}
        </p>
        <ul className={styles.links}>
          {close.links.map((link) => (
            <li key={link.label} data-reveal>
              <a href={link.href} target={link.external ? '_blank' : undefined} rel={link.external ? 'noopener noreferrer' : undefined} className={styles.link}>
                <span className={styles.linkLabel}>{link.label}</span>
                <span className={styles.linkValue}>{link.text}</span>
              </a>
            </li>
          ))}
        </ul>
        <a href={close.resume.href} download className={styles.resume} data-reveal>
          {close.resume.label}
          <span aria-hidden="true"> ↓</span>
        </a>
      </div>
      <p className={styles.footer}>{site.footer}</p>
      <p className={styles.footer}>{site.attribution}</p>
    </footer>
  )
}
