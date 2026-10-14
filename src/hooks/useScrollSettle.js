import { useEffect } from 'react'
import { MOTION_OK, navLine } from './useChapter'

// How near (px) a section head must come to the nav line before the page eases onto it: 12% of the viewport, 48–120 px
const reach = () => Math.min(120, Math.max(48, window.innerHeight * 0.12))
// Without scrollend, a scroll counts as finished after this long without a scroll event
const QUIET = 150
// A wheel or touch older than this (with no scroll since) no longer owns the next scroll that ends
const STALE = 3000

// The heads a settle can land on, in page order with the section above each: everything but the hero
function heads() {
  const all = [...document.querySelectorAll('[data-section]')]
  return all.map((el, i) => ({ el, prev: all[i - 1] ?? null })).filter(({ el }) => el.dataset.section !== 'top')
}

// The head the page should ease onto after a scroll that moved in dir (1 down, -1 up), or null
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
    if (!best || Math.abs(d) < Math.abs(best)) best = d
  }
  return best
}

// After a wheel or touch scroll of the page comes to rest near a section head it was heading for, ease the head under the nav (the owner's "snap to the showcase")
export function useScrollSettle() {
  useEffect(() => {
    const motion = window.matchMedia(MOTION_OK)
    const hasScrollEnd = 'onscrollend' in window
    // The reader's current gesture: where it started, its last direction, when it was last fed
    let gesture = null
    let touch = null
    let quiet = 0
    let lastY = window.scrollY

    const feed = (source) => {
      const now = performance.now()
      if (!gesture || now - gesture.at > STALE) gesture = { source, dir: 0, at: now }
      else gesture.at = now
    }
    // Keys, clicks and taps take the scroll out of the reader's hands: their jumps (and focus scrolling) never settle
    const drop = () => {
      gesture = null
    }

    const settle = () => {
      // A finger still down keeps its gesture: it settles once the finger lifts and any fling has ended
      if (touch) return
      const g = gesture
      gesture = null
      if (!g || !motion.matches || !g.dir || performance.now() - g.at > STALE) return
      const d = pick(g.dir)
      if (d === null) return
      const max = document.documentElement.scrollHeight - window.innerHeight
      const to = Math.max(0, Math.min(max, window.scrollY + d))
      if (Math.abs(to - window.scrollY) >= 1) window.scrollTo({ top: to, behavior: 'smooth' })
    }

    const onWheel = (e) => {
      // Pinch zoom and sideways swipes (the gallery tracks) are not page scrolls
      if (e.ctrlKey || Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return
      feed('wheel')
    }
    const onTouchStart = (e) => {
      gesture = null
      touch = { x: e.touches[0]?.clientX ?? 0, y: e.touches[0]?.clientY ?? 0 }
    }
    const onTouchMove = (e) => {
      const t = e.touches[0]
      if (!touch || !t) return
      if (Math.abs(t.clientY - touch.y) > Math.abs(t.clientX - touch.x)) feed('touch')
    }
    // The finger is up; the fling (if any) still has to end, which scrollend (or the quiet timer) reports
    const onTouchEnd = (e) => {
      if (e.touches.length) return
      touch = null
      if (gesture) gesture.at = performance.now()
      if (!hasScrollEnd) arm()
    }
    const arm = () => {
      clearTimeout(quiet)
      quiet = setTimeout(settle, QUIET)
    }
    const onScroll = () => {
      const y = window.scrollY
      if (gesture && y !== lastY) {
        gesture.dir = Math.sign(y - lastY)
        gesture.at = performance.now()
      }
      lastY = y
      if (!hasScrollEnd && gesture) arm()
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
    if (hasScrollEnd) window.addEventListener('scrollend', settle)
    return () => {
      clearTimeout(quiet)
      window.removeEventListener('wheel', onWheel, opts)
      window.removeEventListener('touchstart', onTouchStart, opts)
      window.removeEventListener('touchmove', onTouchMove, opts)
      window.removeEventListener('touchend', onTouchEnd, opts)
      window.removeEventListener('touchcancel', onTouchEnd, opts)
      window.removeEventListener('keydown', drop, opts)
      window.removeEventListener('mousedown', drop, opts)
      window.removeEventListener('scroll', onScroll, opts)
      window.removeEventListener('scrollend', settle)
    }
  }, [])
}
