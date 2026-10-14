import { useLayoutEffect } from 'react'
import { afterPaint, gsap, MOTION_OK, ScrollTrigger, setupGsap } from '../../hooks/useChapter'

// Once-only rise for items entering from below the fold, batched so a row staggers; items on screen at setup stay as rendered
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
        // Opacity only, so a waiting link stays in the tab order; the rise starts as an item's top enters, so none waits on screen
        gsap.set(items, { opacity: 0, y: 28 })
        const rise = (batch) => context.add(() => gsap.to(batch, { opacity: 1, y: 0, duration: 0.8, ease: 'power3.out', stagger: 0.08, overwrite: true }))
        const triggers = ScrollTrigger.batch(items, { start: 'top bottom', once: true, onEnter: rise })
        // Tabbing into the group shows all of it at once
        const reveal = () => {
          triggers.forEach((trigger) => trigger.kill())
          rise(items)
        }
        el.addEventListener('focusin', reveal, { once: true })
        return () => el.removeEventListener('focusin', reveal)
      })
    })

    return () => {
      cancel()
      mm.revert()
    }
  }, [ref, selector])
}
