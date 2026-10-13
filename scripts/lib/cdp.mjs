// Zero-dependency Chrome DevTools Protocol driver for Node 22 (global WebSocket + fetch); ESM port of GreenCheck's tests/cdp.js
import { spawn, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { constants as osConstants, tmpdir } from 'node:os'
import { dirname, extname, join } from 'node:path'

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const IS_WINDOWS = process.platform === 'win32'

// Tried after the chrome option and env BROWSER: installed Chrome first, then Edge
const BROWSER_PATHS = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  process.env.LOCALAPPDATA && `${process.env.LOCALAPPDATA}\\Google\\Chrome\\Application\\chrome.exe`,
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  '/usr/bin/microsoft-edge',
].filter(Boolean)

const FORMAT_BY_EXT = { '.png': 'png', '.jpg': 'jpeg', '.jpeg': 'jpeg', '.webp': 'webp' }
const CONSOLE_LEVELS = { error: 'error', assert: 'error', warning: 'warning', debug: 'debug', trace: 'debug' }

// Strips the quotes people paste around Windows paths that contain spaces
const unquote = (value) => value.trim().replace(/^(["'])(.*)\1$/, '$2')

// Resolves the browser executable: the chrome option, env BROWSER, installed Chrome, then Edge
export function resolveBrowser(explicit) {
  const requested = [[explicit, 'the chrome option'], [process.env.BROWSER, 'env BROWSER']]
  for (const [raw, origin] of requested) {
    // BROWSER=none is the common "never open a browser" convention, not a path
    if (!raw || /^(none|false|0)$/i.test(raw.trim())) continue
    const path = unquote(raw)
    // Firefox dropped its CDP endpoint, so fail fast instead of waiting out the launch timeout
    if (/firefox/i.test(path)) throw new Error(`${path} (from ${origin}) does not speak the Chrome DevTools Protocol; use Chrome or Edge`)
    if (existsSync(path)) return path
    // A bare command name is left to the PATH lookup
    if (!/[\\/]/.test(path)) return path
    throw new Error(`Browser from ${origin} not found: ${path}`)
  }
  const found = BROWSER_PATHS.find((path) => existsSync(path))
  if (!found) throw new Error('No Chrome or Edge found; set env BROWSER to a Chromium-based browser executable')
  return found
}

// Browsers still running; killed synchronously if this process exits or is interrupted
const live = new Set()
let hooksInstalled = false

// Kills a browser and its helper processes immediately; safe inside an exit handler
function killNow(child) {
  if (child.exitCode !== null || child.signalCode !== null) return
  if (IS_WINDOWS) spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true })
  else child.kill('SIGKILL')
}

// Windows can hold profile files for a moment after Chrome exits, so retry before giving up
function removeDir(dir) {
  try {
    rmSync(dir, { recursive: true, force: true, maxRetries: 8, retryDelay: 150 })
  } catch {
    // A locked leftover in the temp folder is harmless
  }
}

function cleanupAll() {
  for (const entry of live) {
    killNow(entry.child)
    if (entry.ownsProfile) removeDir(entry.profile)
  }
  live.clear()
}

function installExitHooks() {
  if (hooksInstalled) return
  hooksInstalled = true
  process.on('exit', cleanupAll)
  for (const signal of ['SIGINT', 'SIGTERM', 'SIGBREAK', 'SIGHUP']) {
    process.on(signal, () => {
      cleanupAll()
      // Exit like Node's default handler unless the host script also handles this signal
      if (process.listenerCount(signal) === 1) process.exit(128 + (osConstants.signals[signal] ?? 1))
    })
  }
}

function withTimeout(promise, ms, label) {
  let timer
  const expiry = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`Timed out after ${ms} ms: ${label}`)), ms)
  })
  return Promise.race([promise, expiry]).finally(() => clearTimeout(timer))
}

async function devToolsAnswering(port) {
  try {
    const res = await fetch(`http://127.0.0.1:${port}/json/version`, { signal: AbortSignal.timeout(1000) })
    return res.ok
  } catch {
    return false
  }
}

