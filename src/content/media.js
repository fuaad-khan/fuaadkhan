// App media keyed by apps[].id (shape: .wp/CONTRACTS-v2.md §4): hero (+ base) for the intros, clips keyed by highlight id; captured by scripts/capture, encoded by scripts/encode-media.mjs
// x1 / x2 are the 800 / 1600 px WebPs; width / height are the capture viewport in CSS px; view, mapRect, viewport and intro come from each hero's sidecar
import mmcHero1 from '../assets/map-my-city/hero.webp'
import mmcHero2 from '../assets/map-my-city/hero@2x.webp'
import { view as mmcView, mapRect as mmcMapRect, viewport as mmcViewport } from '../assets/map-my-city/hero.json'
import mmcF1Poster1 from '../assets/map-my-city/f1-poster.webp'
import mmcF1Poster2 from '../assets/map-my-city/f1-poster@2x.webp'
import mmcF1Webm from '../assets/map-my-city/f1.webm'
import mmcF1Mp4 from '../assets/map-my-city/f1.mp4'
import mmcF2Poster1 from '../assets/map-my-city/f2-poster.webp'
import mmcF2Poster2 from '../assets/map-my-city/f2-poster@2x.webp'
import mmcF2Webm from '../assets/map-my-city/f2.webm'
import mmcF2Mp4 from '../assets/map-my-city/f2.mp4'
import mmcF31 from '../assets/map-my-city/f3.webp'
import mmcF32 from '../assets/map-my-city/f3@2x.webp'
import ypHero1 from '../assets/yard-plan/hero.webp'
import ypHero2 from '../assets/yard-plan/hero@2x.webp'
import { view as ypView, mapRect as ypMapRect, viewport as ypViewport, intro as ypIntro } from '../assets/yard-plan/hero.json'
import ypBase1 from '../assets/yard-plan/base.webp'
import ypBase2 from '../assets/yard-plan/base@2x.webp'
import ypF1Poster1 from '../assets/yard-plan/f1-poster.webp'
import ypF1Poster2 from '../assets/yard-plan/f1-poster@2x.webp'
import ypF1Webm from '../assets/yard-plan/f1.webm'
import ypF1Mp4 from '../assets/yard-plan/f1.mp4'
import ypF21 from '../assets/yard-plan/f2.webp'
import ypF22 from '../assets/yard-plan/f2@2x.webp'
import ypF31 from '../assets/yard-plan/f3.webp'
import ypF32 from '../assets/yard-plan/f3@2x.webp'
import gcHero1 from '../assets/green-check/hero.webp'
import gcHero2 from '../assets/green-check/hero@2x.webp'
import { view as gcView, mapRect as gcMapRect, viewport as gcViewport, intro as gcIntro } from '../assets/green-check/hero.json'
import gcBase1 from '../assets/green-check/base.webp'
import gcBase2 from '../assets/green-check/base@2x.webp'
import gcF11 from '../assets/green-check/f1.webp'
import gcF12 from '../assets/green-check/f1@2x.webp'
import gcF21 from '../assets/green-check/f2.webp'
import gcF22 from '../assets/green-check/f2@2x.webp'
import gcF3Poster1 from '../assets/green-check/f3-poster.webp'
import gcF3Poster2 from '../assets/green-check/f3-poster@2x.webp'
import gcF3Webm from '../assets/green-check/f3.webm'
import gcF3Mp4 from '../assets/green-check/f3.mp4'

const MMC = [1440, 900]
const APP = [1600, 1000]

const still = ([width, height], x1, x2, alt, extra = {}) => ({ kind: 'still', alt, width, height, poster: { x1, x2 }, ...extra })

// WebM (VP9) first for the browsers that take it, MP4 (H.264) for the rest; reduced motion shows the poster
const loop = ([width, height], x1, x2, webm, mp4, alt) => ({
  kind: 'loop',
  alt,
  width,
  height,
  poster: { x1, x2 },
  sources: [
    { src: webm, type: 'video/webm; codecs=vp9' },
    { src: mp4, type: 'video/mp4' },
  ],
  reduced: 'poster',
})

const mmcCamera = { view: mmcView, mapRect: mmcMapRect, viewport: mmcViewport }
const ypCamera = { view: ypView, mapRect: ypMapRect, viewport: ypViewport }
const gcCamera = { view: gcView, mapRect: gcMapRect, viewport: gcViewport }

export const media = {
  'map-my-city': {
    hero: still(MMC, mmcHero1, mmcHero2, 'Map My San Jacinto with City Hall selected on aerial imagery: County assessor details on the left, and the parcel lookup listing zoning, districts and city services on the right.', mmcCamera),
    clips: {
      lookup: loop(MMC, mmcF1Poster1, mmcF1Poster2, mmcF1Webm, mmcF1Mp4, 'Searching an address in Map My San Jacinto: the suggestion is picked, the map zooms to City Hall, the lookup rows fill, and the one-page property report opens.'),
      layers: loop(MMC, mmcF2Poster1, mmcF2Poster2, mmcF2Webm, mmcF2Mp4, 'The zoning layer and its legend over a San Jacinto neighborhood while the imagery slider steps from 2014 to 2026: empty lots fill with homes and a school campus appears.'),
      buffer: still(MMC, mmcF31, mmcF32, 'A 300-foot proximity buffer around a school parcel, with the buffer panel offering a parcel export and Avery 5160 mailing labels.'),
    },
  },
  'yard-plan': {
    hero: still(APP, ypHero1, ypHero2, 'Yard Plan at City Hall: a turf strip and a concrete area traced on aerial imagery, with the Yard Composition panel showing their square footage and the concrete share.', { ...ypCamera, intro: ypIntro }),
    base: still(APP, ypBase1, ypBase2, 'Aerial imagery of the City Hall parcel, the backdrop of the Yard Plan intro.', ypCamera),
    clips: {
      draw: loop(APP, ypF1Poster1, ypF1Poster2, ypF1Webm, ypF1Mp4, 'Drawing a concrete area in Yard Plan: its corners snap to the turf outline, the shape closes, and the area rows and donut update.'),
      composition: still([960, 600], ypF21, ypF22, 'Close-up of the Yard Composition panel beside the drawn areas: square footage and share for turf and concrete, and the total drawn.'),
      share: still(APP, ypF31, ypF32, 'Yard Plan’s Share panel: download a PDF report or GeoJSON, copy a link that carries the drawing, or print.'),
    },
  },
  'green-check': {
    hero: still(APP, gcHero1, gcHero2, 'Green Check after a hand measurement on aerial imagery: the line from the building to the neighboring lot reads 101 feet, and the Microbusiness verdict reads Eligible, the residence row marked Measured by hand.', { ...gcCamera, intro: gcIntro }),
    base: still(APP, gcBase1, gcBase2, 'Aerial imagery around 438 S State St, the backdrop of the Green Check intro.', gcCamera),
    clips: {
      lookup: still(APP, gcF11, gcF12, 'Green Check’s instant verdict for an industrial parcel: Eligible for Manufacturing, with every requirement met.'),
      buffer: still(APP, gcF21, gcF22, 'Green Check’s automatic verdict at 438 S State St: Not Eligible for Microbusiness, the building 95 feet from a residence, with the measured line and the 100-foot exclusion zone on the map.'),
      verify: loop(APP, gcF3Poster1, gcF3Poster2, gcF3Webm, gcF3Mp4, 'Verifying a distance in Green Check: the line’s far endpoint is dragged to the property line, the distance reads 101 feet, and the verdict changes to Eligible.'),
    },
  },
}
