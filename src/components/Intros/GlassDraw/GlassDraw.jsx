import { useLayoutEffect, useMemo, useRef } from 'react'
import { gsap, setupGsap } from '../../../hooks/useChapter'
import { fill, introValues } from '../values'
import Aerial from './Aerial'
import Chrome from './Chrome'
import { APP, DEMO_PLAN, centroid, glassClip, holePath, readPlan, ringPath } from './geometry'
import { buildTimeline, clickTimes, textsAt } from './timeline'
import styles from './GlassDraw.module.css'

const LABEL_NATIVE = 11.84
const ARROW = 'M0 0V17L4.2 13L7 19.4L9.6 18.3L6.9 12.1H12.5Z'

// Map labels sit at their polygon centres like Leaflet tooltips; on small frames they grow to a legible floor unless that would make them collide
function fitLabels(root, plan, s, width) {
  const els = ['turf-label', 'concrete-label'].map((key) => root.querySelector(`[data-gd="${key}"]`))
  if (els.some((el) => !el)) return
  const size = parseFloat(getComputedStyle(els[0]).fontSize) || 1
  const [a, b] = els.map((el) => [el.offsetWidth / size, el.offsetHeight / size])
  const [p, q] = [centroid(plan.turf), centroid(plan.concrete)]
  // Largest size at which the two boxes still clear each other on one axis, less a small gap
  const fit = 0.9 * Math.max((Math.abs(p[0] - q[0]) * s) / ((a[0] + b[0]) / 2), (Math.abs(p[1] - q[1]) * s) / ((a[1] + b[1]) / 2))
  const floor = width >= 560 ? 10 : 8
  root.style.setProperty('--label-size', `${Math.max(LABEL_NATIVE * s, Math.min(floor, fit)).toFixed(2)}px`)
}

