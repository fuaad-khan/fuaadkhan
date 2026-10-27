import { lazy } from 'react'

export { createDriver } from './driver'
export { fill, introValues } from './values'

// One lazily loaded intro per app id; each renders as a pure function of its driver's t
export const intros = {
  'map-my-city': lazy(() => import('./CityDraw/CityDraw.jsx')),
  'green-check': lazy(() => import('./MeasuredLine/MeasuredLine.jsx')),
}
