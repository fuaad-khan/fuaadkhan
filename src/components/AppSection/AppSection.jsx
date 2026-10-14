import Media from '../Media/Media'
import { media } from '../../content/media'

// One app's section (v2 scaffold stub): WP-B replaces this with the centered header and the highlight gallery
export default function AppSection({ app }) {
  return (
    <section id={app.id} data-section={app.id} aria-labelledby={`${app.id}-title`}>
      <h2 id={`${app.id}-title`}>{app.name}</h2>
      <p>{app.tagline}</p>
      <Media media={media[app.id]?.hero ?? null} />
    </section>
  )
}
