import { useEffect, useLayoutEffect, useRef } from 'react'
import { Flip } from 'gsap/Flip'
import { gsap, MOTION_OK, ScrollTrigger, setupGsap } from '../../hooks/useChapter'
import { accentVar } from '../../styles/accent'
import { useActiveSection } from './useActiveSection'
import styles from './Nav.module.css'

// The lens glide: about 450 ms with a slight overshoot
const GLIDE = { duration: 0.45, ease: 'back.out(1.2)' }
// The morph: items slide on this clock while the outgoing labels fade first and the incoming ones only once the slide has cleared them
const MORPH = { duration: 0.42, ease: 'power3.inOut' }
const FADE_OUT = { opacity: 0, duration: 0.14, ease: 'power1.in' }
const FADE_IN = { opacity: 1, duration: 0.26, delay: 0.26, stagger: 0.05, ease: 'power1.out' }
// How long after mount a load at /#section keeps correcting its landing (load-time refreshes all happen well inside it)
const LAND_WINDOW = 5000

const motionOK = () => window.matchMedia(MOTION_OK).matches

// Where the lens belongs for a section: the item's box inside the bar, or all three apps for the hub; null hides it
function lensTarget(list, active) {
  if (!active || active === 'top') return null
  const items = active === 'applications' ? [...list.querySelectorAll('[data-kind="app"]')] : [list.querySelector(`[data-nav="${active}"]`)]
  const shown = items.filter((item) => item?.offsetWidth)
  if (!shown.length) return null
  const first = shown[0]
  const last = shown[shown.length - 1]
  const accent = active === 'applications' ? '' : first.style.getPropertyValue('--item-accent')
  return { x: first.offsetLeft, width: last.offsetLeft + last.offsetWidth - first.offsetLeft, accent }
}

// Floating glass nav: plain anchor links, a lens on the active section, and the hub item morphing into the apps; served collapsed and lens-less
export default function Nav({ site, apps }) {
  const { nav } = site
  const listRef = useRef(null)
  const lensRef = useRef(null)
  const shown = useRef(false)
  const [active, hold] = useActiveSection()
  const inApps = active === 'applications' || apps.some((app) => app.id === active)

  const items = [
    { id: 'journey', label: nav.journey, kind: 'section' },
    { id: 'applications', label: nav.applications, kind: 'hub' },
    ...apps.map((app) => ({ id: app.id, label: app.name, kind: 'app', accent: accentVar(app.accent) })),
    { id: 'contact', label: nav.contact, kind: 'section' },
  ]

  // Morph first (so the layout is final), then glide the lens to the item measured in that layout
  useLayoutEffect(() => {
    const list = listRef.current
    const lens = lensRef.current
    if (!list || !lens || active === null) return
    setupGsap()
    gsap.registerPlugin(Flip)
    const motion = motionOK()
    // The first section resolved after hydration is applied in place; only later changes morph and glide
    const animate = motion && list.dataset.ready === 'true'
    list.dataset.ready = 'true'

    if (list.hasAttribute('data-expanded') !== inApps) {
      const state = animate ? Flip.getState(list.children) : null
      list.toggleAttribute('data-expanded', inApps)
      if (state) {
        Flip.from(state, {
          ...MORPH,
          absoluteOnLeave: true,
          onLeave: (els) => gsap.to(els, { ...FADE_OUT }),
          onEnter: (els) => gsap.fromTo(els, { opacity: 0 }, { ...FADE_IN }),
        })
      }
    }

    const target = lensTarget(list, active)
    if (!target) {
      shown.current = false
      gsap.to(lens, { autoAlpha: 0, duration: motion ? 0.25 : 0, ease: 'power1.out', overwrite: 'auto' })
      return
    }
    // The app's accent rims the lens; the hub and the other sections keep it neutral
    lens.toggleAttribute('data-accent', Boolean(target.accent))
    if (target.accent) lens.style.setProperty('--lens-accent', target.accent)
    if (animate && shown.current) gsap.to(lens, { x: target.x, width: target.width, ...GLIDE, overwrite: 'auto' })
    else gsap.set(lens, { x: target.x, width: target.width, overwrite: 'auto' })
    if (!shown.current) gsap.to(lens, { autoAlpha: 1, duration: motion ? 0.3 : 0, ease: 'power1.out' })
    shown.current = true
  }, [active, inApps])

  // A load at /#section can lose the browser's jump to a ScrollTrigger refresh (it restores a position recorded before the jump), so re-land after each until the reader acts
  useEffect(() => {
    const id = decodeURIComponent(window.location.hash.slice(1))
    const target = id ? document.getElementById(id) : null
    if (!target?.hasAttribute('data-section')) return
    setupGsap()
    const land = () => {
      const margin = parseFloat(window.getComputedStyle(target).scrollMarginTop) || 0
      if (Math.abs(target.getBoundingClientRect().top - margin) > 2) target.scrollIntoView({ behavior: 'instant', block: 'start' })
    }
    const acts = ['wheel', 'touchstart', 'keydown', 'pointerdown']
    const stop = () => {
      clearTimeout(timer)
      ScrollTrigger.removeEventListener('refresh', land)
      window.removeEventListener('load', land)
      acts.forEach((type) => window.removeEventListener(type, stop))
    }
    const timer = setTimeout(stop, LAND_WINDOW)
    ScrollTrigger.addEventListener('refresh', land)
    window.addEventListener('load', land)
    acts.forEach((type) => window.addEventListener(type, stop, { passive: true }))
    return stop
  }, [])

  // A resize (a breakpoint changes the item sizes) re-measures and moves the lens without animating
  useEffect(() => {
    let frame = 0
    const place = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        const list = listRef.current
        const target = list && shown.current && lensTarget(list, list.dataset.active)
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
