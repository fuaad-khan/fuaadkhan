import { useCallback, useEffect, useRef, useState } from 'react'

// The active section is the one crossing a thin band 45–50 % down the viewport
const BAND = '-45% 0px -50% 0px'
// A held (clicked) section is released this long after the last scroll event, or at the cap, whichever comes first
const QUIET = 160
const CAP = 2500

// Tracks the [data-section] under the band: null on the server and until the first observation, then its id
export function useActiveSection() {
  const [active, setActive] = useState(null)
  const visible = useRef(new Map())
  const order = useRef([])
  const held = useRef(null)

  // The last section in page order that crosses the band (two can touch it at a boundary)
  const current = useCallback(() => order.current.filter((id) => visible.current.get(id)).pop() ?? null, [])

  useEffect(() => {
    const sections = [...document.querySelectorAll('[data-section]')]
    order.current = sections.map((section) => section.dataset.section)
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) visible.current.set(entry.target.dataset.section, entry.isIntersecting)
        if (held.current) return
        const id = current()
        if (id) setActive(id)
      },
      { rootMargin: BAND },
    )
    sections.forEach((section) => io.observe(section))
    return () => {
      io.disconnect()
      held.current?.()
    }
  }, [current])

  // A nav click shows its section at once and ignores the sections a smooth scroll passes until the page comes to rest
  const hold = useCallback(
    (id) => {
      held.current?.()
      setActive(id)
      const end = () => release(true)
      const stop = () => release(false)
      const cap = setTimeout(end, CAP)
      // The first wait is longer: it also covers a click on the section already in place, where no scroll event ever fires
      let quiet = setTimeout(end, QUIET * 3)
      const settle = () => {
        clearTimeout(quiet)
        quiet = setTimeout(end, QUIET)
      }
      function release(resync) {
        clearTimeout(quiet)
        clearTimeout(cap)
        window.removeEventListener('scroll', settle)
        window.removeEventListener('scrollend', end)
        if (held.current === stop) held.current = null
        const now = resync && current()
        if (now) setActive(now)
      }
      window.addEventListener('scroll', settle, { passive: true })
      window.addEventListener('scrollend', end)
      held.current = stop
    },
    [current],
  )

  return [active, hold]
}
