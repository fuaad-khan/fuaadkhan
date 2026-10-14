// Media encoder (PLAN §7, PLAN-v2 Media): .cache/capture/<app>/ → src/assets/<app>/ — WebP stills at 1600 and 800 px, WebM + MP4 loops with WebP posters, sidecars, budgets, a size table and a contact sheet
import { existsSync, linkSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { parseArgs } from 'node:util'
import { launch } from './lib/cdp.mjs'
import { mp4, run, twoPass, webm, webp } from './lib/ffmpeg.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const RAW = join(ROOT, '.cache', 'capture')
const ASSETS = join(ROOT, 'src', 'assets')
const SHOTS = JSON.parse(readFileSync(join(ROOT, 'scripts', 'capture', 'shots.json'), 'utf8'))
// Decimal kB, the unit Vite prints and the stricter reading of the budgets; v2 (CONTRACTS-v2 §4): WebM about 700 kB, and a full watch of every card is reported against 9 MB
const KB = 1000
const BUDGET = { x2: 150 * KB, x1: 50 * KB, webm: 700 * KB, mp4: 900 * KB, page: 9000 * KB }
const LOOP_WIDTH = 1280
// Sidecar fields that never ship (local bookkeeping)
const DROP = new Set(['captureViewport'])

const USAGE = `Usage: node scripts/encode-media.mjs [app ...] [--only name,name] [--no-sheet] [--sheet audit] [--cdp-port 9366]

Encodes the raw captures in .cache/capture/<app>/ (from scripts/capture/index.mjs) into src/assets/<app>/:
  stills  <name>@2x.webp (1600 px) + <name>.webp (800 px), quality lowered from 82 until within ${BUDGET.x2 / KB} / ${BUDGET.x1 / KB} kB
  loops   <name>.webm (VP9) + <name>.mp4 (H.264) at ${LOOP_WIDTH} px / 30 fps, starting on the poster frame, CRF raised until within ${BUDGET.webm / KB} / ${BUDGET.mp4 / KB} kB,
          plus <name>-poster@2x.webp + <name>-poster.webp from the lossless poster frame
  sidecars <name>.json next to each asset (camera, scrubs, leaks: [], intro harvest on hero)
Captures from a draft run (--dpr 1) are refused. Then prints a size table and the page weight over every shipped capture,
and writes <sheet>/contact-sheet.html (+ .png rendered over CDP): every still and poster, plus frames sampled from each shipped WebM.`

const fmt = (n) => `${(n / KB).toFixed(1)} kB`.padStart(10)
const size = (f) => statSync(f).size

// One still at a width, quality stepped down from 82 until it fits the budget (floor 40)
async function stillAt(src, out, width, budget) {
  let quality = 82
  for (;;) {
    await webp(src, out, { width, quality })
    if (size(out) <= budget || quality <= 40) return { file: out, bytes: size(out), quality, over: size(out) > budget }
    quality -= 4
  }
}

// A loop's frames relinked in playback order: from the poster frame to the end, then the start (the seam stays continuous)
function rotated(framesDir, posterFrame, count) {
  const dir = join(framesDir, '..', `${framesDir.split(/[\\/]/).pop()}.rotated`)
  rmSync(dir, { recursive: true, force: true })
  mkdirSync(dir, { recursive: true })
  for (let i = 0; i < count; i++) {
    const from = join(framesDir, `f${String((posterFrame + i) % count).padStart(5, '0')}.jpg`)
    linkSync(from, join(dir, `r${String(i).padStart(5, '0')}.jpg`))
  }
  return { dir, pattern: join(dir, 'r%05d.jpg') }
}

// PLAN §7's CRF first; when that overshoots the budget, size-targeted two-pass VBR (sharper than a raised CRF at the same size), stepping down until it fits
async function videoAt(codec, pattern, out, budget, seconds) {
  const crf = codec === 'vp9' ? 34 : 26
  await (codec === 'vp9' ? webm : mp4)(pattern, out, { width: LOOP_WIDTH, crf })
  if (size(out) <= budget) return { file: out, bytes: size(out), note: `crf ${crf}`, over: false }
  const passlog = join(RAW, `passlog-${codec}`)
  let kbps = Math.floor(((budget * 8) / 1000 / seconds) * 0.9)
  for (let i = 0; i < 6; i++) {
    await twoPass(pattern, out, { codec, kbps, width: LOOP_WIDTH, passlog })
    if (size(out) <= budget) break
    kbps = Math.floor(kbps * 0.92)
  }
  for (const f of readdirSync(RAW).filter((n) => n.startsWith(`passlog-${codec}`))) rmSync(join(RAW, f), { force: true })
  return { file: out, bytes: size(out), note: `2-pass ${kbps} kbps`, over: size(out) > budget }
}

// The sidecar as shipped: the capture's own fields minus local bookkeeping
function writeSidecar(rawJson, out) {
  const data = JSON.parse(readFileSync(rawJson, 'utf8'))
  if (!Array.isArray(data.leaks) || data.leaks.length) throw new Error(`${rawJson}: leaks must be [] (got ${JSON.stringify(data.leaks)})`)
  for (const key of DROP) delete data[key]
  writeFileSync(out, `${JSON.stringify(data, null, 2)}\n`)
  return data
}

async function encodeApp(app, only) {
  const raw = join(RAW, app)
  const out = join(ASSETS, app)
  mkdirSync(out, { recursive: true })
  const rows = []
  for (const shot of SHOTS[app].shots) {
    if (only && !only.has(shot.name)) continue
    const sidecar = join(raw, `${shot.name}.json`)
    if (!existsSync(sidecar)) throw new Error(`${app}/${shot.name}: no capture in ${relative(ROOT, raw)} (run node scripts/capture/index.mjs ${app} --shots ${shot.name})`)
    const dpr = JSON.parse(readFileSync(sidecar, 'utf8')).dpr
    if (!(dpr >= 2)) throw new Error(`${app}/${shot.name}: a draft capture (dpr ${dpr}); capture it again at dpr 2 before encoding`)
    if (shot.kind === 'still') {
      const src = join(raw, `${shot.name}.png`)
      const x2 = await stillAt(src, join(out, `${shot.name}@2x.webp`), 1600, BUDGET.x2)
      const x1 = await stillAt(src, join(out, `${shot.name}.webp`), 800, BUDGET.x1)
      writeSidecar(sidecar, join(out, `${shot.name}.json`))
      rows.push({ app, name: `${shot.name}@2x.webp`, ...x2, budget: BUDGET.x2, note: `q${x2.quality}`, role: shot.name === 'base' ? 'intro' : 'x2' })
      rows.push({ app, name: `${shot.name}.webp`, ...x1, budget: BUDGET.x1, note: `q${x1.quality}`, role: shot.name === 'base' ? 'intro1' : 'x1' })
    } else {
      const framesDir = join(raw, `${shot.name}.frames`)
      const marks = JSON.parse(readFileSync(join(framesDir, 'marks.json'), 'utf8'))
      const seq = rotated(framesDir, marks.marks.poster, marks.frames)
      try {
        const seconds = marks.frames / marks.fps
        const w = await videoAt('vp9', seq.pattern, join(out, `${shot.name}.webm`), BUDGET.webm, seconds)
        const m = await videoAt('h264', seq.pattern, join(out, `${shot.name}.mp4`), BUDGET.mp4, seconds)
        rows.push({ app, name: `${shot.name}.webm`, ...w, budget: BUDGET.webm, note: `${w.note}, ${seconds.toFixed(2)} s`, role: 'webm' })
        rows.push({ app, name: `${shot.name}.mp4`, ...m, budget: BUDGET.mp4, note: m.note, role: 'mp4' })
      } finally {
        rmSync(seq.dir, { recursive: true, force: true })
      }
      const poster = join(framesDir, 'poster.png')
      const p2 = await stillAt(poster, join(out, `${shot.name}-poster@2x.webp`), 1600, BUDGET.x2)
      const p1 = await stillAt(poster, join(out, `${shot.name}-poster.webp`), 800, BUDGET.x1)
      writeSidecar(sidecar, join(out, `${shot.name}.json`))
      rows.push({ app, name: `${shot.name}-poster@2x.webp`, ...p2, budget: BUDGET.x2, note: `q${p2.quality}`, role: 'x2' })
      rows.push({ app, name: `${shot.name}-poster.webp`, ...p1, budget: BUDGET.x1, note: `q${p1.quality}`, role: 'x1' })
    }
    console.log(`  ${app}/${shot.name} encoded`)
  }
  return rows
}

// Shipped capture media per app: each manifest shot's still or poster at both densities, and its WebM and MP4
function shipped(app) {
  const dir = join(ASSETS, app)
  const out = []
  for (const shot of SHOTS[app].shots) {
    const loop = shot.kind === 'loop'
    const files = loop
      ? [[`${shot.name}-poster@2x.webp`, 'x2'], [`${shot.name}-poster.webp`, 'x1'], [`${shot.name}.webm`, 'webm'], [`${shot.name}.mp4`, 'mp4']]
      : [[`${shot.name}@2x.webp`, shot.name === 'base' ? 'intro' : 'x2'], [`${shot.name}.webp`, shot.name === 'base' ? 'intro1' : 'x1']]
    for (const [name, role] of files) if (existsSync(join(dir, name))) out.push({ app, name, role, bytes: size(join(dir, name)), budget: BUDGET[role === 'intro' ? 'x2' : role === 'intro1' ? 'x1' : role] })
  }
  return out
}

// Frames sampled from a shipped WebM (start, thirds, last), so the sheet reviews the bytes a visitor gets
async function sampleLoop(app, name, framesDir) {
  const meta = JSON.parse(readFileSync(join(ASSETS, app, `${name}.json`), 'utf8'))
  const last = Math.max(0, (meta.frames - 1) / meta.fps)
  const out = []
  for (const [i, t] of [0, last / 3, (2 * last) / 3, last].entries()) {
    const file = join(framesDir, `${app}-${name}-${i}.jpg`)
    await run(['-y', '-ss', t.toFixed(3), '-i', join(ASSETS, app, `${name}.webm`), '-frames:v', '1', '-vf', 'scale=800:-2:flags=lanczos', '-q:v', '3', file])
    out.push({ file, t })
  }
  return out
}

// Every still and poster, plus sampled frames of every loop, for the owner and for a by-eye privacy pass
async function contactSheet(apps, sheetDir) {
  const framesDir = join(sheetDir, 'frames')
  rmSync(framesDir, { recursive: true, force: true })
  mkdirSync(framesDir, { recursive: true })
  const rel = (file) => relative(sheetDir, file).replaceAll('\\', '/')
  const cards = []
  for (const app of apps) {
    for (const shot of SHOTS[app].shots) {
      const dir = join(ASSETS, app)
      const loop = shot.kind === 'loop'
      const poster = join(dir, loop ? `${shot.name}-poster@2x.webp` : `${shot.name}@2x.webp`)
      if (!existsSync(poster)) continue
      const meta = JSON.parse(readFileSync(join(dir, `${shot.name}.json`), 'utf8'))
      const kind = loop ? `loop poster (first frame), ${meta.seconds} s, ${meta.width}x${meta.height}` : shot.name === 'base' ? 'intro backdrop (not a gallery card)' : `still, ${meta.width}x${meta.height}`
      cards.push({ src: rel(poster), title: `${app} / ${shot.name}`, meta: `${kind} · ${(size(poster) / KB).toFixed(1)} kB`, state: meta.state ?? '' })
      if (loop && existsSync(join(dir, `${shot.name}.webm`))) {
        for (const { file, t } of await sampleLoop(app, shot.name, framesDir)) cards.push({ src: rel(file), title: `${app} / ${shot.name}.webm`, meta: `frame at ${t.toFixed(2)} s`, state: '' })
      }
    }
  }
  const esc = (v) => String(v).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])
  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Media contact sheet</title>
