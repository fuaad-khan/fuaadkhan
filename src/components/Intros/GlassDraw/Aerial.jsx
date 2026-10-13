import { memo } from 'react'

// Muted top-down palette: low saturation so the turf and concrete drawings stay the brightest marks on the map
const PALETTE = {
  ground: '#c9c1ad',
  lawn: '#a3aa88',
  bed: '#8f9776',
  concrete: '#d8d3c7',
  asphalt: '#9b9b98',
  lane: '#e6dfc8',
  pool: '#a2c3c6',
  rim: '#e4dfd3',
  canopy: '#86906e',
  leaf: '#97a17f',
  roofs: { a: '#b3a793', b: '#ae937e', c: '#a6a8a6' },
}

// One lot per entry: parcel box p, a hip roof [x, y, w, h, tone], optional lawn, drive, bed, pool and trees [cx, cy, r]; sel marks the searched parcel
const LOTS = [
  { p: [140, 330, 230, 360], roof: [158, 390, 190, 132, 'b'], lawn: [150, 540, 150, 148], drive: [300, 524, 58, 178], trees: [[212, 612, 30]] },
  { p: [370, 330, 190, 360], roof: [386, 384, 160, 140, 'c'], lawn: [440, 540, 112, 148], drive: [384, 530, 56, 172], trees: [[522, 362, 26]] },
  { p: [560, 330, 390, 360], roof: [590, 380, 232, 148, 'a'], garage: [828, 410, 108, 128, 'a'], bed: [580, 528, 250, 18], lawn: [580, 542, 250, 146], drive: [828, 538, 110, 164], trees: [[905, 360, 24]], sel: true },
  { p: [1042, 330, 208, 360], roof: [1060, 386, 170, 136, 'b'], lawn: [1052, 540, 118, 148], drive: [1170, 526, 56, 176], trees: [[1092, 620, 28]] },
  { p: [1250, 330, 200, 360], roof: [1266, 388, 168, 132, 'c'], lawn: [1320, 540, 120, 148], drive: [1266, 524, 54, 178] },
  { p: [1450, 330, 200, 360], roof: [1466, 384, 168, 140, 'a'], lawn: [1460, 540, 110, 148], drive: [1570, 528, 56, 174], trees: [[1502, 630, 30]] },
  { p: [140, 0, 220, 330], roof: [160, 60, 180, 130, 'c'], pool: [200, 230, 90, 52], trees: [[320, 270, 30]] },
  { p: [360, 0, 200, 330], roof: [376, 52, 166, 140, 'a'], lawn: [370, 214, 180, 106], trees: [[410, 262, 34]] },
  { p: [560, 0, 200, 330], roof: [578, 58, 166, 128, 'b'], pool: [600, 222, 70, 46], trees: [[720, 280, 26]] },
  { p: [760, 0, 190, 330], roof: [776, 56, 158, 136, 'c'], lawn: [770, 216, 170, 104], trees: [[802, 262, 28], [900, 240, 22]] },
  { p: [1042, 0, 198, 330], roof: [1058, 60, 166, 132, 'a'], pool: [1090, 226, 84, 50] },
  { p: [1240, 0, 200, 330], roof: [1256, 54, 168, 138, 'b'], trees: [[1300, 268, 32]] },
  { p: [1440, 0, 210, 330], roof: [1458, 58, 172, 130, 'c'], lawn: [1450, 210, 190, 110] },
  { p: [150, 784, 210, 216], roof: [168, 868, 176, 132, 'a'], lawn: [160, 794, 130, 66], drive: [290, 784, 56, 92], trees: [[202, 822, 24]] },
  { p: [360, 784, 215, 216], roof: [378, 872, 180, 128, 'c'], lawn: [440, 794, 126, 68], drive: [380, 784, 56, 96] },
  { p: [575, 784, 195, 216], roof: [590, 866, 166, 134, 'b'], lawn: [585, 794, 115, 64], drive: [700, 784, 56, 90], trees: [[622, 820, 22]] },
  { p: [770, 784, 180, 216], roof: [786, 870, 150, 130, 'a'], lawn: [842, 794, 98, 66], drive: [786, 784, 54, 94] },
  { p: [1042, 784, 208, 216], roof: [1060, 868, 172, 132, 'c'], lawn: [1052, 794, 118, 66], drive: [1170, 784, 56, 92], trees: [[1102, 822, 26]] },
  { p: [1250, 784, 200, 216], roof: [1266, 872, 168, 128, 'a'], lawn: [1322, 794, 118, 68], drive: [1266, 784, 54, 96] },
  { p: [1450, 784, 200, 216], roof: [1466, 866, 168, 134, 'b'], lawn: [1460, 794, 110, 64], drive: [1570, 784, 56, 90] },
]

