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
// Stacked (narrow) layouts: the first and last card arrive at these points of the pin instead of where the nodes sit
const CARDS_EARLY = [0.1, 0.7]
// Thumbnail widths from Transition.module.css (--thumb-w): clamp(6.75rem, 30vw, 15rem) when narrow, at most 27.5rem beside the rail
const THUMB_SIZES = '(max-width: 479px) 120px, (max-width: 1023px) 240px, 340px'

export default function Transition({ content, apps }) {
  const ref = useRef(null)
  // The rail recolours from the career gold into the first showcase's accent so the line runs on unbroken
  const railFill = `linear-gradient(var(--accent), ${accentVar(apps[0]?.accent)})`

  useChapter(
    ref,
    (tl, q, el, { wide }) => {
      const [rail] = q('[data-rail]')
      const items = q('[data-card-item]')
      // Where each app's node sits down the section (0 → 1), which is where the linear rail fill reaches it
      const box = el.getBoundingClientRect()
      const pos = items.map((item) => {
        const r = item.querySelector('[data-card-node]').getBoundingClientRect()
        return gsap.utils.clamp(0, 0.9, (r.top + r.height / 2 - box.top) / box.height)
      })
      const first = pos[0]
      const last = pos[pos.length - 1]
      // Stacked layouts put the nodes low in the pinned screen, so the fill hurries to the first and the cards spread over CARDS_EARLY
      const early = !wide && last > first
      const times = early ? pos.map((p) => CARDS_EARLY[0] + ((CARDS_EARLY[1] - CARDS_EARLY[0]) * (p - first)) / (last - first)) : pos
      if (early) {
        const end = times[times.length - 1]
        tl.fromTo(rail, { scaleY: 0 }, { scaleY: first, duration: times[0] }, 0)
          .to(rail, { scaleY: last, duration: end - times[0] }, times[0])
          .to(rail, { scaleY: 1, duration: 1 - end }, end)
      } else {
        tl.fromTo(rail, { scaleY: 0 }, { scaleY: 1, duration: 1 }, 0)
      }
      // Each node lights as the fill reaches it; connector and card follow
      items.forEach((item, i) => {
        const node = item.querySelector('[data-card-node]')
        const at = times[i]
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
                  <Media media={media[app.id]?.hero ?? null} alt="" sizes={THUMB_SIZES} />
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
