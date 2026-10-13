// Renders the social card (scripts/og/card.html → public/og.jpg, 1200x630) and the touch icon (public/favicon.svg → public/apple-touch-icon.png, 180x180)
import { readFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { parseArgs } from 'node:util'
import { launch } from './lib/cdp.mjs'
import { apps } from '../src/content/apps.js'
import { site } from '../src/content/site.js'
import { timeline } from '../src/content/timeline.js'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const CARD = { width: 1200, height: 630, quality: 88, page: join(ROOT, 'scripts/og/card.html'), out: join(ROOT, 'public/og.jpg') }
const ICON = { size: 180, svg: join(ROOT, 'public/favicon.svg'), out: join(ROOT, 'public/apple-touch-icon.png') }

const USAGE = `Usage: node scripts/og-card.mjs [--cdp-port <n>]

Writes public/og.jpg and public/apple-touch-icon.png. Run it again after changing the name, identity,
career stops, app names or palette; the card reads them from src/content and src/styles/global.css.`

// The card takes the site's :root tokens, so a palette change carries over on the next run
function siteTokens() {
  const css = readFileSync(join(ROOT, 'src/styles/global.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
  const root = /:root\s*{([^}]*)}/.exec(css)?.[1]
  if (!root) throw new Error('src/styles/global.css has no :root block')
  return Object.fromEntries([...root.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)].map(([, name, value]) => [name, value.trim()]))
}

function cardData() {
  return {
    tokens: siteTokens(),
    eyebrow: site.eyebrow,
    name: site.name,
    identity: site.identity,
    ocean: site.journey.ocean,
    // Every stop is in California, so the map labels drop the state ("Anaheim, CA" → "Anaheim")
    stops: timeline.map((stop) => ({ label: stop.location.replace(/,\s*[A-Z]{2}$/, ''), coords: stop.coords, placement: stop.labelPlacement })),
    apps: apps.map(({ name, accent }) => ({ name, accent })),
    topo: pathToFileURL(join(ROOT, 'src/assets/topo-redlands.svg')).href,
  }
}

// The favicon's own rect colour fills the corners its rounding leaves transparent, which iOS would draw black; CDP takes it as rgba
function backdrop(svg) {
  const hex = /<rect\b[^>]*\bfill="#([0-9a-f]{6})"/i.exec(svg)?.[1]
  if (!hex) throw new Error('public/favicon.svg has no <rect fill="#rrggbb"> backdrop to fill the icon corners with')
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16))
  return { r, g, b, a: 1 }
}

// Pixel size read from the file itself (PNG IHDR or JPEG SOF), so the report shows what was written
function imageSize(buffer) {
  if (buffer.readUInt32BE(0) === 0x89504e47) return [buffer.readUInt32BE(16), buffer.readUInt32BE(20)]
  for (let i = 2; i < buffer.length - 9; ) {
    const marker = buffer[i + 1]
    if (marker >= 0xc0 && marker <= 0xc2) return [buffer.readUInt16BE(i + 7), buffer.readUInt16BE(i + 5)]
    i += 2 + buffer.readUInt16BE(i + 2)
  }
  return [0, 0]
}

async function main() {
  const { values } = parseArgs({ options: { 'cdp-port': { type: 'string', default: '9360' }, help: { type: 'boolean', short: 'h' } } })
  if (values.help) return console.log(USAGE)
  const port = Number(values['cdp-port'])
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error(`--cdp-port must be a port number (got ${values['cdp-port']})`)

  const page = await launch({ port, width: CARD.width, height: CARD.height })
  try {
    await page.navigate(pathToFileURL(CARD.page).href)
    const faces = await page.evaluate((data) => globalThis.renderCard(data), cardData())
    if (faces.some((count) => count < 1)) throw new Error(`Inter did not load in the card (faces per weight: ${faces.join(', ')})`)
    const errors = page.consoleMessages().filter((m) => m.level === 'error')
    if (errors.length) throw new Error(`the card page logged errors:\n${errors.map((m) => m.text).join('\n')}`)
    const card = await page.screenshot({ path: CARD.out, format: 'jpeg', quality: CARD.quality })

    const svg = readFileSync(ICON.svg, 'utf8')
    await page.setViewport({ width: ICON.size, height: ICON.size, dpr: 1 })
    await page.send('Emulation.setDefaultBackgroundColorOverride', { color: backdrop(svg) })
    await page.navigate(pathToFileURL(ICON.svg).href)
    const icon = await page.screenshot({ path: ICON.out, format: 'png' })

    for (const [file, buffer] of [[CARD.out, card], [ICON.out, icon]]) {
      const [w, h] = imageSize(buffer)
      console.log(`og-card: ${relative(ROOT, file)} ${w}x${h}, ${(buffer.length / 1024).toFixed(1)} KB`)
    }
  } finally {
    await page.close()
  }
}

main().catch((err) => {
  console.error(`og-card: ${err.message}`)
  process.exit(1)
})
