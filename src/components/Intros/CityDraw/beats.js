// Beat windows over the intro's t (PLAN §6.1); where the plan leaves detail open, the film's seconds (video intro.js T) are scaled into the window
export const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v)
export const lerp = (a, b, t) => a + (b - a) * t
export const seg = (t, a, b) => clamp01((t - a) / (b - a))
export const smooth = (a, b, v) => {
  const x = clamp01((v - a) / (b - a))
  return x * x * (3 - 2 * x)
}

// CSS cubic-bezier as a function of x, solved by Newton with a bisection fallback (intro.js:38-51)
function bezier(x1, y1, x2, y2) {
  const cx = 3 * x1
  const bx = 3 * (x2 - x1) - cx
  const ax = 1 - cx - bx
  const cy = 3 * y1
  const by = 3 * (y2 - y1) - cy
  const ay = 1 - cy - by
  const sx = (t) => ((ax * t + bx) * t + cx) * t
  const sy = (t) => ((ay * t + by) * t + cy) * t
  const dx = (t) => (3 * ax * t + 2 * bx) * t + cx
  return (x) => {
    if (x <= 0) return 0
    if (x >= 1) return 1
    let t = x
    for (let i = 0; i < 8; i++) {
      const e = sx(t) - x
      const d = dx(t)
      if (Math.abs(e) < 1e-7 || Math.abs(d) < 1e-6) break
      t -= e / d
    }
    if (!(Math.abs(sx(t) - x) < 1e-5)) {
      let lo = 0
      let hi = 1
      t = x
      for (let i = 0; i < 40; i++) {
        if (sx(t) < x) lo = t
        else hi = t
        t = (lo + hi) / 2
      }
    }
    return sy(t)
  }
}

export const EASE = {
  inOutSine: (t) => -(Math.cos(Math.PI * t) - 1) / 2,
  inOutCubic: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  outCubic: (t) => 1 - Math.pow(1 - t, 3),
  in2: (t) => t * t,
  // The app's spring, cubic-bezier(.34, 1.36, .64, 1)
  back: bezier(0.34, 1.36, 0.64, 1),
}

export const BEATS = {
  // The navy stage fades up over the poster, so the frame's resting state at t = 0 is the capture itself
  stage: [0, 0.035],
  boundary: [0.012, 0.18],
  // Street tiers (Highway/Major, Arterial/Collector, Local): a path starts at `at` plus `spread` by its distance from City Hall, drawn over `dur`
  tiers: [
    { at: 0.14, spread: 0.0863, dur: 0.0935 },
    { at: 0.1975, spread: 0.1007, dur: 0.0791 },
    { at: 0.255, spread: 0.1366, dur: 0.0683 },
  ],
  // Share of each tier's spread given to the per-path offset seeded by its index
  jitter: 0.25,
  reveal: [0.4, 0.7],
  // Legend rows: City limits, Streets, Parcels (with the counter); they leave as the push starts
  legend: [
    [0.03, 0.075],
    [0.15, 0.195],
    [0.4, 0.445],
  ],
  legendOut: [0.745, 0.785],
  // The lockup lands in .62-.74: the film's 8.5-10.95 s, scaled
  dim: [0.6, 0.655],
  seal: [0.62, 0.667],
  sweep: [0.662, 0.716],
  divider: [0.642, 0.689],
  title: { at: 0.652, stagger: 0.0044, dur: 0.039 },
  sub: [0.706, 0.74],
  push: [0.74, 1],
  subOut: [0.74, 0.784],
  undim: [0.74, 0.784],
  // The lockup settles into the capture's header by t ≈ .95, the frame the gallery card then holds
  morph: [0.76, 0.95],
  header: [0.88, 0.95],
  // The parcel raster fades while the push magnifies it 3x to 12x over the city fit (about t .83-.87)
  parcelFade: [3, 12],
  // Then the navy stage clears, so the capture comes in under the street vectors as the push closes on it
  underlay: [0.87, 0.95],
}

// Opacity of the stage (and everything drawn on it) over the poster
export const stageAt = (t) => EASE.inOutSine(seg(t, BEATS.stage[0], BEATS.stage[1]))

// Share of the navy stage cleared away for the capture underneath
export const underlayAt = (t) => EASE.inOutSine(seg(t, BEATS.underlay[0], BEATS.underlay[1]))

// The city dims to half under the lockup and comes back as the push starts
export const dimAt = (t) =>
  lerp(1, 0.5, EASE.inOutSine(seg(t, BEATS.dim[0], BEATS.dim[1]))) + 0.5 * EASE.inOutSine(seg(t, BEATS.undim[0], BEATS.undim[1]))

// Reveal progress 0..1 over the parcels window
export const revealAt = (t) => seg(t, BEATS.reveal[0], BEATS.reveal[1])

// Deterministic 0..1 per index, for per-path offsets that never change between frames
export function hash01(i) {
  let h = Math.imul(i ^ 0x9e3779b9, 0x85ebca6b)
  h ^= h >>> 13
  h = Math.imul(h, 0xc2b2ae35)
  h ^= h >>> 16
  return (h >>> 0) / 4294967296
}
