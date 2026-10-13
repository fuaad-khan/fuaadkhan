import styles from './Hero.module.css'

// The Journey's opening viewport; its rise-in is CSS only, so it plays before (and without) the script bundle
export default function Hero({ site, titleId }) {
  return (
    <header className={styles.hero}>
      <p className={`eyebrow ${styles.eyebrow} ${styles.rise}`} style={{ '--i': 0 }}>
        {site.eyebrow}
      </p>
      <h1 id={titleId} className={`${styles.name} ${styles.rise}`} style={{ '--i': 1 }}>
        {site.name}
      </h1>
      <p className={`${styles.identity} ${styles.rise}`} style={{ '--i': 2 }}>
        {site.identity.map((part, i) => (
          <span key={part}>
            {part}
            {i < site.identity.length - 1 && (
              <>
                <span className="sr-only">,</span>
                <span className={styles.dot} aria-hidden="true">
                  ·
                </span>
              </>
            )}
          </span>
        ))}
      </p>
      <p className={`${styles.lede} ${styles.rise}`} style={{ '--i': 3 }}>
        {site.lede}
      </p>
      <div className={styles.cue} data-cue aria-hidden="true">
        <span className={styles.cueTrack}>
          <span className={styles.cueDash} />
        </span>
        <span className={`${styles.cueLabel} ${styles.rise}`} style={{ '--i': 4 }}>
          {site.ui.scroll}
        </span>
      </div>
    </header>
  )
}
