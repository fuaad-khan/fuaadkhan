// Firefox screenshot over WebDriver BiDi (Firefox has no CDP): waits for a page condition, optionally runs a step, then captures
import { spawn, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { parseArgs } from 'node:util'

const FIREFOX_PATHS = [
  'C:\\Program Files\\Mozilla Firefox\\firefox.exe',
  'C:\\Program Files (x86)\\Mozilla Firefox\\firefox.exe',
  '/Applications/Firefox.app/Contents/MacOS/firefox',
  '/usr/bin/firefox',
]

const USAGE = `Usage: node scripts/firefox-shot.mjs --url <url> --out <file.png> [options]

  --width <px> --height <px>  viewport (default 1440x900)
  --wait <js>                 poll this expression until truthy before capturing
  --eval <js>                 then evaluate this (promises are awaited), e.g. "introHarness.setT(0.3)"
  --port <n>                  WebDriver BiDi port (default 0: Firefox picks a free one)
  --timeout <ms>              deadline for launch and for --wait (default 30000)

Firefox comes from env FIREFOX, else the standard install paths. Example:
  node scripts/firefox-shot.mjs --url "http://localhost:5185/dev/intro-harness.html?app=green-check&ui=0" \\
    --wait "document.documentElement.dataset.intro === 'mounted'" --eval "introHarness.setT(0.3)" --out audit/wp5/firefox-0.3.png`

const sleep = (ms) => new Promise((done) => setTimeout(done, ms))

function options() {
  const { values } = parseArgs({
    options: {
      url: { type: 'string' },
      out: { type: 'string' },
      width: { type: 'string', default: '1440' },
      height: { type: 'string', default: '900' },
      wait: { type: 'string' },
      eval: { type: 'string' },
      port: { type: 'string', default: '0' },
      timeout: { type: 'string', default: '30000' },
      help: { type: 'boolean', short: 'h', default: false },
    },
  })
  if (values.help || !values.url || !values.out) {
    console.log(USAGE)
    process.exit(values.help ? 0 : 2)
  }
  return { ...values, width: Number(values.width), height: Number(values.height), port: Number(values.port), timeout: Number(values.timeout) }
}

function firefoxPath() {
  const explicit = process.env.FIREFOX?.trim().replace(/^(["'])(.*)\1$/, '$2')
  if (explicit) return explicit
  const found = FIREFOX_PATHS.find((path) => existsSync(path))
  if (!found) throw new Error('Firefox not found; set env FIREFOX to its executable')
  return found
}

// Starts headless Firefox on a throwaway profile and resolves with the BiDi endpoint it prints
async function launchFirefox(port, timeout) {
  const profile = mkdtempSync(join(tmpdir(), 'firefox-shot-'))
  const child = spawn(firefoxPath(), ['-headless', '-no-remote', '-profile', profile, `--remote-debugging-port=${port}`, 'about:blank'], {
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  })
  const stop = () => {
    if (child.exitCode === null && child.signalCode === null) {
      if (process.platform === 'win32') spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true })
      else child.kill('SIGKILL')
    }
    rmSync(profile, { recursive: true, force: true, maxRetries: 8, retryDelay: 150 })
  }
  process.on('exit', stop)
  const endpoint = await new Promise((done, fail) => {
    let log = ''
    const timer = setTimeout(() => fail(new Error(`Firefox printed no WebDriver BiDi endpoint within ${timeout} ms\n${log.trim()}`)), timeout)
    const read = (chunk) => {
      log = (log + chunk).slice(-4000)
      const match = /WebDriver BiDi listening on (ws:\/\/\S+)/.exec(log)
      if (match) {
        clearTimeout(timer)
        done(match[1])
      }
    }
    child.stdout.setEncoding('utf8').on('data', read)
    child.stderr.setEncoding('utf8').on('data', read)
    child.once('exit', (code) => fail(new Error(`Firefox exited (${code}) before the BiDi endpoint opened\n${log.trim()}`)))
  })
  return { endpoint, stop }
}

// One BiDi session over Node's global WebSocket: send() resolves with each command's result
async function connect(endpoint) {
  const ws = new WebSocket(`${endpoint}/session`)
  await new Promise((done, fail) => {
    ws.onopen = done
    ws.onerror = () => fail(new Error(`cannot open ${endpoint}/session`))
  })
  let nextId = 1
  const pending = new Map()
  const errors = []
  ws.onmessage = (event) => {
    const message = JSON.parse(event.data)
    if (message.type === 'event' && message.method === 'log.entryAdded' && message.params.level === 'error') errors.push(message.params.text)
    const waiter = pending.get(message.id)
    if (!waiter) return
    pending.delete(message.id)
    if (message.type === 'error') waiter.fail(new Error(`${message.error}: ${message.message}`))
    else waiter.done(message.result)
  }
  const send = (method, params = {}) =>
    new Promise((done, fail) => {
      const id = nextId++
      pending.set(id, { done, fail })
      ws.send(JSON.stringify({ id, method, params }))
    })
  return { send, errors, close: () => ws.close() }
}

async function main() {
  const opts = options()
  const { endpoint, stop } = await launchFirefox(opts.port, opts.timeout)
  const bidi = await connect(endpoint)
  try {
    await bidi.send('session.new', { capabilities: {} })
    await bidi.send('session.subscribe', { events: ['log.entryAdded'] })
    const { contexts } = await bidi.send('browsingContext.getTree', {})
    const context = contexts[0].context
    await bidi.send('browsingContext.setViewport', { context, viewport: { width: opts.width, height: opts.height } })
    await bidi.send('browsingContext.navigate', { context, url: opts.url, wait: 'complete' })
    const evaluate = async (expression) => {
      const reply = await bidi.send('script.evaluate', { expression, target: { context }, awaitPromise: true })
      if (reply.type === 'exception') throw new Error(`page exception: ${reply.exceptionDetails?.text ?? expression}`)
      return reply.result
    }
    if (opts.wait) {
      const deadline = Date.now() + opts.timeout
      while (!(await evaluate(`Boolean(${opts.wait})`)).value) {
        if (Date.now() > deadline) throw new Error(`--wait still false after ${opts.timeout} ms: ${opts.wait}`)
        await sleep(100)
      }
    }
    if (opts.eval) await evaluate(opts.eval)
    // Two frames so the last change is painted before the capture
    await evaluate('new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)))')
    const shot = await bidi.send('browsingContext.captureScreenshot', { context })
    const out = resolve(opts.out)
    mkdirSync(dirname(out), { recursive: true })
    writeFileSync(out, Buffer.from(shot.data, 'base64'))
    console.log(`saved ${out}`)
    if (bidi.errors.length) console.log(`page errors (${bidi.errors.length}):\n${bidi.errors.map((text) => `  ${text}`).join('\n')}`)
    await bidi.send('session.end', {}).catch(() => {})
  } finally {
    bidi.close()
    stop()
  }
}

main().catch((err) => {
  console.error(`firefox-shot failed: ${err.message}`)
  process.exit(1)
})
