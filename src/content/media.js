// App media keyed by apps[].id: { hero, base?, features[3] } of still / loop entries, or null where no capture exists yet (shape: .wp/CONTRACTS.md §9)
// Green Check is null too: the old test captures showed residential addresses and must not ship (the capture pipeline replaces them)
export const media = {
  'map-my-city': {
    hero: null,
    features: [null, null, null],
  },
  'yard-plan': {
    hero: null,
    features: [null, null, null],
  },
  'green-check': {
    hero: null,
    features: [null, null, null],
  },
}