// Turns one CDP RemoteObject into the text DevTools would print for it
function argText(arg = {}) {
  if (arg.type === 'string') return arg.value
  if (arg.unserializableValue !== undefined) return arg.unserializableValue
  if (arg.type === 'undefined') return 'undefined'
  if (arg.value !== undefined) return arg.value !== null && typeof arg.value === 'object' ? JSON.stringify(arg.value) : String(arg.value)
  return arg.description ?? arg.subtype ?? arg.type ?? ''
}

// Applies console format specifiers (%s %d %i %f %o %O %c) the way the DevTools console does
function formatConsoleArgs(args = []) {
  const head = args[0]
  if (head?.type !== 'string' || !/%[sdifoOc%]/.test(head.value)) return args.map(argText).join(' ')
  let next = 1
  const text = head.value.replace(/%([sdifoOc%])/g, (match, spec) => {
    if (spec === '%') return '%'
    if (next >= args.length) return match
    const arg = args[next++]
    return spec === 'c' ? '' : argText(arg)
  })
  return [text, ...args.slice(next).map(argText)].join(' ')
}

function fromConsoleCall(params) {
  const frame = params.stackTrace?.callFrames?.[0]
  return {
    source: 'console',
    level: CONSOLE_LEVELS[params.type] ?? 'info',
    type: params.type,
    text: formatConsoleArgs(params.args),
    url: frame?.url ?? '',
    line: frame ? frame.lineNumber + 1 : null,
    timestamp: params.timestamp,
  }
}

function fromException(details) {
  const frame = details.stackTrace?.callFrames?.[0]
  const thrown = details.exception
  const body = thrown?.description ?? (thrown?.value !== undefined ? String(thrown.value) : '')
  const line = details.lineNumber ?? frame?.lineNumber
  return {
    source: 'exception',
    level: 'error',
    type: 'exception',
    text: [details.text, body].filter(Boolean).join(' '),
    url: details.url ?? frame?.url ?? '',
    line: line === undefined ? null : line + 1,
    timestamp: Date.now(),
  }
}

function fromLogEntry(entry) {
  return {
    source: `log:${entry.source}`,
    level: entry.level === 'verbose' ? 'debug' : entry.level,
    type: entry.source,
    text: entry.text,
    url: entry.url ?? '',
    line: entry.lineNumber === undefined ? null : entry.lineNumber + 1,
    timestamp: entry.timestamp,
  }
}

// Waits for the DevTools endpoint via the stderr banner, falling back to DevToolsActivePort in the profile
async function waitForDevTools(state, profile, deadline) {
  const portFile = join(profile, 'DevToolsActivePort')
  while (Date.now() < deadline) {
    if (state.spawnError) throw new Error(`Could not start the browser: ${state.spawnError.message}`)
    if (state.child.exitCode !== null) {
      throw new Error(`Browser exited (code ${state.child.exitCode}) before DevTools came up\n${state.stderr.slice(-2000)}`)
    }
    if (state.banner) return Number(new URL(state.banner).port)
    if (existsSync(portFile)) {
      const port = Number(readFileSync(portFile, 'utf8').split(/\r?\n/)[0])
      if (port > 0) return port
    }
    await sleep(50)
  }
  throw new Error(`DevTools endpoint did not come up\n${state.stderr.slice(-2000)}`)
}

