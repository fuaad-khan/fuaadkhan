import { useRef } from 'react'
import { useChapter, gsap } from '../../hooks/useChapter'
import MapInset from '../MapInset/MapInset'
import styles from './TimelineChapter.module.css'

// Reduced motion: one fade as the chapter enters, no pin
const fadeIn = (q, el) =>
  gsap.from(el, { opacity: 0, duration: 0.6, scrollTrigger: { trigger: el, start: 'top 80%', once: true } })

export default function TimelineChapter({ stop, index, stops }) {
  const ref = useRef(null)

  useChapter(
    ref,
    (tl, q) => {
      const view = q('[data-map-view]')[0]
      tl.from(q('[data-rail]'), { scaleY: 0, duration: 0.55 }, 0)
        .from(q('[data-node]'), { scale: 0, duration: 0.12, ease: 'power2.out' }, 0.06)
        .from(q('[data-eyebrow]'), { opacity: 0, y: 16, duration: 0.2, ease: 'power2.out' }, 0.06)
        .from(q('[data-head]'), { opacity: 0, y: 32, duration: 0.3, ease: 'power2.out' }, 0.12)
        .from(q('[data-sub]'), { opacity: 0, y: 20, duration: 0.25, ease: 'power2.out' }, 0.3)
        .from(q('[data-bullet]'), { opacity: 0, y: 16, duration: 0.25, stagger: 0.12, ease: 'power2.out' }, 0.42)
      // First stop has no inbound route to draw
      if (q('[data-route]').length) tl.from(q('[data-route]'), { drawSVG: 0, duration: 0.6 }, 0.05)
      tl.from(q('[data-marker]'), { scale: 0, transformOrigin: '50% 50%', duration: 0.15, ease: 'power2.out' }, 0.62)
        .from(q('[data-marker-label]'), { opacity: 0, duration: 0.2 }, 0.72)
        .fromTo(view, { scale: 1 }, { scale: 1.05, svgOrigin: view.dataset.origin, duration: 1.3 }, 0)
        .to({}, { duration: 0.35 })
    },
    { length: 1.5, reduced: fadeIn },
  )

  return (
    <section ref={ref} className={styles.chapter} aria-labelledby={`${stop.id}-title`}>
      <span className={styles.railBase} aria-hidden="true" />
      <span className={styles.rail} data-rail aria-hidden="true" />
      <div className={styles.text}>
        <span className={styles.node} data-node aria-hidden="true" />
        <p className={`eyebrow ${styles.eyebrow}`} data-eyebrow>
          <span>{stop.kind}</span>
          <span className={styles.sep} aria-hidden="true">·</span>
          <span>{stop.dates}</span>
        </p>
        <h2 id={`${stop.id}-title`} className={styles.headline} data-head>
          {stop.headline}
        </h2>
        <p className={styles.role} data-sub>
          <strong>{stop.role}</strong>
          <span className={styles.org}>
            {stop.org} · {stop.location}
          </span>
        </p>
        <ul className={styles.bullets}>
          {stop.bullets.map((b) => (
            <li key={b} data-bullet>
              {b}
            </li>
          ))}
        </ul>
      </div>
      <div className={styles.visual}>
        <MapInset stops={stops} activeIndex={index} />
      </div>
    </section>
  )
}
