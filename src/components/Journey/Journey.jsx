import { useRef } from 'react'
import MapInset from '../MapInset/MapInset'
import Timeline from '../Timeline/Timeline'
import { useDrawOnView } from './useDrawOnView'
import { useRise } from './useRise'
import styles from './Journey.module.css'

// The Journey: a centred heading, the career map that draws its route once in view, and the three stops as cards below it; each rises in one after another
export default function Journey({ site, stops }) {
  const ref = useRef(null)
  const mapRef = useRef(null)

  useRise(ref, { stagger: 0.15 })
  useDrawOnView(mapRef)

  // Lights the pin of the stop whose card is under the pointer (null clears it)
  const pointStop = (index) => {
    for (const pin of mapRef.current?.querySelectorAll('[data-pin]') ?? []) pin.toggleAttribute('data-on', pin.dataset.pin === index)
  }

  return (
    <section ref={ref} id="journey" data-section="journey" className={styles.journey} aria-labelledby="journey-title">
      <div className="section-head">
        <p className="eyebrow" data-reveal>
          {site.journey.eyebrow}
        </p>
        <h2 id="journey-title" data-reveal>
          {site.journey.heading}
        </h2>
        <p data-reveal>{site.journey.body}</p>
      </div>
      <div className={styles.map} data-reveal>
        <MapInset ref={mapRef} stops={stops} journey={site.journey} sep={site.ui.sep} />
      </div>
      <div className={styles.cards}>
        <Timeline stops={stops} label={site.ui.careerTimeline} onPointStop={pointStop} />
      </div>
    </section>
  )
}
