// Capture-time privacy (PLAN §7, Appendix B2): the studio's redact.js (read at run time) plus per-app scrubs, asserted clean before every capture
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const SCRUB_SOURCE = resolve(HERE, '..', 'capture', 'page', 'privacy.js')

// The Map My City video studio, whose redaction shim is reused (never copied into this repo)
export const STUDIO = process.env.MMC_VIDEO || 'C:\\dev\\mapMyCity\\video'

// What each app's captures scrub; every sidecar records the list
export const SCRUBS = {
  'map-my-city': [
    'redact.js: owner, mailing and sale rows blurred unless the owner is a public agency',
    'redact.js: In Care of always blurred',
    'redact.js: mailing labels blurred unless the owner is a public agency',
    'Code Enforcement Officer value set to "—" (lookup row and property report)',
    'internal hosts, keys and local origins blurred if printed',
  ],
  'yard-plan': [
    'property card address and APN lines always blurred (the runner fills them with placeholders; the real address is never fetched)',
    'search suggestions blurred and the search box kept empty',
    'owner-supplied private strings (privacy.local.json) never readable',
    'local origin and link host text blurred if printed',
    'internal hosts and keys blurred if printed',
  ],
  'green-check': [
    'neighbouring residence address blurred wherever a result row prints it',
    'day-care and youth-center names blurred in result rows',
    'sensitive-use compile notes hidden',
    'internal hosts, keys and local origins blurred if printed',
  ],
}

// The studio's redaction shim, read fresh for every run so its fixes apply without a copy here
export function redactSource() {
  const file = join(STUDIO, 'lib', 'shim', 'redact.js')
  if (!existsSync(file)) throw new Error(`redact.js not found at ${file} (set MMC_VIDEO to the Map My City video folder)`)
  return readFileSync(file, 'utf8')
}

// The owner's private strings and capture settings (gitignored privacy.local.json at the repo root); empty when the file is absent
export const LOCAL_FILE = resolve(HERE, '..', '..', 'privacy.local.json')
export function localPrivacy() {
  try {
    return JSON.parse(readFileSync(LOCAL_FILE, 'utf8'))
  } catch {
    return {}
  }
}

// Registers the scrubs to run before any page script on every document the page loads; the local private strings ride along, so a readable one fails the frame
export async function installPrivacy(page, app) {
  if (!SCRUBS[app]) throw new Error(`No privacy scrubs defined for ${app}`)
  const strings = (localPrivacy().strings ?? []).filter((s) => typeof s === 'string' && s.length > 3)
  const parts = [`window.__wp6App = ${JSON.stringify(app)};`, `window.__wp6Private = ${JSON.stringify(strings)};`]
  if (app === 'map-my-city') parts.push(redactSource())
  parts.push(readFileSync(SCRUB_SOURCE, 'utf8'))
  await page.send('Page.addScriptToEvaluateOnNewDocument', { source: parts.join('\n;\n') })
}

// Throws when anything private is readable on screen; the messages name the kind of leak, never its text
export async function assertNoLeaks(page, label) {
  const leaks = await page.evaluate('window.__privacy ? window.__privacy.leaks() : ["privacy scrubs not installed"]')
  if (leaks.length) throw new Error(`${label}: privacy leak (${[...new Set(leaks)].join('; ')})`)
  return []
}

// Keeps what the scrubs blurred or replaced in an untracked file, so privacy-sweep.mjs can search shipped bytes for it
export async function recordForbidden(page, file) {
  const found = await page.evaluate('window.__privacy ? window.__privacy.seen() : []')
  if (!found.length) return 0
  let known = []
  try {
    known = JSON.parse(readFileSync(file, 'utf8')).strings ?? []
  } catch {
    // First run
  }
  const strings = [...new Set([...known, ...found])]
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, JSON.stringify({ note: 'Local only (gitignored): strings the capture scrubs hid; read by scripts/privacy-sweep.mjs', strings }, null, 2))
  return strings.length
}
