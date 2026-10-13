// Build step 3 of npm run build: injects the prerendered page into dist/index.html, guards it against the built CSS and head, then deletes the SSR bundle
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { parseArgs } from 'node:util'
import { gzipSync } from 'node:zlib'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const MOUNT = '<div id="root"></div>'
const SITE = 'https://fuaadkhan.com/'

// React's production server build, the same flavour as the client bundle that hydrates this markup; set before the bundle loads
process.env.NODE_ENV = 'production'

class GuardError extends Error {}

const fail = (message) => {
  throw new GuardError(message)
}

const kb = (bytes) => `${(bytes / 1024).toFixed(1)} KB`

const attributes = (tag) => Object.fromEntries([...tag.matchAll(/([\w:-]+)="([^"]*)"/g)].map(([, name, value]) => [name, value]))

// React prepends a preload for each of the first ten non-lazy images; the image already sits in the markup, so the hint only competes with the fonts
function dropImageHints(markup) {
  const hints = []
  let body = markup
  for (let match; (match = /^<link\b[^>]*>/.exec(body)); body = body.slice(match[0].length)) {
    const hint = attributes(match[0])
    if (hint.rel !== 'preload' || hint.as !== 'image') fail(`unexpected element before the page markup: ${match[0]} (head resources belong in index.html)`)
    hints.push(hint.href ?? hint.imagesrcset?.trim().split(/[\s,]+/)[0] ?? '')
  }
  for (const url of hints) if (!url || !body.includes(url)) fail(`image preload for an image that is not in the markup: ${url}`)
  return { body, hints }
}

// The markup must be the app's DOM alone: an element first (hydration keys off firstElementChild), a page outline, and no inline scripts (CSP script-src 'self')
function checkMarkup(body) {
  if (!body.startsWith('<')) fail(`the markup must start with an element, not ${JSON.stringify(body.slice(0, 40))}`)
  if (/<script\b/i.test(body)) fail('the markup contains a <script>; the CSP blocks inline scripts')
  for (const tag of ['<main', '<h1', '<footer']) if (!body.includes(tag)) fail(`the markup has no ${tag}>`)
}

// Every class in the markup must exist in a stylesheet index.html links: a miss means the two builds hashed a CSS module differently, or a className is undefined
function checkClasses(body, html, dist) {
  const sheets = [...html.matchAll(/<link\b[^>]*>/g)].map(([tag]) => attributes(tag)).filter((link) => link.rel === 'stylesheet').map((link) => link.href)
  if (!sheets.length) fail('index.html links no stylesheet')
  const defined = new Set()
  for (const href of sheets) {
    const file = join(dist, new URL(href, SITE).pathname)
    if (!existsSync(file)) fail(`stylesheet ${href} is missing from ${relative(ROOT, dist)}`)
    const css = readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
    for (const [, name] of css.matchAll(/\.(-?[_a-zA-Z][\w-]*)/g)) defined.add(name)
  }
  const used = new Set([...body.matchAll(/\sclass="([^"]*)"/g)].flatMap(([, list]) => list.split(/\s+/)).filter(Boolean))
  const missing = [...used].filter((name) => !defined.has(name))
  if (missing.length) fail(`${missing.length} class name(s) in the markup are missing from the CSS: ${missing.slice(0, 20).join(' ')}`)
  return { classes: used.size, sheets: sheets.length }
}

// The social card and icons the head points at must ship, and the JSON-LD stays valid and free of contact details (owner decision)
function checkHead(html, dist) {
  const head = html.slice(0, html.indexOf('</head>'))
  const urls = [...head.matchAll(/<(?:meta|link)\b[^>]*>/g)]
    .map(([tag]) => attributes(tag))
    .map((a) => (['og:image', 'twitter:image'].includes(a.property ?? a.name) ? a.content : ['icon', 'apple-touch-icon'].includes(a.rel) ? a.href : null))
    .filter(Boolean)
  for (const name of ['og:image', 'twitter:image', 'apple-touch-icon']) if (!head.includes(`"${name}"`)) fail(`index.html has no ${name}`)
  for (const url of urls) {
    const resolved = new URL(url, SITE)
    if (resolved.origin !== new URL(SITE).origin) fail(`${url} is not on ${SITE}`)
    if (!existsSync(join(dist, resolved.pathname))) fail(`${url} has no file at ${relative(ROOT, join(dist, resolved.pathname))}`)
  }
  const ld = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(head)?.[1]
  if (!ld) fail('index.html has no JSON-LD')
  let person
  try {
    person = JSON.parse(ld)
  } catch (err) {
    fail(`the JSON-LD is not valid JSON: ${err.message}`)
  }
  const contact = /"(email|telephone)"|mailto:|tel:|[\w.+-]+@[\w-]+\.[a-z]|\(?\b\d{3}\)?[-.\s]\d{3}[-.\s]\d{4}\b/i
  if (contact.test(JSON.stringify(person))) fail('the JSON-LD must not carry an email address or phone number')
  return urls.length
}

async function main() {
  const { values } = parseArgs({ options: { dist: { type: 'string', default: 'dist' } } })
  const dist = resolve(ROOT, values.dist)
  const ssrDir = join(dist, '.ssr')
  const entry = join(ssrDir, 'entry-prerender.js')
  const indexFile = join(dist, 'index.html')
  try {
    if (!existsSync(indexFile)) fail(`${relative(ROOT, indexFile)} is missing; run vite build first`)
    if (!existsSync(entry)) fail(`${relative(ROOT, entry)} is missing; run vite build --ssr src/entry-prerender.jsx --outDir ${relative(ROOT, ssrDir)} first`)
    const html = readFileSync(indexFile, 'utf8')
    const mounts = html.split(MOUNT).length - 1
    if (mounts !== 1) fail(`index.html must contain ${MOUNT} exactly once (found ${mounts}; already prerendered?)`)

    const { render } = await import(pathToFileURL(entry).href)
    const { body, hints } = dropImageHints(await render())
    checkMarkup(body)
    const { classes, sheets } = checkClasses(body, html, dist)
    const assets = checkHead(html, dist)

    // A function replacement, so "$&"-like sequences in the copy are never read as patterns
    writeFileSync(indexFile, html.replace(MOUNT, () => `<div id="root">${body}</div>`))
    const headings = (body.match(/<h[1-6]\b/g) ?? []).length
    console.log(
      `prerender: ${kb(body.length)} (${kb(gzipSync(body).length)} gzip) into ${relative(ROOT, indexFile)} · ${headings} headings · ` +
        `${classes} class names found in ${sheets} stylesheet(s) · ${assets} head assets present · JSON-LD has no contact details` +
        (hints.length ? ` · dropped ${hints.length} image preload hint(s): ${hints.join(', ')}` : ''),
    )
  } finally {
    // The SSR bundle is a build intermediate and must never deploy
    rmSync(ssrDir, { recursive: true, force: true })
  }
}

main().catch((err) => {
  console.error(err instanceof GuardError ? `prerender: ${err.message}` : err)
  process.exit(1)
})
