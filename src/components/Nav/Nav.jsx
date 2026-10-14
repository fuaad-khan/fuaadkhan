import { useEffect, useLayoutEffect, useRef } from 'react'
import { gsap, MOTION_OK, navLine, onScrollTrigger } from '../../hooks/useChapter'
import { accentVar } from '../../styles/accent'
import { useActiveSection } from './useActiveSection'
import styles from './Nav.module.css'

// The lens glide: about 450 ms with a slight overshoot
const GLIDE = { duration: 0.45, ease: 'back.out(1.2)' }
// The morph: items slide on this clock, the outgoing labels clear in its first third and the incoming ones fade in once the slide has passed them
const MORPH = { duration: 0.42, ease: 'power3.inOut' }
const FADE_OUT = { opacity: 0, duration: 0.14, ease: 'power1.in' }
const FADE_IN = { opacity: 1, duration: 0.26, delay: 0.34, stagger: 0.05, ease: 'power1.out' }
// The lens dims in place while the outgoing labels clear, then glides at 60% of the slide: the items have nearly landed and no incoming label has appeared under it yet
const DIM = { opacity: 0.4, duration: 0.14, ease: 'power1.out' }
const LENS_AFTER = MORPH.duration * 0.6
const SHOW = 0.3
// How long after mount a load at /#section keeps correcting its landing (load-time refreshes all happen well inside it)
const LAND_WINDOW = 5000

const motionOK = () => window.matchMedia(MOTION_OK).matches

// Flip loads with the first section change past the hero, off the critical path but well before the reader reaches an app
let Flip = null
let flipLoad = null
const loadFlip = () => {
  flipLoad ??= import('gsap/Flip').then((mod) => {
    gsap.registerPlugin(mod.Flip)
    Flip = mod.Flip
  })
  return flipLoad
}

// The active item's box inside the bar, or null to hide the lens (the hero, or an item this width does not show)
function lensTarget(list) {
  const id = list.dataset.active
  const item = id && id !== 'top' ? list.querySelector(`[data-nav="${id}"]`) : null
  if (!item?.offsetWidth) return null
  return { x: item.offsetLeft, width: item.offsetWidth, accent: item.style.getPropertyValue('--item-accent') }
}

// Puts the lens on the active item of the current layout (a glide when it is already showing, otherwise in place) and records which section it went to
function placeLens(list, lens, state, { glide, motion }) {
  const target = lensTarget(list)
  state.placed = list.dataset.active ?? null
  if (!target) {
    state.shown = false
    gsap.to(lens, { autoAlpha: 0, duration: motion ? 0.25 : 0, ease: 'power1.out', overwrite: 'auto' })
    return
  }
  // An app's accent rims the lens; the hub and the other sections keep it neutral
  lens.toggleAttribute('data-accent', Boolean(target.accent))
  if (target.accent) lens.style.setProperty('--lens-accent', target.accent)
  if (glide && state.shown) gsap.to(lens, { x: target.x, width: target.width, ...GLIDE, overwrite: 'auto' })
  else gsap.set(lens, { x: target.x, width: target.width, overwrite: 'auto' })
  gsap.to(lens, { autoAlpha: 1, duration: motion ? SHOW : 0, ease: 'power1.out', overwrite: 'auto' })
  state.shown = true
}

