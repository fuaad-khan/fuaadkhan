// Largest zoom about `origin` (viewBox units, capped at `want`) that keeps every node's box inside the visible part of a slice-fitted SVG
export function fitZoom(svg, origin, nodes, want, margin = 4) {
  const { width, height } = svg.getBoundingClientRect()
  const box = svg.viewBox.baseVal
  if (!width || !height || !box?.width) return 1
  // preserveAspectRatio="xMidYMid slice": the frame shows a centred window of the viewBox
  const fit = Math.max(width / box.width, height / box.height)
  const halfW = width / fit / 2
  const halfH = height / fit / 2
  const left = box.width / 2 - halfW + margin
  const right = box.width / 2 + halfW - margin
  const top = box.height / 2 - halfH + margin
  const bottom = box.height / 2 + halfH - margin
  const { x, y } = origin
  let zoom = want
  for (const node of nodes) {
    const b = node.getBBox()
    if (b.x < x) zoom = Math.min(zoom, (x - left) / (x - b.x))
    if (b.x + b.width > x) zoom = Math.min(zoom, (right - x) / (b.x + b.width - x))
    if (b.y < y) zoom = Math.min(zoom, (y - top) / (y - b.y))
    if (b.y + b.height > y) zoom = Math.min(zoom, (bottom - y) / (b.y + b.height - y))
  }
  return Math.max(1, zoom)
}
