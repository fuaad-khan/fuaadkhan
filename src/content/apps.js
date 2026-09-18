import gcHome from '../assets/green-check/smoke-final.webp'
import gcPass from '../assets/green-check/eligibility-pass.webp'
import gcFail from '../assets/green-check/eligibility-fail.webp'

// Application showcases, in page order. media: { type: 'image' | 'video' | 'placeholder', src, alt, width, height }
export const apps = [
  {
    id: 'map-my-city',
    name: 'Map My City',
    kind: 'Parcel lookup',
    status: 'In production',
    accent: '#5ea8ff',
    tagline: 'Every parcel, one search.',
    problem: 'Residents and staff need fast, self-serve answers about any parcel: zoning, city services, hazards, and assessor records in one place.',
    audience: 'Residents, planners, and permit staff at the City of San Jacinto.',
    hero: { type: 'placeholder' },
    features: [
      {
        title: 'Parcel query and property reports',
        body: 'Search by address or APN, or click any parcel, and print a one-page property report.',
        media: null,
      },
      {
        title: 'Layers, legend, and measurement',
        body: 'Zoning, land use, and hazard zones with a legend that tracks what’s visible. Measure distance and area on the fly.',
        media: null,
      },
      {
        title: 'Proximity buffer and mailing labels',
        body: 'Draw a radius around a parcel, export the neighbors, and print Avery 5160 labels for hearing notices.',
        media: null,
      },
    ],
    stack: ['JavaScript', 'Leaflet', 'Esri Leaflet', 'Turf.js', 'MapTiler', 'esbuild'],
    links: {
      repo: { label: 'Repository', href: 'https://github.com/fuaad-khan/mapMyCity' },
    },
  },
  {
    id: 'yard-plan',
    name: 'Yard Plan',
    kind: 'Residential yard drafting',
    status: 'Shipped · redesign in progress',
    accent: '#e08a5a',
    tagline: 'Sketch a front yard without CAD.',
    problem: 'Homeowners need to show the Planning Department how much of a front yard will be turf versus hardscape, without learning CAD.',
    audience: 'San Jacinto residents planning a front yard, and the planning staff who review it.',
    hero: { type: 'placeholder' },
    features: [
      {
        title: 'Draw to scale on your own parcel',
        body: 'Find the property by address or APN, then trace turf and hardscape on aerial imagery with snapping and vertex editing.',
        media: null,
      },
      {
        title: 'Live composition',
        body: 'Square footage per type, total area, and the concrete percentage update as you draw.',
        media: null,
      },
      {
        title: 'Export and share the plan',
        body: 'Download a PDF or GeoJSON, print, or send a permalink that carries the whole drawing. Staff upload it back for review.',
        media: null,
      },
    ],
    stack: ['JavaScript', 'Leaflet', 'Leaflet Draw', 'Esri Leaflet', 'Turf.js', 'jsPDF', 'Nearmap imagery'],
    links: {
      repo: { label: 'Repository', href: 'https://github.com/fuaad-khan/YardPlan' },
    },
  },
  {
    id: 'green-check',
    name: 'Green Check',
    kind: 'Cannabis site eligibility',
    status: 'In development',
    accent: '#6fcf97',
    tagline: 'Can a cannabis business go here?',
    problem: 'Answering that means cross-referencing zoning and buffer rules by hand. Green Check does it in one search.',
    audience: 'City planners, code enforcement, and prospective cannabis and alcohol license applicants.',
    hero: { type: 'image', src: gcHome, alt: 'Green Check home screen: a parcel map of San Jacinto with a search bar, license type picker, and legend.', width: 1385, height: 805 },
    features: [
      {
        title: 'Address lookup, instant verdict',
        body: 'Pick a license type, search an address or APN, and get an eligible or not-eligible answer under the city’s Development Code.',
        media: { type: 'image', src: gcPass, alt: 'Green Check showing an eligibility result and property details for an industrial parcel.', width: 1385, height: 805 },
      },
      {
        title: 'Buffer checks against sensitive uses',
        body: 'Distances run from building footprint to property line for schools, day cares, youth centers, and homes. A failed rule draws the measurement on the map.',
        media: { type: 'image', src: gcFail, alt: 'Green Check drawing a 4 ft measurement line between a parcel and a neighboring residence.', width: 1385, height: 805 },
      },
      {
        title: 'Plain-language reasons',
        body: 'Every verdict lists which rule passed or failed and why, with the offending distance in feet.',
        media: { type: 'image', src: gcFail, alt: 'Green Check result panel explaining a zoning restriction and a too-close-to-residence failure.', width: 1385, height: 805 },
      },
    ],
    stack: ['React', 'Vite', 'Leaflet', 'Esri Leaflet', 'Turf.js', 'MapTiler', 'Overture building footprints'],
    links: {
      repo: { label: 'Repository', href: 'https://github.com/fuaad-khan/GreenCheck' },
    },
  },
]
