import { useId, useLayoutEffect, useMemo, useRef } from 'react'
import { gsap, setupGsap } from '../../../hooks/useChapter'
import { fill } from '../values'
import { DemoChrome, MapControls } from './Chrome'
import Panel from './Panel'
import { CARD_SCALE, COLUMN_W, HEADER_H, MAP_SCALE, blendViews, lerp, lerpPoint, linePath, reach, sceneFor, viewFor, worldBox } from './scene'
import { BEATS, CAMERA_PATH, CURSOR_PATH, DURATION, buildTimeline, setInitial } from './timeline'
import styles from './MeasuredLine.module.css'

// Green Check's selection pin (createMap.js PIN_PATH), 38 px wide, tip on the anchor
const PIN_PATH = 'M13 31C13 31 2.5 18.5 2.5 11.5a10.5 10.5 0 0 1 21 0C23.5 18.5 13 31 13 31Z'
// The map's feet label is 13 px; while the camera reads the map it grows toward this on-screen floor
const LABEL_PX = 13
const LABEL_MIN_PX = 11
// Margins (capture px) the map view keeps around the action, and how close to the map's top-left corner it must come to frame the corner too
const MAP_PAD = { x: 60, top: 90, bottom: 60 }
const CORNER = { x: 140, y: 160 }
// Leaflet's control column in the capture, from the map's corner: its x span, then the zoom pair, home + locate, and layers as y bands
const CONTROLS = { x: [12, 58], bands: [[13, 99], [107, 192], [200, 246]] }
// The app's Legend panel in the capture (green-check base@2x, bottom-left of the map): its x span from the map's corner
const LEGEND_X = [16, 235]

// Position k along a path of named stops: the stops either side of it and how far between them
const pick = (path, k) => {
  const i0 = Math.max(0, Math.min(path.length - 1, Math.floor(k)))
  const i1 = Math.min(path.length - 1, i0 + 1)
  return [path[i0], path[i1], i1 === i0 ? 0 : k - i0]
}

