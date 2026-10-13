import TopoBackground from './components/TopoBackground/TopoBackground'
import Journey from './components/Journey/Journey'
import Transition from './components/Transition/Transition'
import Showcase from './components/AppShowcase/Showcase'
import Close from './components/Close/Close'
import { site } from './content/site'
import { timeline } from './content/timeline'
import { apps } from './content/apps'

export default function App() {
  return (
    <>
      <TopoBackground />
      <main>
        <Journey site={site} stops={timeline} />
        <Transition content={site.transition} apps={apps} />
        {apps.map((app) => (
          <Showcase key={app.id} app={app} />
        ))}
      </main>
      <Close site={site} />
    </>
  )
}
