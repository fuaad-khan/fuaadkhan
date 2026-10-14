// App media keyed by apps[].id (shape: .wp/CONTRACTS-v2.md §4): hero (+ base) for the intros, clips keyed by highlight id; captured by scripts/capture, encoded by scripts/encode-media.mjs
// x1 / x2 are the 800 / 1600 px WebPs; width / height are the capture (or close-up) size in CSS px; view, mapRect, viewport and intro come from each hero's sidecar
// Loops are played once from their poster, the first frame, and tell their story start to end
import mmcHero1 from '../assets/map-my-city/hero.webp'
import mmcHero2 from '../assets/map-my-city/hero@2x.webp'
import { view as mmcView, mapRect as mmcMapRect, viewport as mmcViewport } from '../assets/map-my-city/hero.json'
import mmcLookupPoster1 from '../assets/map-my-city/lookup-poster.webp'
import mmcLookupPoster2 from '../assets/map-my-city/lookup-poster@2x.webp'
import mmcLookupWebm from '../assets/map-my-city/lookup.webm'
import mmcLookupMp4 from '../assets/map-my-city/lookup.mp4'
import mmcLayersPoster1 from '../assets/map-my-city/layers-poster.webp'
import mmcLayersPoster2 from '../assets/map-my-city/layers-poster@2x.webp'
import mmcLayersWebm from '../assets/map-my-city/layers.webm'
import mmcLayersMp4 from '../assets/map-my-city/layers.mp4'
import mmcMeasurePoster1 from '../assets/map-my-city/measure-poster.webp'
import mmcMeasurePoster2 from '../assets/map-my-city/measure-poster@2x.webp'
import mmcMeasureWebm from '../assets/map-my-city/measure.webm'
import mmcMeasureMp4 from '../assets/map-my-city/measure.mp4'
import mmcCreatemapPoster1 from '../assets/map-my-city/createmap-poster.webp'
import mmcCreatemapPoster2 from '../assets/map-my-city/createmap-poster@2x.webp'
import mmcCreatemapWebm from '../assets/map-my-city/createmap.webm'
import mmcCreatemapMp4 from '../assets/map-my-city/createmap.mp4'
import mmcBufferPoster1 from '../assets/map-my-city/buffer-poster.webp'
import mmcBufferPoster2 from '../assets/map-my-city/buffer-poster@2x.webp'
import mmcBufferWebm from '../assets/map-my-city/buffer.webm'
import mmcBufferMp4 from '../assets/map-my-city/buffer.mp4'
import ypHero1 from '../assets/yard-plan/hero.webp'
import ypHero2 from '../assets/yard-plan/hero@2x.webp'
import { view as ypView, mapRect as ypMapRect, viewport as ypViewport, intro as ypIntro } from '../assets/yard-plan/hero.json'
import ypBase1 from '../assets/yard-plan/base.webp'
import ypBase2 from '../assets/yard-plan/base@2x.webp'
import ypDrawPoster1 from '../assets/yard-plan/draw-poster.webp'
import ypDrawPoster2 from '../assets/yard-plan/draw-poster@2x.webp'
import ypDrawWebm from '../assets/yard-plan/draw.webm'
import ypDrawMp4 from '../assets/yard-plan/draw.mp4'
import ypCompositionPoster1 from '../assets/yard-plan/composition-poster.webp'
import ypCompositionPoster2 from '../assets/yard-plan/composition-poster@2x.webp'
import ypCompositionWebm from '../assets/yard-plan/composition.webm'
import ypCompositionMp4 from '../assets/yard-plan/composition.mp4'
import ypSharePoster1 from '../assets/yard-plan/share-poster.webp'
import ypSharePoster2 from '../assets/yard-plan/share-poster@2x.webp'
import ypShareWebm from '../assets/yard-plan/share.webm'
import ypShareMp4 from '../assets/yard-plan/share.mp4'
import gcHero1 from '../assets/green-check/hero.webp'
import gcHero2 from '../assets/green-check/hero@2x.webp'
import { view as gcView, mapRect as gcMapRect, viewport as gcViewport, intro as gcIntro } from '../assets/green-check/hero.json'
import gcBase1 from '../assets/green-check/base.webp'
import gcBase2 from '../assets/green-check/base@2x.webp'
import gcLookupPoster1 from '../assets/green-check/lookup-poster.webp'
import gcLookupPoster2 from '../assets/green-check/lookup-poster@2x.webp'
import gcLookupWebm from '../assets/green-check/lookup.webm'
import gcLookupMp4 from '../assets/green-check/lookup.mp4'
import gcBuffer1 from '../assets/green-check/buffer.webp'
import gcBuffer2 from '../assets/green-check/buffer@2x.webp'
import gcChooserPoster1 from '../assets/green-check/chooser-poster.webp'
import gcChooserPoster2 from '../assets/green-check/chooser-poster@2x.webp'
import gcChooserWebm from '../assets/green-check/chooser.webm'
import gcChooserMp4 from '../assets/green-check/chooser.mp4'
import gcVerifyPoster1 from '../assets/green-check/verify-poster.webp'
import gcVerifyPoster2 from '../assets/green-check/verify-poster@2x.webp'
import gcVerifyWebm from '../assets/green-check/verify.webm'
import gcVerifyMp4 from '../assets/green-check/verify.mp4'

