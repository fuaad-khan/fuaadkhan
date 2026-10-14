import { fill } from '../Intros/values'
import styles from './Gallery.module.css'

// Play, pause and replay glyphs for the round button
const ICONS = {
  play: <path d="M5.5 3.2v11.6c0 .6.7 1 1.2.7l9.4-5.8c.5-.3.5-1 0-1.3L6.7 2.5c-.5-.3-1.2.1-1.2.7Z" />,
  pause: (
    <>
      <rect x="4" y="3" width="3.6" height="12" rx="1" />
      <rect x="10.4" y="3" width="3.6" height="12" rx="1" />
    </>
  ),
  replay: (
    <>
      <path d="M9 3.2a5.8 5.8 0 1 1-5.6 7.3" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
      <path d="M9 0.6v5.2l3.4-2.6Z" />
    </>
  ),
}

// Apple's control pill: a dot per card (the active one stretches into a progress bar fed by --progress, and is the dots' one tab stop) and a round play/pause/replay button
export default function Controls({ captions, active, mode, labels, dotsRef, onDot, onToggle }) {
  const action = mode === 'ended' ? 'replay' : mode === 'playing' ? 'pause' : 'play'
  const total = captions.length
  return (
    <div className={styles.controls}>
      <div ref={dotsRef} className={styles.dots} role="group" aria-label={labels.dots}>
        {captions.map((caption, i) => (
          <button
            key={i}
            type="button"
            className={styles.dot}
            aria-label={fill(labels.show, { n: i + 1, total, caption })}
            aria-current={i === active ? 'true' : undefined}
            tabIndex={i === active ? 0 : -1}
            onClick={() => onDot(i)}
          >
            <span className={styles.pip}>
              <span className={styles.pipFill} />
            </span>
          </button>
        ))}
      </div>
      <button type="button" className={styles.toggle} aria-label={labels[action]} onClick={onToggle}>
        <svg viewBox="0 0 18 18" aria-hidden="true" focusable="false">
          {ICONS[action]}
        </svg>
      </button>
    </div>
  )
}
