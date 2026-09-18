import { useLayoutEffect, useRef } from 'react'
import { gsap, MOTION_OK } from '../../hooks/useChapter'
import styles from './Hero.module.css'

export default function Hero({ site }) {
  const ref = useRef(null)

  useLayoutEffect(() => {
    const el = ref.current
    const mm = gsap.matchMedia()

    mm.add(MOTION_OK, () => {
      const q = gsap.utils.selector(el)
      // One short load-in; everything after this is scroll-driven
      gsap.from(q('[data-intro]'), { opacity: 0, y: 28, duration: 1, ease: 'power3.out', stagger: 0.1, delay: 0.1 })
      // The rail draws downward as the hero scrolls away, handing off to the timeline
      gsap.fromTo(
        q('[data-rail]'),
        { scaleY: 0 },
        { scaleY: 1, ease: 'none', scrollTrigger: { trigger: el, start: 'top top', end: 'bottom top', scrub: 0.4 } },
      )
      gsap.to(q('[data-cue]'), { opacity: 0, ease: 'none', scrollTrigger: { trigger: el, start: 'top top', end: '30% top', scrub: true } })
    })

    return () => mm.revert()
  }, [])

  return (
    <header ref={ref} className={styles.hero}>
      <div className={styles.inner}>
        <p className={`eyebrow ${styles.eyebrow}`} data-intro>
          {site.eyebrow}
        </p>
        <h1 className={styles.name} data-intro>
          {site.name}
        </h1>
        <p className={styles.identity} data-intro>
          {site.identity.map((part, i) => (
            <span key={part}>
              {i > 0 && <span className={styles.dot} aria-hidden="true">·</span>}
              {part}
            </span>
          ))}
        </p>
        <p className={styles.lede} data-intro>
          {site.lede}
        </p>
      </div>
      <div className={styles.railWrap} aria-hidden="true">
        <span className={styles.railStart} />
        <span className={styles.rail} data-rail />
      </div>
      <p className={styles.cue} data-cue aria-hidden="true">
        {site.scrollCue}
      </p>
    </header>
  )
}
