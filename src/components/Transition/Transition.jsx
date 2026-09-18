import { useRef } from 'react'
import { useChapter, gsap } from '../../hooks/useChapter'
import styles from './Transition.module.css'

const fadeIn = (q, el) =>
  gsap.from(el, { opacity: 0, duration: 0.6, scrollTrigger: { trigger: el, start: 'top 80%', once: true } })

// Node x positions as percentages of the diagram width
const X = [20, 50, 80]

export default function Transition({ content, apps }) {
  const ref = useRef(null)

  useChapter(
    ref,
    (tl, q) => {
      tl.from(q('[data-trunk]'), { scaleY: 0, duration: 0.25 }, 0)
        .from(q('[data-eyebrow]'), { opacity: 0, y: 16, duration: 0.2, ease: 'power2.out' }, 0.02)
        .from(q('[data-head]'), { opacity: 0, y: 32, duration: 0.3, ease: 'power2.out' }, 0.06)
        .from(q('[data-body]'), { opacity: 0, y: 20, duration: 0.25, ease: 'power2.out' }, 0.22)
        .from(q('[data-bus]'), { scaleX: 0, duration: 0.3 }, 0.25)
        .from(q('[data-branch]'), { scaleY: 0, duration: 0.2, stagger: 0.1 }, 0.5)
        .from(q('[data-appnode]'), { scale: 0, duration: 0.15, stagger: 0.1, ease: 'power2.out' }, 0.66)
        .from(q('[data-applabel]'), { opacity: 0, y: 10, duration: 0.2, stagger: 0.1, ease: 'power2.out' }, 0.74)
        .to({}, { duration: 0.3 })
    },
    { length: 1.1, reduced: fadeIn },
  )

  return (
    <section ref={ref} className={styles.chapter} aria-labelledby="built-title">
      <div className={styles.lines} aria-hidden="true">
        <span className={styles.trunkBase} />
        <span className={styles.trunk} data-trunk />
        <span className={styles.bus} data-bus />
        {X.map((x) => (
          <span key={x} className={styles.branch} style={{ left: `${x}%` }} data-branch />
        ))}
      </div>

      <div className={styles.text}>
        <p className="eyebrow" data-eyebrow>
          {content.eyebrow}
        </p>
        <h2 id="built-title" data-head>
          {content.headline}
        </h2>
        <p className={styles.body} data-body>
          {content.body}
        </p>
      </div>

      <ul className={styles.nodes}>
        {apps.map((app, i) => (
          <li key={app.id} className={styles.nodeItem} style={{ left: `${X[i]}%`, '--node-accent': app.accent }}>
            <span className={styles.node} data-appnode aria-hidden="true" />
            <span className={styles.label} data-applabel>
              <span className={styles.labelName}>{app.name}</span>
              <span className={styles.labelKind}>{app.kind}</span>
            </span>
          </li>
        ))}
      </ul>
    </section>
  )
}
