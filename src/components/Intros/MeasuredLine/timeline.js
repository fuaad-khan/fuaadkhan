import { cubicBezier } from './scene'

// Green Check's motion tokens (greenCheck.css:376-381) and the CSS ease-out keyword
const EASE = cubicBezier(0.2, 0, 0, 1)
const EASE_OUT = cubicBezier(0.2, 0.8, 0.2, 1)
const EASE_SPRING = cubicBezier(0.34, 1.56, 0.64, 1)
const CSS_EASE_OUT = cubicBezier(0, 0, 0.58, 1)

// The intro maps t linearly onto these seconds of the app's own flow: t = seconds / DURATION
export const DURATION = 5.2

// Beat starts in seconds; durations inside buildTimeline are the app's keyframe lengths (greenCheck.css:436-455, 837-876)
export const BEATS = {
  // Parcel tint, .35 s
  tint: 0,
  // Pin drop, .26 s (pin-drop)
  pin: 0.35,
  // Pin ping, .6 s after its 300 ms delay (pin-ping)
  ping: 0.65,
  // The building in use fills orange
  footprint: 0.7,
  // Dashed line marches out from the building, .52 s (dash-march)
  line: 0.9,
  // Exclusion zone, .28 s (zone-in)
  ring: 1.42,
  // The feet label, .2 s (label-in)
  pill: 1.54,
  // Not Eligible card, .28 s, icon pop .22 s (verdict-in, icon-pop)
  verdict: 1.9,
  // Rows 35 ms apart, .24 s each (row-in)
  rows: 2.0,
  // Verify distance highlights; fills drop away as in the app's verify mode
  verify: 2.8,
  // The row shows Complete; both handles pulse twice, .9 s each (handle-pulse)
  verifying: 2.96,
  // The far endpoint glides to the property line while the feet count up
  drag: 3.1,
  // Released; the pointer heads for Complete
  dragEnd: 4.0,
  // Complete pressed
  complete: 4.2,
  // The row passes and Measured by hand springs in, .36 s (stamp-in)
  rejudge: 4.28,
  // The verdict flips to Eligible and the rows replay their entrance, held from 4.92 s for the Showcase's dissolve
  flip: 4.5,
}

// Regions the camera visits in order (scene ROIs); on frames large enough to read, each resolves to the whole app
export const CAMERA_PATH = ['wide', 'map', 'verdict', 'row', 'map', 'row', 'final', 'wide']
// Anchors the pointer travels between in act 2
export const CURSOR_PATH = ['enter', 'verify', 'handle', 'complete', 'leave']

// Start states, applied before the timeline is built so rewinding to t = 0 restores exactly these
export function setInitial(gsap, el) {
  gsap.set(el('parcel'), { drawSVG: '0%', fillOpacity: 0 })
  gsap.set(el('footprint'), { fillOpacity: 0, strokeOpacity: 0 })
  gsap.set(el('pin'), { y: -12, opacity: 0 })
  gsap.set(el('ping'), { scale: 0.4, opacity: 0, transformOrigin: '50% 50%' })
  gsap.set([...el('ring'), ...el('neighbour')], { strokeOpacity: 0, fillOpacity: 0 })
  gsap.set(el('auto-reveal'), { drawSVG: '0%' })
  gsap.set([...el('auto-line'), ...el('hand-line')], { strokeDashoffset: 48 })
  gsap.set(el('auto-dot'), { scale: 0, transformOrigin: '50% 50%' })
  gsap.set([...el('verify'), ...el('hand')], { autoAlpha: 0 })
  gsap.set(el('pulse'), { scale: 1, opacity: 0, transformOrigin: '50% 50%' })
  gsap.set([...el('halo'), ...el('label')], { opacity: 0 })
  gsap.set([...el('v-fail'), ...el('v-pass')], { autoAlpha: 0 })
  gsap.set([...el('vc-fail'), ...el('vc-pass')], { opacity: 0 })
  gsap.set([...el('vt-fail'), ...el('vt-pass')], { y: 6 })
  gsap.set([...el('vi-fail'), ...el('vi-pass')], { scale: 0.85 })
  gsap.set([...el('list1'), ...el('list2')], { autoAlpha: 0 })
  gsap.set([...el('item1'), ...el('item2')], { opacity: 0, y: 4 })
  gsap.set([...el('res-bg'), ...el('res-pass'), ...el('chip-verify'), ...el('chip-pass'), ...el('act-drag'), ...el('act-done')], { autoAlpha: 0 })
  gsap.set([...el('verify-tint'), ...el('complete-tint')], { opacity: 0 })
  gsap.set(el('stamp'), { scale: 0.85, opacity: 0, transformOrigin: '0% 50%' })
  gsap.set(el('reset'), { opacity: 0 })
  gsap.set(el('cursor-arrow'), { opacity: 0, scale: 1, transformOrigin: '0% 0%' })
  gsap.set(el('ripple'), { scale: 0, opacity: 0 })
}

