// Shared motion helpers (GSAP set-up, on-demand ScrollTrigger, the after-paint queue, the nav line, the motion and near-viewport hooks); the v1 file name stays because the Gallery and Intros import it
import { useEffect, useState, useSyncExternalStore } from 'react'
import gsap from 'gsap'
import { DrawSVGPlugin } from 'gsap/DrawSVGPlugin'

export const MOTION_OK = '(prefers-reduced-motion: no-preference)'

let gsapReady = false

// Registers DrawSVG once, client only; every effect that animates calls this first (ScrollTrigger loads on demand, below)
export function setupGsap() {
  if (gsapReady || typeof window === 'undefined') return
  gsapReady = true
  gsap.registerPlugin(DrawSVGPlugin)
}

// ScrollTrigger keeps a rAF loop alive once registered, so it is fetched and registered only where a scrubbed tween needs it
let scrollTrigger = null
let scrollTriggerLoad = null
const scrollTriggerWaiters = new Set()

export function loadScrollTrigger() {
  scrollTriggerLoad ??= import('gsap/ScrollTrigger').then(({ ScrollTrigger }) => {
    gsap.registerPlugin(ScrollTrigger)
    scrollTrigger = ScrollTrigger
    // Inter swaps in after the first layout, so trigger positions are measured again once fonts settle
    if (document.fonts?.status === 'loading') document.fonts.ready.then(() => ScrollTrigger.refresh())
    scrollTriggerWaiters.forEach((waiter) => waiter.start())
    scrollTriggerWaiters.clear()
    return ScrollTrigger
  })
  return scrollTriggerLoad
}

// Runs fn(ScrollTrigger) once ScrollTrigger is in use (now, or whenever it loads); fn may return a cleanup; returns the unsubscribe
export function onScrollTrigger(fn) {
  let cleanup = null
  const waiter = { start: () => (cleanup = fn(scrollTrigger) ?? null) }
  if (scrollTrigger) waiter.start()
  else scrollTriggerWaiters.add(waiter)
  return () => {
    scrollTriggerWaiters.delete(waiter)
    cleanup?.()
  }
}

// Setup jobs queued by afterPaint, run in document order one per task once the hydration commit has painted
const jobs = []
let draining = false

function drain() {
  jobs.shift()?.run()
  if (jobs.length) setTimeout(drain, 0)
  else draining = false
}

// Runs fn after the next paint in a task of its own, so hydration and section setup never form one long task; returns a cancel function
export function afterPaint(fn) {
  const job = { run: fn }
  jobs.push(job)
  if (!draining) {
    draining = true
    requestAnimationFrame(() => setTimeout(drain, 0))
  }
  return () => {
    const i = jobs.indexOf(job)
    if (i >= 0) jobs.splice(i, 1)
  }
}

// Where a section lands under the floating nav: the root's scroll-padding-top (global.css), which jumps, scrollIntoView and focus all honour
export const navLine = () => parseFloat(window.getComputedStyle(document.documentElement).scrollPaddingTop) || 0

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

export { gsap }
