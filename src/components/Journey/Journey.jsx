import { useRef } from 'react'
import { useChapter, reducedFade } from '../../hooks/useChapter'
import Rail from '../Rail/Rail'
import Hero from '../Hero/Hero'
import Timeline from '../Timeline/Timeline'
import MapInset from '../MapInset/MapInset'
import { fitZoom } from '../MapInset/camera'
import styles from './Journey.module.css'

const TITLE_ID = 'hero-name'
// Two columns with the map beside the copy; narrower screens carry the map in a sticky band on top
const WIDE = '(min-width: 768px)'
// A leg starts this far past the previous beat's centre and lands this far before the next beat centres (fractions of the range)
const LEG_LEAD = 0.04
const LEG_TAIL = 0.06
// Camera push toward each destination mid-leg, then the settle; fitZoom lowers either so no visible label leaves the frame
const PUSH = 1.3
const SETTLE = 1.08
// Points sampled along each leg for the marker's keyframes (linear between them, eased as a whole like the drawn line)
const SAMPLES = 32

const clamp01 = (v) => Math.min(1, Math.max(0, v))

// The one scrubbed timeline: rail and node fills, cue fade, then per leg the drawn route, the riding marker, the camera and the arrival
function build(tl, q, el, { wide }) {
  const [rail] = q('[data-rail]')
  const [cue] = q('[data-cue]')
  const [band] = q('[data-band]')
  const [view] = q('[data-map-view]')
  const [marker] = q('[data-marker]')
  const beats = q('[data-beat]')
  const fills = q('[data-node-fill]')
  const routes = q('[data-route]')
  const dots = q('[data-stop]')
  const labels = q('[data-label]')
  const ocean = q('[data-ocean]')
  const svg = view.ownerSVGElement

  // Fractions come from the laid-out page: section-local centres, independent of the current scroll
  const top = el.getBoundingClientRect().top
  const mid = (node) => {
    const r = node.getBoundingClientRect()
    return r.top - top + r.height / 2
  }
  const height = el.offsetHeight
  const range = Math.max(1, height - window.innerHeight)
  // A beat reads best centred in the viewport, or on phones in what the sticky map band leaves visible
  const reading = ((wide ? 0 : band.offsetHeight) + window.innerHeight) / 2
  const centred = beats.map((beat) => clamp01((mid(beat) - reading) / range))

  tl.fromTo(rail, { scaleY: 0 }, { scaleY: 1, duration: 1 }, 0).to(cue, { autoAlpha: 0, duration: 0.05 }, 0)
  // The rail fill grows linearly over the section, so a node lights at the fraction of the height where it sits
  fills.forEach((fill) => {
    const at = Math.min(clamp01(mid(fill) / height) - 0.015, 0.97)
    tl.fromTo(fill, { scale: 0 }, { scale: 1, duration: 0.03, ease: 'power2.out' }, Math.max(0, at))
  })

  // Zoom about a stop as CSS variables (GSAP's svgOrigin smoothing leaves offsets behind on revert); re-evaluated on every refresh
  const shot = (i, want) => {
    const origin = { x: +dots[i].getAttribute('cx'), y: +dots[i].getAttribute('cy') }
    const zoom = () => fitZoom(svg, origin, [...labels.slice(0, i + 1), ...dots.slice(0, i + 1), ...ocean], want)
    return {
      '--vs': zoom,
      '--vx': () => `${(1 - zoom()) * origin.x}px`,
      '--vy': () => `${(1 - zoom()) * origin.y}px`,
    }
  }

  routes.forEach((route, k) => {
    const i = k + 1
    const start = centred[k] + LEG_LEAD
    const end = Math.max(start + 0.08, centred[i] - LEG_TAIL)
    const span = end - start
    const length = route.getTotalLength()
    const path = Array.from({ length: SAMPLES + 1 }, (_, n) => route.getPointAtLength((length * n) / SAMPLES))
    tl.fromTo(route, { drawSVG: 0 }, { drawSVG: '100%', duration: span, ease: 'power1.inOut' }, start)
      .to(
        marker,
        {
          keyframes: { '--mx': path.map((p) => `${p.x}px`), '--my': path.map((p) => `${p.y}px`), easeEach: 'none' },
          duration: span,
          ease: 'power1.inOut',
        },
        start,
      )
      .to(view, { ...shot(i, PUSH), duration: span / 2, ease: 'power1.inOut' }, start)
      .to(view, { ...shot(i, SETTLE), duration: span / 2, ease: 'power1.inOut' }, start + span / 2)
      .fromTo(dots[i], { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.02 }, end - 0.02)
      .fromTo(labels[i], { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.03 }, end)
  })
}

// Hero and career beats as one section around a single sticky map: the coast draws on first paint, the route plays as the beats pass
export default function Journey({ site, stops }) {
  const ref = useRef(null)

  useChapter(ref, build, { conditions: { wide: WIDE }, reduced: reducedFade })

  return (
    <section ref={ref} className={styles.journey} aria-labelledby={TITLE_ID}>
      <Rail />
      <div className={styles.copy}>
        <Hero site={site} titleId={TITLE_ID} />
        <Timeline stops={stops} label={site.ui.careerTimeline} />
      </div>
      <div className={styles.visual} data-band>
        <div className={styles.sticky}>
          <MapInset stops={stops} journey={site.journey} />
        </div>
      </div>
    </section>
  )
}
