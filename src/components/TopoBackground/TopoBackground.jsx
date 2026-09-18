import { useLayoutEffect, useRef } from 'react'
import { gsap, MOTION_OK } from '../../hooks/useChapter'
import topoUrl from '../../assets/topo-redlands.svg'
import styles from './TopoBackground.module.css'

// Fixed contour-map texture that trails the page: taller than the viewport, drifted up by GSAP
export default function TopoBackground() {
  const ref = useRef(null)

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const mm = gsap.matchMedia()

    mm.add(MOTION_OK, () => {
      // Travel exactly the layer's overflow across the whole document; lowest refresh priority so pin spacers exist first
      gsap.to(el, {
        y: () => -(el.offsetHeight - window.innerHeight),
        ease: 'none',
        scrollTrigger: { start: 0, end: 'max', scrub: true, invalidateOnRefresh: true, refreshPriority: -1 },
      })
    })

    return () => mm.revert()
  }, [])

  return (
    <div ref={ref} className={styles.layer} aria-hidden="true">
      <img className={styles.texture} src={topoUrl} alt="" width="699" height="1556" decoding="async" />
    </div>
  )
}
