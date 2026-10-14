import { useLayoutEffect } from 'react'
import { afterPaint, gsap, MOTION_OK, ScrollTrigger, setupGsap } from '../../hooks/useChapter'

// Once-only rise for items that enter from below the fold, batched so a row staggers; items on screen at setup stay as rendered
export function useRise(ref, selector = '[data-reveal]') {
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const mm = gsap.matchMedia()

    const cancel = afterPaint(() => {
      setupGsap()
      mm.add(MOTION_OK, (context) => {
        const items = [...el.querySelectorAll(selector)].filter((item) => item.getBoundingClientRect().top >= window.innerHeight)
        if (!items.length) return
        // autoAlpha keeps links inside a waiting item out of the tab order
        gsap.set(items, { autoAlpha: 0, y: 28 })
        ScrollTrigger.batch(items, {
          start: 'top 90%',
          once: true,
          onEnter: (batch) =>
            context.add(() => gsap.to(batch, { autoAlpha: 1, y: 0, duration: 0.8, ease: 'power3.out', stagger: 0.08 })),
        })
      })
    })

    return () => {
      cancel()
      mm.revert()
    }
  }, [ref, selector])
}