async function findPageTarget(port, deadline) {
  for (;;) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/json/list`)
      const page = (await res.json()).find((target) => target.type === 'page' && target.webSocketDebuggerUrl)
      if (page) return page
    } catch {
      // Endpoint still starting
    }
    if (Date.now() > deadline) throw new Error(`No page target on DevTools port ${port}`)
    await sleep(100)
  }
}

// Launches a headless Chromium browser on about:blank and returns a connected page session
export async function launch({
  port = 9360,
  width = 1440,
  height = 900,
  dpr = 1,
  mobile = false,
  chrome,
  headless = true,
  userDataDir,
  extraArgs = [],
  timeout = 30000,
} = {}) {
  const executable = resolveBrowser(chrome)
  if (port && (await devToolsAnswering(port))) {
    throw new Error(`DevTools port ${port} is already in use (another browser?); pass a different port`)
  }
  const ownsProfile = !userDataDir
  const profile = userDataDir ?? mkdtempSync(join(tmpdir(), 'cdp-'))
  // A stale DevToolsActivePort from an earlier run would point at a dead browser
  rmSync(join(profile, 'DevToolsActivePort'), { force: true })

  const args = [
    ...(headless ? ['--headless=new'] : []),
    '--no-first-run',
    '--no-default-browser-check',
    '--hide-scrollbars',
    '--disable-gpu',
    `--force-device-scale-factor=${dpr}`,
    `--window-size=${width},${height}`,
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${profile}`,
    '--disable-background-timer-throttling',
    '--disable-backgrounding-occluded-windows',
    '--disable-renderer-backgrounding',
    '--disable-features=Translate,MediaRouter,OptimizationHints',
    '--disable-extensions',
    '--disable-sync',
    '--mute-audio',
    '--password-store=basic',
    ...extraArgs,
    'about:blank',
  ]

  installExitHooks()
  // No shell: Node quotes each argument itself, so paths with spaces need no escaping
  const child = spawn(executable, args, { stdio: ['ignore', 'ignore', 'pipe'], windowsHide: true })
  const entry = { child, profile, ownsProfile }
  live.add(entry)
  const state = { child, stderr: '', banner: null, spawnError: null }
  child.once('error', (err) => {
    state.spawnError = err
  })
  child.stderr.setEncoding('utf8')
  child.stderr.on('data', (chunk) => {
    state.stderr = (state.stderr + chunk).slice(-8192)
    state.banner ??= /DevTools listening on (ws:\/\/\S+)/.exec(state.stderr)?.[1] ?? null
  })

  try {
    const deadline = Date.now() + timeout
    const devtoolsPort = await waitForDevTools(state, profile, deadline)
    const target = await findPageTarget(devtoolsPort, deadline)
    const session = await connect({ target, child, entry, devtoolsPort, executable })
    await session.setViewport({ width, height, dpr, mobile })
    return session
  } catch (err) {
    killNow(child)
    live.delete(entry)
    if (ownsProfile) removeDir(profile)
    throw err
  }
}

