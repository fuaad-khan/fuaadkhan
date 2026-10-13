import { useEffect, useRef, useState } from 'react'
import { useMotionOK, useNearViewport } from '../../hooks/useChapter'
import { site } from '../../content/site'
import { parcelGrid } from './parcelGrid'
import styles from './Media.module.css'

const SIZES = '(min-width: 768px) 56vw, 92vw'
const GRID = parcelGrid()

const join = (...names) => names.filter(Boolean).join(' ')

// Responsive still from an entry's 1x/2x posters, sized up front so nothing shifts while it loads
function Still({ entry, alt, className, sizes = SIZES }) {
  const { x1, x2 } = entry.poster
  return (
    <img
      className={join(styles.img, className)}
      src={x1}
      srcSet={`${x1} 800w, ${x2} 1600w`}
      sizes={sizes}
      width={entry.width}
      height={entry.height}
      alt={alt}
      loading="lazy"
      decoding="async"
    />
  )
}

// Poster always; the clip mounts on the client near the viewport when motion is allowed, and plays only while in view
function Loop({ entry, alt, className, playing, sizes }) {
  const ref = useRef(null)
  const video = useRef(null)
  const allow = useRef(false)
  const motionOK = useMotionOK()
  const near = useNearViewport(ref, '50%')
  const [inView, setInView] = useState(false)
  const [paused, setPaused] = useState(false)
  const live = motionOK && near && entry.sources?.length > 0
  const shouldPlay = live && inView && !paused && playing !== false

  useEffect(() => {
    const v = video.current
    if (!live || !v) return
    const io = new IntersectionObserver(([e]) => setInView(e.isIntersecting && e.intersectionRatio >= 0.4), {
      threshold: [0, 0.4],
    })
    io.observe(v)
    return () => io.disconnect()
  }, [live])

  useEffect(() => {
    allow.current = shouldPlay
    const v = video.current
    if (!v) return
    if (shouldPlay) v.play().catch(() => {})
    else v.pause()
  }, [shouldPlay])

  return (
    <div ref={ref} className={join(styles.loop, className)}>
      <Still entry={entry} alt={live ? '' : alt} sizes={sizes} />
      {live && (
        <>
          <video
            ref={video}
            className={styles.video}
            autoPlay
            muted
            loop
            playsInline
            preload="none"
            poster={entry.poster.x2}
            aria-label={alt}
            onPlay={(e) => {
              if (!allow.current) e.currentTarget.pause()
            }}
          >
            {entry.sources.map((s) => (
              <source key={s.src} src={s.src} type={s.type} />
            ))}
          </video>
          <button
            type="button"
            className={styles.toggle}
            aria-label={site.ui.pauseLoop}
            aria-pressed={paused}
            title={paused ? site.ui.playLoop : site.ui.pauseLoop}
            onClick={() => setPaused((p) => !p)}
          >
            <span className={paused ? styles.playIcon : styles.pauseIcon} aria-hidden="true" />
          </button>
        </>
      )}
    </div>
  )
}

// Neutral stand-in while an app has no capture yet: the parcel-grid motif at low opacity
function Placeholder({ alt, className }) {
  // alt="" marks a decorative use: hidden from assistive tech rather than an unnamed img
  const a11y = alt === '' ? { 'aria-hidden': true } : { role: 'img', 'aria-label': alt ?? site.ui.illustration }
  return (
    <div className={join(styles.placeholder, className)} {...a11y}>
      <svg className={styles.grid} viewBox={GRID.viewBox} preserveAspectRatio="xMidYMid slice" aria-hidden="true">
        <path className={styles.streets} d={GRID.streets} />
        <path className={styles.parcels} d={GRID.parcels} />
        <circle className={styles.buffer} cx={GRID.buffer.cx} cy={GRID.buffer.cy} r={GRID.buffer.r} />
        <path className={styles.highlight} d={GRID.highlight} />
      </svg>
      <span className={styles.caption} aria-hidden="true">
        {site.ui.illustration}
      </span>
    </div>
  )
}

// Renders one media.js entry: a still, a loop over its poster, or the placeholder when the entry is null; sizes overrides the srcset hint
export default function Media({ media, alt, className, playing, sizes }) {
  if (!media) return <Placeholder alt={alt} className={className} />
  if (media.kind === 'loop') return <Loop entry={media} alt={alt ?? media.alt} className={className} playing={playing} sizes={sizes} />
  return <Still entry={media} alt={alt ?? media.alt} className={className} sizes={sizes} />
}
