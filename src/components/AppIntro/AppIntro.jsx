import { useRef } from 'react'
import { useChapter, gsap } from '../../hooks/useChapter'
import Media from '../Media/Media'
import styles from './AppIntro.module.css'

const fadeIn = (q, el) =>
  gsap.from(el, { opacity: 0, duration: 0.6, scrollTrigger: { trigger: el, start: 'top 80%', once: true } })

export default function AppIntro({ app }) {
  const ref = useRef(null)

  useChapter(
    ref,
    (tl, q) => {
      tl.from(q('[data-rail]'), { scaleY: 0, duration: 1.1 }, 0)
        .from(q('[data-node]'), { scale: 0, duration: 0.12, ease: 'power2.out' }, 0.02)
        .from(q('[data-eyebrow]'), { opacity: 0, y: 16, duration: 0.2, ease: 'power2.out' }, 0)
        .from(q('[data-head]'), { opacity: 0, y: 40, duration: 0.3, ease: 'power2.out' }, 0.05)
        .from(q('[data-problem]'), { opacity: 0, y: 24, duration: 0.3, ease: 'power2.out' }, 0.22)
        .from(q('[data-audience]'), { opacity: 0, y: 16, duration: 0.25, ease: 'power2.out' }, 0.4)
        .from(q('[data-visual]'), { opacity: 0, scale: 0.9, y: 48, duration: 0.7, ease: 'power2.out' }, 0.15)
        .to({}, { duration: 0.3 })
    },
    { length: 1.2, reduced: fadeIn },
  )

  return (
    <section ref={ref} className={styles.chapter} aria-labelledby={`${app.id}-title`}>
      <span className={styles.railBase} aria-hidden="true" />
      <span className={styles.rail} data-rail aria-hidden="true" />
      <div className={styles.text}>
        <span className={styles.node} data-node aria-hidden="true" />
        <p className={`eyebrow ${styles.eyebrow}`} data-eyebrow>
          <span>{app.kind}</span>
          <span className={styles.sep} aria-hidden="true">·</span>
          <span>{app.status}</span>
        </p>
        <h2 id={`${app.id}-title`} className={styles.name} data-head>
          {app.name}
        </h2>
        <p className={styles.problem} data-problem>
          {app.problem}
        </p>
        <p className={styles.audience} data-audience>
          <span className={styles.audienceLabel}>Built for</span>
          {app.audience}
        </p>
      </div>
      <div className={styles.visual} data-visual>
        <Media media={app.hero} accent={app.accent} label={app.name} priority={false} />
      </div>
    </section>
  )
}
