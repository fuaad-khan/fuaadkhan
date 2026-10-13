import { Fragment, useEffect, useRef } from 'react'
import { fill, introValues } from '../values'
import cityUrl from '../../../assets/map-my-city/city.json?url'
import parcels2x from '../../../assets/map-my-city/parcels-city.webp'
import parcels1x from '../../../assets/map-my-city/parcels-city@1x.webp'
import sealUrl from '../../../assets/map-my-city/seal.webp'
import { createCamera } from './camera'
import { decodeCity } from './mercator'
import { createOverlay } from './overlay'
import { createPainter } from './painter'
import styles from './CityDraw.module.css'

// Canvas backing widths above this get the 1600 px parcel raster, smaller ones the 800 px file
const RASTER_2X_FROM = 1000

// Legend keys: the gold dashed limits, a street line, a few parcels
const SWATCHES = [
  <span key="limits" className={`${styles.swatch} ${styles.limits}`} />,
  <span key="streets" className={`${styles.swatch} ${styles.streets}`} />,
  <svg key="parcels" className={`${styles.swatch} ${styles.parcels}`} viewBox="0 0 44 24">
    <rect x="1.5" y="1.5" width="19" height="9" />
    <rect x="23.5" y="1.5" width="19" height="9" />
    <rect x="1.5" y="13.5" width="41" height="9" />
  </svg>,
]

// metrics[0].value ('18,459') as the counter's final number
const parseCount = (value) => {
  const n = Number(String(value ?? '').replace(/[^\d.]/g, ''))
  return Number.isFinite(n) && n > 0 ? Math.round(n) : 0
}

async function loadCity(url) {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`city.json: HTTP ${response.status}`)
  return decodeCity(await response.json())
}

// Decoded up front and drawn as a bitmap, so the first frames that need it never stall on decoding
async function loadBitmap(url) {
  const img = new Image()
  img.decoding = 'async'
  img.src = url
  await img.decode()
  return typeof createImageBitmap === 'function' ? createImageBitmap(img) : img
}

