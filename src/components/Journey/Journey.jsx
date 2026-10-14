import { useRef } from 'react'
import MapInset from '../MapInset/MapInset'
import Timeline from '../Timeline/Timeline'
import { useDrawOnView } from './useDrawOnView'
import { useRise } from './useRise'
import styles from './Journey.module.css'

// The Journey: a centred heading, the career map that draws its route once in view, and the three stops as cards below it
export default function Journey({ site, stops }) {
  const mapRef = useRef(null)
  const cardsRef = useRef(null)

  useDrawOnView(mapRef)
  useRise(cardsRef)

  // Lights the pin of the stop whose card is under the pointer (null clears it)
  const pointStop = (index) => {
    for (const pin of mapRef.current?.querySelectorAll('[data-pin]') ?? []) pin.toggleAttribute('data-on', pin.dataset.pin === index)
  }

  return (
    <section id="journey" data-section="journey" className={styles.journey} aria-labelledby="journey-title">
      <div className="section-head">
        <p className="eyebrow">{site.journey.eyebrow}</p>
        <h2 id="journey-title">{site.journey.heading}</h2>
        <p>{site.journey.body}</p>
      </div>
      <div className={styles.map}>
        <MapInset ref={mapRef} stops={stops} journey={site.journey} />
      </div>
      <div ref={cardsRef} className={styles.cards}>
        <Timeline stops={stops} label={site.ui.careerTimeline} onPointStop={pointStop} />
      </div>
    </section>
  )
}