// Opens the page WebSocket and builds the session API around it
async function connect({ target, child, entry, devtoolsPort, executable }) {
  const ws = new WebSocket(target.webSocketDebuggerUrl)
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true })
    ws.addEventListener('error', () => reject(new Error(`Could not open ${target.webSocketDebuggerUrl}`)), { once: true })
  })

  const pending = new Map()
  const handlers = new Map()
  const messages = []
  const mediaFeatures = {}
  let viewport = null
  let nextId = 0
  let closed = false
  let closing = null

  ws.addEventListener('message', (event) => {
    const msg = JSON.parse(event.data)
    if (msg.id !== undefined) {
      const slot = pending.get(msg.id)
      if (!slot) return
      pending.delete(msg.id)
      clearTimeout(slot.timer)
      if (msg.error) slot.reject(new Error(`CDP ${slot.method}: ${msg.error.message}${msg.error.data ? ` (${msg.error.data})` : ''}`))
      else slot.resolve(msg.result)
      return
    }
    for (const key of [msg.method, '*']) {
      for (const fn of handlers.get(key) ?? []) {
        try {
          fn(msg.params ?? {}, msg.method)
        } catch (err) {
          console.error(`CDP listener for ${msg.method} threw:`, err)
        }
      }
    }
  })

  ws.addEventListener('close', () => {
    closed = true
    for (const slot of pending.values()) {
      clearTimeout(slot.timer)
      slot.reject(new Error(`CDP ${slot.method}: connection closed`))
    }
    pending.clear()
  })

  // Sends one CDP command and resolves with its result
  function send(method, params = {}, { timeout = 60000 } = {}) {
    if (closed) return Promise.reject(new Error(`CDP ${method}: session is closed`))
    const id = ++nextId
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        if (pending.delete(id)) reject(new Error(`CDP ${method} timed out after ${timeout} ms`))
      }, timeout)
      pending.set(id, { resolve, reject, timer, method })
      ws.send(JSON.stringify({ id, method, params }))
    })
  }

  // Subscribes to one CDP event ('*' for all) as fn(params, method); returns the unsubscribe function
  function on(event, fn) {
    if (!handlers.has(event)) handlers.set(event, new Set())
    handlers.get(event).add(fn)
    return () => handlers.get(event)?.delete(fn)
  }

  // Resolves with the next matching event's params, or rejects after timeout
  function waitForEvent(event, { predicate = () => true, timeout = 30000 } = {}) {
    let off = () => {}
    const hit = new Promise((resolve) => {
      off = on(event, (params) => {
        if (predicate(params)) resolve(params)
      })
    })
    return withTimeout(hit, timeout, `waiting for ${event}`).finally(() => off())
  }

  // Evaluates an expression (or a function called with JSON-serialisable args) and returns its JSON value
  async function evaluate(expression, ...args) {
    const source = typeof expression === 'function'
      ? `(${expression})(${args.map((arg) => (arg === undefined ? 'undefined' : JSON.stringify(arg))).join(', ')})`
      : expression
    const res = await send('Runtime.evaluate', { expression: source, returnByValue: true, awaitPromise: true })
    if (res.exceptionDetails) {
      const details = res.exceptionDetails
      throw new Error(`Page exception: ${details.exception?.description ?? details.text}`)
    }
    return res.result.value
  }

  // Navigates the page and waits for its load event (plus Chrome's network-idle signal for 'networkidle')
  async function navigate(url, { waitUntil = 'load', timeout = 30000 } = {}) {
    const wanted = waitUntil === 'networkidle' ? ['load', 'networkIdle'] : ['load']
    const seen = new Map()
    let loaderId = null
    let wake = () => {}
    const complete = () => loaderId !== null && wanted.every((name) => seen.get(loaderId)?.has(name))
    const off = on('Page.lifecycleEvent', (params) => {
      if (!seen.has(params.loaderId)) seen.set(params.loaderId, new Set())
      seen.get(params.loaderId).add(params.name)
      if (complete()) wake()
    })
    try {
      const res = await send('Page.navigate', { url }, { timeout })
      if (res.errorText) throw new Error(`Navigation to ${url} failed: ${res.errorText}`)
      // Same-document navigations (hash changes) have no new loader to wait for
      if (!res.loaderId) return res
      loaderId = res.loaderId
      if (!complete()) {
        await withTimeout(new Promise((resolve) => { wake = resolve }), timeout, `${url} reaching ${wanted.join(' + ')}`)
      }
      return res
    } finally {
      off()
    }
  }

  // Emulates the viewport in CSS pixels; mobile also enables touch so pointer and hover media queries match a phone
  async function setViewport({ width, height, dpr, mobile } = {}) {
    viewport = {
      width: width ?? viewport?.width ?? 1440,
      height: height ?? viewport?.height ?? 900,
      dpr: dpr ?? viewport?.dpr ?? 1,
      mobile: mobile ?? viewport?.mobile ?? false,
    }
    await send('Emulation.setDeviceMetricsOverride', {
      width: viewport.width,
      height: viewport.height,
      deviceScaleFactor: viewport.dpr,
      mobile: viewport.mobile,
      screenWidth: viewport.width,
      screenHeight: viewport.height,
    })
    await send('Emulation.setTouchEmulationEnabled', viewport.mobile ? { enabled: true, maxTouchPoints: 5 } : { enabled: false })
    return { ...viewport }
  }

  // Emulates media features; null clears one, omitted ones keep their current value
  async function setMedia({ reducedMotion, colorScheme } = {}) {
    if (reducedMotion !== undefined) {
      const value = reducedMotion === true ? 'reduce' : reducedMotion === false ? 'no-preference' : reducedMotion
      mediaFeatures['prefers-reduced-motion'] = value ?? ''
    }
    if (colorScheme !== undefined) mediaFeatures['prefers-color-scheme'] = colorScheme ?? ''
    const features = Object.entries(mediaFeatures).map(([name, value]) => ({ name, value }))
    await send('Emulation.setEmulatedMedia', { media: '', features })
  }

  // Page scripts on or off; takes effect for the next navigation
  const setScriptEnabled = (enabled) => send('Emulation.setScriptExecutionDisabled', { value: !enabled })

  // Captures the viewport (or a viewport-relative clip in CSS px) and returns the Buffer, writing it when a path is given
  async function screenshot({ path, format, quality, clip, fromSurface = true } = {}) {
    const type = format ?? FORMAT_BY_EXT[extname(path ?? '').toLowerCase()] ?? 'png'
    const params = { format: type, fromSurface }
    if (type !== 'png' && quality !== undefined) params.quality = quality
    if (clip) {
      // CDP clips in document coordinates; callers pass boxes as getBoundingClientRect reports them
      const { cssVisualViewport: view } = await send('Page.getLayoutMetrics')
      params.clip = { scale: 1, ...clip, x: clip.x + view.pageX, y: clip.y + view.pageY }
    }
    const { data } = await send('Page.captureScreenshot', params)
    const buffer = Buffer.from(data, 'base64')
    if (path) {
      mkdirSync(dirname(path), { recursive: true })
      writeFileSync(path, buffer)
    }
    return buffer
  }

  // Polls an expression until it returns a truthy value, which is returned
  async function waitFor(expression, timeoutMs = 10000, { interval = 100 } = {}) {
    const deadline = Date.now() + timeoutMs
    let lastError = null
    for (;;) {
      try {
        const value = await evaluate(expression)
        if (value) return value
        lastError = null
      } catch (err) {
        lastError = err
      }
      if (Date.now() >= deadline) {
        const label = String(expression).replace(/\s+/g, ' ').slice(0, 120)
        throw new Error(`waitFor timed out after ${timeoutMs} ms: ${label}${lastError ? ` (last error: ${lastError.message})` : ''}`)
      }
      await sleep(interval)
    }
  }

  // Asks the browser to quit, kills the process tree if it lingers, then removes a temp profile
  function close() {
    closing ??= (async () => {
      if (!closed) await send('Browser.close', {}, { timeout: 2000 }).catch(() => {})
      closed = true
      try {
        ws.close()
      } catch {
        // Already closed
      }
      if (child.exitCode === null && child.signalCode === null) {
        const exited = new Promise((resolve) => child.once('exit', resolve))
        const quit = await Promise.race([exited.then(() => true), sleep(3000).then(() => false)])
        if (!quit) {
          killNow(child)
          await Promise.race([exited, sleep(3000)])
        }
      }
      live.delete(entry)
      if (entry.ownsProfile) removeDir(entry.profile)
    })()
    return closing
  }

  // Console output is collected from launch, so register before enabling the domains that replay it
  on('Runtime.consoleAPICalled', (params) => messages.push(fromConsoleCall(params)))
  on('Runtime.exceptionThrown', (params) => messages.push(fromException(params.exceptionDetails)))
  on('Log.entryAdded', (params) => messages.push(fromLogEntry(params.entry)))
  await Promise.all([send('Page.enable'), send('Runtime.enable'), send('Log.enable')])
  await send('Page.setLifecycleEventsEnabled', { enabled: true })

  return {
    send,
    on,
    waitForEvent,
    evaluate,
    navigate,
    setViewport,
    setMedia,
    setScriptEnabled,
    screenshot,
    consoleMessages: () => messages.slice(),
    waitFor,
    close,
    get viewport() {
      return { ...viewport }
    },
    browser: { executable, pid: child.pid, port: devtoolsPort, profile: entry.profile },
  }
}