// Map My City's intro (PLAN §6.1): city limits, streets and parcels draw on, the seal and lockup land, then the camera pushes into the capture
export default function CityDraw({ app, media, driver, target, onError }) {
  const rootRef = useRef(null)
  const canvasRef = useRef(null)
  const counterRef = useRef(null)
  const wordRefs = useRef([])
  const values = introValues(app, media)
  const captions = app?.intro?.captions ?? []
  const labels = app?.intro?.labels ?? {}
  const words = fill(labels.lockup ?? app?.frameTitle, values).split(/\s+/).filter(Boolean)
  const subtitle = fill(labels.subtitle, values)
  const total = parseCount(app?.metrics?.[0]?.value)
  // Hosts may rebuild the target object on every render; only its content matters
  const targetKey = JSON.stringify(target ?? null)

  useEffect(() => {
    const root = rootRef.current
    const canvas = canvasRef.current
    const wordEls = wordRefs.current.filter(Boolean)
    const landing = JSON.parse(targetKey)
    const cam = { s: 1, x: 0, y: 0 }
    let alive = true
    let city = null
    let painter = null
    let overlay = null
    let camera = null
    let raster = null
    let rasterUrl = null
    let loading = null
    let width = 0
    let height = 0
    let ratio = 1
    let visible = true
    let dirty = true
    let painted = NaN
    let ratioQuery = null

    // One frame at the driver's t, canvas and HTML layer from the same camera; skipped off-screen or when nothing changed
    const paint = () => {
      if (!alive || !raster || !camera || !visible) return
      const t = driver.get()
      if (!dirty && t === painted) return
      try {
        camera.at(t, cam)
        painter.paint(t, cam, camera.cam0)
        overlay.update(t, cam)
        painted = t
        dirty = false
      } catch (err) {
        fail(err)
      }
    }

    // Swaps in the parcel raster this canvas size wants; the 1600 px file, once loaded, is never traded down
    const pickRaster = (url) => {
      if (url === rasterUrl || rasterUrl === parcels2x || url === loading) return
      loading = url
      loadBitmap(url)
        .then((bitmap) => {
          if (!alive || rasterUrl === parcels2x) {
            bitmap.close?.()
            return
          }
          raster?.close?.()
          raster = bitmap
          rasterUrl = url
          if (loading === url) loading = null
          painter.setRaster(bitmap)
          root.dataset.city = 'ready'
          dirty = true
          paint()
        })
        .catch(fail)
    }

    // Observer callbacks run outside React, so their failures go through fail() like the loads do
    const layout = () => {
      if (!alive || !city || !width || !height) return
      try {
        painter.resize(width, height, ratio)
        camera = createCamera(city, landing, width, height)
        overlay.layout(width, height, camera)
      } catch (err) {
        fail(err)
        return
      }
      dirty = true
      pickRaster(width * ratio > RASTER_2X_FROM ? parcels2x : parcels1x)
      paint()
    }

    // Moving between screens can change devicePixelRatio without a resize
    const onRatio = () => {
      ratio = Math.min(window.devicePixelRatio || 1, 2)
      watchRatio()
      layout()
    }
    const watchRatio = () => {
      ratioQuery?.removeEventListener('change', onRatio)
      ratioQuery = window.matchMedia(`(resolution: ${window.devicePixelRatio || 1}dppx)`)
      ratioQuery.addEventListener('change', onRatio)
    }

    const resizer = new ResizeObserver((entries) => {
      const box = entries[entries.length - 1].contentRect
      width = box.width
      height = box.height
      ratio = Math.min(window.devicePixelRatio || 1, 2)
      layout()
    })
    const watcher = new IntersectionObserver((entries) => {
      visible = entries[entries.length - 1].isIntersecting
      paint()
    })
    const unsubscribe = driver.subscribe(paint)

    function stop() {
      alive = false
      unsubscribe()
      resizer.disconnect()
      watcher.disconnect()
      ratioQuery?.removeEventListener('change', onRatio)
      painter?.destroy()
      raster?.close?.()
      raster = null
    }

    // Any failure outside render unmounts the intro through IntroLayer's boundary, leaving the poster
    function fail(err) {
      if (!alive) return
      stop()
      onError?.(err instanceof Error ? err : new Error(String(err)))
    }

    watchRatio()
    resizer.observe(root)
    watcher.observe(root)
    loadCity(cityUrl)
      .then((decoded) => {
        if (!alive) return
        city = decoded
        painter = createPainter(canvas, city)
        overlay = createOverlay(root, wordEls, counterRef.current, total || city.count, painter.reveal)
        layout()
      })
      .catch(fail)

    return () => {
      if (alive) stop()
    }
  }, [driver, onError, total, targetKey])

  return (
    <div ref={rootRef} className={styles.root} aria-hidden="true">
      <canvas ref={canvasRef} className={styles.canvas} />
      <div className={styles.vignette} />
      <div className={styles.header} />
      <div className={styles.scrim} />
      <div className={styles.lockup}>
        <span className={styles.sealBox}>
          <span className={styles.glow} />
          <img className={styles.seal} src={sealUrl} alt="" width="72" height="72" decoding="async" />
          <span className={styles.sweep} />
        </span>
        <span className={styles.divider} />
        <span className={styles.title}>
          {words.map((word, i) => (
            <Fragment key={i}>
              {i > 0 && ' '}
              <span
                className={styles.word}
                ref={(el) => {
                  wordRefs.current[i] = el
                }}
              >
                <span>{word}</span>
              </span>
            </Fragment>
          ))}
        </span>
      </div>
      {subtitle && <p className={styles.subtitle}>{subtitle}</p>}
      <ul className={styles.legend}>
        {SWATCHES.map((swatch, i) => (
          <li key={i} className={styles.row}>
            {swatch}
            <span>{fill(captions[i], values)}</span>
            {i === 2 && (
              <span ref={counterRef} className={styles.count}>
                0
              </span>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}
