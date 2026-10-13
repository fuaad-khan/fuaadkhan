import { BEATS, EASE, clamp01, lerp, revealAt, seg, smooth, stageAt } from './beats'

// The app header's lockup in its own CSS px (mapMyCity.css #appHeader: 88 tall, seal 72 at x 20, hairline at 106, title at 121)
export const HEADER = { h: 88, seal: 72 }
// The centred pose: lockup scale per frame px of width, and the lockup's centre as a share of the frame height
const POSE = { scale: 0.00135, cy: 0.44 }
const ROWS = ['--row0', '--row1', '--row2']

// Drives the HTML layer (legend, counter, seal, lockup, header) through custom properties; only changed values are written
export function createOverlay(root, words, counter, total, reveal) {
  const format = new Intl.NumberFormat('en-US')
  const written = new Map()
  const wordWritten = new Float64Array(words.length).fill(NaN)
  let count = -1
  let W = 0
  let H = 0
  let S = 1
  let k = 1
  let uA = 1
  let morph = false

  const set = (name, value) => {
    const v = Math.round(value * 1000) / 1000
    if (written.get(name) === v) return
    written.set(name, v)
    root.style.setProperty(name, String(v))
  }

  return {
    // Size-dependent geometry, once per resize
    layout(width, height, camera) {
      W = width
      H = height
      S = camera.S
      k = W / 1440
      uA = POSE.scale * W
      // The lockup settles into the header only when the capture shows the app's 88 px header above a full-width map
      morph = camera.mapRect[0] === 0 && Math.abs(camera.mapRect[1] - HEADER.h) < 1
      set('--cy', POSE.cy * H)
      set('--suby', POSE.cy * H + (HEADER.seal / 2 + 12) * uA)
      set('--headerH', camera.mapRect[1] * S)
    },
    update(t, cam) {
      const stage = stageAt(t)
      const push = seg(t, BEATS.push[0], BEATS.push[1])
      set('--vignette', stage * (1 - EASE.inOutSine(push)))

      // Legend rows arrive with their beats and leave as the push starts; the counter follows the reveal's wave
      set('--legend', stage * (1 - EASE.in2(seg(t, BEATS.legendOut[0], BEATS.legendOut[1]))))
      for (let i = 0; i < ROWS.length; i++) set(ROWS[i], EASE.outCubic(seg(t, BEATS.legend[i][0], BEATS.legend[i][1])))
      const rv = revealAt(t)
      const n = rv <= 0 ? 0 : rv >= 1 ? total : Math.min(total, Math.round(total * reveal.passed(reveal.radius(rv, cam.s, k))))
      if (n !== count) {
        count = n
        counter.textContent = format.format(n)
      }

      // Seal lands with a light sweep, the hairline grows, the title rises word by word, the subtitle follows
      const seal = seg(t, BEATS.seal[0], BEATS.seal[1])
      const sweep = seg(t, BEATS.sweep[0], BEATS.sweep[1])
      const m = morph ? EASE.inOutCubic(seg(t, BEATS.morph[0], BEATS.morph[1])) : 0
      set('--seal', clamp01(seal / 0.45))
      set('--sealScale', lerp(1.16, 1, EASE.outCubic(seal)))
      set('--sweep', sweep)
      set('--sweepOn', sweep > 0 && sweep < 1 ? 1 : 0)
      set('--glow', EASE.outCubic(seal) * (1 - 0.55 * sweep) * (1 - m))
      set('--divider', EASE.outCubic(seg(t, BEATS.divider[0], BEATS.divider[1])))
      for (let i = 0; i < words.length; i++) {
        const a = BEATS.title.at + i * BEATS.title.stagger
        const p = seg(t, a, a + BEATS.title.dur)
        if (wordWritten[i] === p) continue
        wordWritten[i] = p
        words[i].style.setProperty('--w', String(Math.round(EASE.back(p) * 1000) / 1000))
        words[i].style.setProperty('--wo', String(Math.round(smooth(0.04, 0.5, p) * 1000) / 1000))
      }
      const subIn = EASE.outCubic(seg(t, BEATS.sub[0], BEATS.sub[1]))
      const subOut = EASE.in2(seg(t, BEATS.subOut[0], BEATS.subOut[1]))
      set('--sub', subIn * (1 - subOut))
      set('--subRise', ((1 - subIn) * 18 - subOut * 6) * k)
      set('--scrim', EASE.inOutSine(seg(t, BEATS.dim[0], BEATS.dim[1])) * (1 - m))

      // The push carries the lockup from the centre into the capture's header (scale geometric, position linear); without a header it fades
      set('--m', m)
      set('--lu', Math.exp(lerp(Math.log(uA), Math.log(S), m)))
      set('--lx', lerp(W / 2, 0, m))
      set('--ly', lerp(POSE.cy * H, (HEADER.h / 2) * S, m))
      set('--lp', lerp(50, 0, m))
      set('--lockup', morph ? stage : stage * (1 - EASE.inOutSine(seg(t, BEATS.subOut[0], BEATS.subOut[1]))))
      set('--header', morph ? EASE.inOutSine(seg(t, BEATS.header[0], BEATS.header[1])) : 0)
    },
  }
}
