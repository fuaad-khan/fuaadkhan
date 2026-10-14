import { useMemo, useRef, useState } from 'react'
import { useMotionOK, useNearViewport } from '../../hooks/useChapter'
import { createDriver, fill } from '../Intros'
import { media } from '../../content/media'
import { site } from '../../content/site'
import { accentVar } from '../../styles/accent'
import Card from './Card'
import Controls from './Controls'
import { useGalleryPlayer } from './useGalleryPlayer'
import styles from './Gallery.module.css'

// Seconds a still or the glance card stays up unless its highlight sets a duration
const STILL_SECONDS = 6

// Each highlight with its media entry (a missing clip falls back to the hero) and the kind the player runs it as
function resolveCards(app, assets) {
  const hero = assets?.hero ?? null
  return app.highlights.map((h) => {
    const entry = h.kind === 'glance' ? null : h.kind === 'intro' ? hero : (assets?.clips?.[h.id] ?? hero)
    const kind = h.kind === 'intro' || h.kind === 'glance' ? h.kind : entry?.kind === 'loop' && entry.sources?.length ? 'loop' : 'still'
    return { ...h, caption: h.caption ?? (h.kind === 'glance' ? site.ui.gallery.glance : ''), entry, kind, seconds: h.duration ?? STILL_SECONDS }
  })
}

// Apple-style highlight gallery: a horizontally snapping track of cards that plays itself while on screen, with dots, play/pause and a Next cue
export default function Gallery({ app, next }) {
  const regionRef = useRef(null)
  const trackRef = useRef(null)
  const dotsRef = useRef(null)
  const videosRef = useRef([])
  const motionOK = useMotionOK()
  const near = useNearViewport(regionRef)
  const assets = media[app.id]
  const hero = assets?.hero
  const cards = useMemo(() => resolveCards(app, assets), [app, assets])
  const [drivers] = useState(() => cards.map((card) => (card.kind === 'intro' ? createDriver() : null)))
  const videoRefs = useMemo(
    () =>
      cards.map((_, i) => (el) => {
        videosRef.current[i] = el
      }),
    [cards],
  )
  const target = useMemo(() => ({ view: hero?.view, mapRect: hero?.mapRect, viewport: hero?.viewport }), [hero])
  const { active, mode, running, goTo, toggle, onKeyDown, clipFailed } = useGalleryPlayer({
    cards,
    motionOK,
    near,
    regionRef,
    trackRef,
    dotsRef,
    videosRef,
    drivers,
  })
  const clipErrors = useMemo(() => cards.map((_, i) => () => clipFailed(i)), [cards, clipFailed])
  const labels = site.ui.gallery
  const last = cards.length - 1
  const showNext = motionOK ? mode === 'ended' : active === last

  return (
    <div
      ref={regionRef}
      className={styles.gallery}
      role="region"
      aria-roledescription="carousel"
      aria-label={fill(labels.region, { name: app.name })}
      data-state={motionOK ? mode : 'static'}
      data-running={running}
      data-active={active}
      onKeyDown={onKeyDown}
    >
      <ul ref={trackRef} className={styles.track} tabIndex={0}>
        {cards.map((card, i) => (
          <Card
            key={card.id}
            app={app}
            card={card}
            index={i}
            current={i === active}
            assets={assets}
            driver={drivers[i]}
            target={target}
            live={near && motionOK}
            preload={i === active || i === active + 1 ? 'auto' : 'none'}
            videoRef={videoRefs[i]}
            onClipError={clipErrors[i]}
          />
        ))}
      </ul>
      <div className={styles.bar}>
        <Controls
          count={cards.length}
          active={active}
          mode={mode}
          labels={labels}
          dotsRef={dotsRef}
          onDot={(i) => goTo(i, { user: true })}
          onToggle={toggle}
        />
        <a className={styles.next} href={next.href} data-shown={showNext ? '' : undefined} style={{ '--next-accent': accentVar(next.accent) }}>
          {next.label}
          <svg className={styles.nextIcon} viewBox="0 0 20 20" aria-hidden="true" focusable="false">
            <circle cx="10" cy="10" r="8.6" />
            <path d="M10 5.8v8M6.6 10.9 10 14.2l3.4-3.3" />
          </svg>
        </a>
      </div>
    </div>
  )
}
