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

// One app: its centred name, then the tagline with the status chip on the same line, then its highlight gallery
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
        <h2 id={titleId} className={styles.title}>
          {app.name}
        </h2>
        <div className={styles.subline}>
          {app.tagline && <p className={styles.tagline}>{app.tagline}</p>}
          <p className={styles.status}>{app.status}</p>
        </div>
      </header>
      <Gallery app={app} next={nextFor(app)} />
    </section>
  )
}
