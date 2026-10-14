const clamp01 = (v) => Math.min(1, Math.max(0, Number(v) || 0))

// Progress channel from a gallery's clock to its intro; listeners hear t in [0, 1] only when it moves
export function createDriver(initial = 0) {
  let t = clamp01(initial)
  const listeners = new Set()

  return {
    subscribe(fn) {
      listeners.add(fn)
      return () => {
        listeners.delete(fn)
      }
    },
    get: () => t,
    emit(next) {
      const v = clamp01(next)
      // Ignore sub-1e-4 jitter, but always land exactly on 0 and 1
      if (v === t || (Math.abs(v - t) <= 1e-4 && v !== 0 && v !== 1)) return
      t = v
      listeners.forEach((fn) => fn(t))
    },
  }
}
