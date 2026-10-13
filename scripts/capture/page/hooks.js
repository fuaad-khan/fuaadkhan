// Injected before any page script by the capture runner: a Leaflet map registry, a drawn cursor, network/tile idleness and geometry harvest helpers
;(() => {
  if (window.__wp6) return
  const maps = []

  // window.L is trapped so the init hook is on L.Map before the app builds its map (works for CDN scripts and bundles alike)
  let leaflet
  const hookLeaflet = (L) => {
    try {
      if (L && L.Map && !L.Map.__wp6) {
        L.Map.__wp6 = true
        L.Map.addInitHook(function () {
          maps.push(this)
        })
      }
    } catch {
      // Something else called L
    }
  }
  Object.defineProperty(window, 'L', {
    configurable: true,
    enumerable: true,
    get: () => leaflet,
    set: (value) => {
      leaflet = value
      hookLeaflet(value)
    },
  })

  // Counts XHR/fetch in flight when the virtual clock (which counts its own) is absent
  let pending = 0
  if (!window.__vt) {
    const send = XMLHttpRequest.prototype.send
    XMLHttpRequest.prototype.send = function (...args) {
      pending++
      let done = false
      this.addEventListener('loadend', () => {
        if (!done) {
          done = true
          pending--
        }
      })
      try {
        return send.apply(this, args)
      } catch (err) {
        done = true
        pending--
        throw err
      }
    }
    if (window.fetch) {
      const realFetch = window.fetch.bind(window)
      window.fetch = (...args) => {
        pending++
        return realFetch(...args).finally(() => {
          pending--
        })
      }
    }
  }

  const round = (v) => Math.round(v * 10) / 10

  // The app's main map: window.map when it is a Leaflet map, else the largest registered one
  function theMap() {
    const own = window.map
    if (own && typeof own.latLngToContainerPoint === 'function') return own
    let best = null
    let area = -1
    for (const m of maps) {
      const r = m.getContainer().getBoundingClientRect()
      if (r.width * r.height > area) {
        area = r.width * r.height
        best = m
      }
    }
    return best
  }

  // Viewport CSS px of a lat/lng on the live map
  function point(latlng, m = theMap()) {
    const p = m.latLngToContainerPoint(latlng)
    const r = m.getContainer().getBoundingClientRect()
    return [round(r.left + p.x), round(r.top + p.y)]
  }

  // Flattens Leaflet latlng nesting into a list of rings (arrays of {lat, lng})
  function rings(latlngs) {
    if (!latlngs || !latlngs.length) return []
    return Array.isArray(latlngs[0]) ? latlngs.flatMap(rings) : [latlngs]
  }

  // Every vector layer and marker on the map with its pane, style and geometry in lat/lng
  function layers() {
    const m = theMap()
    const out = []
    if (!m) return out
    m.eachLayer((layer) => {
      const o = layer.options || {}
      const base = { pane: o.pane || '', className: o.className || '', color: o.color || '', fillColor: o.fillColor || '', dashArray: o.dashArray || '', weight: o.weight ?? null }
      if (typeof layer.getRadius === 'function' && typeof layer.getLatLng === 'function') {
        const c = layer.getLatLng()
        out.push({ ...base, type: 'circle', latlng: [c.lat, c.lng], radius: layer.getRadius() })
      } else if (typeof layer.getLatLngs === 'function') {
        const closed = typeof layer.getCenter === 'function' && !!layer._rings && layer.options.fill !== false && layer instanceof window.L.Polygon
        out.push({ ...base, type: closed ? 'polygon' : 'polyline', rings: rings(layer.getLatLngs()).map((ring) => ring.map((ll) => [ll.lat, ll.lng])) })
      } else if (typeof layer.getLatLng === 'function' && layer._icon) {
        const c = layer.getLatLng()
        out.push({ ...base, type: 'marker', latlng: [c.lat, c.lng], iconClass: layer._icon.className || '' })
      }
    })
    return out
  }

  // Map camera, map container rect and viewport, all in CSS px
  function mapState() {
    const m = theMap()
    if (!m) return null
    const c = m.getCenter()
    const r = m.getContainer().getBoundingClientRect()
    return {
      view: { lat: c.lat, lng: c.lng, zoom: m.getZoom() },
      mapRect: [round(r.left), round(r.top), round(r.width), round(r.height)],
      viewport: [window.innerWidth, window.innerHeight],
    }
  }

  // Projects [[lat, lng], ...] (or one pair) to viewport px with the live camera
  function project(input) {
    const m = theMap()
    if (!Array.isArray(input[0])) return point(input, m)
    return input.map((ll) => point(ll, m))
  }

  // Leaflet's SVG paths (M/L/z polylines and the two-arc circles) as absolute viewport-px data through each path's screen CTM
  function paths(selector) {
    const out = []
    for (const el of document.querySelectorAll(selector)) {
      const ctm = el.getClientRects().length ? el.getScreenCTM() : null
      if (!ctm) continue
      const at = (x, y) => {
        const p = new DOMPoint(x, y).matrixTransform(ctm)
        return [round(p.x), round(p.y)]
      }
      const tokens = (el.getAttribute('d') || '').match(/[MLZAmlza]|-?\d*\.?\d+(?:e[-+]?\d+)?/g) || []
      let d = ''
      let circle = null
      for (let i = 0; i < tokens.length; ) {
        const cmd = tokens[i++]
        if (cmd === 'M' || cmd === 'L') {
          const [x, y] = at(Number(tokens[i]), Number(tokens[i + 1]))
          i += 2
          d += `${cmd}${x} ${y}`
        } else if (cmd === 'z' || cmd === 'Z') {
          d += 'Z'
        } else if (cmd === 'a' && !circle) {
          // M (cx - r),cy a r,r 0 1,0 2r,0 ...: the circle's centre is r to the right of the move point
          const r = Number(tokens[i])
          const m = /M(-?[\d.]+) (-?[\d.]+)$/.exec(d)
          const start = m ? [Number(m[1]), Number(m[2])] : [0, 0]
          const scale = Math.hypot(ctm.a, ctm.b)
          circle = { cx: round(start[0] + r * scale), cy: round(start[1]), r: round(r * scale) }
          i += 7
        } else if (cmd === 'a') {
          i += 7
        }
      }
      out.push({
        d: circle ? '' : d,
        circle,
        stroke: el.getAttribute('stroke') || '',
        fill: el.getAttribute('fill') || '',
        dash: el.getAttribute('stroke-dasharray') || '',
        className: typeof el.className === 'string' ? el.className : el.className.baseVal,
      })
    }
    return out
  }

  // Rounded [x, y, w, h] of the first element matching sel, or null when it is absent or not rendered
  function rect(sel) {
    const el = typeof sel === 'string' ? document.querySelector(sel) : sel
    if (!el || !el.getClientRects().length) return null
    const r = el.getBoundingClientRect()
    return [round(r.left), round(r.top), round(r.width), round(r.height)]
  }

  // Map tiles still loading plus requests in flight plus images not yet decoded
  function busy() {
    const tiles = document.querySelectorAll('.leaflet-tile-container img.leaflet-tile:not(.leaflet-tile-loaded)').length
    let images = 0
    for (const img of document.images) if (img.src && !img.complete) images++
    const requests = window.__vt ? window.__vt.pending() : pending
    return { tiles, images, requests, total: tiles + images + requests }
  }

  // Decodes every loaded image so a screenshot never catches one half-drawn
  async function decode() {
    await Promise.all([...document.images].filter((i) => i.complete && i.naturalWidth).map((i) => i.decode().catch(() => {})))
    if (document.fonts) await document.fonts.ready
    return true
  }

  // A drawn arrow cursor: headless screenshots carry no pointer, and loops need one to read as a person working
  let cursor = null
  function moveCursor(x, y, down = false) {
    if (!cursor) {
      cursor = document.createElement('div')
      cursor.id = '__wp6-cursor'
      cursor.setAttribute('aria-hidden', 'true')
      cursor.style.cssText = 'position:fixed;left:0;top:0;width:28px;height:34px;pointer-events:none;z-index:2147483647;transform-origin:3px 2px;will-change:transform'
      cursor.innerHTML =
        '<svg width="28" height="34" viewBox="0 0 28 34" style="display:block;overflow:visible"><path d="M3 2 L3 26 L9.2 20.3 L13.4 30 L17.6 28.2 L13.5 18.8 L22 18.6 Z" fill="#111" stroke="#fff" stroke-width="2" stroke-linejoin="round"/></svg>'
      document.documentElement.appendChild(cursor)
    }
    cursor.style.display = ''
    cursor.style.transform = `translate(${x - 3}px, ${y - 2}px) scale(${down ? 0.88 : 1})`
    return true
  }
  function hideCursor() {
    if (cursor) cursor.style.display = 'none'
    return true
  }

  // Hides elements for a capture (visibility keeps their layout, so nothing else moves) and returns a restore key
  const hidden = new Map()
  function hide(selectors, mode = 'visibility') {
    let n = 0
    for (const sel of selectors) {
      for (const el of document.querySelectorAll(sel)) {
        if (!hidden.has(el)) hidden.set(el, el.getAttribute('style'))
        if (mode === 'display') el.style.setProperty('display', 'none', 'important')
        else el.style.setProperty('visibility', 'hidden', 'important')
        n++
      }
    }
    return n
  }
  function unhide() {
    for (const [el, style] of hidden) {
      if (style === null) el.removeAttribute('style')
      else el.setAttribute('style', style)
    }
    hidden.clear()
    return true
  }

  window.__wp6 = { maps, theMap, mapState, project, layers, paths, rect, busy, decode, moveCursor, hideCursor, hide, unhide }
})()
