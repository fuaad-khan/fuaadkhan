import { useMemo, useRef, useState } from 'react'
import { useChapter, useMotionOK, useNearViewport, reducedFade, gsap } from '../../hooks/useChapter'
import Rail from '../Rail/Rail'
import DeviceFrame from '../Media/DeviceFrame'
import Media from '../Media/Media'
import IntroLayer from '../Intros/IntroLayer'
import { createDriver } from '../Intros'
import { media } from '../../content/media'
import { site } from '../../content/site'
import { accentVar } from '../../styles/accent'
import { TRACK, TRACK_SHORT, SHORT_SCREEN, WIDE_SCREEN, fractions } from './layout'
import styles from './Showcase.module.css'

// Share of the scroll range over which an incoming feature frame fades in, ending on its feature's centre
const FADE = 0.05

// srcset hints: the frame fills the 7fr column on wide screens and the copy width on narrow ones
const FRAME_SIZES = '(min-width: 1024px) 50vw, 90vw'
const STILL_SIZES = '(min-width: 1024px) 36vw, 90vw'

const pad = (n) => String(n).padStart(2, '0')

// One app: sticky device frame (poster, coded intro, feature frames) beside flowing copy, scrubbed by one timeline
export default function Showcase({ app }) {
  const ref = useRef(null)
  const [driver] = useState(() => createDriver())
  const [active, setActive] = useState(-1)
  const activeRef = useRef(-1)
  const motionOK = useMotionOK()
  const near = useNearViewport(ref)

  const assets = media[app.id]
  const hero = assets?.hero ?? null
  const frames = app.features.map((_, i) => assets?.features?.[i] ?? hero)
  const target = useMemo(() => ({ view: hero?.view, mapRect: hero?.mapRect, viewport: hero?.viewport }), [hero])
  const count = app.features.length

  useChapter(
    ref,
    (tl, q, el, { short }) => {
      const f = fractions(count, short ? TRACK_SHORT : TRACK)
      const shots = q('[data-frame]')
      const progress = { t: 0 }
      // Frame i takes over (and its loop plays) from the moment it starts to fade in
      const starts = f.featureCenters.map((c, i) => (i === 0 ? f.dissolve[1] : c - FADE))

      tl.fromTo(q('[data-rail]'), { scaleY: 0 }, { scaleY: 1, duration: 1 }, 0)
        .fromTo(progress, { t: 0 }, { t: 1, duration: f.introEnd, onUpdate: () => driver.emit(progress.t) }, 0)
        .to(q('[data-intro-layer]'), { autoAlpha: 0, duration: f.dissolve[1] - f.dissolve[0] }, f.dissolve[0])

      // In before out: each frame is opaque above its predecessor before that one is hidden, so the screen never dips
      shots.forEach((shot, i) => {
        tl.fromTo(shot, { autoAlpha: 0 }, { autoAlpha: 1, duration: f.featureCenters[i] - starts[i] }, starts[i])
        if (i > 0) tl.set(shots[i - 1], { autoAlpha: 0 }, f.featureCenters[i])
      })

      // A feature's node lights where the rail fill (0 to 1 down the whole section) reaches it
      const box = el.getBoundingClientRect()
      q('[data-feature-node]').forEach((node) => {
        const r = node.getBoundingClientRect()
        const at = gsap.utils.clamp(0, 0.97, (r.top + r.height / 2 - box.top) / box.height)
        tl.fromTo(node.firstElementChild, { scale: 0 }, { scale: 1, duration: 0.02, ease: 'power2.out' }, at)
      })

      // Frames start inert; the top frame becomes reachable by keyboard once its linear fade passes halfway
      gsap.set(shots, { attr: { inert: '' } })
      const halfway = starts.map((s, i) => (s + f.featureCenters[i]) / 2)
      let reachable = -1
      tl.fromTo(q('[data-stack]'), { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.04 }, f.stackAt).eventCallback('onUpdate', () => {
        const p = tl.progress()
        const top = halfway.reduce((last, h, i) => (p >= h ? i : last), -1)
        if (top !== reachable) {
          shots[reachable]?.setAttribute('inert', '')
          shots[top]?.removeAttribute('inert')
          reachable = top
        }
        const next = starts.reduce((last, s, i) => (p >= s ? i : last), -1)
        if (next === activeRef.current) return
        activeRef.current = next
        setActive(next)
      })
    },
    { conditions: { short: SHORT_SCREEN, wide: WIDE_SCREEN }, reduced: reducedFade },
  )

  return (
    <section ref={ref} className={styles.showcase} style={{ '--app-accent': accentVar(app.accent) }} aria-labelledby={`${app.id}-title`}>
      <Rail accent={app.accent} />

      <div className={styles.copy}>
        <div className={styles.introTrack}>
          <div className={styles.introText}>
            <div className={styles.kicker}>
              <p className={`eyebrow ${styles.kind}`}>
                <span className={styles.introNode} aria-hidden="true" />
                {app.kind}
              </p>
              <p className={styles.status}>{app.status}</p>
            </div>
            <h2 id={`${app.id}-title`}>{app.name}</h2>
            {app.tagline && <p className={styles.tagline}>{app.tagline}</p>}
            <p className={styles.problem}>{app.problem}</p>
            <dl className={styles.facts}>
              <div className={styles.fact}>
                <dt>{site.ui.builtFor}</dt>
                <dd>{app.audience}</dd>
              </div>
              {app.deployedAs && (
                <div className={styles.fact}>
                  <dt>{site.ui.deployedAs}</dt>
                  <dd>{app.deployedAs}</dd>
                </div>
              )}
            </dl>
            <ul className={styles.metrics}>
              {app.metrics.map((m) => (
                <li key={m.label}>
                  <span className={styles.metricValue}>{m.value}</span>
                  <span className={styles.metricLabel}>{m.label}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <ol className={styles.features}>
          {app.features.map((feature, i) => (
            <li key={feature.title} className={styles.feature} data-fade>
              <p className={styles.index} aria-hidden="true">
                <span className={styles.featureNode} data-feature-node>
                  <span className={styles.featureFill} />
                </span>
                {pad(i + 1)} / {pad(count)}
              </p>
              <h3 className={styles.featureTitle}>{feature.title}</h3>
              <p className={styles.featureBody}>{feature.body}</p>
              {!motionOK && (
                <div className={styles.still}>
                  <Media media={frames[i]} sizes={STILL_SIZES} />
                </div>
              )}
            </li>
          ))}
        </ol>

        <div className={styles.stackTrack}>
          <div className={styles.stack} data-stack data-fade>
            <p className={styles.stackLabel}>{site.ui.stackLabel}</p>
            <ul className={styles.stackList}>
              {app.stack.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
            {app.footnote && <p className={styles.footnote}>{app.footnote}</p>}
          </div>
        </div>
      </div>

      <div className={styles.visual}>
        <div className={styles.stage}>
          <DeviceFrame title={app.frameTitle} accent={app.accent} aspect={hero ? `${hero.width} / ${hero.height}` : undefined}>
            <Media media={hero} sizes={FRAME_SIZES} />
            <div className={styles.introLayer} data-intro-layer>
              {near && motionOK && <IntroLayer appId={app.id} app={app} media={assets} driver={driver} target={target} />}
            </div>
            {frames.map((m, i) => (
              <div key={i} className={styles.featureFrame} data-frame={i}>
                {near && motionOK && <Media media={m} playing={i === active} sizes={FRAME_SIZES} />}
              </div>
            ))}
          </DeviceFrame>
        </div>
      </div>
    </section>
  )
}
