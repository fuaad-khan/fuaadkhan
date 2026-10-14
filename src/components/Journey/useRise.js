import { useLayoutEffect } from 'react'
import { afterPaint, gsap, MOTION_OK } from '../../hooks/useChapter'

// Once-only rise for items entering from below the fold; items that enter together stagger as a row, items on screen at setup stay as rendered
export function useRise(ref, selector = '[data-reveal]') {
  useLayoutEffect(() => {
    const el = ref.current
    if (!el || typeof IntersectionObserver === 'undefined') return
    const mm = gsap.matchMedia()

    const cancel = afterPaint(() => {
      mm.add(MOTION_OK, (context) => {
        const items = [...el.querySelectorAll(selector)].filter((item) => item.getBoundingClientRect().top >= window.innerHeight)
        if (!items.length) return
        // Opacity only, so a waiting link stays in the tab order; the rise starts as an item's top enters, so none waits on screen
        gsap.set(items, { opacity: 0, y: 28 })
        const rise = (batch) => context.add(() => gsap.to(batch, { opacity: 1, y: 0, duration: 0.8, ease: 'power3.out', stagger: 0.08, overwrite: true }))
        // One observer callback carries every item that crossed the bottom edge in that frame, so a row rises as one staggered batch
        const io = new IntersectionObserver((entries) => {
          const batch = entries.filter((entry) => entry.isIntersecting).map((entry) => entry.target)
          if (!batch.length) return
          batch.forEach((item) => io.unobserve(item))
          rise(batch)
        })
        items.forEach((item) => io.observe(item))
        // Tabbing into the group shows all of it at once
        const reveal = () => {
          io.disconnect()
          rise(items)
        }
        el.addEventListener('focusin', reveal, { once: true })
        return () => {
          io.disconnect()
          el.removeEventListener('focusin', reveal)
        }
      })
    })

    return () => {
      cancel()
      mm.revert()
    }
  }, [ref, selector])
}