// Yard Plan's "map under glass": the frosted sheet with its rounded window, the app's chrome, and a turf + concrete plan drawn, snapped and tallied as t runs 0 → 1
export default function GlassDraw({ app, media, driver, target, onError }) {
  const rootRef = useRef(null)
  const tvw = target?.viewport?.[0]
  const tvh = target?.viewport?.[1]
  const hero = media?.hero
  const plan = useMemo(() => readPlan(hero, tvw && tvh ? { viewport: [tvw, tvh] } : undefined) ?? DEMO_PLAN, [hero, tvw, tvh])
  const values = useMemo(() => introValues(app, media), [app, media])
  const intro = app?.intro ?? {}
  const rows = intro.rows ?? []
  const labels = intro.labels ?? {}
  const [vw, vh] = plan.viewport
  const base = plan.demo ? null : media?.base?.poster ? media.base : null
  const clicks = useMemo(() => clickTimes(plan), [plan])
  const [turfAt, concreteAt] = useMemo(() => [centroid(plan.turf), centroid(plan.concrete)], [plan])
  const texts = {
    ...textsAt(0, values, rows, labels),
    donutLabel: labels.donutLabel,
    areas: [
      [labels.turf, fill(labels.turfArea, values)],
      [labels.concrete, fill(labels.concreteArea, values)],
    ],
  }

  useLayoutEffect(() => {
    const root = rootRef.current
    if (!root) return
    setupGsap()
    let tl
    const ctx = gsap.context(() => {
      tl = buildTimeline(root, { plan, values, rows, labels })
    }, root)
    const glass = root.querySelector('[data-gd="glass"]')

    // The window is cut in px, so it is recomputed whenever the frame changes size (updateGlassFrame on resize)
    const resize = () => {
      try {
        const { width, height } = root.getBoundingClientRect()
        if (!width || !height) return
        const s = Math.max(width / vw, height / vh)
        glass.style.clipPath = glassClip([vw, vh], s)
        root.style.setProperty('--k', (1 / s).toFixed(4))
        fitLabels(root, plan, s, width)
      } catch (err) {
        onError?.(err)
      }
    }
    resize()
    const ro = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(resize)
    ro?.observe(root)

    // A pure function of t: the paused timeline seeks to t × TOTAL seconds in either direction
    const render = (t) => {
      try {
        tl.progress(t)
      } catch (err) {
        onError?.(err)
      }
    }
    render(driver.get())
    const unsubscribe = driver.subscribe(render)

    return () => {
      unsubscribe()
      ro?.disconnect()
      ctx.revert()
    }
    // rows and labels are module-level apps.js data, stable for the page's life
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan, values, driver, onError, vw, vh])

  return (
    <div ref={rootRef} className={styles.root} style={{ '--gd-vw': vw, '--gd-vh': vh }} aria-hidden="true">
      <div className={styles.stage}>
        <div className={styles.map}>
          {plan.demo && <Aerial />}
          {base && (
            <img
              className={styles.base}
              src={base.poster.x1}
              srcSet={`${base.poster.x1} 800w, ${base.poster.x2} 1600w`}
              sizes="(min-width: 768px) 56vw, 92vw"
              alt=""
              decoding="async"
              onError={() => onError?.(new Error('GlassDraw: the base still failed to load'))}
            />
          )}
        </div>

        <div className={styles.glass} data-gd="glass" />

        <svg className={styles.layer} viewBox={`0 0 ${vw} ${vh}`} preserveAspectRatio="none" aria-hidden="true" focusable="false">
          <path className={styles.edge} d={holePath(APP.railW, APP.headerH, vw, vh, APP.frameR)} />
          <path className={`${styles.shape} ${styles.turfShape}`} d={ringPath(plan.turf)} data-gd="turf-shape" />
          <path className={`${styles.shape} ${styles.concreteShape}`} d={ringPath(plan.concrete)} data-gd="concrete-shape" />
          <polyline className={`${styles.trace} ${styles.turfTrace}`} points="" data-gd="turf-line" />
          <polyline className={`${styles.trace} ${styles.concreteTrace}`} points="" data-gd="concrete-line" />
          <line className={`${styles.guide} ${styles.turfGuide}`} data-gd="turf-guide" />
          <line className={`${styles.guide} ${styles.guideHalo}`} data-gd="concrete-halo" />
          <line className={`${styles.guide} ${styles.concreteGuide}`} data-gd="concrete-guide" />
          {['turf', 'concrete'].map((name) =>
            plan[name].map(([x, y], i) => (
              <g key={`${name}${i}`} transform={`translate(${x} ${y})`}>
                <g data-gd={`${name}-vertex`} transform="scale(0)">
                  <circle className={`${styles.growVertex} ${styles.vertex}`} r="6.5" />
                </g>
              </g>
            )),
          )}
          <g transform={`translate(${plan.snap[0]} ${plan.snap[1]})`}>
            <g data-gd="cue" transform="scale(0)">
              <g className={styles.growCue}>
                <circle className={styles.cueGlow} r="22" opacity="0.12" />
                <circle className={styles.cueGlow} r="15" opacity="0.2" />
                <circle className={styles.cueRing} r="12" data-gd="cue-ring" />
                <circle className={styles.cuePoint} r="7" />
              </g>
            </g>
          </g>
        </svg>

        <div className={styles.labels}>
          {[
            ['turf', turfAt, styles.turfLabel],
            ['concrete', concreteAt, styles.concreteLabel],
          ].map(([name, [x, y], cls]) => (
            <span key={name} className={`${styles.label} ${cls}`} style={{ '--x': x, '--y': y }}>
              <span className={styles.labelPop} data-gd={`${name}-label`}>
                <span>{labels[name]}</span>
                <span>{fill(labels[`${name}Area`], values)}</span>
              </span>
            </span>
          ))}
        </div>

        <Chrome app={app} chrome={intro.chrome} rows={rows} texts={texts} real={!plan.demo} />

        <svg className={styles.layer} viewBox={`0 0 ${vw} ${vh}`} preserveAspectRatio="none" aria-hidden="true" focusable="false">
          {clicks.map(({ at, p }, i) => (
            <g key={i} transform={`translate(${p[0]} ${p[1]})`}>
              <g data-gd="ripple" data-at={at} transform="scale(0)" opacity="0">
                <circle className={`${styles.growRipple} ${styles.ripple}`} r="11" />
              </g>
            </g>
          ))}
          <g data-gd="cursor" transform={`translate(${plan.turf[0][0] - 34} ${plan.turf[0][1] - 26})`}>
            <g className={styles.growCursor}>
              <path className={styles.arrowShadow} d={ARROW} transform="translate(0.8 1.4)" />
              <path className={styles.arrow} d={ARROW} />
            </g>
          </g>
        </svg>
      </div>
    </div>
  )
}
