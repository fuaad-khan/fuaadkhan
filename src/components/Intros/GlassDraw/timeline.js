import { gsap } from '../../../hooks/useChapter'
import { fill } from '../values'
import { THEME_BUTTON } from './geometry'

// Timeline length in seconds (PLAN §6.2); the driver's t maps linearly onto it. The dark theme drops the night beat and ends sooner
export const TOTAL = 3
export const TOTAL_DARK = 2

// Beats in timeline seconds: turf drawn .04–.46, concrete snapped and drawn .7–1.3, panel tallies, night 1.9–2.5, hold to 3; dark: the pointer rests from 1.36, hold to 2
const AT = {
  turf: [0.04, 0.46],
  turfCount: [0.5, 0.68],
  approach: [0.6, 0.8],
  cue: 0.8,
  lock: [0.83, 0.86],
  concrete: [0.86, 1.3],
  concreteCount: [1.4, 1.88],
  toTheme: [1.66, 1.86],
  clicks: [1.9, 2.3],
  night: [1.9, 2.08],
  day: [2.32, 2.5],
  cursorOut: [2.5, 2.62],
  rest: [1.36, 1.72],
  restOut: [1.62, 1.8],
}

const DWELL = 0.012
const RIPPLE = 0.14
const clamp01 = (v) => Math.min(1, Math.max(0, v))
const lerp = (a, b, e) => a + (b - a) * e
const mixPt = (p, q, e) => [lerp(p[0], q[0], e), lerp(p[1], q[1], e)]
const progress = (time, [a, b]) => clamp01((time - a) / (b - a))
const round1 = (v) => Math.round(v * 10) / 10

// cubic-bezier() as an easing function, for the apps' spring (.34, 1.36, .64, 1)
export function cubicBezier(x1, y1, x2, y2) {
  const cx = 3 * x1
  const bx = 3 * (x2 - x1) - cx
  const ax = 1 - cx - bx
  const cy = 3 * y1
  const by = 3 * (y2 - y1) - cy
  const ay = 1 - cy - by
  const x = (s) => ((ax * s + bx) * s + cx) * s
  return (t) => {
    if (t <= 0) return 0
    if (t >= 1) return 1
    let lo = 0
    let hi = 1
    let s = t
    // Bisection on x(s) = t: x is monotonic for these control points, so 24 halvings reach 1e-7
    for (let i = 0; i < 24; i++) {
      if (x(s) < t) lo = s
      else hi = s
      s = (lo + hi) / 2
    }
    return ((ay * s + by) * s + cy) * s
  }
}

export const spring = cubicBezier(0.34, 1.36, 0.64, 1)

// Click times for drawing a ring: a click on each vertex, then the closing click back on the first; long edges take a little longer
function schedule(ring, [start, end]) {
  const n = ring.length
  const weights = ring.map((p, i) => Math.hypot(ring[(i + 1) % n][0] - p[0], ring[(i + 1) % n][1] - p[1]) ** 0.6)
  const sum = weights.reduce((a, b) => a + b, 0) || 1
  const move = Math.max(0, end - start - n * DWELL)
  const clicks = [start]
  weights.forEach((w, i) => clicks.push(clicks[i] + DWELL + (move * w) / sum))
  clicks[n] = end
  return { ring, clicks }
}

// Cursor position and placed-vertex count at `time` while a ring is being drawn
function along({ ring, clicks }, time, ease) {
  const n = ring.length
  if (time < clicks[0]) return { p: ring[0], placed: 0 }
  for (let i = 0; i < n; i++) {
    if (time < clicks[i + 1]) {
      const from = clicks[i] + DWELL
      const e = time < from ? 0 : ease(progress(time, [from, clicks[i + 1]]))
      return { p: mixPt(ring[i], ring[(i + 1) % n], e), placed: i + 1 }
    }
  }
  return { p: ring[0], placed: n, closed: true }
}

const finite = (v) => typeof v === 'number' && Number.isFinite(v)

// Composition numbers at `time`: turf tallies when its shape closes, concrete and the shares when the concrete closes
function tally(values, time, easeOut, easeInOut) {
  const keys = ['turf', 'concrete', 'total', 'pct', 'turfPct']
  if (time < AT.turfCount[0]) return { cur: { ...values, turf: 0, concrete: 0, total: 0 }, empty: true, sweep: 0 }
  if (!keys.every((k) => finite(values[k]))) return { cur: values, empty: false, sweep: finite(values.pct) ? values.pct : 0 }
  const a = easeOut(progress(time, AT.turfCount))
  const b = easeInOut(progress(time, AT.concreteCount))
  const turf = Math.round(values.turf * a)
  const total = Math.round(turf + (values.total - values.turf) * b)
  const cur = {
    ...values,
    turf,
    total,
    concrete: Math.round(values.concrete * b),
    pct: Math.round(values.pct * b),
    turfPct: Math.round(100 + (values.turfPct - 100) * b),
  }
  return { cur, empty: total === 0, sweep: values.pct * b }
}

