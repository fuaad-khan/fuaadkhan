import { BEATS, EASE, dimAt, hash01, lerp, revealAt, seg, smooth, stageAt, underlayAt } from './beats'

const STAGE = '#011f33'
const STAGE_RGB = '1,31,51'
const GOLD = '#f2c14e'
// Street classes back to front: width in px at a 1440 px frame, alpha, colour and draw-on tier (intro.js:233-240, Future dropped)
const STREETS = [
  { key: 'Local', w: 0.9, a: 0.38, color: '#cfe0ee', tier: 2 },
  { key: 'Collector', w: 1.5, a: 0.62, color: '#e3eef7', tier: 1 },
  { key: 'Arterial', w: 1.8, a: 0.72, color: '#e3eef7', tier: 1 },
  { key: 'Major', w: 2.5, a: 0.86, color: '#ffffff', tier: 0 },
  { key: 'Highway', w: 3.2, a: 0.95, color: '#ffffff', tier: 0 },
]
// City limits as the app draws them (12 8 dash), with a wide additive glow stroke instead of shadowBlur
const LIMITS = { w: 2.6, glow: 8, glowAlpha: 0.07, dash: 12, gap: 8, head: 33 }
// Parcels: line alpha on the stage, the reveal's inner level (its wavefront rises to 1), and its shape in px at a 1440 px frame
const PARCELS = { alpha: 0.5, inner: 0.6, start: 56, feather: 112, beyond: 225, glow: 0.85 }
const MAX_TIPS = 512
// Gradient caches are keyed by quantised shape, so scrubbing reuses a bounded set instead of allocating per frame
const RHO_STEPS = 32
const GLOW_STEPS = 8

// Additive light sprite for pen heads and street tips (one radial gradient, drawn once)
function sprite(rgb) {
  const c = document.createElement('canvas')
  c.width = 64
  c.height = 64
  const x = c.getContext('2d')
  const gr = x.createRadialGradient(32, 32, 0, 32, 32, 32)
  gr.addColorStop(0, `rgba(${rgb},0.95)`)
  gr.addColorStop(0.25, `rgba(${rgb},0.45)`)
  gr.addColorStop(1, `rgba(${rgb},0)`)
  x.fillStyle = gr
  x.fillRect(0, 0, 64, 64)
  return c
}

// Appends a polyline to the current path up to distance d and writes its head into head (intro.js:323-335)
function trace(ctx, line, d, head) {
  const { pts, cum } = line
  const n = cum.length
  ctx.moveTo(pts[0], pts[1])
  for (let i = 1; i < n; i++) {
    if (cum[i] <= d) {
      ctx.lineTo(pts[2 * i], pts[2 * i + 1])
      continue
    }
    const f = (d - cum[i - 1]) / Math.max(1e-6, cum[i] - cum[i - 1])
    head[0] = lerp(pts[2 * i - 2], pts[2 * i], f)
    head[1] = lerp(pts[2 * i - 1], pts[2 * i + 1], f)
    ctx.lineTo(head[0], head[1])
    return
  }
  head[0] = pts[2 * n - 2]
  head[1] = pts[2 * n - 1]
}

// The radial reveal over the city's parcel-centroid quantiles: the wave is patient where the city is dense (intro.js:836-846)
export function createReveal(city) {
  const q = city.quantiles
  const n = q.length - 1
  const far = q[n]
  return {
    // Reveal radius in z18 px for progress rv at camera scale s; it runs on past the last parcel so the wave leaves the frame
    radius(rv, s, k) {
      const f = EASE.inOutSine(rv)
      const x = f * n
      const i = Math.min(n - 1, Math.floor(x))
      return lerp(q[i], q[i + 1], x - i) + smooth(0.8, 1, f) * (city.rmax - far + (PARCELS.beyond * k) / s)
    },
    // Share of parcels whose centroid the wave has passed
    passed(r) {
      if (r >= far) return 1
      if (r <= q[0]) return 0
      let i = 0
      while (q[i + 1] < r) i++
      return (i + (r - q[i]) / Math.max(1e-6, q[i + 1] - q[i])) / n
    },
  }
}

