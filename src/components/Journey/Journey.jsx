import Hero from '../Hero/Hero'
import Timeline from '../Timeline/Timeline'

// Placeholder until the Journey section lands: the interim Hero and pinned Timeline, unchanged
export default function Journey({ site, stops }) {
  return (
    <>
      <Hero site={site} />
      <Timeline stops={stops} />
    </>
  )
}
