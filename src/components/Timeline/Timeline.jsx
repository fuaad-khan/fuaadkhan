import { useLayoutEffect, useRef } from 'react'
import { useChapter, gsap, ScrollTrigger, MOTION_OK } from '../../hooks/useChapter'
import MapInset from '../MapInset/MapInset'
import styles from './Timeline.module.css'

// Rail progress at each stop; must match the node positions in the stylesheet
const NODE_STOPS = [0.28, 0.5, 0.72]

const fadeIn = (q, el) =>
  gsap.from(el, { opacity: 0, duration: 0.6, scrollTrigger: { trigger: el, start: 'top 80%', once: true } })

export default function Timeline({ stops }) {
  const ref = useRef(null)
  const beatsRef = useRef(null)

  // Stacked beats need the container sized to the tallest one so the pinned layout never clips
  useLayoutEffect(() => {
    const box = beatsRef.current
    if (!box || !window.matchMedia(MOTION_OK).matches) return
    const measure = () => {
      box.style.minHeight = ''
      box.style.minHeight = `${Math.max(...[...box.children].map((c) => c.offsetHeight))}px`
    }
    measure()
    ScrollTrigger.addEventListener('refreshInit', measure)
    return () => ScrollTrigger.removeEventListener('refreshInit', measure)
  }, [])

  useChapter(
    ref,
    (tl, q) => {
      const beats = q('[data-beat]')
      const routes = q('[data-route]')
      const dots = q('[data-stop]')
      const labels = q('[data-label]')
      const fills = q('[data-node-fill]')
      const marker = q('[data-marker]')[0]
      const rail = q('[data-rail]')[0]
      const view = q('[data-map-view]')[0]
      const n = beats.length

      // Rewind the map to the start of the journey: marker on stop one, nothing drawn yet
      gsap.set(marker, { x: +dots[0].getAttribute('cx'), y: +dots[0].getAttribute('cy') })
      gsap.set(routes, { drawSVG: 0 })
      gsap.set([...dots.slice(1), ...labels.slice(1)], { opacity: 0 })
      gsap.set(fills, { scale: 0 })
      gsap.set(rail, { scaleY: 0 })

      beats.forEach((beat, i) => {
        const parts = beat.querySelectorAll('[data-part]')
        tl.to(rail, { scaleY: NODE_STOPS[i], duration: 0.25 }, i)
          .to(fills[i], { scale: 1, duration: 0.12, ease: 'power2.out' }, i + 0.2)
          .from(parts, { opacity: 0, y: 24, duration: 0.35, stagger: 0.05, ease: 'power2.out' }, i + 0.1)
        if (i < n - 1) tl.to(beat, { opacity: 0, y: -16, duration: 0.2, ease: 'power2.in' }, i + 0.82)
        if (i > 0) {
          // Draw the leg and carry the marker along it in lockstep
          const path = routes[i - 1]
          const len = path.getTotalLength()
          const leg = { p: 0 }
          const move = () => {
            const pt = path.getPointAtLength(len * leg.p)
            gsap.set(marker, { x: pt.x, y: pt.y })
          }
          tl.to(path, { drawSVG: '100%', duration: 0.6, ease: 'power1.inOut' }, i)
            .to(leg, { p: 1, duration: 0.6, ease: 'power1.inOut', onUpdate: move }, i)
            .to(dots[i], { opacity: 1, duration: 0.1 }, i + 0.55)
            .to(labels[i], { opacity: 1, duration: 0.15 }, i + 0.6)
        }
      })

      tl.to(rail, { scaleY: 1, duration: 0.4 }, n)
        .fromTo(view, { scale: 1 }, { scale: 1.05, svgOrigin: view.dataset.origin, duration: n + 0.4 }, 0)
        .to({}, { duration: 0.1 })
    },
    { length: 3.6, reduced: fadeIn },
  )

  return (
    <section ref={ref} className={styles.chapter} aria-label="Career timeline">
      <span className={styles.railBase} aria-hidden="true" />
      <span className={styles.rail} data-rail aria-hidden="true" />
      <span className={styles.nodes} aria-hidden="true">
        {stops.map((stop, i) => (
          <span key={stop.id} className={styles.node} style={{ top: `${NODE_STOPS[i] * 100}%` }}>
            <span className={styles.nodeFill} data-node-fill />
          </span>
        ))}
      </span>

      <ol ref={beatsRef} className={styles.beats}>
        {stops.map((stop) => (
          <li key={stop.id} className={styles.beat} data-beat>
            <p className={`eyebrow ${styles.eyebrow}`} data-part>
              <span>{stop.kind}</span>
              <span className={styles.sep} aria-hidden="true">·</span>
              <span>{stop.dates}</span>
            </p>
            <h2 id={`${stop.id}-title`} className={styles.headline} data-part>
              {stop.headline}
            </h2>
            <p className={styles.role} data-part>
              <strong>{stop.role}</strong>
              <span className={styles.org}>
                {stop.org} · {stop.location}
              </span>
            </p>
            <ul className={styles.bullets}>
              {stop.bullets.map((b) => (
                <li key={b} data-part>
                  {b}
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ol>

      <div className={styles.visual}>
        <MapInset stops={stops} />
      </div>
    </section>
  )
}