// Green Check intro: the automatic verdict, then the planner re-measures by hand and the verdict flips
export default function MeasuredLine({ app, media, driver, target, onError }) {
  const rootRef = useRef(null)
  const worldRef = useRef(null)
  const onErrorRef = useRef(onError)
  const maskId = `ml-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`
  const targetKey = JSON.stringify({ viewport: target?.viewport, mapRect: target?.mapRect })
  const scene = useMemo(() => sceneFor(app, media, JSON.parse(targetKey)), [app, media, targetKey])

  useLayoutEffect(() => {
    onErrorRef.current = onError
  })

  useLayoutEffect(() => {
    const root = rootRef.current
    const world = worldRef.current
    if (!root || !world || !driver) return undefined
    setupGsap()
    const q = gsap.utils.selector(root)
    // data-ml holds space-separated names, so one element can answer to several tweens
    const el = (name) => q(`[data-ml~="${name}"]`)
    const proxies = { cam: { k: 0 }, cur: { k: 0 }, drag: { p: 0 } }
    let tl = null
    const ctx = gsap.context(() => {
      setInitial(gsap, el)
      tl = buildTimeline(gsap, el, proxies)
    }, root)

    const { geo, values } = scene
    const [vw, vh] = scene.viewport
    const [mx, my, mw, mh] = scene.mapRect
    const labels = app.intro?.labels ?? {}
    const autoText = fill(labels.autoFeet, values)
    const handText = fill(labels.handFeet, values)
    const parts = {
      label: el('label')[0],
      labelText: el('label-text')[0],
      count: el('count')[0],
      verifyLine: el('verify-line')[0],
      handleA: el('handle-a')[0],
      handleB: el('handle-b')[0],
      cursor: el('cursor')[0],
    }
    const size = { W: 0, H: 0 }
    const rois = { wide: null }
    const anchors = {}
    const last = {}

    // Regions the camera frames and the points the pointer visits, read from layout (never from the camera's transform)
    const measure = () => {
      const box = (name) => {
        const node = el(name)[0]
        return node ? worldBox(node, world) : null
      }
      let x0 = Infinity
      let y0 = Infinity
      let x1 = -Infinity
      let y1 = -Infinity
      const grow = (x, y) => {
        x0 = Math.min(x0, x)
        y0 = Math.min(y0, y)
        x1 = Math.max(x1, x)
        y1 = Math.max(y1, y)
      }
      ;['parcel', 'footprint', 'neighbour'].forEach((name) => {
        const node = el(name)[0]
        if (!node) return
        try {
          const bb = node.getBBox()
          grow(bb.x, bb.y)
          grow(bb.x + bb.width, bb.y + bb.height)
        } catch {
          // An unrendered shape has no box; the line endpoints still frame the map
        }
      })
      ;[geo.auto.a, geo.auto.b, geo.hand.a, geo.hand.b, geo.pin].forEach(([x, y]) => grow(x, y))
      // Action near the map's top-left corner: frame the corner too, so Leaflet's control stack shows whole instead of sliced
      const left = x0 - MAP_PAD.x - mx < CORNER.x ? mx - 8 : x0 - MAP_PAD.x
      const top = y0 - MAP_PAD.top - my < CORNER.y ? my - 8 : y0 - MAP_PAD.top
      const controls = {
        x: CONTROLS.x.map((v) => mx + v),
        bands: CONTROLS.bands.map(([a, b]) => [my + a, my + b]),
        slack: [MAP_PAD.top, MAP_PAD.bottom],
      }
      // Over the capture, a view whose edge crossed the Legend would slice it at any zoom, so the map view stays right of it (and of the controls) when the action allows
      const clearX = mx + LEGEND_X[1] + 8
      const clear = scene.real && x0 - clearX >= MAP_PAD.x / 4
      rois.map = {
        x: left,
        y: top,
        w: x1 + MAP_PAD.x - left,
        h: y1 + MAP_PAD.bottom - top,
        within: clear ? [clearX, my - 8, mx + mw + 8 - clearX, mh + 16] : [mx - 8, my - 8, mw + 16, mh + 16],
        controls: clear ? null : controls,
        scale: MAP_SCALE,
      }

      // Card views run from the gap under the banner to just past the residence row (no text cut), opening above the card when there is room
      const colX = vw - COLUMN_W
      const cardTop = HEADER_H + 8
      const verdicts = box('verdicts')
      const row = el('item1')[0] ? worldBox(el('item1')[0], world) : null
      const actions = box('res-actions')
      if (verdicts && actions) rois.verdict = { x: colX, y: verdicts.y - 7, w: COLUMN_W, h: actions.y + actions.h + 9 - verdicts.y, top: cardTop, scale: CARD_SCALE }
      if (row && actions) rois.row = { x: colX, y: row.y - 4, w: COLUMN_W, h: actions.y + actions.h + 6 - row.y, top: cardTop, scale: CARD_SCALE }
      // The Eligible view keeps the re-sorted residence row and its stamp in frame; frames too small to read it keep the verdict and two rows
      const res2 = box('res2')
      const second = el('item2')[1] ? worldBox(el('item2')[1], world) : null
      if (verdicts && second) rois.eligible = { x: colX, y: verdicts.y - 7, w: COLUMN_W, h: second.y + second.h + 10 - verdicts.y, scale: CARD_SCALE }
      if (res2) rois.final = { x: colX, y: cardTop, w: COLUMN_W, h: res2.y + res2.h + 6 - cardTop, top: cardTop, scale: CARD_SCALE, fallback: 'eligible', min: 0.7 }

      const centre = (b, fallback) => (b ? [b.x + b.w / 2, b.y + b.h / 2] : fallback)
      anchors.verify = centre(box('verify-btn'), [colX + 260, 480])
      anchors.complete = centre(box('complete-btn'), [colX + 100, 470])
      anchors.enter = [anchors.verify[0] + 70, anchors.verify[1] + 60]
      anchors.leave = [anchors.complete[0] + 60, anchors.complete[1] + 70]
    }

    // A region this frame cannot read swaps for its tighter fallback
    const roiOf = (name) => {
      const roi = rois[name]
      return roi?.fallback && reach(roi, size.W, size.H, vw, vh) < roi.min ? rois[roi.fallback] : roi
    }

    // Everything the timeline cannot tween directly: the dragged line, the counting feet, the camera and the pointer
    const paint = (t) => {
      const time = t * DURATION
      tl.time(time)

      const p = proxies.drag.p
      const a = lerpPoint(geo.auto.a, geo.hand.a, p)
      const b = lerpPoint(geo.auto.b, geo.hand.b, p)
      parts.verifyLine?.setAttribute('d', linePath(a, b))
      parts.handleA?.setAttribute('transform', `translate(${a[0]} ${a[1]})`)
      parts.handleB?.setAttribute('transform', `translate(${b[0]} ${b[1]})`)

      const feet = Math.round(lerp(Number(values.auto), Number(values.hand), p))
      const countText = Number.isFinite(feet) ? fill(labels.handFeet, { ...values, hand: feet }) : handText
      const phase = time < BEATS.verifying ? 'auto' : time < BEATS.rejudge ? 'verify' : 'hand'
      const labelText = phase === 'auto' ? autoText : phase === 'hand' ? handText : countText
      if (parts.labelText && labelText !== last.label) parts.labelText.textContent = last.label = labelText
      if (parts.count && countText !== last.count) parts.count.textContent = last.count = countText

      if (!size.W || !size.H) return
      const [ra, rb, f] = pick(CAMERA_PATH, proxies.cam.k)
      const view = blendViews(viewFor(roiOf(ra), size.W, size.H, vw, vh), viewFor(roiOf(rb), size.W, size.H, vw, vh), f)
      const s = size.W / view.w
      const tx = -view.x * s
      const ty = -view.y * s
      world.style.transform = `translate(${tx}px, ${ty}px) scale(${s})`

      const line = phase === 'auto' ? geo.auto : phase === 'hand' ? geo.hand : { a, b }
      const mid = lerpPoint(line.a, line.b, 0.5)
      const onMap = (ra === 'map' ? 1 - f : 0) + (rb === 'map' && rb !== ra ? f : 0)
      const grow = 1 + (Math.max(1, LABEL_MIN_PX / (LABEL_PX * s)) - 1) * onMap
      if (parts.label) parts.label.style.transform = `translate(${mid[0] - mx}px, ${mid[1] - my}px) scale(${grow})`

      const [ca, cb, g] = pick(CURSOR_PATH, proxies.cur.k)
      const points = { ...anchors, handle: b }
      const c = lerpPoint(points[ca], points[cb], g)
      if (parts.cursor) parts.cursor.style.transform = `translate(${c[0] * s + tx}px, ${c[1] * s + ty}px)`
    }

    const render = (t) => {
      try {
        paint(t)
      } catch (err) {
        onErrorRef.current?.(err)
      }
    }
    const resize = () => {
      size.W = root.clientWidth
      size.H = root.clientHeight
    }

    resize()
    measure()
    render(driver.get())
    const unsubscribe = driver.subscribe(render)
    const ro = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => {
      resize()
      render(driver.get())
    })
    ro?.observe(root)
    // Inter arriving can rewrap the card, which moves the regions and the buttons the pointer clicks
    let alive = true
    document.fonts?.ready.then(() => {
      if (!alive) return
      measure()
      render(driver.get())
    })

    return () => {
      alive = false
      unsubscribe()
      ro?.disconnect()
      ctx.revert()
    }
  }, [app, driver, scene])

  const [vw, vh] = scene.viewport
  const [mx, my, mw, mh] = scene.mapRect
  const { geo } = scene
  const autoD = linePath(geo.auto.a, geo.auto.b)
  const handD = linePath(geo.hand.a, geo.hand.b)
  const ring = geo.ring

  return (
    <div ref={rootRef} className={styles.root} aria-hidden="true">
      <div ref={worldRef} className={styles.world} style={{ width: vw, height: vh }}>
        {scene.real ? (
          <img
            className={styles.base}
            src={scene.still}
            alt=""
            width={vw}
            height={vh}
            decoding="async"
            draggable="false"
            onError={() => onErrorRef.current?.(new Error(`MeasuredLine: base still failed to load (${scene.still})`))}
          />
        ) : (
          <DemoChrome app={app} scene={scene} />
        )}

        <div className={styles.mapClip} style={{ left: mx, top: my, width: mw, height: mh }}>
          <svg className={styles.fill} viewBox={`${mx} ${my} ${mw} ${mh}`} preserveAspectRatio="none">
            <defs>
              <mask id={maskId} maskUnits="userSpaceOnUse" x={mx} y={my} width={mw} height={mh}>
                <path data-ml="auto-reveal" d={autoD} className={styles.reveal} />
              </mask>
            </defs>
            <path data-ml="parcel" d={geo.parcel.d} className={styles.parcel} />
            {geo.footprint?.d && <path data-ml="footprint" d={geo.footprint.d} className={styles.footprint} />}
            <g transform={`translate(${geo.pin[0]} ${geo.pin[1]})`}>
              <ellipse data-ml="ping" cx="0" cy="1" rx="8" ry="3" className={styles.ping} />
              <g data-ml="pin" className={styles.pin}>
                <g transform="translate(-19 -46) scale(1.4615)">
                  <path d={PIN_PATH} className={styles.pinBody} />
                  <circle cx="13" cy="11.5" r="4.5" className={styles.pinDot} />
                </g>
              </g>
            </g>
            {ring?.d && <path data-ml="ring" d={ring.d} className={styles.ring} />}
            {!ring?.d && ring?.r > 0 && <circle data-ml="ring" cx={ring.cx} cy={ring.cy} r={ring.r} className={styles.ring} />}
            {geo.neighbour?.d && <path data-ml="neighbour" d={geo.neighbour.d} className={styles.neighbour} />}
            <g data-ml="auto">
              <path data-ml="auto-line" d={autoD} className={styles.measure} mask={`url(#${maskId})`} />
              <circle data-ml="auto-dot" cx={geo.auto.a[0]} cy={geo.auto.a[1]} r="4" className={styles.dot} />
              <circle data-ml="auto-dot" cx={geo.auto.b[0]} cy={geo.auto.b[1]} r="4" className={styles.dot} />
            </g>
            <g data-ml="verify">
              <path data-ml="verify-line" d={autoD} className={styles.measure} />
              <g data-ml="handle-a" transform={`translate(${geo.auto.a[0]} ${geo.auto.a[1]})`}>
                <circle data-ml="pulse" r="10.5" className={styles.pulse} />
                <circle r="7.5" className={styles.handle} />
              </g>
              <g data-ml="handle-b" transform={`translate(${geo.auto.b[0]} ${geo.auto.b[1]})`}>
                <circle data-ml="halo" r="18" className={styles.halo} />
                <circle data-ml="pulse" r="10.5" className={styles.pulse} />
                <circle r="7.5" className={styles.handle} />
              </g>
            </g>
            <g data-ml="hand">
              <path data-ml="hand-line" d={handD} className={styles.measure} />
              <circle cx={geo.hand.a[0]} cy={geo.hand.a[1]} r="4" className={styles.dot} />
              <circle cx={geo.hand.b[0]} cy={geo.hand.b[1]} r="4" className={styles.dot} />
            </g>
          </svg>
          <div data-ml="label" className={styles.label}>
            <span className={styles.pill}>
              <span data-ml="label-text" />
            </span>
          </div>
        </div>

        {!scene.real && <MapControls mapRect={scene.mapRect} />}
        <Panel app={app} values={scene.values} viewport={scene.viewport} />
      </div>

      <div data-ml="cursor" className={styles.cursor}>
        <span data-ml="ripple" className={styles.ripple} />
        <svg data-ml="cursor-arrow" className={styles.arrow} viewBox="0 0 14 21">
          <path d="M1 1V16.5L4.9 12.9L7.6 19.3L10.3 18.1L7.7 11.9H13Z" />
        </svg>
      </div>
    </div>
  )
}
