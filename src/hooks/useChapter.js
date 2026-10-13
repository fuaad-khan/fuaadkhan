import { useEffect, useLayoutEffect, useState, useSyncExternalStore } from 'react'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { DrawSVGPlugin } from 'gsap/DrawSVGPlugin'

export const MOTION_OK = '(prefers-reduced-motion: no-preference)'
export const MOTION_REDUCED = '(prefers-reduced-motion: reduce)'

let gsapReady = false

// Registers the plugins once, client only; every effect that animates calls this first
export function setupGsap() {
  if (gsapReady || typeof window === 'undefined') return
  gsapReady = true
  gsap.registerPlugin(ScrollTrigger, DrawSVGPlugin)
  // Inter swaps in after the first layout, so trigger positions are measured again once fonts settle
  document.fonts?.ready.then(() => ScrollTrigger.refresh())
}

// Unpinned chapters place tweens at layout.js fractions of the scroll range, so their timeline must last exactly 1
function fitToRange(tl) {
  const duration = tl.duration()
  if (duration < 1) tl.set({}, {}, 1)
  else if (duration > 1.0001 && import.meta.env.DEV) {
    console.warn(`useChapter: an unpinned timeline lasts ${duration.toFixed(3)}; fit it into 0–1 so the fractions match the scroll`)
  }
}

// One scrubbed timeline per section for build(tl, q, el, conditions): unpinned by default, or pinned for `length` viewport heights
export function useChapter(
  ref,
  build,
  { pin = false, start = 'top top', end = 'bottom bottom', length, scrub = 0.5, anticipatePin = 1, reduced, conditions } = {},
) {
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    setupGsap()
    const mm = gsap.matchMedia()

    // Extra queries (e.g. { short: SHORT_SCREEN }) rebuild the chapter whenever one flips; the two motion keys always win
    mm.add({ ...conditions, motionOK: MOTION_OK, reduceMotion: MOTION_REDUCED }, (context) => {
      const flags = context.conditions
      const q = gsap.utils.selector(el)
      if (flags.reduceMotion) {
        reduced?.(q, el)
        return
      }
      if (!flags.motionOK) return
      const tl = gsap.timeline({
        defaults: { ease: 'none' },
        scrollTrigger: {
          trigger: el,
          start,
          end: pin && length != null ? () => `+=${Math.round(length * window.innerHeight)}` : end,
          pin,
          anticipatePin,
          scrub,
          invalidateOnRefresh: true,
        },
      })
      build(tl, q, el, flags)
      if (!pin) fitToRange(tl)
    })

    return () => mm.revert()
    // Chapters are static content; layout changes rebuild through matchMedia conditions, never through React renders
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
}

// Once-only rise as the section enters view; autoAlpha keeps not-yet-shown links out of the tab order
export function useReveal(ref, selector = '[data-reveal]', { stagger = 0.08 } = {}) {
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    setupGsap()
    const mm = gsap.matchMedia()

    mm.add(MOTION_OK, () => {
      const items = el.querySelectorAll(selector)
      if (!items.length) return
      gsap.from(items, {
        autoAlpha: 0,
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

// Reduced-motion stand-in: each tagged item below the fold fades in once, opacity only; autoAlpha keeps its links untabbable until then
export function reducedFade(q, el, selector = '[data-fade]') {
  const fold = window.innerHeight * 0.85
  q(selector).forEach((item) => {
    // Items already in view when the chapter builds stay as rendered, so nothing visible blinks out
    if (item.getBoundingClientRect().top < fold) return
    gsap.from(item, {
      autoAlpha: 0,
      duration: 0.6,
      ease: 'power1.out',
      // clamp() still fires items near the page end whose top never reaches 85% of the viewport
      scrollTrigger: { trigger: item, start: 'clamp(top 85%)', once: true },
    })
  })
}

const motionQuery = () => (typeof window.matchMedia === 'function' ? window.matchMedia(MOTION_OK) : null)

const subscribeMotion = (onChange) => {
  const mq = motionQuery()
  mq?.addEventListener('change', onChange)
  return () => mq?.removeEventListener('change', onChange)
}

const motionSnapshot = () => motionQuery()?.matches ?? false

const serverMotionSnapshot = () => false

// True when motion is allowed; false on the server and during hydration so markup always matches the prerender
export function useMotionOK() {
  return useSyncExternalStore(subscribeMotion, motionSnapshot, serverMotionSnapshot)
}

// Flips to true once the element comes within rootMargin of the viewport, then stops observing
export function useNearViewport(ref, rootMargin = '150%') {
  const [near, setNear] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (near || !el) return
    if (typeof IntersectionObserver === 'undefined') {
      setNear(true)
      return
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return
        setNear(true)
        io.disconnect()
      },
      { rootMargin },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [ref, rootMargin, near])

  return near
}

export { gsap, ScrollTrigger }