// Canvas painter for the vector city: one paint(t) per driver change, allocation-free once warm
export function createPainter(canvas, city) {
  const g = canvas.getContext('2d')
  if (!g) throw new Error('Canvas 2D is unavailable')
  const white = sprite('255,255,255')
  const gold = sprite('255,226,150')
  const reveal = createReveal(city)
  const [ax, ay] = city.anchor

  // Street schedule: each path starts by its distance from City Hall, plus an offset seeded by its index
  let dMax = 1
  for (const s of STREETS) for (const line of city.streets[s.key]) dMax = Math.max(dMax, Math.hypot(line.pts[0] - ax, line.pts[1] - ay))
  const classes = STREETS.map((s, ci) => {
    const tier = BEATS.tiers[s.tier]
    const path = new Path2D()
    let start = Infinity
    let end = -Infinity
    const lines = city.streets[s.key].map((line, i) => {
      const { pts } = line
      path.moveTo(pts[0], pts[1])
      for (let j = 2; j < pts.length; j += 2) path.lineTo(pts[j], pts[j + 1])
      const near = Math.sqrt(Math.hypot(pts[0] - ax, pts[1] - ay) / dMax)
      const t0 = tier.at + tier.spread * ((1 - BEATS.jitter) * near + BEATS.jitter * hash01(i + ci * 4096))
      start = Math.min(start, t0)
      end = Math.max(end, t0 + tier.dur)
      return { pts, cum: line.cum, len: line.len, t0 }
    })
    return { ...s, dur: tier.dur, path, lines, start, end }
  })
  // Classes are stored back to front, which is not start order (Local is drawn first but starts last)
  const firstStart = Math.min(...classes.map((c) => c.start))

  const head = new Float64Array(2)
  const tips = new Float32Array(3 * MAX_TIPS)
  const heads = new Float32Array(2 * city.boundary.length)
  const dash = [0, 0]
  const noDash = []
  const coverCache = new Map()
  let W = 0
  let H = 0
  let dpr = 1
  let k = 1
  let lw = 1
  let raster = null
  let rasterScale = 1

  // Reveal mask as stage colour painted over the additive parcels (stage + P becomes stage + P(1 - c)): inner level, brighter front, feathered edge
  function coverGradient(rho, glow) {
    const ri = Math.round(rho * RHO_STEPS)
    const gi = Math.round((glow / PARCELS.glow) * GLOW_STEPS)
    const key = ri * (GLOW_STEPS + 1) + gi
    let gr = coverCache.get(key)
    if (gr) return gr
    const p = ri / RHO_STEPS
    const peak = PARCELS.inner + (1 - PARCELS.inner) * (gi / GLOW_STEPS)
    gr = g.createRadialGradient(0, 0, 0, 0, 0, 1)
    gr.addColorStop(0, `rgba(${STAGE_RGB},${1 - PARCELS.inner})`)
    gr.addColorStop(Math.max(0, 1 - 2.4 * p), `rgba(${STAGE_RGB},${1 - PARCELS.inner})`)
    gr.addColorStop(Math.max(0, 1 - 0.6 * p), `rgba(${STAGE_RGB},${1 - peak})`)
    gr.addColorStop(1, `rgba(${STAGE_RGB},1)`)
    coverCache.set(key, gr)
    return gr
  }

  function parcels(t, alpha, cam, cam0) {
    const rv = revealAt(t)
    if (rv <= 0 || !raster) return
    const fade = 1 - smooth(BEATS.parcelFade[0], BEATS.parcelFade[1], cam.s / cam0.s)
    const a = (PARCELS.alpha * alpha * fade) / city.intensity
    if (a <= 0.002) return
    // The raster is lines on black: added with 'lighter', its black adds nothing, so it behaves like a transparent overlay
    const sc = (dpr * cam.s) / rasterScale
    const tx = dpr * (cam.s * city.extent[0] + cam.x)
    const ty = dpr * (cam.s * city.extent[1] + cam.y)
    if (rv >= 1) {
      g.setTransform(sc, 0, 0, sc, tx, ty)
      g.globalCompositeOperation = 'lighter'
      g.globalAlpha = Math.min(1, a)
      g.drawImage(raster, 0, 0)
      g.globalCompositeOperation = 'source-over'
      return
    }
    const r = Math.max(0.5, reveal.radius(rv, cam.s, k) * cam.s + PARCELS.start * k * Math.min(1, rv * 12))
    const ox = cam.s * ax + cam.x
    const oy = cam.s * ay + cam.y
    // Nothing outside the reveal's box can show, so the raster and the reveal gradient are clipped to it
    const x0 = Math.max(0, ox - r)
    const y0 = Math.max(0, oy - r)
    const x1 = Math.min(W, ox + r)
    const y1 = Math.min(H, oy + r)
    if (x1 <= x0 || y1 <= y0) return
    g.save()
    g.setTransform(dpr, 0, 0, dpr, 0, 0)
    g.beginPath()
    g.rect(x0, y0, x1 - x0, y1 - y0)
    g.clip()
    g.setTransform(sc, 0, 0, sc, tx, ty)
    g.globalCompositeOperation = 'lighter'
    g.globalAlpha = Math.min(1, a / PARCELS.inner)
    g.drawImage(raster, 0, 0)
    // One radial-gradient pass in unit space around City Hall: no offscreen canvas, so nothing forces a raster mid-paint
    const rho = Math.min(1, (PARCELS.feather * k) / r)
    const glow = PARCELS.glow * (1 - smooth(0.8, 1, rv))
    g.setTransform(dpr * r, 0, 0, dpr * r, dpr * ox, dpr * oy)
    g.globalCompositeOperation = 'source-over'
    g.globalAlpha = 1
    g.fillStyle = coverGradient(rho, glow)
    g.fillRect(-1, -1, 2, 2)
    g.restore()
  }

  function streets(t, alpha, cam) {
    if (alpha <= 0 || t < firstStart) return
    g.setTransform(dpr * cam.s, 0, 0, dpr * cam.s, dpr * cam.x, dpr * cam.y)
    g.lineJoin = 'round'
    g.lineCap = 'round'
    let n = 0
    for (let c = 0; c < classes.length; c++) {
      const cls = classes[c]
      if (t < cls.start) continue
      g.globalAlpha = cls.a * alpha
      g.strokeStyle = cls.color
      g.lineWidth = (cls.w * lw) / cam.s
      // Finished classes stroke their prebuilt path; only a class mid-draw traces partial lines
      if (t >= cls.end) {
        g.stroke(cls.path)
        continue
      }
      g.beginPath()
      const { lines } = cls
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i]
        const p = EASE.outCubic(seg(t, line.t0, line.t0 + cls.dur))
        if (p <= 0) continue
        trace(g, line, p * line.len, head)
        if (p < 1 && cls.tier < 2 && n < MAX_TIPS) {
          tips[3 * n] = head[0]
          tips[3 * n + 1] = head[1]
          tips[3 * n + 2] = cls.tier
          n++
        }
      }
      g.stroke()
    }
    if (!n) return
    // A soft light rides the head of every growing major street
    g.setTransform(dpr, 0, 0, dpr, 0, 0)
    g.globalCompositeOperation = 'lighter'
    for (let i = 0; i < n; i++) {
      const tier = tips[3 * i + 2]
      const r = (tier ? 7 : 10) * k
      g.globalAlpha = alpha * (tier ? 0.3 : 0.42)
      g.drawImage(white, cam.s * tips[3 * i] + cam.x - r, cam.s * tips[3 * i + 1] + cam.y - r, 2 * r, 2 * r)
    }
    g.globalCompositeOperation = 'source-over'
  }

  function limits(t, alpha, cam) {
    const p = EASE.inOutSine(seg(t, BEATS.boundary[0], BEATS.boundary[1]))
    if (p <= 0 || alpha <= 0) return
    g.setTransform(dpr * cam.s, 0, 0, dpr * cam.s, dpr * cam.x, dpr * cam.y)
    g.lineJoin = 'round'
    g.lineCap = 'butt'
    g.strokeStyle = GOLD
    const drawing = p < 1
    if (drawing) {
      g.beginPath()
      for (let i = 0; i < city.boundary.length; i++) {
        const ring = city.boundary[i]
        trace(g, ring, p * ring.len, head)
        heads[2 * i] = head[0]
        heads[2 * i + 1] = head[1]
      }
    }
    g.globalCompositeOperation = 'lighter'
    g.globalAlpha = alpha * LIMITS.glowAlpha
    g.lineWidth = (LIMITS.glow * lw) / cam.s
    if (drawing) g.stroke()
    else g.stroke(city.boundaryPath)
    g.globalCompositeOperation = 'source-over'
    g.globalAlpha = alpha
    g.lineWidth = (LIMITS.w * lw) / cam.s
    dash[0] = (LIMITS.dash * lw) / cam.s
    dash[1] = (LIMITS.gap * lw) / cam.s
    g.setLineDash(dash)
    if (drawing) g.stroke()
    else g.stroke(city.boundaryPath)
    g.setLineDash(noDash)
    if (!drawing) return
    // The pen's glowing head
    g.setTransform(dpr, 0, 0, dpr, 0, 0)
    g.globalCompositeOperation = 'lighter'
    g.globalAlpha = alpha * Math.min(1, p * 12)
    const r = LIMITS.head * k
    for (let i = 0; i < city.boundary.length; i++) g.drawImage(gold, cam.s * heads[2 * i] + cam.x - r, cam.s * heads[2 * i + 1] + cam.y - r, 2 * r, 2 * r)
    g.globalCompositeOperation = 'source-over'
  }

  return {
    reveal,
    // Backing store = CSS size x min(devicePixelRatio, 2); sizes scale with the frame relative to the 1440 px capture
    resize(width, height, ratio) {
      W = width
      H = height
      dpr = ratio
      const cw = Math.max(1, Math.round(W * dpr))
      const ch = Math.max(1, Math.round(H * dpr))
      if (canvas.width !== cw || canvas.height !== ch) {
        canvas.width = cw
        canvas.height = ch
      }
      k = W / 1440
      lw = Math.min(1.15, Math.max(0.55, Math.sqrt(k)))
    },
    setRaster(image) {
      raster = image
      rasterScale = image.width / city.extent[2]
    },
    paint(t, cam, cam0) {
      g.setTransform(1, 0, 0, 1, 0, 0)
      g.globalCompositeOperation = 'source-over'
      g.globalAlpha = 1
      const stage = stageAt(t)
      const fill = stage * (1 - underlayAt(t))
      // An opaque stage overwrites every pixel, so the clear is only needed while it fades in or clears for the capture
      if (fill < 1) g.clearRect(0, 0, canvas.width, canvas.height)
      if (stage <= 0) return
      g.globalAlpha = fill
      g.fillStyle = STAGE
      g.fillRect(0, 0, canvas.width, canvas.height)
      const dim = dimAt(t)
      parcels(t, stage * dim, cam, cam0)
      streets(t, stage * dim, cam)
      limits(t, stage * lerp(1, 0.75, 1 - dim), cam)
      g.globalAlpha = 1
    },
    // Frees the backing store right away instead of waiting for GC
    destroy() {
      canvas.width = 0
      canvas.height = 0
      coverCache.clear()
      raster = null
    },
  }
}