// One paused timeline in app seconds; proxies carry the camera, the pointer and the drag for the per-frame painter
export function buildTimeline(gsap, el, proxies) {
  const B = BEATS
  const tl = gsap.timeline({ paused: true, defaults: { ease: 'none' } })
  const at = (targets, vars, time) => tl.to(targets, vars, time)

  // A verdict change: the old content fades first, the new card's colour fades in over it, then its text rises (verdict-in) and its icon pops (icon-pop)
  const swap = (from, to, time) => {
    at(el(`vc-${from}`), { opacity: 0, duration: 0.08 }, time)
    at(el(`v-${to}`), { autoAlpha: 1, duration: 0.16, ease: EASE }, time)
    tl.set(el(`v-${from}`), { autoAlpha: 0 }, time + 0.16)
    at(el(`vc-${to}`), { opacity: 1, duration: 0.12 }, time + 0.06)
    at(el(`vt-${to}`), { y: 0, duration: 0.28, ease: EASE_OUT }, time)
    at(el(`vi-${to}`), { scale: 1, duration: 0.22, ease: EASE_OUT }, time)
  }

  // A press: the pointer dips, a ripple spreads from its tip
  const click = (time) => {
    at(el('cursor-arrow'), { scale: 0.85, duration: 0.05 }, time)
    at(el('cursor-arrow'), { scale: 1, duration: 0.08 }, time + 0.05)
    tl.set(el('ripple'), { scale: 0, opacity: 0.5 }, time)
    at(el('ripple'), { scale: 1, opacity: 0, duration: 0.25, ease: EASE_OUT }, time)
  }

  // Act 1, the map: parcel, pin, building, then the measurement
  at(el('parcel'), { drawSVG: '100%', fillOpacity: 0.25, duration: 0.35, ease: EASE_OUT }, B.tint)
  at(el('pin'), { y: 0, duration: 0.26, ease: EASE_OUT }, B.pin)
  at(el('pin'), { opacity: 1, duration: 0.08 }, B.pin)
  tl.set(el('ping'), { scale: 0.4, opacity: 0.9 }, B.ping)
  at(el('ping'), { scale: 2.4, opacity: 0, duration: 0.6, ease: EASE_OUT }, B.ping)
  at(el('footprint'), { fillOpacity: 0.75, strokeOpacity: 1, duration: 0.2, ease: EASE_OUT }, B.footprint)
  at(el('neighbour'), { strokeOpacity: 1, fillOpacity: 0.3, duration: 0.16, ease: EASE_OUT }, B.line)
  at(el('auto-reveal'), { drawSVG: '100%', duration: 0.52, ease: EASE_OUT }, B.line)
  at(el('auto-line'), { strokeDashoffset: 0, duration: 0.52, ease: EASE_OUT }, B.line)
  at(el('auto-dot')[0], { scale: 1, duration: 0.12, ease: EASE_OUT }, B.line)
  at(el('auto-dot')[1], { scale: 1, duration: 0.12, ease: EASE_OUT }, B.line + 0.3)
  at(el('ring'), { strokeOpacity: 1, fillOpacity: 0.07, duration: 0.28, ease: CSS_EASE_OUT }, B.ring)
  at(el('label'), { opacity: 1, duration: 0.2, ease: CSS_EASE_OUT }, B.pill)

  // Act 1, the card: Checking… resolves into Not Eligible, rows stagger in
  at(el('v-arc'), { rotation: (B.verdict / 0.9) * 360, duration: B.verdict }, 0)
  swap('pending', 'fail', B.verdict)
  at(el('skel'), { autoAlpha: 0, duration: 0.12 }, B.verdict)
  at(el('list1'), { autoAlpha: 1, duration: 0.12 }, B.verdict)
  el('item1').forEach((item, i) => at(item, { opacity: 1, y: 0, duration: 0.24, ease: EASE_OUT }, B.rows + Math.min(i, 6) * 0.035))

  // Act 2: Verify distance is pressed and the map drops its fills
  at(el('verify-tint'), { opacity: 0.45, duration: 0.06 }, B.verify - 0.04)
  at(el('verify-tint'), { opacity: 1, duration: 0.04 }, B.verify + 0.04)
  at(el('verify-btn'), { scale: 0.98, duration: 0.04 }, B.verify + 0.04)
  at(el('verify-btn'), { scale: 1, duration: 0.06 }, B.verify + 0.1)
  at([...el('parcel'), ...el('footprint'), ...el('neighbour'), ...el('ring')], { fillOpacity: 0, duration: 0.18, ease: EASE }, B.verify + 0.1)
  tl.set(el('auto'), { autoAlpha: 0 }, B.verifying)
  tl.set(el('verify'), { autoAlpha: 1 }, B.verifying)
  at(el('res-bg'), { autoAlpha: 1, duration: 0.18, ease: EASE }, B.verifying)
  at([...el('act-verify'), ...el('chip-fail')], { autoAlpha: 0, duration: 0.1 }, B.verifying)
  at([...el('act-drag'), ...el('chip-verify')], { autoAlpha: 1, duration: 0.12 }, B.verifying)
  tl.set(el('pulse'), { scale: 1, opacity: 0.9 }, B.verifying)
  at(el('pulse'), { scale: 2.3, opacity: 0, duration: 0.9, ease: EASE_OUT, repeat: 1 }, B.verifying)

  // The far endpoint is grabbed, dragged to the property line and released
  at(el('halo'), { opacity: 1, duration: 0.1 }, B.drag)
  at(proxies.drag, { p: 1, duration: B.dragEnd - B.drag, ease: 'power2.inOut' }, B.drag)
  at(el('halo'), { opacity: 0, duration: 0.12 }, B.dragEnd)

  // Complete: the row re-judges, the stamp springs in, the map redraws the hand line with its fills back
  at(el('complete-tint'), { opacity: 0.5, duration: 0.06 }, B.complete - 0.06)
  at(el('complete-tint'), { opacity: 1, duration: 0.04 }, B.complete)
  at(el('complete-btn'), { scale: 0.98, duration: 0.04 }, B.complete)
  at(el('complete-btn'), { scale: 1, duration: 0.06 }, B.complete + 0.05)
  tl.set(el('verify'), { autoAlpha: 0 }, B.rejudge)
  tl.set(el('hand'), { autoAlpha: 1 }, B.rejudge)
  at(el('hand-line'), { strokeDashoffset: 0, duration: 0.52, ease: EASE_OUT }, B.rejudge)
  tl.set(el('label'), { opacity: 0 }, B.rejudge)
  at(el('label'), { opacity: 1, duration: 0.2, ease: CSS_EASE_OUT }, B.rejudge + 0.12)
  at(el('parcel'), { fillOpacity: 0.25, duration: 0.18, ease: EASE }, B.rejudge)
  at(el('footprint'), { fillOpacity: 0.75, duration: 0.18, ease: EASE }, B.rejudge)
  at(el('neighbour'), { fillOpacity: 0.3, duration: 0.18, ease: EASE }, B.rejudge)
  at(el('ring'), { fillOpacity: 0.07, duration: 0.28, ease: CSS_EASE_OUT }, B.rejudge)
  at([...el('res-bg'), ...el('act-drag'), ...el('chip-verify')], { autoAlpha: 0, duration: 0.12 }, B.rejudge)
  at(el('res-fail'), { autoAlpha: 0, duration: 0.14 }, B.rejudge)
  at([...el('res-pass'), ...el('chip-pass')], { autoAlpha: 1, duration: 0.18 }, B.rejudge)
  tl.set(el('act-done'), { autoAlpha: 1 }, B.rejudge)
  at(el('stamp'), { scale: 1, opacity: 1, duration: 0.36, ease: EASE_SPRING }, B.rejudge)
  at(el('reset'), { opacity: 1, duration: 0.18, ease: EASE }, B.rejudge)

  // The verdict flips to Eligible; the list re-renders as the app's does, rows staggering in again
  swap('fail', 'pass', B.flip)
  tl.set(el('list1'), { autoAlpha: 0 }, B.flip)
  tl.set(el('list2'), { autoAlpha: 1 }, B.flip)
  el('item2').forEach((item, i) => at(item, { opacity: 1, y: 0, duration: 0.24, ease: EASE_OUT }, B.flip + Math.min(i, 6) * 0.035))

  // Camera: wide, map, verdict, row, map, row, final, wide (each move .16–.6 s, eased in and out)
  const moves = [[0.15, 0.75], [1.78, 2.08], [2.5, 2.74], [2.98, 3.22], [4.0, 4.22], [4.46, 4.62], [4.82, 5.14]]
  moves.forEach(([start, end], i) => at(proxies.cam, { k: i + 1, duration: end - start, ease: 'power2.inOut' }, start))

  // Pointer: in to Verify, click, over to the handle, drag, over to Complete, click, away
  at(el('cursor-arrow'), { opacity: 1, duration: 0.1 }, 2.5)
  at(proxies.cur, { k: 1, duration: 0.28, ease: 'power2.out' }, 2.5)
  click(B.verify + 0.04)
  at(proxies.cur, { k: 2, duration: B.drag - 2.96, ease: 'power2.inOut' }, 2.96)
  at(el('cursor-arrow'), { scale: 0.88, duration: 0.05 }, B.drag)
  tl.set(el('ripple'), { scale: 0, opacity: 0.5 }, B.drag)
  at(el('ripple'), { scale: 1, opacity: 0, duration: 0.25, ease: EASE_OUT }, B.drag)
  at(el('cursor-arrow'), { scale: 1, duration: 0.08 }, B.dragEnd)
  at(proxies.cur, { k: 3, duration: B.complete - 0.02 - (B.dragEnd + 0.02), ease: 'power2.inOut' }, B.dragEnd + 0.02)
  click(B.complete)
  at(proxies.cur, { k: 4, duration: 0.2, ease: 'power2.in' }, B.complete + 0.1)
  at(el('cursor-arrow'), { opacity: 0, duration: 0.14 }, B.complete + 0.14)

  // Pads the timeline to exactly DURATION, so t = 1 is the held final frame
  tl.set({}, {}, DURATION)
  return tl
}
