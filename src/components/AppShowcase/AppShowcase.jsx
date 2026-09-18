import AppIntro from '../AppIntro/AppIntro'
import AppFeatures from '../AppFeatures/AppFeatures'

// Two pinned chapters per app, sharing one accent
export default function AppShowcase({ app }) {
  return (
    <div style={{ '--app-accent': app.accent }}>
      <AppIntro app={app} />
      <AppFeatures app={app} />
    </div>
  )
}
