import Hero from './components/Hero/Hero'
import Timeline from './components/Timeline/Timeline'
import Transition from './components/Transition/Transition'
import AppShowcase from './components/AppShowcase/AppShowcase'
import Close from './components/Close/Close'
import { site } from './content/site'
import { timeline } from './content/timeline'
import { apps } from './content/apps'

export default function App() {
  return (
    <main>
      <Hero site={site} />
      <Timeline stops={timeline} />
      <Transition content={site.transition} apps={apps} />
      {apps.map((app) => (
        <AppShowcase key={app.id} app={app} />
      ))}
      <Close site={site} />
    </main>
  )
}
