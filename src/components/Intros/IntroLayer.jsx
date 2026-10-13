import { Component, Suspense, useCallback, useState } from 'react'
import { useMotionOK } from '../../hooks/useChapter'
import { intros } from './index'

// A failing intro renders nothing, so the poster underneath simply stays in view
class IntroBoundary extends Component {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  render() {
    return this.state.failed ? null : this.props.children
  }
}

// Errors an intro reports from listeners, timers or fetches are rethrown in render, so the boundary handles them like render errors
function IntroHost({ intro, ...props }) {
  const Intro = intro
  const [error, setError] = useState(null)
  const onError = useCallback((err) => setError(() => err ?? new Error('Intro failed')), [])
  if (error) throw error
  return <Intro {...props} onError={onError} />
}

// Mounts an app's coded intro; the host renders this only when near the viewport, and it stays empty without motion
export default function IntroLayer({ appId, app, media, driver, target }) {
  const motionOK = useMotionOK()
  const Intro = intros[appId]
  if (!Intro || !driver || !motionOK) return null

  return (
    <IntroBoundary>
      <Suspense fallback={null}>
        <IntroHost intro={Intro} app={app} media={media} driver={driver} target={target} />
      </Suspense>
    </IntroBoundary>
  )
}