<style>
  body { margin: 0; padding: 24px; background: #1e2128; color: #f4f1ea; font: 14px/1.4 system-ui, sans-serif; }
  h1 { font-size: 20px; margin: 0 0 16px; }
  .grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; }
  figure { margin: 0; background: #272b33; border-radius: 10px; overflow: hidden; }
  img { display: block; width: 100%; aspect-ratio: 16 / 10; object-fit: contain; background: #111; }
  figcaption { padding: 8px 10px 10px; }
  .t { font-weight: 600; } .m { color: #a39e93; font-size: 12px; }
</style></head><body>
<h1>Media contact sheet: ${cards.length} images (generated ${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC)</h1>
<div class="grid">
${cards.map((c) => `<figure><img src="${esc(c.src)}" alt=""><figcaption><div class="t">${esc(c.title)}</div><div class="m">${esc(c.meta)}</div>${c.state ? `<div class="m">${esc(c.state)}</div>` : ''}</figcaption></figure>`).join('\n')}
</div></body></html>
`
  const file = join(sheetDir, 'contact-sheet.html')
  writeFileSync(file, html)
  return file
}

// Renders the contact sheet to a PNG (full page) so it can be reviewed as one image
async function renderSheet(file, port) {
  const page = await launch({ port, width: 1600, height: 1000, dpr: 1 })
  try {
    await page.navigate(pathToFileURL(file).href, { waitUntil: 'load', timeout: 60000 })
    await page.waitFor('[...document.images].every((i) => i.complete && i.naturalWidth > 0)', 30000)
    const height = await page.evaluate('Math.ceil(document.documentElement.scrollHeight)')
    await page.setViewport({ width: 1600, height })
    const png = file.replace(/\.html$/, '.png')
    await page.screenshot({ path: png, format: 'png' })
    return png
  } finally {
    await page.close()
  }
}

const { values, positionals } = parseArgs({ allowPositionals: true, options: { only: { type: 'string' }, 'no-sheet': { type: 'boolean' }, sheet: { type: 'string', default: 'audit' }, 'cdp-port': { type: 'string', default: '9366' }, help: { type: 'boolean', short: 'h' } } })
if (values.help) {
  console.log(USAGE)
  process.exit(0)
}
const apps = positionals.length ? positionals : Object.keys(SHOTS)
for (const app of apps) if (!SHOTS[app]) throw new Error(`Unknown app ${app}`)
const only = values.only ? new Set(values.only.split(',')) : null

const rows = []
for (const app of apps) {
  console.log(`${app}:`)
  rows.push(...(await encodeApp(app, only)))
}

console.log(`\n${'encoded this run'.padEnd(44)}${'size'.padStart(10)}${'budget'.padStart(10)}  settings`)
for (const r of rows) console.log(`${`${r.app}/${r.name}`.padEnd(44)}${fmt(r.bytes)}${fmt(r.budget)}  ${r.note}${r.over ? '  OVER BUDGET' : ''}`)
// What a visitor downloads when every card loads: one density of each still and poster, one video format, plus the intro backdrops
const all = Object.keys(SHOTS).flatMap(shipped)
const sum = (pred) => all.filter(pred).reduce((s, r) => s + r.bytes, 0)
const at2x = sum((r) => r.role === 'x2' || r.role === 'intro' || r.role === 'webm')
const at1x = sum((r) => r.role === 'x1' || r.role === 'intro1' || r.role === 'mp4')
const shippedOver = all.filter((r) => r.bytes > r.budget)
console.log(`\nshipped capture media: ${all.length} files${shippedOver.length ? `, over budget: ${shippedOver.map((r) => `${r.app}/${r.name}`).join(', ')}` : ', all within budget'}`)
console.log(`every card watched, 2x screen + WebM: ${fmt(at2x)}  (reported against ${fmt(BUDGET.page)})${at2x > BUDGET.page ? '  OVER' : ''}`)
console.log(`every card watched, 1x screen + MP4: ${fmt(at1x)}`)
const over = rows.filter((r) => r.over)
if (!values['no-sheet']) {
  const sheetDir = resolve(ROOT, values.sheet)
  mkdirSync(sheetDir, { recursive: true })
  const sheet = await contactSheet(Object.keys(SHOTS), sheetDir)
  console.log(`\ncontact sheet: ${relative(ROOT, sheet)}`)
  const png = await renderSheet(sheet, Number(values['cdp-port']))
  console.log(`rendered: ${relative(ROOT, png)}`)
}
if (over.length || shippedOver.length) {
  console.error(`\n${over.length + shippedOver.length} asset(s) over budget`)
  process.exit(1)
}
