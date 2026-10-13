// Dev-only harness for the coded intros: drives t by slider or playback over an optional base still (served at /dev/intro-harness.html)
// Entry module with no exports on purpose: an edit reloads the page instead of hot-swapping a second React root
/* eslint-disable react-refresh/only-export-components */
import { Component, StrictMode, Suspense, memo, useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { createRoot } from 'react-dom/client'
import '../src/styles/global.css'

// Project modules load by URL at run time, so a missing or half-written one shows as a notice instead of a blank overlay
const MODULES = {
  intros: '/src/components/Intros/index.js',
  layer: '/src/components/Intros/IntroLayer.jsx',
  apps: '/src/content/apps.js',
  media: '/src/content/media.js',
}

// Match-cut target until media.js carries the app's hero sidecar: the City Hall view the Map My City capture lands on (PLAN Appendix B2)
const FALLBACK_TARGET = {
  view: { lat: 33.78227, lng: -116.95852, zoom: 20 },
  mapRect: [0, 88, 1440, 812],
  viewport: [1440, 900],
}

const UI = {
  title: 'Intro harness',
  app: 'App',
  play: 'Play',
  pause: 'Pause',
  reverse: 'Reverse',
  loop: 'Loop (s)',
  base: 'Base still',
  opacity: 'Intro opacity',
  direct: 'Bypass IntroLayer',
  keys: 'Space play/pause · R reverse · Left/Right ±0.01 (Shift ±0.1) · Home/End 0/1',
}

const params = new URLSearchParams(window.location.search)
const clamp01 = (value) => Math.min(1, Math.max(0, Number(value) || 0))
const numberParam = (key, fallback) => {
  const raw = params.get(key)
  const value = Number(raw)
  return raw !== null && raw.trim() !== '' && Number.isFinite(value) ? value : fallback
}
const listParam = (key, size) => {
  const values = (params.get(key) ?? '').split(',').map((v) => Number(v.trim()))
  return params.has(key) && values.length === size && values.every(Number.isFinite) ? values : null
}
const nextFrames = () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))

// Same contract as Intros/driver.js, used only if that module fails to load
function localDriver(initial) {
  let t = clamp01(initial)
  const listeners = new Set()
  return {
    subscribe(fn) {
      listeners.add(fn)
      return () => {
        listeners.delete(fn)
      }
    },
    get: () => t,
    emit(next) {
      const value = clamp01(next)
      if (value === t) return
      t = value
      listeners.forEach((fn) => fn(t))
    },
  }
}

// The hero sidecar's camera when media.js has one, else the fallback; lat/lng/zoom/rect/vp URL params override, target=none passes nothing
function resolveTarget(entry) {
  if (params.get('target') === 'none') return { target: undefined, source: 'none (the intro’s own fallback applies)' }
  const hero = entry?.hero
  const fromMedia = Boolean(hero?.view && hero?.mapRect && hero?.viewport)
  const base = fromMedia ? { view: hero.view, mapRect: hero.mapRect, viewport: hero.viewport } : FALLBACK_TARGET
  const view = { ...base.view }
  for (const key of ['lat', 'lng', 'zoom']) if (params.has(key)) view[key] = numberParam(key, view[key])
  const target = { view, mapRect: listParam('rect', 4) ?? base.mapRect, viewport: listParam('vp', 2) ?? base.viewport }
  const overridden = ['lat', 'lng', 'zoom', 'rect', 'vp'].some((key) => params.has(key))
  return { target, source: `${fromMedia ? 'media.js hero' : 'harness fallback'}${overridden ? ' + URL overrides' : ''}` }
}

// Errors React catches in boundaries (IntroLayer swallows them) are collected here and shown as notices
const caught = { list: [], listeners: new Set() }
const reportCaught = (error) => {
  console.error(error)
  caught.list = [...caught.list, String(error?.message ?? error)]
  caught.listeners.forEach((fn) => fn())
}
const subscribeCaught = (fn) => {
  caught.listeners.add(fn)
  return () => caught.listeners.delete(fn)
}
const getCaught = () => caught.list

const reducedQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
const subscribeReduced = (fn) => {
  reducedQuery.addEventListener('change', fn)
  return () => reducedQuery.removeEventListener('change', fn)
}
const getReduced = () => reducedQuery.matches

