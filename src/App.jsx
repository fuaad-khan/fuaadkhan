import TopoBackground from './components/TopoBackground/TopoBackground'
import Nav from './components/Nav/Nav'
import Journey from './components/Journey/Journey'
import Applications from './components/Applications/Applications'
import AppSection from './components/AppSection/AppSection'
import Close from './components/Close/Close'
import { site } from './content/site'
import { timeline } from './content/timeline'
import { apps } from './content/apps'

export default function App() {
  return (
    <>
      <TopoBackground />
      <Nav site={site} apps={apps} />
      <main>
        <Journey site={site} stops={timeline} />
        <Applications content={site.applications} apps={apps} />
        {apps.map((app) => (
          <AppSection key={app.id} app={app} />
        ))}
      </main>
      <Close site={site} />
    </>
  )
}
