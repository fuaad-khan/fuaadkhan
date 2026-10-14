import { useCallback, useEffect, useRef, useState } from 'react'

// Seconds an intro holds its final frame before the gallery moves on
const INTRO_HOLD = 1.2
// A card is the active one once this share of it is inside the track
const ACTIVE_AT = 0.6
// Autoplay runs while this share of the gallery (or of the viewport, if the gallery is taller) is on screen
const VISIBLE_AT = 0.5
// A jump that a swipe interrupted is settled from the scroll position after this long
const SETTLE_MS = 1600
// A clip that has not started after this many seconds plays out on its poster instead
const STALL_SECONDS = 8

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v))
const round4 = (v) => String(Math.round(clamp(v, 0, 1) * 1e4) / 1e4)

// Autoplay for one highlight gallery: the active card, the clock that plays it, and the jumps between cards
export function useGalleryPlayer({ cards, motionOK, near, regionRef, trackRef, dotsRef, videosRef, drivers }) {
  const count = cards.length
  const [active, setActive] = useState(0)
  const [mode, setModeState] = useState('idle')
  const [inView, setInView] = useState(false)
  const [fallbacks, setFallbacks] = useState(0)
  const activeRef = useRef(0)
  const modeRef = useRef('idle')
  const motionRef = useRef(motionOK)
  const elapsed = useRef(0)
  const fresh = useRef(true)
  const pending = useRef(null)
  const settleTimer = useRef(0)
  const failed = useRef(new Set())

  const running = motionOK && mode === 'playing' && inView

  useEffect(() => {
    motionRef.current = motionOK
  }, [motionOK])

  const setMode = useCallback((next) => {
    modeRef.current = next
    setModeState(next)
  }, [])

  // A clip that cannot play (no playable source, a decode error, autoplay refused) runs as its poster on the still timer
  const clipFailed = useCallback((i) => {
    if (failed.current.has(i)) return
    failed.current.add(i)
    setFallbacks((n) => n + 1)
  }, [])

  // Makes card i the active one; its clock, clip and intro start again from 0 the next time it runs
  const activate = useCallback(
    (i, restart = false) => {
      const prev = activeRef.current
      if (i === prev && !restart) return
      if (i !== prev) videosRef.current[prev]?.pause()
      activeRef.current = i
      elapsed.current = 0
      fresh.current = true
      setActive(i)
      drivers[i]?.emit(0)
      dotsRef.current?.children[i]?.style.setProperty('--progress', '0')
    },
    [drivers, dotsRef, videosRef],
  )

  // The card nearest the track's centre once scrolling stops, for jumps that never reached their target
  const settle = useCallback(() => {
    pending.current = null
    const track = trackRef.current
    if (!track) return
    const mid = track.scrollLeft + track.clientWidth / 2
    let best = activeRef.current
    let gap = Infinity
    Array.from(track.children).forEach((card, i) => {
      const d = Math.abs(card.offsetLeft + card.offsetWidth / 2 - mid)
      if (d < gap) {
        gap = d
        best = i
      }
    })
    activate(best)
  }, [activate, trackRef])

  // Scrolls card i to the centre (instantly under reduced motion); a viewer's jump also restarts a finished gallery
  const goTo = useCallback(
    (index, { user = false } = {}) => {
      const i = clamp(index, 0, count - 1)
      const ended = modeRef.current === 'ended'
      activate(i, user && ended)
      if (user && motionRef.current && (ended || modeRef.current === 'idle')) setMode('playing')
      const track = trackRef.current
      const card = track?.children[i]
      if (!card) return
      const left = card.offsetLeft + card.offsetWidth / 2 - track.clientWidth / 2
      if (Math.abs(track.scrollLeft - left) < 2) return
      pending.current = i
      clearTimeout(settleTimer.current)
      settleTimer.current = setTimeout(settle, motionRef.current ? SETTLE_MS : 300)
      track.scrollTo({ left, behavior: motionRef.current ? 'smooth' : 'auto' })
    },
    [activate, count, setMode, settle, trackRef],
  )

  // After a card finishes: the next one, or the end state (replay button and the Next link)
  const advance = useCallback(() => {
    const i = activeRef.current
    if (i < count - 1) {
      goTo(i + 1)
      return
    }
    dotsRef.current?.children[i]?.style.setProperty('--progress', '1')
    setMode('ended')
  }, [count, dotsRef, goTo, setMode])

  const toggle = useCallback(() => {
    const current = modeRef.current
    if (current === 'ended') goTo(0, { user: true })
    else setMode(current === 'playing' ? 'paused' : 'playing')
  }, [goTo, setMode])

  const onKeyDown = useCallback(
    (e) => {
      if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return
      const step = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0
      if (!step) return
      e.preventDefault()
      goTo(activeRef.current + step, { user: true })
    },
    [goTo],
  )

  // The gallery counts as on screen while half of it (or half the viewport) shows and the tab is visible
  useEffect(() => {
    const region = regionRef.current
    if (!region || typeof IntersectionObserver === 'undefined') return undefined
    let visible = false
    let shown = document.visibilityState !== 'hidden'
    const update = () => setInView(visible && shown)
    const io = new IntersectionObserver(
      ([entry]) => {
        const h = Math.min(entry.boundingClientRect.height, entry.rootBounds?.height || window.innerHeight)
        visible = entry.isIntersecting && entry.intersectionRect.height >= VISIBLE_AT * h - 1
        update()
      },
      { threshold: Array.from({ length: 21 }, (_, k) => k / 20) },
    )
    const onVisibility = () => {
      shown = document.visibilityState !== 'hidden'
      update()
    }
    io.observe(region)
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      io.disconnect()
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [regionRef])

  // The active card follows the track (swipes, wheel, keyboard scrolling); cards a jump passes over are ignored
  useEffect(() => {
    const track = trackRef.current
    if (!track || typeof IntersectionObserver === 'undefined') return undefined
    const ratios = new Map()
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => ratios.set(Number(entry.target.dataset.index), entry.intersectionRatio))
        let best = -1
        let top = 0
        ratios.forEach((ratio, i) => {
          if (ratio > top) {
            top = ratio
            best = i
          }
        })
        if (best < 0 || top < ACTIVE_AT) return
        if (pending.current !== null) {
          if (best !== pending.current) return
          pending.current = null
          clearTimeout(settleTimer.current)
          return
        }
        if (best === activeRef.current) return
        activate(best)
        if (motionRef.current && modeRef.current === 'ended') setMode('playing')
      },
      { root: track, threshold: [0, ACTIVE_AT, 1] },
    )
    Array.from(track.children).forEach((card) => io.observe(card))
    return () => io.disconnect()
  }, [activate, setMode, trackRef])

  // First time on screen with motion allowed: start from the first card
  useEffect(() => {
    if (motionOK && inView && modeRef.current === 'idle') setMode('playing')
  }, [inView, motionOK, setMode])

  useEffect(() => {
    const timer = settleTimer
    return () => clearTimeout(timer.current)
  }, [])

  // The clock: an intro's t and a still's timer run on rAF, a clip plays once from 0; progress lands on the active dot
  useEffect(() => {
    if (!running) return undefined
    const i = active
    const card = cards[i]
    const clip = card.kind === 'loop' && !failed.current.has(i) ? (videosRef.current[i] ?? null) : null
    // A clip that already errored while it waited as the next card plays as its poster
    if (clip?.error) failed.current.add(i)
    const video = clip?.error ? null : clip
    const driver = card.kind === 'intro' ? drivers[i] : null
    const dot = dotsRef.current?.children[i]
    const seconds = card.seconds
    let raf = 0
    let last = performance.now()
    let finished = false
    let waited = 0

    const progress = (p) => dot?.style.setProperty('--progress', round4(p))
    const finish = () => {
      if (finished) return
      finished = true
      progress(1)
      advance()
    }
    const fallBack = () => {
      if (!finished) clipFailed(i)
    }

    if (fresh.current) {
      fresh.current = false
      elapsed.current = 0
      if (video) {
        try {
          video.currentTime = 0
        } catch {
          // Not seekable yet: playback starts from 0 anyway
        }
      }
    }
    if (video) {
      video.addEventListener('ended', finish)
      video.play()?.catch?.((err) => {
        if (err?.name !== 'AbortError') fallBack()
      })
    }

    const tick = (now) => {
      const dt = clamp((now - last) / 1000, 0, 0.1)
      last = now
      if (video) {
        if (video.currentTime > 0) waited = 0
        else if ((waited += dt) > STALL_SECONDS) {
          fallBack()
          return
        }
        progress(video.duration > 0 ? video.currentTime / video.duration : 0)
      } else {
        elapsed.current += dt
        driver?.emit(elapsed.current / Math.max(0.5, seconds - INTRO_HOLD))
        progress(elapsed.current / seconds)
        if (elapsed.current >= seconds) {
          finish()
          return
        }
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)

    return () => {
      cancelAnimationFrame(raf)
      if (video) {
        video.removeEventListener('ended', finish)
        video.pause()
      }
    }
  }, [running, active, cards, drivers, dotsRef, videosRef, advance, clipFailed, fallbacks, near])

  return { active, mode, running, goTo, toggle, onKeyDown, clipFailed }
}
