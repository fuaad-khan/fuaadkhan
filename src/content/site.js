/* global __BUILD_YEAR__ */
// Site-wide copy: hero, UI labels, journey map, transition chapter, close, footer

// Stamped by vite.config.js at build time so the prerendered footer and the hydrated one always agree
const year = typeof __BUILD_YEAR__ === 'undefined' ? new Date().getFullYear() : __BUILD_YEAR__

export const site = {
  name: 'Fuaad Khan',
  eyebrow: 'Portfolio',
  identity: ['GIS Supervisor', 'GIS Developer', 'Inland Empire, CA'],
  lede: 'I build enterprise GIS infrastructure and the web mapping applications that run on it. Six-plus years in public-sector GIS, from sole GIS staff to supervisor.',

  ui: {
    builtFor: 'Built for',
    featuresLabel: 'Features',
    scroll: 'Scroll',
    pauseLoop: 'Pause animation',
    playLoop: 'Play animation',
    careerTimeline: 'Career timeline',
    illustration: 'Illustration',
    stackLabel: 'Built with',
    deployedAs: 'Deployed as',
  },

  journey: {
    ocean: 'Pacific Ocean',
    mapCaption: 'Career map · Southern California',
  },

  transition: {
    eyebrow: 'Selected work',
    headline: 'Things I’ve built.',
    body: 'Three web mapping applications, designed and built end to end for the City of San Jacinto and the people who live there.',
  },

  close: {
    eyebrow: 'What’s next',
    headline: 'Let’s put something on a map.',
    body: 'Open to GIS development roles and collaborations: enterprise GIS architecture, web mapping applications, and geospatial data pipelines.',
    links: [
      { label: 'Email', text: 'fuaadetl@gmail.com', href: 'mailto:fuaadetl@gmail.com' },
      { label: 'GitHub', text: 'github.com/fuaad-khan', href: 'https://github.com/fuaad-khan', external: true },
      {
        label: 'LinkedIn',
        text: 'linkedin.com/in/fuaad-khan-7b3549115',
        href: 'https://www.linkedin.com/in/fuaad-khan-7b3549115/',
        external: true,
      },
    ],
    resume: { label: 'Download résumé', href: '/Fuaad_Khan_Resume.pdf' },
  },

  footer: `© ${year} Fuaad Khan · fuaadkhan.com`,
  attribution: 'Background contours derived from Mapzen Terrain Tiles (AWS Open Data) · USGS 3DEP, SRTM',
}
