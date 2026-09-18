import { useLayoutEffect } from 'react'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { DrawSVGPlugin } from 'gsap/DrawSVGPlugin'

gsap.registerPlugin(ScrollTrigger, DrawSVGPlugin)

// Mobile address-bar show/hide fires resize events that would otherwise jump pinned sections
ScrollTrigger.config({ ignoreMobileResize: true })

export const MOTION_OK = '(prefers-reduced-motion: no-preference)'
export const MOTION_REDUCED = '(prefers-reduced-motion: reduce)'

/**
 * Pins one chapter and hands a scroll-scrubbed timeline to `build(tl, q)`.
 * `length` is the pinned scroll distance in viewport heights.
 * `reduced(q, el)` runs instead when the user prefers reduced motion.
 */
export function useChapter(ref, build, { length = 1.5, scrub = 0.6, pin = true, reduced } = {}) {
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const mm = gsap.matchMedia()

    mm.add(MOTION_OK, () => {
      const q = gsap.utils.selector(el)
      const tl = gsap.timeline({
        defaults: { ease: 'none' },
        scrollTrigger: {
          trigger: el,
          start: 'top top',
          end: () => `+=${Math.round(length * window.innerHeight)}`,
          pin,
          scrub,
          anticipatePin: 1,
          invalidateOnRefresh: true,
        },
      })
      build(tl, q, el)
    })

    mm.add(MOTION_REDUCED, () => {
      if (reduced) reduced(gsap.utils.selector(el), el)
    })

    return () => mm.revert()
    // Chapters are static content; rebuilding on every render would thrash ScrollTrigger
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
}

// Simple enter-fade for elements that should reveal once as they scroll into view (no pin)
export function useReveal(ref, selector = '[data-reveal]', { stagger = 0.08 } = {}) {
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const mm = gsap.matchMedia()

    mm.add(MOTION_OK, () => {
      const items = el.querySelectorAll(selector)
      if (!items.length) return
      gsap.from(items, {
        opacity: 0,
        y: 24,
        duration: 0.9,
        ease: 'power3.out',
        stagger,
        scrollTrigger: { trigger: el, start: 'top 75%', once: true },
      })
    })

    return () => mm.revert()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
}

export { gsap, ScrollTrigger }
