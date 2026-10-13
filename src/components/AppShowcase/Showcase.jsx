import AppIntro from '../AppIntro/AppIntro'
import AppFeatures from '../AppFeatures/AppFeatures'
import { accentVar } from '../../styles/accent'

// Placeholder until the Showcase shell lands: the interim pinned intro + features pair, sharing one accent
export default function Showcase({ app }) {
  return (
    <div style={{ '--app-accent': accentVar(app.accent) }}>
      <AppIntro app={app} />
      <AppFeatures app={app} />
    </div>
  )
}
