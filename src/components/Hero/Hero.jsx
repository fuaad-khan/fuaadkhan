import portrait160 from '../../assets/portrait/portrait-160.webp'
import portrait320 from '../../assets/portrait/portrait-320.webp'
import portrait480 from '../../assets/portrait/portrait-480.webp'
import styles from './Hero.module.css'

// The page's first viewport, centred over the topo; its rise-in is CSS only, so it plays before (and without) the script bundle
export default function Hero({ site }) {
  return (
    <header id="top" data-section="top" className={styles.hero}>
      <div className={styles.copy}>
        <p className={`eyebrow ${styles.rise}`} style={{ '--i': 0 }}>
          {site.eyebrow}
        </p>
        <h1 className={`${styles.name} ${styles.rise}`} style={{ '--i': 1 }}>
          {site.name}
        </h1>
        <p className={`${styles.identity} ${styles.rise}`} style={{ '--i': 2 }}>
          {site.identity.map((part, i) => (
            <span key={part}>
              {part}
              {i < site.identity.length - 1 && (
                <>
                  <span className="sr-only">{site.ui.listSep}</span>
                  <span className={styles.dot} aria-hidden="true">
                    {site.ui.sep}
                  </span>
                </>
              )}
            </span>
          ))}
        </p>
        <p className={`${styles.lede} ${styles.rise}`} style={{ '--i': 3 }}>
          {site.lede}
        </p>
        <img
          className={`${styles.portrait} ${styles.rise}`}
          style={{ '--i': 4 }}
          src={portrait320}
          srcSet={`${portrait160} 160w, ${portrait320} 320w, ${portrait480} 480w`}
          sizes="(min-width: 1200px) 136px, 112px"
          width="480"
          height="480"
          alt={site.portrait.alt}
          decoding="async"
        />
      </div>
      <div className={`${styles.cue} ${styles.rise}`} style={{ '--i': 5 }} aria-hidden="true">
        <span className={styles.cueLabel}>{site.ui.scroll}</span>
        <span className={styles.cueTrack}>
          <span className={styles.cueDash} />
        </span>
      </div>
    </header>
  )
}
