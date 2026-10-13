// Numbers an intro shows: the capture sidecar's (media.hero.intro.values) win over the demo values in apps.js
export function introValues(app, media) {
  return { ...app?.intro?.values, ...media?.hero?.intro?.values }
}

// Fills {key} placeholders in an apps.js intro string; numbers get en-US grouping, unknown keys stay visible
export function fill(template, values = {}) {
  return String(template ?? '').replace(/\{(\w+)\}/g, (match, key) => {
    const value = values[key]
    if (value == null) return match
    return typeof value === 'number' ? value.toLocaleString('en-US') : String(value)
  })
}
