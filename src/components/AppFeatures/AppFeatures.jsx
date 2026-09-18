import { useRef } from 'react'
import { useChapter, gsap } from '../../hooks/useChapter'
import Media from '../Media/Media'
import styles from './AppFeatures.module.css'

const fadeIn = (q, el) =>
  gsap.from(el, { opacity: 0, duration: 0.6, scrollTrigger: { trigger: el, start: 'top 80%', once: true } })

const pad = (n) => String(n).padStart(2, '0')

export default function AppFeatures({ app }) {
  const ref = useRef(null)
  const frames = app.features.map((f) => f.media ?? app.hero)
  // Crossfading identical frames is invisible, so collapse to one when nothing changes
  const singleFrame = new Set(frames.map((m) => m?.src ?? 'placeholder')).size === 1

  useChapter(
    ref,
    (tl, q) => {
      const items = q('[data-feature]')
      const shots = q('[data-frame]')
      const n = items.length
      items.forEach((item, i) => {
        tl.from(item, { opacity: 0, y: 28, duration: 0.35, ease: 'power2.out' }, i)
        if (i < n - 1) tl.to(item, { opacity: 0, y: -18, duration: 0.25, ease: 'power2.in' }, i + 0.75)
      })
      shots.forEach((shot, i) => {
        if (i > 0) tl.from(shot, { opacity: 0, duration: 0.35 }, i)
        if (i < n - 1) tl.to(shot, { opacity: 0, duration: 0.3 }, i + 0.75)
      })
      tl.fromTo(q('[data-progress]'), { scaleX: 0 }, { scaleX: 1, duration: n }, 0)
        .from(q('[data-stack]'), { opacity: 0, y: 20, duration: 0.35, ease: 'power2.out' }, n - 0.1)
        .to({}, { duration: 0.35 })
    },
    { length: 2.2, reduced: fadeIn },
  )

  return (
    <section ref={ref} className={styles.chapter} aria-label={`${app.name} features`}>
      <span className={styles.railBase} aria-hidden="true" />

      <div className={styles.visual}>
        {singleFrame ? (
          <Media media={frames[0]} accent={app.accent} label={app.name} />
        ) : (
          frames.map((m, i) => (
            <div key={i} className={styles.frame} data-frame>
              <Media media={m} accent={app.accent} label={app.name} />
            </div>
          ))
        )}
      </div>

      <div className={styles.text}>
        <p className={`eyebrow ${styles.eyebrow}`}>{app.name}</p>
        <ol className={styles.features}>
          {app.features.map((f, i) => (
            <li key={f.title} className={styles.feature} data-feature>
              <span className={styles.index} aria-hidden="true">
                {pad(i + 1)} / {pad(app.features.length)}
              </span>
              <h3 className={styles.title}>{f.title}</h3>
              <p className={styles.body}>{f.body}</p>
            </li>
          ))}
        </ol>
        <span className={styles.progressTrack} aria-hidden="true">
          <span className={styles.progress} data-progress />
        </span>
        <div className={styles.stack} data-stack>
          <p className={styles.stackLine}>
            {app.stack.map((s, i) => (
              <span key={s}>
                {i > 0 && <span className={styles.sep} aria-hidden="true">·</span>}
                {s}
              </span>
            ))}
          </p>
          <ul className={styles.links}>
            {Object.entries(app.links).map(([key, link]) => (
              <li key={key}>
                <a href={link.href} target="_blank" rel="noopener noreferrer" className={styles.link}>
                  {link.label}
                  <span aria-hidden="true"> ↗</span>
                </a>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  )
}
