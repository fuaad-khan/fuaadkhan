// Privacy sweep (PLAN §3, §13.5), draft: greps shipped bytes for internal hosts, keys, local origins, phone numbers and known private strings; checks capture sidecars
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, extname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

const USAGE = `Usage: node scripts/privacy-sweep.mjs [--assets | --dist [dir]]

  --assets      src/assets/** and src/content/media.js (the media pipeline's output, before a build)
  --dist [dir]  a production build (default dist/), every file
Exit 0 when clean, 1 on any finding, 2 on usage errors.

Forbidden in any text or binary string: internal GIS hosts, API keys, local origins, phone numbers, the residential
strings from the research, and every string in the untracked lists .cache/privacy.local.json (written by the capture
scrubs: the neighbouring residence, the officer name) and privacy.local.json (owner-supplied). 438 S State St, the
intended commercial subject, is allowed. Capture sidecars must carry leaks: [] and a scrub list.`

// Known patterns: [label, regex]; the residential strings come from the research for PLAN §13.5
const PATTERNS = [
  ['internal GIS host', /gis01|sanjacintoca\.gov\/server/i],
  ['API key parameter', /[?&](?:api_?key|key|token|access_token)=[A-Za-z0-9_-]{8,}/i],
  ['API key name', /\bapi[_-]?key\b/i],
  ['MapTiler key URL', /api\.maptiler\.com\/[^\s"']*key=/i],
  ['local origin', /127\.0\.0\.1|localhost(?::\d+)?/i],
  ['phone number', /(?<![\d.])\(?\d{3}\)?[-. ]\d{3}[-. ]\d{4}(?![\d.])/],
  ['research residence', /802 E Main|Camino Los Banos|Peregrine|Kirby/i],
]
// Extensionless files (Cloudflare Pages' _headers and _redirects) are plain text too
const TEXT = new Set(['', '.js', '.mjs', '.json', '.css', '.html', '.svg', '.txt', '.md', '.map', '.xml', '.webmanifest'])
const BINARY = new Set(['.webp', '.png', '.jpg', '.jpeg', '.gif', '.avif', '.mp4', '.webm', '.woff2', '.woff', '.ico', '.pdf'])

// Untracked lists of exact strings that must never ship
function localStrings() {
  const out = []
  for (const file of [join(ROOT, '.cache', 'privacy.local.json'), join(ROOT, 'privacy.local.json')]) {
    if (!existsSync(file)) continue
    try {
      for (const s of JSON.parse(readFileSync(file, 'utf8')).strings ?? []) if (typeof s === 'string' && s.trim().length > 3) out.push(s.trim())
    } catch {
      throw new Error(`${relative(ROOT, file)} is not valid JSON ({ "strings": [...] })`)
    }
  }
  return [...new Set(out)]
}

function walk(dir, files = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) walk(full, files)
    else files.push(full)
  }
  return files
}

// Printable ASCII runs of 6+ characters (metadata, comments, encoder tags) from a binary file
function strings(buf) {
  return buf.toString('latin1').match(/[\x20-\x7e]{6,}/g) ?? []
}

// Case-insensitive search that tolerates the allowed subject address
function findings(text, locals) {
  const hits = []
  const clean = text.replace(/438 S\.? State St(?:reet)?/gi, '')
  for (const [label, re] of PATTERNS) if (re.test(clean)) hits.push(label)
  const lower = clean.toLowerCase()
  for (const s of locals) if (lower.includes(s.toLowerCase())) hits.push('scrubbed private string (local list)')
  return hits
}

const { values } = parseArgs({ options: { assets: { type: 'boolean' }, dist: { type: 'string' }, help: { type: 'boolean', short: 'h' } }, allowPositionals: false, strict: false })
if (values.help || (values.assets && values.dist !== undefined)) {
  console.log(USAGE)
  process.exit(values.help ? 0 : 2)
}

const targets = []
if (values.assets) {
  targets.push(...walk(join(ROOT, 'src', 'assets')))
  targets.push(join(ROOT, 'src', 'content', 'media.js'))
} else {
  const dir = resolve(ROOT, typeof values.dist === 'string' && values.dist ? values.dist : 'dist')
  if (!existsSync(dir)) {
    console.error(`No build at ${relative(ROOT, dir)}; run npm run build first`)
    process.exit(2)
  }
  targets.push(...walk(dir))
}

const locals = localStrings()
const problems = []
let scanned = 0
let sidecars = 0
for (const file of targets) {
  const ext = extname(file).toLowerCase()
  const rel = relative(ROOT, file).replaceAll('\\', '/')
  const buf = readFileSync(file)
  scanned++
  if (TEXT.has(ext)) {
    for (const hit of findings(buf.toString('utf8'), locals)) problems.push(`${rel}: ${hit}`)
  } else if (BINARY.has(ext)) {
    for (const hit of findings(strings(buf).join('\n'), locals)) problems.push(`${rel}: ${hit} (binary string)`)
    if (values.assets && ['.png', '.jpg', '.jpeg'].includes(ext)) problems.push(`${rel}: raw ${ext} in src/assets (ship WebP)`)
  } else if (statSync(file).size > 0) {
    problems.push(`${rel}: unexpected file type`)
  }
  // Capture sidecars: every still and loop must have been asserted leak-free with its scrubs recorded
  if (ext === '.json' && rel.includes('assets/')) {
    let data = null
    try {
      data = JSON.parse(buf.toString('utf8'))
    } catch {
      problems.push(`${rel}: invalid JSON`)
    }
    if (data && (data.kind === 'still' || data.kind === 'loop')) {
      sidecars++
      if (!Array.isArray(data.leaks) || data.leaks.length) problems.push(`${rel}: leaks is not []`)
      if (!Array.isArray(data.scrubs) || !data.scrubs.length) problems.push(`${rel}: no scrubs recorded`)
    }
  }
}

console.log(`privacy sweep (${values.assets ? 'assets' : 'dist'}): ${scanned} files, ${sidecars} capture sidecars, ${locals.length} local private strings checked`)
if (!locals.length) console.log('WARN  no local private-string list (.cache/privacy.local.json or privacy.local.json): run the captures, or add the officer name to privacy.local.json')
if (problems.length) {
  for (const p of problems) console.log(`FAIL  ${p}`)
  process.exit(1)
}
console.log('PASS  no forbidden strings')
