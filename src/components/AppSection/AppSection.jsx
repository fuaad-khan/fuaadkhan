import Gallery from '../Gallery/Gallery'
import { fill } from '../Intros/values'
import { apps } from '../../content/apps'
import { site } from '../../content/site'
import { accentVar } from '../../styles/accent'
import styles from './AppSection.module.css'

// Where the gallery's end cue leads: the next app's section, or Contact after the last app
function nextFor(app) {
  const following = apps[apps.findIndex((a) => a.id === app.id) + 1]
  const name = following ? following.name : site.nav.contact
  return {
    href: following ? `#${following.id}` : '#contact',
    label: fill(site.ui.gallery.next, { name }),
    accent: following ? following.accent : 'gold',
  }
}

// One app, sized to a viewport under the nav: centred kind, status and name, the tagline, then its highlight gallery
export default function AppSection({ app }) {
  const titleId = `${app.id}-title`
  return (
    <section
      id={app.id}
      data-section={app.id}
      aria-labelledby={titleId}
      className={styles.section}
      style={{ '--app-accent': accentVar(app.accent) }}
    >
      <header className={styles.header}>
        <div className={styles.kicker}>
          <p className={`eyebrow ${styles.kind}`}>{app.kind}</p>
          <p className={styles.status}>{app.status}</p>
        </div>
        <h2 id={titleId} className={styles.title}>
          {app.name}
        </h2>
        {app.tagline && <p className={styles.tagline}>{app.tagline}</p>}
      </header>
      <Gallery app={app} next={nextFor(app)} />
    </section>
  )
}
