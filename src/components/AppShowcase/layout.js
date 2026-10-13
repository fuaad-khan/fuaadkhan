// Showcase scroll tracks in svh; keep in step with --track-intro / --track-feature / --track-stack / --track-pad in global.css
export const TRACK = { intro: 200, feature: 80, stack: 30, pad: 10 }

// Matches the (max-height: 700px) override of --track-intro in global.css
export const SHORT_SCREEN = '(max-height: 700px)'
export const TRACK_SHORT = { ...TRACK, intro: 160 }

// Two-column breakpoint of the Showcase and Transition stylesheets; chapters rebuild when it flips because node timings are measured
export const WIDE_SCREEN = '(min-width: 1024px), (min-width: 640px) and (orientation: landscape)'

// Timeline positions (0–1) for one Showcase scrubbed from 'top top' to 'bottom bottom'; lead = svh of in-flow content above the copy track
export function fractions(featureCount = 3, track = TRACK, lead = 0) {
  const { intro, feature, stack, pad } = track
  const range = lead + intro + feature * featureCount + stack + pad - 100
  const introEnd = (lead + intro - 40) / range
  return {
    range,
    introEnd,
    dissolve: [introEnd - 0.02, introEnd + 0.05],
    featureCenters: Array.from({ length: featureCount }, (_, i) => (lead + intro + feature * i + feature / 2 - 50) / range),
    stackAt: 0.95,
  }
}