// Shows a direct-mode intro's error inside the stage instead of unmounting the page
class Boundary extends Component {
  state = { error: null }

  static getDerivedStateFromError(error) {
    return { error }
  }

  render() {
    if (this.state.error) return <p className="stage-error">{String(this.state.error?.message ?? this.state.error)}</p>
    return this.props.children
  }
}

// Same onError contract as IntroLayer: an error reported from a listener or fetch is rethrown in render for the Boundary to show
function DirectIntro({ intro, ...props }) {
  const Intro = intro
  const [error, setError] = useState(null)
  const onError = useCallback((err) => setError(() => err ?? new Error('Intro failed')), [])
  if (error) throw error
  return <Intro {...props} onError={onError} />
}

// Base still under the intro; memoised so playback re-renders only the controls, never the intro tree
const Stage = memo(function Stage({ mods, appId, app, media, driver, target, direct, base, aspect, showBase, opacity, onBaseLoad, onBaseError, stageRef, layerRef }) {
  const IntroLayer = mods.layer?.default
  const Intro = mods.intros?.intros?.[appId]
  let intro = null
  if (direct && Intro) {
    intro = (
      <Boundary key={appId}>
        <Suspense fallback={null}>
          <DirectIntro intro={Intro} app={app} media={media} driver={driver} target={target} />
        </Suspense>
      </Boundary>
    )
  } else if (!direct && IntroLayer) {
    intro = <IntroLayer appId={appId} app={app} media={media} driver={driver} target={target} />
  }

  return (
    <div className="stage" ref={stageRef} style={{ aspectRatio: aspect }}>
      {base && (
        <img
          className="base"
          src={base}
          alt=""
          style={{ visibility: showBase ? 'visible' : 'hidden' }}
          onLoad={onBaseLoad}
          onError={onBaseError}
        />
      )}
      <div className="layer" ref={layerRef} style={{ opacity }}>
        {intro}
      </div>
    </div>
  )
})

// Slider, readout and transport; the only part that re-renders as t moves
function Controls({ driver, playing, setPlaying, direction, setDirection, duration, setDuration }) {
  const t = useSyncExternalStore(driver.subscribe, driver.get)
  const seek = (value) => {
    setPlaying(false)
    driver.emit(clamp01(value))
  }

  return (
    <div className="controls chrome">
      <button type="button" aria-pressed={playing} onClick={() => setPlaying((p) => !p)}>
        {playing ? UI.pause : UI.play}
      </button>
      <button type="button" aria-pressed={direction < 0} onClick={() => setDirection((d) => -d)}>
        {UI.reverse}
      </button>
      <input className="scrub" type="range" min="0" max="1" step="0.001" value={t} aria-label="t" onChange={(e) => seek(e.target.value)} />
      <output aria-live="off">{t.toFixed(3)}</output>
      <label>
        {UI.loop}
        <input
          type="number"
          min="0.5"
          max="120"
          step="0.5"
          defaultValue={duration}
          onChange={(e) => {
            const value = Number(e.target.value)
            if (value >= 0.5) setDuration(value)
          }}
        />
      </label>
    </div>
  )
}