// The panel's text at `time`, also used for the first render so React and the painter agree
export function textsAt(time, values, rows, labels) {
  const ease = gsap.parseEase('power2.out')
  const { cur, empty } = tally(values, time, ease, gsap.parseEase('power2.inOut'))
  return {
    rowValues: rows.map((row) => fill(row.value, cur)),
    rowPcts: rows.map((row) => (row.pct ? (empty ? '—' : fill(row.pct, cur)) : null)),
    donut: empty ? '—' : fill(labels.donutValue, cur),
  }
}

// Writes an attribute, style property or text only when it changed, so scrubbing stays cheap
function writer() {
  const cache = new Map()
  return (el, key, value) => {
    if (!el) return
    let seen = cache.get(el)
    if (!seen) cache.set(el, (seen = {}))
    if (seen[key] === value) return
    seen[key] = value
    if (key === 'text') el.textContent = value
    else if (key.startsWith('--') || key === 'opacity' || key === 'visibility') el.style.setProperty(key, value)
    else el.setAttribute(key, value)
  }
}

// One paused timeline for the whole intro: tweens own opacity, scale and the theme mix; the painter derives everything that follows the cursor
export function buildTimeline(root, { plan, values, rows, labels, dark = false }) {
  const one = (key) => root.querySelector(`[data-gd="${key}"]`)
  const all = (key) => [...root.querySelectorAll(`[data-gd="${key}"]`)]
  const put = writer()
  const edge = gsap.parseEase('power1.inOut')
  const glide = gsap.parseEase('power2.inOut')
  const out = gsap.parseEase('power2.out')
  const snapIn = gsap.parseEase('power3.out')

  const turf = schedule(plan.turf, AT.turf)
  const concrete = schedule(plan.concrete, AT.concrete)
  const start = [plan.turf[0][0] - 34, plan.turf[0][1] - 26]
  const near = [plan.snap[0] - 9, plan.snap[1] + 8]
  const rest = restPoint(plan)
  const leave = dark ? AT.restOut : AT.cursorOut

  const shapes = [
    { s: turf, line: one('turf-line'), guide: [one('turf-guide')], vertices: all('turf-vertex') },
    { s: concrete, line: one('concrete-line'), guide: [one('concrete-guide'), one('concrete-halo')], vertices: all('concrete-vertex') },
  ]
  const ripples = all('ripple').map((el) => ({ el, at: Number(el.dataset.at) }))
  const cursor = one('cursor')
  const cue = one('cue')
  const cueRing = one('cue-ring')
  const donut = one('donut')
  const donutValue = one('donut-value')
  const rowValues = rows.map((_, i) => one(`row-value-${i}`))
  const rowPcts = rows.map((_, i) => one(`row-pct-${i}`))

  // Where the pointer is at `time`: drawing, gliding to the shared corner, locking on, then off to the theme button (dark: off the plan)
  function pointer(time) {
    if (time < AT.turf[0]) return mixPt(start, plan.turf[0], out(progress(time, [0, AT.turf[0]])))
    if (time <= AT.turf[1]) return along(turf, time, edge).p
    if (time < AT.lock[0]) return mixPt(plan.turf[0], near, glide(progress(time, AT.approach)))
    if (time < AT.concrete[0]) return mixPt(near, plan.snap, snapIn(progress(time, AT.lock)))
    if (time <= AT.concrete[1]) return along(concrete, time, edge).p
    if (dark) return mixPt(plan.concrete[0], rest, glide(progress(time, AT.rest)))
    const drift = progress(time, AT.cursorOut)
    const p = mixPt(plan.concrete[0], THEME_BUTTON, glide(progress(time, AT.toTheme)))
    return [p[0] + 10 * drift, p[1] + 12 * drift]
  }

  function paint(time) {
    const [px, py] = pointer(time)
    put(cursor, 'transform', `translate(${round1(px)} ${round1(py)})`)
    put(cursor, 'opacity', String(round1(1 - progress(time, leave))))

    for (const { s, line, guide, vertices } of shapes) {
      const { placed, closed } = time >= s.clicks[0] ? along(s, time, edge) : { placed: 0 }
      const drawing = placed > 0 && !closed
      const pts = s.ring.slice(0, placed).map(([x, y]) => `${x},${y}`).join(' ')
      put(line, 'points', drawing ? pts : '')
      const last = s.ring[Math.max(0, placed - 1)]
      for (const g of guide) {
        put(g, 'visibility', drawing ? 'visible' : 'hidden')
        put(g, 'x1', String(last[0]))
        put(g, 'y1', String(last[1]))
        put(g, 'x2', String(round1(px)))
        put(g, 'y2', String(round1(py)))
      }
      // Markers pop as each vertex is clicked and clear once the ring closes
      const fade = 1 - progress(time, [s.clicks[s.ring.length], s.clicks[s.ring.length] + 0.04])
      vertices.forEach((el, i) => {
        const pop = time < s.clicks[i] ? 0 : spring(progress(time, [s.clicks[i], s.clicks[i] + 0.04]))
        put(el, 'transform', `scale(${round1(Math.max(0, pop) * 100) / 100})`)
        put(el, 'opacity', String(time < s.clicks[i] ? 0 : round1(fade)))
      })
    }

    for (const { el, at } of ripples) {
      const k = progress(time, [at, at + RIPPLE])
      const live = time >= at && k < 1
      put(el, 'transform', `scale(${live ? round1(0.4 + 1.2 * out(k)) : 0})`)
      put(el, 'opacity', live ? String(round1(0.6 * (1 - k))) : '0')
    }

    // Snap cue: pops when the cursor enters the 12 px tolerance, the tolerance ring widens out, then the cue clears
    const cueOn = time >= AT.cue && time < 0.96
    put(cue, 'transform', `scale(${cueOn ? round1(spring(progress(time, [AT.cue, AT.cue + 0.03])) * 100) / 100 : 0})`)
    put(cue, 'opacity', String(cueOn ? round1(1 - progress(time, [0.92, 0.96])) : 0))
    const ring = progress(time, [AT.cue, AT.cue + 0.14])
    put(cueRing, 'r', String(round1(12 + 12 * out(ring))))
    put(cueRing, 'opacity', String(round1(0.9 * (1 - ring))))

    const { cur, empty, sweep } = tally(values, time, out, glide)
    rows.forEach((row, i) => {
      put(rowValues[i], 'text', fill(row.value, cur))
      if (row.pct) put(rowPcts[i], 'text', empty ? '—' : fill(row.pct, cur))
    })
    put(donutValue, 'text', empty ? '—' : fill(labels.donutValue, cur))
    put(donut, '--p', String(round1(sweep)))
  }

  const tl = gsap.timeline({ paused: true, defaults: { ease: 'none', immediateRender: false, lazy: false }, onUpdate: () => paint(tl.time()) })
  const on = (targets, at, value) => tl.fromTo(targets, { '--on': 1 - value }, { '--on': value, duration: 0.03 }, at)

  on([one('dock-turf'), one('tool-turf')], AT.turf[0] - 0.02, 1)
  on([one('dock-turf'), one('tool-turf')], AT.turf[1], 0)
  on([one('dock-concrete'), one('tool-concrete')], 0.7, 1)
  on([one('dock-concrete'), one('tool-concrete')], AT.concrete[1], 0)
  tl.fromTo([one('dock-undo'), one('tool-undo')], { opacity: 0.4 }, { opacity: 1, duration: 0.03 }, AT.turf[1])

  // Each shape fills as it closes, then its sq ft label springs in at the polygon's centre
  ;[
    ['turf', AT.turf[1], 0.5, 0],
    ['concrete', AT.concrete[1], 1.34, 1],
  ].forEach(([name, close, label, row]) => {
    tl.fromTo(one(`${name}-shape`), { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.005 }, close)
      .fromTo(one(`${name}-shape`), { '--fill': 0 }, { '--fill': 0.45, duration: 0.08, ease: 'power1.out' }, close)
      .fromTo(one(`${name}-label`), { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.06 }, label)
      .fromTo(one(`${name}-label`), { '--pop': 0.55 }, { '--pop': 1, duration: 0.2, ease: spring }, label)
      .fromTo(one(`area-${row}`), { autoAlpha: 0, '--rise': 0.4 }, { autoAlpha: 1, '--rise': 0, duration: 0.08, ease: 'power2.out' }, close + 0.02)
  })
  tl.fromTo(one('areas'), { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.05 }, AT.turf[1] + 0.01)
    .fromTo(one('donut-fill'), { opacity: 0 }, { opacity: 1, duration: 0.06 }, AT.turfCount[0])

  // Day → night → day: one mix variable drives every chrome token; the map under the glass never changes. The dark theme holds night throughout
  if (!dark) {
    tl.fromTo(root, { '--gd-night': 0 }, { '--gd-night': 1, duration: AT.night[1] - AT.night[0], ease: 'power1.inOut' }, AT.night[0])
      .fromTo(root, { '--gd-night': 1 }, { '--gd-night': 0, duration: AT.day[1] - AT.day[0], ease: 'power1.inOut' }, AT.day[0])
  }
  tl.set({}, {}, dark ? TOTAL_DARK : TOTAL)

  // Record every tween's end and start once, so any later seek renders the same frame in either direction
  tl.progress(1).progress(0)
  return tl
}

// Click times for the ripple layer: every vertex click of both rings, the lock-on, and the two theme clicks (none in dark)
export function clickTimes(plan, dark = false) {
  const t = schedule(plan.turf, AT.turf).clicks
  const c = schedule(plan.concrete, AT.concrete).clicks
  return [
    ...t.map((at, i) => ({ at, p: plan.turf[i % plan.turf.length] })),
    ...c.map((at, i) => ({ at, p: plan.concrete[i % plan.concrete.length] })),
    ...(dark ? [] : AT.clicks.map((at) => ({ at, p: THEME_BUTTON }))),
  ]
}

// Where the pointer settles in the dark theme: just past the concrete's lower right, clear of both shapes
function restPoint(plan) {
  const xs = plan.concrete.map(([x]) => x)
  const ys = plan.concrete.map(([, y]) => y)
  return [Math.max(...xs) + 44, Math.max(...ys) + 36]
}
