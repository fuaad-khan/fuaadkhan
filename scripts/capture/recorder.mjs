// Deterministic loop recording on the studio's virtual clock (C:\dev\mapMyCity\video\lib\shim\virtual-time.js): input between steps, one JPEG per frame
import { copyFileSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { assertNoLeaks, recordForbidden, SCRUBS } from '../lib/privacy.mjs'
import { FORBIDDEN_FILE } from './session.mjs'

const pad = (n) => String(n).padStart(5, '0')
const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)

// Key descriptors for the characters typed into search boxes
function keyOf(ch) {
  if (ch === ' ') return { key: ' ', code: 'Space', windowsVirtualKeyCode: 32 }
  if (/[0-9]/.test(ch)) return { key: ch, code: `Digit${ch}`, windowsVirtualKeyCode: ch.charCodeAt(0) }
  if (/[a-z]/i.test(ch)) return { key: ch, code: `Key${ch.toUpperCase()}`, windowsVirtualKeyCode: ch.toUpperCase().charCodeAt(0) }
  return { key: ch, code: '', windowsVirtualKeyCode: ch.charCodeAt(0) }
}

// Records frames for one loop into dir; every frame is asserted leak-free before it is written
export function createRecorder(ctx, { name, fps = 30, quality = 92 }) {
  const { page } = ctx
  const dir = join(ctx.dir, `${name}.frames`)
  rmSync(dir, { recursive: true, force: true })
  mkdirSync(dir, { recursive: true })
  const dt = 1000 / fps
  const marks = {}
  const mouse = { x: ctx.width * 0.6, y: ctx.height * 0.55, down: false }
  let count = 0
  let posterPending = false

  const step = () => page.evaluate(`window.__vt.step(${dt})`)
  const cursor = () => page.evaluate(`window.__wp6.moveCursor(${mouse.x}, ${mouse.y}, ${mouse.down})`)

  async function shoot() {
    await assertNoLeaks(page, `${ctx.app}/${name} frame ${count}`)
    const buf = await page.screenshot({ format: 'jpeg', quality })
    writeFileSync(join(dir, `f${pad(count)}.jpg`), buf)
    // The poster frame is also kept lossless, so the poster and the still are encoded from a PNG
    if (posterPending) {
      posterPending = false
      await page.screenshot({ path: join(dir, 'poster.png'), format: 'png' })
    }
    count++
  }

  // Advances the clock one frame and captures it, n times
  async function tick(n = 1) {
    for (let i = 0; i < n; i++) {
      await step()
      await shoot()
    }
  }

  const rec = {
    dir,
    fps,
    marks,
    get frames() {
      return count
    },
    seconds: (s) => Math.max(1, Math.round(s * fps)),
    tick,
    // Live time: the app keeps animating while the viewer reads
    live: (s) => tick(rec.seconds(s)),
    // Repeats the last frame without advancing the clock (a perfectly still hold)
    freeze(s) {
      for (let i = 0; i < rec.seconds(s); i++) {
        copyFileSync(join(dir, `f${pad(count - 1)}.jpg`), join(dir, `f${pad(count)}.jpg`))
        count++
      }
    },
    // Pre-roll: steps the clock without capturing until a page expression is truthy
    async waitFor(expression, { max = 30, label = expression } = {}) {
      for (let i = 0; i < rec.seconds(max); i++) {
        if (await page.evaluate(`!!(${expression})`)) return i
        await step()
      }
      throw new Error(`${ctx.app}/${name}: ${label} not reached within ${max} s of virtual time`)
    },
    // Keeps recording live frames until a page expression is truthy (the clock only moves when stepped)
    async until(expression, { max = 6, label = expression } = {}) {
      for (let i = 0; i < rec.seconds(max); i++) {
        if (await page.evaluate(`!!(${expression})`)) return i
        await tick()
      }
      throw new Error(`${ctx.app}/${name}: ${label} not reached within ${max} s of virtual time`)
    },
    // Names the next frame (the encoder starts the loop at marks.poster, so the first frame is the poster)
    mark(label) {
      marks[label] = count
      if (label === 'poster') posterPending = true
    },
    // Steps the clock without capturing until nothing runs, loads or mutates for `quiet` frames
    async settle({ min = 10, max = 900, quiet = 15 } = {}) {
      let calm = 0
      for (let i = 0; i < max; i++) {
        const r = await step()
        calm = r.running === 0 && r.pending === 0 && r.mutations === 0 ? calm + 1 : 0
        if (i >= min && calm >= quiet) return i
      }
      return max
    },
    // Shows the drawn cursor at its current position without moving it
    showCursor: () => cursor(),
    // Glides the cursor along an eased path over `s` seconds, dispatching real mouse moves (drag when the button is down)
    async moveTo(x, y, s = 0.6) {
      const from = { x: mouse.x, y: mouse.y }
      const n = rec.seconds(s)
      for (let i = 1; i <= n; i++) {
        const t = easeInOut(i / n)
        mouse.x = from.x + (x - from.x) * t
        mouse.y = from.y + (y - from.y) * t
        await page.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: mouse.x, y: mouse.y, button: mouse.down ? 'left' : 'none', buttons: mouse.down ? 1 : 0 })
        await cursor()
        await tick()
      }
    },
    // Teleports the cursor (no frames), e.g. to set the starting pose
    async place(x, y) {
      mouse.x = x
      mouse.y = y
      await page.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, button: 'none', buttons: 0 })
      await cursor()
    },
    async press() {
      mouse.down = true
      await page.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: mouse.x, y: mouse.y, button: 'left', buttons: 1, clickCount: 1 })
      await cursor()
    },
    async release() {
      mouse.down = false
      await page.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: mouse.x, y: mouse.y, button: 'left', buttons: 0, clickCount: 1 })
      await cursor()
    },
    // Press, two frames, release: a visible click at the current position
    async click() {
      await rec.press()
      await tick(2)
      await rec.release()
      await tick()
    },
    // Moves to (x, y) and clicks there
    async clickAt(x, y, s = 0.6) {
      await rec.moveTo(x, y, s)
      await rec.tick(rec.seconds(0.12))
      await rec.click()
    },
    // Types text into the focused field at about cps characters per second
    async type(text, cps = 9) {
      const gap = Math.max(1, Math.round(fps / cps))
      for (const ch of text) {
        const k = keyOf(ch)
        await page.send('Input.dispatchKeyEvent', { type: 'keyDown', text: ch, unmodifiedText: ch, ...k })
        await page.send('Input.dispatchKeyEvent', { type: 'keyUp', ...k })
        await tick(gap)
      }
    },
    // Writes marks.json next to the frames and the loop's sidecar (every frame was asserted leak-free) for the encoder
    async finish(extra = {}) {
      writeFileSync(join(dir, 'marks.json'), JSON.stringify({ fps, frames: count, marks }, null, 2))
      if (marks.poster === undefined) throw new Error(`${ctx.app}/${name}: no poster mark`)
      const camera = await page.evaluate('window.__wp6.mapState()')
      const sidecar = {
        app: ctx.app,
        name,
        kind: 'loop',
        width: ctx.width,
        height: ctx.height,
        dpr: ctx.dpr,
        fps,
        frames: count,
        seconds: Math.round((count / fps) * 100) / 100,
        posterFrame: marks.poster,
        ...(camera ?? {}),
        viewport: [ctx.width, ctx.height],
        clock: 'virtual (C:\\dev\\mapMyCity\\video\\lib\\shim\\virtual-time.js), one frame per step',
        scrubs: SCRUBS[ctx.app],
        leaks: [],
        appCommit: ctx.commit,
        capturedAt: new Date().toISOString(),
        ...extra,
      }
      writeFileSync(join(ctx.dir, `${name}.json`), JSON.stringify(sidecar, null, 2))
      await recordForbidden(page, FORBIDDEN_FILE)
      console.log(`  loop  ${ctx.app}/${name}  ${count} frames (${sidecar.seconds} s)  marks ${JSON.stringify(marks)}`)
      return { frames: count, marks }
    },
  }
  return rec
}