function Harness({ mods, loadErrors }) {
  const appId = params.get('app') || 'map-my-city'
  const apps = mods.apps?.apps ?? mods.apps?.default ?? []
  const found = apps.find((entry) => entry.id === appId) ?? null
  const app = useMemo(() => found ?? { id: appId }, [found, appId])
  const mediaMap = mods.media?.media ?? mods.media?.default ?? null
  const media = mediaMap?.[appId] ?? null
  const introIds = Object.keys(mods.intros?.intros ?? {})
  const [{ target, source }] = useState(() => resolveTarget(media))
  const [driver] = useState(() => (mods.intros?.createDriver ?? localDriver)(clamp01(numberParam('t', 0))))
  const base = params.get('base')
  const [aspect, setAspect] = useState(() => `${numberParam('w', 1440)} / ${numberParam('h', 900)}`)
  const [baseError, setBaseError] = useState(false)
  const [playing, setPlaying] = useState(params.get('play') === '1')
  const [direction, setDirection] = useState(1)
  const [duration, setDuration] = useState(() => Math.max(0.5, numberParam('dur', 8)))
  const [direct, setDirect] = useState(params.get('mode') === 'direct')
  const [showBase, setShowBase] = useState(true)
  const [opacity, setOpacity] = useState(() => clamp01(numberParam('opacity', 1)))
  const reduced = useSyncExternalStore(subscribeReduced, getReduced)
  const caughtErrors = useSyncExternalStore(subscribeCaught, getCaught)
  const stageRef = useRef(null)
  const layerRef = useRef(null)

  // Without explicit w/h the stage takes the base still's own aspect, so capture pixels map 1:1
  const onBaseLoad = useCallback((event) => {
    const { naturalWidth, naturalHeight } = event.currentTarget
    if (!params.has('w') && !params.has('h') && naturalWidth && naturalHeight) setAspect(`${naturalWidth} / ${naturalHeight}`)
  }, [])
  const onBaseError = useCallback(() => setBaseError(true), [])

  // Looping playback at the chosen duration; a private accumulator keeps tiny steps from stalling on the driver's jitter filter
  useEffect(() => {
    if (!playing) return
    let raf = 0
    let last = performance.now()
    let position = driver.get()
    const tick = (now) => {
      position += (direction * (now - last)) / 1000 / duration
      last = now
      if (position > 1) position -= Math.floor(position)
      if (position < 0) position += Math.ceil(-position)
      driver.emit(position)
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [playing, direction, duration, driver])

  useEffect(() => {
    const onKey = (event) => {
      if (event.ctrlKey || event.metaKey || event.altKey || event.target.closest?.('input, select, textarea, button')) return
      const step = event.shiftKey ? 0.1 : 0.01
      const seek = (value) => {
        setPlaying(false)
        driver.emit(clamp01(value))
      }
      const actions = {
        ' ': () => setPlaying((p) => !p),
        r: () => setDirection((d) => -d),
        R: () => setDirection((d) => -d),
        ArrowLeft: () => seek(driver.get() - step),
        ArrowRight: () => seek(driver.get() + step),
        Home: () => seek(0),
        End: () => seek(1),
      }
      const action = actions[event.key]
      if (!action) return
      event.preventDefault()
      action()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [driver])

  // Scripted capture hooks: setT resolves after two frames so a screenshot right after it shows the new state
  useEffect(() => {
    window.introHarness = {
      appId,
      target,
      driver,
      setT: (value) => {
        setPlaying(false)
        driver.emit(clamp01(value))
        return nextFrames().then(() => driver.get())
      },
      getT: () => driver.get(),
      play: () => setPlaying(true),
      pause: () => setPlaying(false),
      stageRect: () => {
        const r = stageRef.current?.getBoundingClientRect()
        return r ? { x: r.x, y: r.y, width: r.width, height: r.height } : null
      },
    }
    document.documentElement.dataset.harness = 'ready'
  }, [appId, target, driver])

  // data-intro reports whether the intro rendered anything, for scripts waiting on the lazy chunk
  useEffect(() => {
    const el = layerRef.current
    if (!el) return
    const update = () => {
      document.documentElement.dataset.intro = el.childElementCount ? 'mounted' : 'empty'
    }
    update()
    const observer = new MutationObserver(update)
    observer.observe(el, { childList: true })
    return () => observer.disconnect()
  }, [])

  const switchApp = (id) => {
    const next = new URLSearchParams(params)
    for (const key of ['base', 'w', 'h', 'lat', 'lng', 'zoom', 'rect', 'vp', 't']) next.delete(key)
    next.set('app', id)
    window.location.search = next.toString()
  }

  const notices = []
  for (const [key, message] of Object.entries(loadErrors)) {
    if (key === 'media') notices.push({ kind: 'info', text: `media.js is not available yet, so media is null and the target falls back (${message})` })
    else notices.push({ kind: 'error', text: `Could not load ${MODULES[key]}: ${message}` })
  }
  if (mods.intros && !introIds.includes(appId)) notices.push({ kind: 'error', text: `No intro registered for "${appId}". Known: ${introIds.join(', ')}` })
  if (mods.apps && !found) notices.push({ kind: 'error', text: `apps.js has no app with id "${appId}"` })
  if (mods.layer && !mods.layer.default) notices.push({ kind: 'error', text: 'IntroLayer.jsx has no default export' })
  if (reduced && !direct) notices.push({ kind: 'info', text: 'prefers-reduced-motion is on, so IntroLayer renders nothing (as on the site). Tick "Bypass IntroLayer" or add &mode=direct.' })
  if (baseError) notices.push({ kind: 'error', text: `Base still did not load: ${base}` })
  for (const message of caughtErrors) notices.push({ kind: 'error', text: `Intro threw: ${message}` })

  const ids = [...new Set([...introIds, ...apps.map((entry) => entry.id), appId])]
  const view = target?.view
  const show = (value) => (Array.isArray(value) ? `[${value.join(', ')}]` : JSON.stringify(value))
  const readout = [
    `app       ${appId}${found ? ` · ${found.name}` : ''} · media ${media ? 'entry present' : 'null'}`,
    `target    ${source}`,
    target ? `view      ${view?.lat !== undefined ? `${view.lat}, ${view.lng} @ z${view.zoom}` : show(view)}` : null,
    target ? `mapRect   ${show(target.mapRect)}` : null,
    target ? `viewport  ${show(target.viewport)}` : null,
    `stage     aspect ${aspect}${base ? ` · base ${base}` : ' · no base still'} · ${direct ? 'direct intro' : 'via IntroLayer'}`,
  ].filter(Boolean).join('\n')

  return (
    <div className="harness">
      <header className="chrome">
        <h1>{UI.title}</h1>
        <label>
          {UI.app}{' '}
          <select value={appId} onChange={(e) => switchApp(e.target.value)}>
            {ids.map((id) => (
              <option key={id} value={id}>
                {id}
              </option>
            ))}
          </select>
        </label>
      </header>
      {notices.map((notice, i) => (
        <p key={i} className={`notice chrome ${notice.kind}`} role={notice.kind === 'error' ? 'alert' : undefined}>
          {notice.text}
        </p>
      ))}
      <Stage
        mods={mods}
        appId={appId}
        app={app}
        media={media}
        driver={driver}
        target={target}
        direct={direct}
        base={base}
        aspect={aspect}
        showBase={showBase}
        opacity={opacity}
        onBaseLoad={onBaseLoad}
        onBaseError={onBaseError}
        stageRef={stageRef}
        layerRef={layerRef}
      />
      <Controls
        driver={driver}
        playing={playing}
        setPlaying={setPlaying}
        direction={direction}
        setDirection={setDirection}
        duration={duration}
        setDuration={setDuration}
      />
      <div className="options chrome">
        {base && (
          <label>
            <input type="checkbox" checked={showBase} onChange={(e) => setShowBase(e.target.checked)} />
            {UI.base}
          </label>
        )}
        <label>
          {UI.opacity}
          <input type="range" min="0" max="1" step="0.05" value={opacity} onChange={(e) => setOpacity(Number(e.target.value))} />
        </label>
        <label>
          <input type="checkbox" checked={direct} onChange={(e) => setDirect(e.target.checked)} />
          {UI.direct}
        </label>
      </div>
      <pre className="readout chrome">{readout}</pre>
      <p className="keys chrome">{UI.keys}</p>
    </div>
  )
}

async function boot() {
  const html = document.documentElement
  // Same gate main.jsx sets, so intros see the scripted-page CSS
  html.classList.add('js')
  html.dataset.ui = params.get('ui') === '0' ? '0' : '1'
  const results = await Promise.all(
    Object.entries(MODULES).map(([key, url]) =>
      import(/* @vite-ignore */ url).then(
        (mod) => [key, mod, null],
        (err) => [key, null, err?.message ?? String(err)],
      ),
    ),
  )
  const mods = Object.fromEntries(results.map(([key, mod]) => [key, mod]))
  const loadErrors = Object.fromEntries(results.filter(([, , err]) => err).map(([key, , err]) => [key, err]))
  createRoot(document.getElementById('root'), { onCaughtError: reportCaught }).render(
    <StrictMode>
      <Harness mods={mods} loadErrors={loadErrors} />
    </StrictMode>,
  )
}

boot()
