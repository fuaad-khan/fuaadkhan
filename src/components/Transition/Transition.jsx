import { useRef } from 'react'
import { useChapter, reducedFade, gsap } from '../../hooks/useChapter'
import Rail from '../Rail/Rail'
import DeviceFrame from '../Media/DeviceFrame'
import Media from '../Media/Media'
import { media } from '../../content/media'
import { accentVar } from '../../styles/accent'
import { WIDE_SCREEN } from '../AppShowcase/layout'
import styles from './Transition.module.css'

// Pin timeline (PLAN §5.2): the fill runs 0 → 1, each card follows its node, then a short hold before release
const CARD_DELAY = 0.02
const HOLD = 0.16

export default function Transition({ content, apps }) {
  const ref = useRef(null)
  // The rail recolours from the career gold into the first showcase's accent so the line runs on unbroken
  const railFill = `linear-gradient(var(--accent), ${accentVar(apps[0]?.accent)})`

  useChapter(
    ref,
    (tl, q, el) => {
      tl.fromTo(q('[data-rail]'), { scaleY: 0 }, { scaleY: 1, duration: 1 }, 0)
      // Each app's node lights where the fill (0 → 1 down the section) reaches it; connector and card follow
      const box = el.getBoundingClientRect()
      q('[data-card-item]').forEach((item) => {
        const node = item.querySelector('[data-card-node]')
        const r = node.getBoundingClientRect()
        const at = gsap.utils.clamp(0, 0.9, (r.top + r.height / 2 - box.top) / box.height)
        // fromTo mirrors the hidden states declared in CSS, so first paint and the timeline agree
        tl.fromTo(node.firstElementChild, { scale: 0 }, { scale: 1, duration: 0.04, ease: 'power2.out' }, at)
          .fromTo(item.querySelector('[data-connector]'), { scaleX: 0 }, { scaleX: 1, duration: 0.08, ease: 'power1.inOut' }, at)
          .fromTo(item.querySelector('[data-card]'), { autoAlpha: 0, x: 48 }, { autoAlpha: 1, x: 0, duration: 0.18, ease: 'power2.out' }, at + CARD_DELAY)
      })
      tl.to({}, { duration: HOLD })
    },
    { pin: true, length: 0.9, conditions: { wide: WIDE_SCREEN }, reduced: reducedFade },
  )

  return (
    <section ref={ref} className={styles.chapter} aria-labelledby="built-title">
      <Rail style={{ '--rail-fill': railFill }} />

      <div className={styles.text}>
        <p className="eyebrow">{content.eyebrow}</p>
        <h2 id="built-title" className={styles.headline}>
          {content.headline}
        </h2>
        <p className={styles.body}>{content.body}</p>
      </div>

      <ol className={styles.cards}>
        {apps.map((app) => (
          <li key={app.id} className={styles.item} style={{ '--card-accent': accentVar(app.accent) }} data-card-item data-fade>
            <span className={styles.connector} data-connector aria-hidden="true" />
            <span className={styles.node} data-card-node aria-hidden="true">
              <span className={styles.nodeFill} />
            </span>
            <div className={styles.card} data-card>
              <div className={styles.thumb}>
                <DeviceFrame accent={app.accent} className={styles.mini}>
                  <Media media={media[app.id]?.hero ?? null} alt="" sizes="440px" />
                </DeviceFrame>
              </div>
              <div className={styles.info}>
                <p className={styles.name}>{app.name}</p>
                <p className={styles.kind}>{app.kind}</p>
                <p className={styles.status}>{app.status}</p>
              </div>
            </div>
          </li>
        ))}
      </ol>
    </section>
  )
}