// Lightens (k > 0) or darkens (k < 0) a hex colour, for the sunlit and shaded roof facets
function shade(hex, k) {
  const n = parseInt(hex.slice(1), 16)
  const ch = (v) => Math.round(k > 0 ? v + (255 - v) * k : v * (1 + k))
  return `rgb(${ch(n >> 16)} ${ch((n >> 8) & 255)} ${ch(n & 255)})`
}

// A hip roof seen from above: four facets around a ridge, lit from the south-west
function Roof({ box: [x, y, w, h, tone] }) {
  const base = PALETTE.roofs[tone]
  const r = Math.min(w, h) / 2
  const along = w >= h
  const [ax, ay, bx, by] = along ? [x + r, y + r, x + w - r, y + r] : [x + r, y + r, x + r, y + h - r]
  const facets = along
    ? [
        [`${x},${y} ${x + w},${y} ${bx},${by} ${ax},${ay}`, -0.08],
        [`${x},${y + h} ${x + w},${y + h} ${bx},${by} ${ax},${ay}`, 0.1],
        [`${x},${y} ${ax},${ay} ${x},${y + h}`, 0.02],
        [`${x + w},${y} ${bx},${by} ${x + w},${y + h}`, -0.04],
      ]
    : [
        [`${x},${y} ${x},${y + h} ${bx},${by} ${ax},${ay}`, 0.02],
        [`${x + w},${y} ${x + w},${y + h} ${bx},${by} ${ax},${ay}`, -0.06],
        [`${x},${y} ${ax},${ay} ${x + w},${y}`, -0.08],
        [`${x},${y + h} ${bx},${by} ${x + w},${y + h}`, 0.1],
      ]
  return (
    <g>
      <rect x={x + 5} y={y + 6} width={w} height={h} fill="rgb(40 36 28 / 0.16)" />
      {facets.map(([points, k], i) => (
        <polygon key={i} points={points} fill={shade(base, k)} />
      ))}
      <path d={`M${x} ${y}L${ax} ${ay}L${bx} ${by}L${x + w} ${y + h}M${x + w} ${y}L${bx} ${by}M${x} ${y + h}L${ax} ${ay}`} fill="none" stroke="rgb(70 60 50 / 0.2)" strokeWidth="1.4" />
    </g>
  )
}

function Tree({ c: [cx, cy, r] }) {
  return (
    <g>
      <circle cx={cx + 5} cy={cy + 6} r={r} fill="rgb(40 40 30 / 0.18)" />
      <circle cx={cx} cy={cy} r={r} fill={PALETTE.canopy} />
      <circle cx={cx - r * 0.25} cy={cy - r * 0.25} r={r * 0.55} fill={PALETTE.leaf} opacity="0.8" />
    </g>
  )
}

const box = ([x, y, w, h]) => ({ x, y, width: w, height: h })

// Neutral stand-in for Yard Plan's aerial base until the capture lands: a residential block around the searched parcel
export default memo(function Aerial() {
  return (
    <svg viewBox="0 0 1600 1000" preserveAspectRatio="none" aria-hidden="true" focusable="false">
      <rect width="1600" height="1000" fill={PALETTE.ground} />
      {LOTS.map((lot, i) => (
        <g key={i}>
          {lot.lawn && <rect {...box(lot.lawn)} fill={PALETTE.lawn} />}
          {lot.bed && <rect {...box(lot.bed)} fill={PALETTE.bed} />}
          {lot.drive && <rect {...box(lot.drive)} fill={PALETTE.concrete} />}
          {lot.pool && <rect {...box(lot.pool)} rx="10" fill={PALETTE.pool} stroke={PALETTE.rim} strokeWidth="6" />}
          <Roof box={lot.roof} />
          {lot.garage && <Roof box={lot.garage} />}
          {lot.trees?.map((c, j) => <Tree key={j} c={c} />)}
        </g>
      ))}
      <rect x="0" y="690" width="1600" height="94" fill={PALETTE.concrete} />
      <rect x="950" y="0" width="92" height="1000" fill={PALETTE.concrete} />
      <rect x="0" y="702" width="1600" height="70" fill={PALETTE.asphalt} />
      <rect x="962" y="0" width="68" height="1000" fill={PALETTE.asphalt} />
      <path d="M0 737H950M1042 737H1600M996 0V690M996 784V1000" stroke={PALETTE.lane} strokeOpacity="0.55" strokeWidth="2" strokeDasharray="24 18" fill="none" />
      {LOTS.map((lot, i) => (
        <rect key={i} {...box(lot.p)} fill="none" stroke="#ffffff" strokeOpacity="0.55" strokeWidth="1.2" />
      ))}
      {LOTS.filter((lot) => lot.sel).map((lot, i) => (
        <rect key={i} {...box(lot.p)} fill="none" stroke="#22d3ee" strokeWidth="4" strokeLinejoin="round" />
      ))}
    </svg>
  )
})