const MMC = [1440, 900]
const APP = [1600, 1000]
// Yard Plan's composition and share clips are 1120 x 700 close-ups of the 1600 x 1000 capture
const CLOSE_UP = [1120, 700]

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
      lookup: loop(MMC, mmcLookupPoster1, mmcLookupPoster2, mmcLookupWebm, mmcLookupMp4, 'Looking up City Hall in Map My San Jacinto: from the street map with nothing selected, a loosely typed address, 595 south san jacinto av, brings up the City Hall suggestion; picking it zooms the map to City Hall, fills the lookup rows and opens the County Assessor panel, then Report opens the one-page property report.'),
      layers: loop(MMC, mmcLayersPoster1, mmcLayersPoster2, mmcLayersWebm, mmcLayersMp4, 'Map layers in Map My San Jacinto: a neighborhood on its 2014 aerial imagery with no layer on, then Zoning is turned on from the Layer List and the legend lists the three zones in view, then the imagery slider is dragged from 2014 to 2026 as the empty lots fill with homes.'),
      measure: loop(MMC, mmcMeasurePoster1, mmcMeasurePoster2, mmcMeasureWebm, mmcMeasureMp4, 'The Measure tool in Map My San Jacinto beside City Hall: a line along two streets reads 690 feet, then a polygon traced around the Civic Center block reads 87,810 square feet.'),
      createmap: loop(MMC, mmcCreatemapPoster1, mmcCreatemapPoster2, mmcCreatemapWebm, mmcCreatemapMp4, 'Create Map in Map My San Jacinto: a rectangle drag picks three City-owned parcels, Create Map builds the exhibit, a hatch fill and the Planning template are applied, and the sheet scrolls to its title block with the City seal.'),
      buffer: loop(MMC, mmcBufferPoster1, mmcBufferPoster2, mmcBufferWebm, mmcBufferMp4, 'A 300-foot proximity buffer around a school parcel in Map My San Jacinto, then the Avery mailing labels with private owners blurred and public agencies readable, then the printable site map with the 300-foot radius.'),
    },
  },
  'yard-plan': {
    hero: still(APP, ypHero1, ypHero2, 'Yard Plan in dark mode at City Hall: a turf strip and a concrete area traced on aerial imagery, with the Yard Composition panel showing their square footage and the concrete share.', { ...ypCamera, intro: ypIntro }),
    base: still(APP, ypBase1, ypBase2, 'Aerial imagery of the City Hall parcel in Yard Plan’s dark mode, the backdrop of the Yard Plan intro.', ypCamera),
    clips: {
      draw: loop(APP, ypDrawPoster1, ypDrawPoster2, ypDrawWebm, ypDrawMp4, 'Drawing in Yard Plan’s dark mode: four corners trace a turf strip, then a concrete area whose corner snaps to the turf’s corner, and the panel tallies 1,914 square feet of turf, 3,544 of concrete and 65 percent concrete.'),
      composition: loop(CLOSE_UP, ypCompositionPoster1, ypCompositionPoster2, ypCompositionWebm, ypCompositionMp4, 'Close-up of Yard Plan’s Yard Composition panel in dark mode: a corner of the concrete area is dragged out while the rows, the total and the donut follow live, from 65 to 71 percent concrete.'),
      share: loop(CLOSE_UP, ypSharePoster1, ypSharePoster2, ypShareWebm, ypShareMp4, 'Close-up of Yard Plan’s Download and Share panel in dark mode: PDF report, GeoJSON, Copy Link and Print, then Copy Link and the confirmation that the shareable link was copied.'),
    },
  },
  'green-check': {
    hero: still(APP, gcHero1, gcHero2, 'Green Check after a hand measurement on aerial imagery: the line from the building to the neighboring lot reads 101 feet, and the Microbusiness verdict reads Eligible, the residence row marked Measured by hand.', { ...gcCamera, intro: gcIntro }),
    base: still(APP, gcBase1, gcBase2, 'Aerial imagery around 438 S State St, the backdrop of the Green Check intro.', gcCamera),
    clips: {
      lookup: loop(APP, gcLookupPoster1, gcLookupPoster2, gcLookupWebm, gcLookupMp4, 'Green Check: Manufacturing is picked as the license type, a misspelled address is typed, the corrected suggestion for an industrial parcel is chosen, and the verdict reads Eligible with every requirement met.'),
      buffer: still(APP, gcBuffer1, gcBuffer2, 'Green Check’s automatic verdict at 438 S State St: Not Eligible for Microbusiness, the building 95 feet from a residence, with the measured line and the 100-foot exclusion zone on the map.'),
      chooser: loop(APP, gcChooserPoster1, gcChooserPoster2, gcChooserWebm, gcChooserMp4, 'Green Check at a commercial parcel with three buildings: hovering two rows of the list highlights their buildings on the map, hovering the largest building on the map highlights its row, then that building is chosen and the verdict reads Eligible.'),
      verify: loop(APP, gcVerifyPoster1, gcVerifyPoster2, gcVerifyWebm, gcVerifyMp4, 'Verifying a distance in Green Check: from Not Eligible at 95 feet, the line’s far endpoint is dragged to the property line, the distance reads 101 feet, and after Complete the verdict changes to Eligible.'),
    },
  },
}
