import { useLayoutEffect } from 'react'
import { afterPaint, gsap, MOTION_OK, setupGsap } from '../../hooks/useChapter'

// Seconds: a beat before the first leg, each leg's draw, the gap between legs, and the fade of the stop a leg reaches
const LEAD = 0.25
const LEGS = [1, 1.15]
const GAP = 0.15
const ARRIVE = 0.35
// Points sampled along each leg for the marker's keyframes (linear between them, eased as a whole like the drawn line)
const SAMPLES = 32
// Share of the map that must be on screen before the route plays
const SHOWN = 0.45

// The paused route draw (about 3 s): per leg the line and the marker riding it, then the stop it reaches; a halo pulse on arrival
function buildDraw(root) {
  const q = gsap.utils.selector(root)
  const routes = q('[data-route]')
  const pins = q('[data-pin]')
  const [marker] = q('[data-marker]')
  const [halo] = q('[data-halo]')
  const tl = gsap.timeline({ paused: true })
  let at = LEAD

  routes.forEach((route, k) => {
    const span = LEGS[Math.min(k, LEGS.length - 1)]
    const length = route.getTotalLength()
    const path = Array.from({ length: SAMPLES + 1 }, (_, n) => route.getPointAtLength((length * n) / SAMPLES))
    // fromTo mirrors the undrawn, hidden states declared in CSS, so first paint and the timeline agree
    tl.fromTo(route, { drawSVG: 0 }, { drawSVG: '100%', duration: span, ease: 'power1.inOut' }, at)
      .to(
        marker,
        {
          keyframes: { '--mx': path.map((p) => `${p.x}px`), '--my': path.map((p) => `${p.y}px`), easeEach: 'none' },
          duration: span,
          ease: 'power1.inOut',
        },
        at,
      )
      .fromTo(pins[k + 1], { autoAlpha: 0 }, { autoAlpha: 1, duration: ARRIVE, ease: 'power1.out' }, at + span - 0.1)
    at += span + GAP
  })

  return tl
    .fromTo(halo, { attr: { r: 12 }, opacity: 0.55 }, { attr: { r: 30 }, opacity: 0, duration: 1, ease: 'power2.out' }, at - GAP)
    .set(halo, { attr: { r: 12 } })
    .to(halo, { opacity: 0.55, duration: 0.5, ease: 'power1.out' })
}

// Plays the Journey route once when the map comes into view; a map already scrolled past shows the finished route
export function useDrawOnView(ref) {
  useLayoutEffect(() => {
    const root = ref.current
    if (!root) return
    const mm = gsap.matchMedia()

    const cancel = afterPaint(() => {
      setupGsap()
      mm.add(MOTION_OK, () => {
        const tl = buildDraw(root)
        if (root.getBoundingClientRect().bottom < 0) {
          tl.progress(1)
          return
        }
        const io = new IntersectionObserver(
          ([entry]) => {
            if (entry.intersectionRatio < SHOWN - 0.01) return
            io.disconnect()
            tl.play()
          },
          { threshold: [SHOWN] },
        )
        io.observe(root)
        return () => io.disconnect()
      })
    })

    return () => {
      cancel()
      mm.revert()
    }
  }, [ref])
}
