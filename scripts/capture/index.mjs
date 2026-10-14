// Capture runner (PLAN §7): node scripts/capture/index.mjs <map-my-city|yard-plan|green-check|all> [--shots hero,f1] → .cache/capture/<app>/
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { parseArgs } from 'node:util'

const HERE = dirname(fileURLToPath(import.meta.url))
const MANIFEST = JSON.parse(readFileSync(join(HERE, 'shots.json'), 'utf8'))

const USAGE = `Usage: node scripts/capture/index.mjs <app|all> [--shots <list>] [--dpr 1]

  app        ${Object.keys(MANIFEST).join(' | ')} | all
  --shots    comma list of shot names (default: every shot in shots.json)
  --dpr      device pixel ratio for a quick draft run (default: the manifest's, 2; ship only 2x captures)

Raw stills (PNG + sidecar JSON) and loop frames land in .cache/capture/<app>/ (gitignored).
Then run node scripts/encode-media.mjs to build src/assets/<app>/.
App folders can be overridden with MMC_ROOT, YP_ROOT and GC_ROOT; the studio with MMC_VIDEO.`

const { values, positionals } = parseArgs({ allowPositionals: true, options: { shots: { type: 'string' }, dpr: { type: 'string' }, help: { type: 'boolean', short: 'h' } } })
if (values.help || positionals.length !== 1 || !(positionals[0] === 'all' || MANIFEST[positionals[0]])) {
  console.log(USAGE)
  process.exit(values.help ? 0 : 2)
}

const apps = positionals[0] === 'all' ? Object.keys(MANIFEST) : [positionals[0]]
const wanted = values.shots ? new Set(values.shots.split(',').map((s) => s.trim()).filter(Boolean)) : null
let failed = false

for (const app of apps) {
  const config = { ...MANIFEST[app] }
  config.root = process.env[config.rootEnv] || config.root
  if (values.dpr) config.dpr = Number(values.dpr)
  const shots = config.shots.filter((s) => !wanted || wanted.has(s.name))
  if (!shots.length) continue
  console.log(`\n${config.label}: ${shots.map((s) => s.name).join(', ')}`)
  const started = Date.now()
  const driver = await import(pathToFileURL(join(HERE, `${app}.mjs`)).href)
  // Live City services and imagery occasionally stall: one retry of the whole app before giving up
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      await driver.capture({ app, config, shots })
      console.log(`${app}: done in ${Math.round((Date.now() - started) / 1000)} s`)
      break
    } catch (err) {
      console.error(`${app}: attempt ${attempt} failed: ${err.stack || err.message}`)
      if (attempt === 2) failed = true
    }
  }
}
process.exit(failed ? 1 : 0)
