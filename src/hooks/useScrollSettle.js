import { useEffect } from 'react'
import { MOTION_OK, navLine } from './useChapter'

// How near (px) a section head must come to the nav line before the page eases onto it: 12% of the viewport, 48–120 px
const reach = () => Math.min(120, Math.max(48, window.innerHeight * 0.12))
// A scroll has ended at scrollend, or after QUIET ms without a scroll event; the settle waits SETTLE ms more for the reader's next notch or touch
const QUIET = 150
const SETTLE = 180
// A wheel or touch older than this (with no scroll since) no longer owns the next scroll that ends
const STALE = 3000
// The ease onto the head: an ease-out over about a third of a second, longer for longer distances
const easeOut = (t) => 1 - (1 - t) ** 3
const duration = (d) => Math.min(420, 240 + Math.abs(d) * 1.5)

// The heads a settle can land on, in page order with the section above each: everything but the hero
function heads() {
  const all = [...document.querySelectorAll('[data-section]')]
  return all.map((el, i) => ({ el, prev: all[i - 1] ?? null })).filter(({ el }) => el.dataset.section !== 'top')
}

// How far (px) the page should travel to put a head under the nav after a scroll that moved in dir (1 down, -1 up), or null
function pick(dir) {
  const line = navLine()
  const vh = window.innerHeight
  const near = reach()
  let best = null
  for (const { el, prev } of heads()) {
    const d = el.getBoundingClientRect().top - line
    // Only a head still ahead in the direction of travel: the settle continues the scroll, never pulls it back
    if (dir > 0 ? d <= 0 || d > near : d >= 0 || d < -near) continue
    // Settling down hides the last d px of the section above; for one taller than the viewport only its bottom padding may go
    if (dir > 0 && prev && prev.offsetHeight > vh && d > parseFloat(window.getComputedStyle(prev).paddingBottom)) continue
    if (best === null || Math.abs(d) < Math.abs(best)) best = d
  }
  return best
}

// After a wheel or touch scroll of the page comes to rest near a section head it was heading for, ease that head under the nav (the owner's "snap to the showcase"); any new input stops it
export function useScrollSettle() {
  useEffect(() => {
    const motion = window.matchMedia(MOTION_OK)
    // The reader's current gesture (its last direction, when it was last fed) and the finger, if one is down
    let gesture = null
    let touch = null
    let quiet = 0
    let pending = 0
    let frame = 0
    let lastY = window.scrollY

    const cancel = () => {
      clearTimeout(pending)
      pending = 0
      cancelAnimationFrame(frame)
      frame = 0
    }
    const feed = () => {
      cancel()
      const now = performance.now()
      if (!gesture || now - gesture.at > STALE) gesture = { dir: 0, at: now }
      else gesture.at = now
    }
    // Keys, clicks and taps take the scroll out of the reader's hands: their jumps (and focus scrolling) never settle
    const drop = () => {
      cancel()
      gesture = null
    }

    // Eases by d px in instant rAF steps, so the reader's next wheel or touch simply takes over
    const ease = (d) => {
      const from = window.scrollY
      const max = document.documentElement.scrollHeight - window.innerHeight
      const to = Math.max(0, Math.min(max, from + d))
      if (Math.abs(to - from) < 1) return
      const start = performance.now()
      const span = duration(to - from)
      const step = (now) => {
        const t = Math.min(1, (now - start) / span)
        window.scrollTo({ top: from + (to - from) * easeOut(t), behavior: 'instant' })
        frame = t < 1 ? requestAnimationFrame(step) : 0
      }
      frame = requestAnimationFrame(step)
    }

    const settle = () => {
      pending = 0
      const g = gesture
      gesture = null
      if (!g || !motion.matches || !g.dir || performance.now() - g.at > STALE) return
      const d = pick(g.dir)
      if (d !== null) ease(d)
    }
    // The scroll has come to rest: settle once the reader's input stays quiet a moment (a finger still down keeps its gesture for later)
    const ended = () => {
      clearTimeout(quiet)
      if (touch || !gesture || pending) return
      pending = setTimeout(settle, SETTLE)
    }
    const arm = () => {
      clearTimeout(quiet)
      quiet = setTimeout(ended, QUIET)
    }

    const onWheel = (e) => {
      // Pinch zoom and sideways swipes (the gallery tracks) are not page scrolls
      if (e.ctrlKey || Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return
      feed()
    }
    const onTouchStart = (e) => {
      drop()
      touch = { x: e.touches[0]?.clientX ?? 0, y: e.touches[0]?.clientY ?? 0 }
    }
    const onTouchMove = (e) => {
      const t = e.touches[0]
      if (touch && t && Math.abs(t.clientY - touch.y) > Math.abs(t.clientX - touch.x)) feed()
    }
    // The finger is up; a fling keeps scrolling (and re-arming the quiet timer) until it ends
    const onTouchEnd = (e) => {
      if (e.touches.length) return
      touch = null
      if (!gesture) return
      gesture.at = performance.now()
      arm()
    }
    const onScroll = () => {
      const y = window.scrollY
      if (gesture && !frame && y !== lastY) {
        gesture.dir = Math.sign(y - lastY)
        gesture.at = performance.now()
      }
      lastY = y
      if (gesture) arm()
    }

    const opts = { passive: true }
    window.addEventListener('wheel', onWheel, opts)
    window.addEventListener('touchstart', onTouchStart, opts)
    window.addEventListener('touchmove', onTouchMove, opts)
    window.addEventListener('touchend', onTouchEnd, opts)
    window.addEventListener('touchcancel', onTouchEnd, opts)
    window.addEventListener('keydown', drop, opts)
    window.addEventListener('mousedown', drop, opts)
    window.addEventListener('scroll', onScroll, opts)
    window.addEventListener('scrollend', ended)
    return () => {
      clearTimeout(quiet)
      cancel()
      window.removeEventListener('wheel', onWheel, opts)
      window.removeEventListener('touchstart', onTouchStart, opts)
      window.removeEventListener('touchmove', onTouchMove, opts)
      window.removeEventListener('touchend', onTouchEnd, opts)
      window.removeEventListener('touchcancel', onTouchEnd, opts)
      window.removeEventListener('keydown', drop, opts)
      window.removeEventListener('mousedown', drop, opts)
      window.removeEventListener('scroll', onScroll, opts)
      window.removeEventListener('scrollend', ended)
    }
  }, [])
}
