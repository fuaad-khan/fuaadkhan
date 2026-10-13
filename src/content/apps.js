// Showcases in page order: accent is a token, media lives in media.js by id, links stays empty (repos are private)
// intro feeds the coded intros: {key} placeholders are filled from intro.values, which the capture sidecar overrides (Intros/values.js)
export const apps = [
  {
    id: 'map-my-city',
    name: 'Map My City',
    kind: 'Parcel lookup',
    status: 'In production · internal',
    deployedAs: 'Map My San Jacinto · City of San Jacinto',
    accent: 'map',
    frameTitle: 'Map My San Jacinto',
    tagline: 'Every parcel, one search.',
    problem: 'Residents and staff need fast, self-serve answers about any parcel: zoning, city services, hazards, and assessor records in one place.',
    audience: 'Residents, planners, and permit staff at the City of San Jacinto.',
    metrics: [
      { value: '18,459', label: 'parcels' },
      { value: '22', label: 'parallel queries per click' },
      { value: '54', label: 'imagery dates, 2014–2026' },
    ],
    features: [
      {
        title: 'Parcel query and property reports',
        body: 'Search by address or APN, or click any parcel, and print a one-page property report.',
      },
      {
        title: 'Layers, legend, and imagery history',
        body: 'Zoning, land use, and hazard layers with a legend that tracks what’s visible. Measure on the fly, or scrub aerial imagery back to 2014.',
      },
      {
        title: 'Proximity buffer and mailing labels',
        body: 'Draw a radius around a parcel, export the neighbors, and print Avery 5160 labels for hearing notices.',
      },
    ],
    stack: ['JavaScript', 'Leaflet', 'Esri Leaflet', 'Turf.js', 'MapTiler', 'esbuild'],
    intro: {
      captions: ['City limits', 'Streets', 'Parcels'],
      rows: [],
      labels: {
        lockup: 'Map My San Jacinto',
        subtitle: 'Property information for every parcel in the city',
      },
    },
    links: {},
  },
  {
    id: 'yard-plan',
    name: 'Yard Plan',
    kind: 'Residential yard drafting',
    status: 'In development',
    accent: 'yard',
    frameTitle: 'Yard Plan',
    tagline: 'Sketch a front yard without CAD.',
    problem: 'Homeowners need to show the Planning Department how much of a front yard will be turf versus hardscape, without learning CAD.',
    audience: 'San Jacinto residents planning a front yard, and the planning staff who review it.',
    metrics: [
      { value: '13', label: 'JavaScript modules' },
      { value: '0', label: 'frameworks' },
      { value: '~1,200', label: 'characters to link a 10-shape plan' },
    ],
    features: [
      {
        title: 'Draw to scale on your own parcel',
        body: 'Find the property by address or APN, then trace turf and hardscape on aerial imagery with snapping and vertex editing.',
      },
      {
        title: 'Live composition',
        body: 'Square footage per type, total area, and the concrete percentage update as you draw.',
      },
      {
        title: 'Export and share the plan',
        body: 'Download a PDF or GeoJSON, print, or send a permalink that carries the whole drawing. Staff upload it back for review.',
      },
    ],
    stack: ['JavaScript', 'Leaflet', 'Leaflet Draw', 'Esri Leaflet', 'Turf.js', 'jsPDF', 'Nearmap imagery'],
    intro: {
      captions: [],
      // Demo plan until the capture sidecar supplies the real areas (sq ft) and shares (%)
      values: { turf: 1240, concrete: 610, total: 1850, turfPct: 67, pct: 33 },
      rows: [
        { label: 'Turf', value: '{turf} sq ft', pct: '{turfPct}%' },
        { label: 'Concrete', value: '{concrete} sq ft', pct: '{pct}%' },
        { label: 'Total drawn', value: '{total} sq ft' },
      ],
      labels: {
        turf: 'Turf 1',
        turfArea: '{turf} sq ft',
        concrete: 'Concrete 1',
        concreteArea: '{concrete} sq ft',
        donutValue: '{pct}%',
        donutLabel: 'Concrete',
      },
    },
    links: {},
  },
  {
    id: 'green-check',
    name: 'Green Check',
    kind: 'Cannabis site eligibility',
    status: 'Pilot · internal preview',
    accent: 'green',
    frameTitle: 'Green Check',
    tagline: 'Can a cannabis business go here?',
    problem: 'Checking whether a cannabis business can open at an address means cross-referencing zoning and buffer rules by hand. Green Check does it in one search.',
    audience: 'City planners, code enforcement, and prospective cannabis and alcohol license applicants.',
    metrics: [
      { value: '~2 s', label: 'from address to verdict' },
      { value: '20,211', label: 'building footprints' },
      { value: '226', label: 'automated tests' },
    ],
    features: [
      {
        title: 'Address lookup, instant verdict',
        body: 'Pick one of 10 license types, search an address or APN, and get Eligible, Not Eligible, or Needs More Data under the city’s Development Code.',
      },
      {
        title: 'Buffer checks against sensitive uses',
        body: 'Distances run from building footprint to property line for schools, day cares, youth centers, and homes. Every rule is explained in plain language; failed distances are drawn on the map.',
      },
      {
        title: 'Disagree? Measure it yourself.',
        body: 'Auto-measured at 95 ft from a home, the site fails. Measure by hand to the property line: at 100 ft or more, the verdict turns Eligible, stamped “Measured by hand.”',
      },
    ],
    stack: ['React', 'Vite', 'Leaflet', 'Esri Leaflet', 'Turf.js', 'MapTiler', 'Overture building footprints'],
    footnote: 'Results do not constitute a zoning determination.',
    intro: {
      captions: [],
      // Demo distances (ft) until the capture sidecar supplies the measured ones
      values: { auto: 95, hand: 101 },
      rows: [
        { id: 'cityLimits', status: 'pass', title: 'Inside San Jacinto city limits' },
        { id: 'zoning', status: 'pass', title: 'Zoning permits microbusiness' },
        {
          id: 'residential',
          status: 'fail',
          title: 'Too Close to a Residence',
          detail: '{auto} ft from the building to the property line; 100 ft required.',
          verifiedTitle: 'At least 100 ft from any residential dwelling',
          verifiedDetail: 'Verified on the map: {hand} ft from the building (the app measured {auto} ft); 100 ft required.',
        },
        { id: 'school', status: 'pass', title: 'At least 600 ft from any K-12 school' },
        { id: 'dayCare', status: 'pass', title: 'At least 600 ft from any day care center' },
        { id: 'youthCenter', status: 'pass', title: 'At least 600 ft from any youth center' },
      ],
      labels: {
        address: '438 S State St',
        licenseType: 'Microbusiness',
        verdictBefore: 'Not Eligible',
        verdictAfter: 'Eligible',
        why: 'Why?',
        allMet: 'All requirements met',
        autoFeet: '{auto} ft',
        handFeet: '{hand} ft',
        verify: 'Verify distance',
        complete: 'Complete',
        stamp: 'Measured by hand',
        result: 'Eligibility Result',
        checking: 'Checking…',
        verdictSub: 'for {licenseType} use',
        passed: 'Passed requirements ({count})',
        verifyHint: 'Disagree with this distance? Re-measure it on the map.',
        dragHint: 'Drag the line’s endpoints on the map, then complete.',
        cancel: 'Cancel',
        reset: 'Reset',
      },
      // App chrome the intro draws only while no base still exists (media.js 'green-check'.base)
      chrome: {
        tagline: 'Cannabis and Alcohol Business Eligibility',
        nav: ['Home', 'Layers', 'Measure', 'Guidelines', 'About'],
        licenseLabel: 'License type',
        street: 'State St',
      },
    },
    links: {},
  },
]
