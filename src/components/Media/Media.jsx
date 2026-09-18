import AppFrame from './AppFrame'
import styles from './Media.module.css'

const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

// Renders an app visual: image, looping clip, or a cartographic placeholder when none exists yet
export default function Media({ media, accent, label }) {
  if (!media || media.type === 'placeholder') {
    return (
      <div className={styles.frame} style={{ '--frame-accent': accent }}>
        <AppFrame accent={accent} label={label} seed={label.length} />
      </div>
    )
  }

  if (media.type === 'video') {
    const autoplay = !reducedMotion()
    return (
      <div className={styles.frame} style={{ '--frame-accent': accent }}>
        <video
          className={styles.video}
          autoPlay={autoplay}
          muted
          loop
          playsInline
          preload="none"
          poster={media.poster}
          aria-label={media.alt}
        >
          <source src={media.src} type={media.mime ?? 'video/mp4'} />
        </video>
      </div>
    )
  }

  return (
    <div className={styles.frame} style={{ '--frame-accent': accent }}>
      <img
        className={styles.image}
        src={media.src}
        alt={media.alt}
        width={media.width}
        height={media.height}
        loading="lazy"
        decoding="async"
      />
    </div>
  )
}
