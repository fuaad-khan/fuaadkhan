import { useLayoutEffect, useRef } from 'react'
import { gsap, MOTION_OK, setupGsap } from '../../hooks/useChapter'
import styles from './TopoBackground.module.css'

// Where the CSS makes the layer 180lvh tall; everywhere else it is a static 100lvh layer
const DRIFT = `${MOTION_OK} and (min-width: 768px)`
// 80 of the layer's 180lvh: the last frame still shows a full 100lvh of contours, whatever the browser chrome does
const TRAVEL = 80 / 180

// Fixed contour texture behind the page; on wide screens it drifts up 80lvh across the whole document
export default function TopoBackground() {
  const ref = useRef(null)

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    setupGsap()
    const mm = gsap.matchMedia()

    // Whole device pixels only: a fractional offset makes Chrome re-raster the whole contour layer on every frame
    const snapToDevicePixel = gsap.utils.unitize((y) => Math.round(y * window.devicePixelRatio) / window.devicePixelRatio)

    mm.add(DRIFT, () => {
      // force3D keeps one composited layer for the whole drift; lowest refresh priority so pin spacers exist before 'max' is read
      gsap.to(el, {
        y: () => -el.offsetHeight * TRAVEL,
        ease: 'none',
        force3D: true,
        modifiers: { y: snapToDevicePixel },
        scrollTrigger: { start: 0, end: 'max', scrub: true, invalidateOnRefresh: true, refreshPriority: -1 },
      })
    })

    return () => mm.revert()
  }, [])

  // The mask sits on a child, so it is rasterised into the layer once instead of being composited on every frame
  return (
    <div ref={ref} className={styles.layer} aria-hidden="true">
      <div className={styles.contours} />
    </div>
  )
}
