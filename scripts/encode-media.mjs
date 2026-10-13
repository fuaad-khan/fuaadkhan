// Media encoder (PLAN §7): .cache/capture/<app>/ → src/assets/<app>/ — WebP stills at 1600 and 800 px, WebM + MP4 loops with WebP posters, sidecars, budgets and a size table
import { existsSync, linkSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { parseArgs } from 'node:util'
import { launch } from './lib/cdp.mjs'
import { mp4, twoPass, webm, webp } from './lib/ffmpeg.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const RAW = join(ROOT, '.cache', 'capture')
const ASSETS = join(ROOT, 'src', 'assets')
const SHOTS = JSON.parse(readFileSync(join(ROOT, 'scripts', 'capture', 'shots.json'), 'utf8'))
// Decimal kB, the unit Vite prints and the stricter reading of the PLAN §7 budgets
const KB = 1000
const BUDGET = { x2: 150 * KB, x1: 50 * KB, webm: 600 * KB, mp4: 900 * KB, page: 4000 * KB }
const LOOP_WIDTH = 1280
// Sidecar fields that never ship (local bookkeeping)
const DROP = new Set(['captureViewport'])

const USAGE = `Usage: node scripts/encode-media.mjs [app ...] [--only name,name] [--no-sheet] [--cdp-port 9366]

Encodes the raw captures in .cache/capture/<app>/ (from scripts/capture/index.mjs) into src/assets/<app>/:
  stills  <name>@2x.webp (1600 px) + <name>.webp (800 px), quality lowered from 82 until within ${BUDGET.x2 / KB} / ${BUDGET.x1 / KB} kB
  loops   <name>.webm (VP9) + <name>.mp4 (H.264) at ${LOOP_WIDTH} px / 30 fps, starting on the poster frame, CRF raised until within ${BUDGET.webm / KB} / ${BUDGET.mp4 / KB} kB,
          plus <name>-poster@2x.webp + <name>-poster.webp from the lossless poster frame
  sidecars <name>.json next to each asset (camera, scrubs, leaks: [], intro harvest on hero)
Then prints a size table and writes audit/media-contact-sheet.html (+ .png rendered over CDP).`

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

// Every still and poster at a glance (plus capture-only alternates), for the owner and for a by-eye privacy pass
function contactSheet(apps) {
  const cards = []
  for (const app of apps) {
    const dir = join(ASSETS, app)
    if (!existsSync(dir)) continue
    for (const file of readdirSync(dir).filter((f) => f.endsWith('@2x.webp')).sort()) {
      const meta = JSON.parse(readFileSync(join(dir, `${file.replace(/(-poster)?@2x\.webp$/, '')}.json`), 'utf8'))
      cards.push({ app, src: relative(join(ROOT, 'audit'), join(dir, file)).replaceAll('\\', '/'), title: `${app} / ${file}`, bytes: size(join(dir, file)), state: meta.state ?? '', kind: file.includes('-poster') ? 'loop poster' : meta.name === 'base' ? 'intro backdrop (not shown by the Showcase)' : 'still' })
    }
    const rawDir = join(RAW, app)
    for (const file of existsSync(rawDir) ? readdirSync(rawDir).filter((f) => f.endsWith('.json')) : []) {
      const meta = JSON.parse(readFileSync(join(rawDir, file), 'utf8'))
      if (!meta.alternate) continue
      cards.push({ app, src: relative(join(ROOT, 'audit'), join(rawDir, file.replace(/\.json$/, '.png'))).replaceAll('\\', '/'), title: `${app} / ${meta.name} (raw alternate, not shipped)`, bytes: size(join(rawDir, file.replace(/\.json$/, '.png'))), state: meta.state ?? '', kind: 'alternate' })
    }
  }
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])
  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Media contact sheet</title>
<style>
  body { margin: 0; padding: 24px; background: #1e2128; color: #f4f1ea; font: 14px/1.4 system-ui, sans-serif; }
  h1 { font-size: 20px; margin: 0 0 16px; }
  .grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px; }
  figure { margin: 0; background: #272b33; border-radius: 10px; overflow: hidden; }
  img { display: block; width: 100%; aspect-ratio: 16 / 10; object-fit: cover; background: #111; }
  figcaption { padding: 8px 10px 10px; }
  .t { font-weight: 600; } .m { color: #a39e93; font-size: 12px; }
</style></head><body>
<h1>Media contact sheet: ${cards.length} images (generated ${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC)</h1>
<div class="grid">
${cards.map((c) => `<figure><img src="${esc(c.src)}" alt=""><figcaption><div class="t">${esc(c.title)}</div><div class="m">${esc(c.kind)} · ${(c.bytes / KB).toFixed(1)} kB</div><div class="m">${esc(c.state)}</div></figcaption></figure>`).join('\n')}
</div></body></html>
`
  const file = join(ROOT, 'audit', 'media-contact-sheet.html')
  mkdirSync(dirname(file), { recursive: true })
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

const { values, positionals } = parseArgs({ allowPositionals: true, options: { only: { type: 'string' }, 'no-sheet': { type: 'boolean' }, 'cdp-port': { type: 'string', default: '9366' }, help: { type: 'boolean', short: 'h' } } })
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

console.log(`\n${'asset'.padEnd(44)}${'size'.padStart(10)}${'budget'.padStart(10)}  settings`)
for (const r of rows) console.log(`${`${r.app}/${r.name}`.padEnd(44)}${fmt(r.bytes)}${fmt(r.budget)}  ${r.note}${r.over ? '  OVER BUDGET' : ''}`)
// What a visitor downloads when every below-fold asset loads: one density of each still and poster, one video format, plus the intro backdrops
const sum = (pred) => rows.filter(pred).reduce((s, r) => s + r.bytes, 0)
const at2x = sum((r) => r.role === 'x2' || r.role === 'intro' || r.role === 'webm')
const at1x = sum((r) => r.role === 'x1' || r.role === 'intro1' || r.role === 'mp4')
console.log(`\npage media, 2x screen + WebM: ${fmt(at2x)}  (budget ${fmt(BUDGET.page)})${at2x > BUDGET.page ? '  OVER BUDGET' : ''}`)
console.log(`page media, 1x screen + MP4: ${fmt(at1x)}`)
const over = rows.filter((r) => r.over)
if (!values['no-sheet']) {
  const sheet = contactSheet(Object.keys(SHOTS))
  console.log(`\ncontact sheet: ${relative(ROOT, sheet)}`)
  const png = await renderSheet(sheet, Number(values['cdp-port']))
  console.log(`rendered: ${relative(ROOT, png)}`)
}
if (over.length || at2x > BUDGET.page) {
  console.error(`\n${over.length} asset(s) over budget${at2x > BUDGET.page ? ', page media over budget' : ''}`)
  process.exit(1)
}