// Floating glass nav: plain anchor links, a lens on the active section, and the hub item morphing into the apps inside an app section
export default function Nav({ site, apps }) {
  const { nav } = site
  const listRef = useRef(null)
  const lensRef = useRef(null)
  const lensState = useRef({ shown: false, placed: null })
  const morph = useRef({ id: 0, tl: null })
  const [active, hold] = useActiveSection()
  // The hub keeps My Applications in the bar (current, under the lens); only an app section expands it into the three apps
  const inApps = apps.some((app) => app.id === active)

  const items = [
    { id: 'journey', label: nav.journey, kind: 'section' },
    { id: 'applications', label: nav.applications, kind: 'hub' },
    ...apps.map((app) => ({ id: app.id, label: app.name, kind: 'app', accent: accentVar(app.accent) })),
    { id: 'contact', label: nav.contact, kind: 'section' },
  ]

  // Morph first (so the layout is final), then the lens: at once, or partway through the morph's slide
  useLayoutEffect(() => {
    const list = listRef.current
    const lens = lensRef.current
    if (!list || !lens || active === null) return
    const motion = motionOK()
    // The first section resolved after hydration is applied in place; only later changes morph and glide
    const animate = motion && list.dataset.ready === 'true'
    list.dataset.ready = 'true'
    if (motion && active !== 'top') loadFlip()

    if (list.hasAttribute('data-expanded') !== inApps) {
      // A newer morph supersedes any in flight; getState completes the old one, whose callback must then do nothing
      const id = ++morph.current.id
      const state = animate && Flip ? Flip.getState(list.children) : null
      list.toggleAttribute('data-expanded', inApps)
      if (state) {
        const lensOn = lensState.current
        if (lensOn.shown) gsap.to(lens, { ...DIM, overwrite: 'auto' })
        gsap.delayedCall(LENS_AFTER, () => {
          if (id === morph.current.id) placeLens(list, lens, lensOn, { glide: true, motion })
        })
        morph.current.tl = Flip.from(state, {
          ...MORPH,
          absoluteOnLeave: true,
          onLeave: (els) => gsap.to(els, { ...FADE_OUT }),
          onEnter: (els) => gsap.fromTo(els, { opacity: 0 }, { ...FADE_IN }),
          // A section reached while the items were still sliding gets the lens now
          onComplete: () => {
            if (id === morph.current.id && lensOn.placed !== list.dataset.active) placeLens(list, lens, lensOn, { glide: true, motion })
          },
        })
        return
      }
    }
    // Mid-morph the items are still sliding: the morph places the lens on whichever section is active by then
    if (morph.current.tl?.isActive()) return
    placeLens(list, lens, lensState.current, { glide: animate, motion })
  }, [active, inApps])

  // A load at /#section lands at once and stays: a warm-cache browser jumps only after the load event (smooth by then, html.loaded), the font swap can nudge it, and a ScrollTrigger refresh (desktop drift) can undo it, so land now, on load, once fonts settle and after each refresh, until the reader acts
  useEffect(() => {
    const id = decodeURIComponent(window.location.hash.slice(1))
    const target = id ? document.getElementById(id) : null
    if (!target?.hasAttribute('data-section')) return
    let live = true
    const land = () => {
      if (!live) return
      const max = document.documentElement.scrollHeight - window.innerHeight
      const want = Math.max(0, Math.min(max, target.getBoundingClientRect().top + window.scrollY - navLine()))
      if (Math.abs(window.scrollY - want) > 1) target.scrollIntoView({ behavior: 'instant', block: 'start' })
    }
    const off = onScrollTrigger((ScrollTrigger) => {
      ScrollTrigger.addEventListener('refresh', land)
      return () => ScrollTrigger.removeEventListener('refresh', land)
    })
    const acts = ['wheel', 'touchstart', 'keydown', 'pointerdown']
    const stop = () => {
      live = false
      clearTimeout(timer)
      off()
      window.removeEventListener('load', land)
      acts.forEach((type) => window.removeEventListener(type, stop))
    }
    const timer = setTimeout(stop, LAND_WINDOW)
    acts.forEach((type) => window.addEventListener(type, stop, { passive: true }))
    window.addEventListener('load', land)
    document.fonts?.ready.then(() => requestAnimationFrame(land))
    land()
    return stop
  }, [])

  // A resize (a breakpoint changes the item sizes) re-measures and moves the lens without animating
  useEffect(() => {
    let frame = 0
    const place = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        const list = listRef.current
        const target = list && lensState.current.shown && lensTarget(list)
        if (target) gsap.set(lensRef.current, { x: target.x, width: target.width })
      })
    }
    window.addEventListener('resize', place)
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('resize', place)
    }
  }, [])

  // In-page jumps: smooth (instant under reduced motion), the hash replaced rather than pushed, focus moved to the section
  const go = (event) => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
    const id = event.currentTarget.hash.slice(1)
    const target = document.getElementById(id)
    if (!target) return
    event.preventDefault()
    hold(id)
    target.scrollIntoView({ behavior: motionOK() ? 'smooth' : 'instant', block: 'start' })
    history.replaceState(history.state, '', `#${id}`)
    if (!target.hasAttribute('tabindex')) target.setAttribute('tabindex', '-1')
    target.focus({ preventScroll: true })
  }

  return (
    <nav className={styles.nav} aria-label={nav.label} data-audit="background">
      <div className={styles.bar}>
        <a href="#top" className={styles.home} onClick={go}>
          {nav.home}
        </a>
        <span ref={lensRef} className={styles.lens} aria-hidden="true" data-lens />
        <ul ref={listRef} className={styles.list} data-active={active ?? undefined}>
          {items.map((item) => (
            <li key={item.id} data-kind={item.kind} data-nav={item.id} style={item.accent ? { '--item-accent': item.accent } : undefined}>
              <a href={`#${item.id}`} className={styles.link} aria-current={active === item.id ? 'location' : undefined} onClick={go}>
                {item.label}
              </a>
            </li>
          ))}
        </ul>
      </div>
    </nav>
  )
}
