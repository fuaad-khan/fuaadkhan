import Icon from './Icon'
import styles from './MeasuredLine.module.css'

const NAV_ICONS = ['home', 'layers', 'ruler', 'file', 'info']

// Muted aerial palette: overlays (white, orange, red) must stay the brightest things on the map
const A = {
  ground: '#8a8471',
  dirt: '#94896f',
  alley: '#8f897b',
  asphalt: '#4a4c4b',
  lot: '#565857',
  walk: '#a6a298',
  stripe: 'rgba(236, 233, 224, 0.55)',
  lane: 'rgba(222, 217, 204, 0.7)',
  yellow: '#c4a24c',
  roof: '#bcb9b1',
  roofEdge: '#a2a098',
  unit: '#9c9991',
  oldRoof: '#a39c8d',
  // Roof facets in order north, east, south, west
  shingle: ['#807468', '#64594f', '#5a5047', '#766a5e'],
  shingle2: ['#8b7e70', '#6e6256', '#64594e', '#817466'],
  ridge: '#5b5147',
  grass: '#99926a',
  lawn: '#6c784b',
  tree: '#3d4932',
  treeLight: '#4a593c',
  shadow: 'rgba(0, 0, 0, 0.26)',
  pool: '#5c96a0',
  coping: '#cbc8be',
  fence: '#dcd5c3',
  parcel: 'rgba(255, 255, 255, 0.5)',
}

const Tree = ({ x, y, r }) => (
  <g>
    <circle cx={x + r * 0.25} cy={y + r * 0.3} r={r} fill={A.shadow} />
    <circle cx={x} cy={y} r={r} fill={A.tree} />
    <circle cx={x - r * 0.28} cy={y - r * 0.3} r={r * 0.55} fill={A.treeLight} />
  </g>
)

// A hipped shingle roof: four facets lit from the north-west, meeting on a ridge
const House = ({ x, y, w, h, tones = A.shingle }) => {
  const inset = Math.min(w, h) / 2
  const across = w >= h
  const r0 = across ? [x + inset, y + h / 2] : [x + w / 2, y + inset]
  const r1 = across ? [x + w - inset, y + h / 2] : [x + w / 2, y + h - inset]
  const [nw, ne, se, sw] = [[x, y], [x + w, y], [x + w, y + h], [x, y + h]]
  const facets = across
    ? [[nw, ne, r1, r0], [ne, se, r1], [se, sw, r0, r1], [sw, nw, r0]]
    : [[nw, ne, r0], [ne, se, r1, r0], [se, sw, r1], [sw, nw, r0, r1]]
  const d = (pts) => `M${pts.map((p) => p.join(' ')).join('L')}Z`
  return (
    <g>
      <rect x={x + 4} y={y + 5} width={w} height={h} fill={A.shadow} />
      {facets.map((pts, i) => (
        <path key={i} d={d(pts)} fill={tones[i]} stroke={A.ridge} strokeWidth="0.75" strokeLinejoin="round" />
      ))}
    </g>
  )
}

const Car = ({ x, y, w = 13, h = 26, tone }) => <rect x={x} y={y} width={w} height={h} rx="4" fill={tone} />

// Top-down street block around 438 S State St, drawn in world px; the neighbour's fence sits at the measured property line
function Aerial({ rect: [mx, my, mw, mh], lotX: E, fenceX, street }) {
  const asphaltEnd = E - 16
  const centre = (676 + asphaltEnd) / 2
  const stalls = Array.from({ length: 12 }, (_, i) => 412 + i * 18)
  return (
    <svg className={styles.fill} viewBox={`${mx} ${my} ${mw} ${mh}`} preserveAspectRatio="none" aria-hidden="true">
      <rect x={mx} y={my} width={mw} height={mh} fill={A.ground} />
      <rect x="250" y="226" width="914" height="84" fill={A.walk} />
      <rect x="250" y="236" width="914" height="64" fill={A.asphalt} />
      <path d="M250 268H660M830 268H1164" stroke={A.lane} strokeWidth="2" strokeDasharray="18 26" />
      <rect x="250" y="934" width="914" height="50" fill={A.walk} />
      <rect x="250" y="944" width="914" height="40" fill={A.asphalt} />
      <rect x="340" y="310" width="22" height="624" fill={A.alley} />
      <rect x={E + 200} y="310" width="20" height="624" fill={A.alley} />
      <rect x="660" y={my} width={E - 660} height={mh} fill={A.walk} />
      <rect x="676" y={my} width={asphaltEnd - 676} height={mh} fill={A.asphalt} />
      <path d={`M${centre - 2.5} ${my}V226M${centre + 2.5} ${my}V226M${centre - 2.5} 310V934M${centre + 2.5} 310V934`} stroke={A.yellow} strokeWidth="2" />
      <path d={`M${(676 + centre) / 2} 310V934M${(centre + asphaltEnd) / 2} 310V934`} stroke={A.lane} strokeWidth="2" strokeDasharray="20 30" />

      <rect x="380" y="180" width="252" height="40" fill={A.roof} />
      <rect x={E} y="178" width="196" height="44" fill={A.lot} />
      <rect x="380" y="318" width="262" height="72" fill={A.roof} stroke={A.roofEdge} strokeWidth="2" />
      <rect x="420" y="336" width="24" height="16" fill={A.unit} />
      <rect x="560" y="350" width="30" height="18" fill={A.unit} />

      <rect x="362" y="404" width="104" height="232" fill={A.lot} />
      {stalls.map((y) => (
        <path key={y} d={`M368 ${y}H446`} stroke={A.stripe} strokeWidth="1.5" />
      ))}
      <path d="M470 440H640V590H540V566H470Z" fill={A.roof} stroke={A.roofEdge} strokeWidth="2" />
      <rect x="512" y="468" width="24" height="16" fill={A.unit} />
      <rect x="580" y="500" width="20" height="14" fill={A.unit} />
      <rect x="496" y="528" width="28" height="18" fill={A.unit} />
      <rect x="640" y="404" width="20" height="232" fill={A.walk} />
      <rect x="472" y="596" width="186" height="40" fill={A.lot} />

      <rect x="378" y="656" width="198" height="104" fill={A.oldRoof} stroke={A.roofEdge} strokeWidth="2" />
      <rect x="590" y="652" width="66" height="120" fill={A.dirt} />
      <Tree x={624} y={700} r={18} />
      <rect x="366" y="784" width="290" height="146" fill={A.dirt} />
      <Tree x={420} y={840} r={14} />
      <Tree x={600} y={880} r={16} />

      <House x={262} y={330} w={64} h={92} />
      <House x={258} y={478} w={70} h={78} tones={A.shingle2} />
      <House x={264} y={630} w={60} h={86} />
      <House x={260} y={796} w={66} h={84} tones={A.shingle2} />
      <Tree x={304} y={452} r={22} />
      <Tree x={326} y={600} r={16} />
      <Tree x={286} y={770} r={20} />

      <rect x={E} y="312" width="200" height="156" fill={A.grass} />
      <House x={E + 40} y={338} w={92} h={90} tones={A.shingle2} />
      <Tree x={E + 170} y={352} r={24} />
      <rect x={E} y="472" width="200" height="136" fill={A.grass} />
      <rect x={E + 140} y="476" width="58" height="128" fill={A.lawn} />
      <House x={E + 44} y={498} w={88} h={86} />
      <rect x={E + 4} y="590" width="40" height="18" fill={A.walk} />
      <path d={`M${fenceX} 474V606`} stroke={A.fence} strokeWidth="2" />
      <Tree x={E + 168} y={588} r={20} />
      <rect x={E} y="612" width="200" height="146" fill={A.grass} />
      <House x={E + 40} y={634} w={84} h={96} tones={A.shingle2} />
      <Tree x={E + 170} y={700} r={22} />
      <rect x={E} y="762" width="200" height="170" fill={A.grass} />
      <House x={E + 38} y={788} w={94} h={88} />
      <rect x={E + 150} y="800" width="34" height="52" rx="6" fill={A.pool} stroke={A.coping} strokeWidth="3" />

      <rect x={E + 236} y="520" width="38" height="56" rx="6" fill={A.pool} stroke={A.coping} strokeWidth="3" />
      <Tree x={E + 290} y={400} r={30} />
      <Tree x={E + 270} y={690} r={26} />
      <House x={E + 300} y={600} w={80} h={70} tones={A.shingle2} />

      <Car x={698} y={360} tone="#c9c6bf" />
      <Car x={760} y={700} tone="#3f4a5a" />
      <Car x={392} y={418} w={26} h={13} tone="#8a3b36" />
      <Car x={392} y={490} w={26} h={13} tone="#d8d5cf" />
      <Car x={E + 14} y={186} w={26} h={13} tone="#59606b" />

      <path
        d={`M362 400H660M362 640H660M362 780H660M362 310V934M660 310V934M${E} 310V934M${E + 200} 310V934M${E} 470H${E + 200}M${E} 610H${E + 200}M${E} 760H${E + 200}M250 460H340M250 610H340M250 760H340M${E + 220} 560H1164M${E + 220} 740H1164`}
        stroke={A.parcel}
        strokeWidth="1"
        fill="none"
      />
      {street && (
        <text className={styles.street} x={centre + 18} y="820" transform={`rotate(-90 ${centre + 18} 820)`} textAnchor="middle">
          {street}
        </text>
      )}
    </svg>
  )
}

// Green Check's shell around the map (header, nav rail, search row, map card), drawn only when no base still exists
export function DemoChrome({ app, scene }) {
  const labels = app.intro?.labels ?? {}
  const chrome = app.intro?.chrome ?? {}
  const [mx, my, mw, mh] = scene.mapRect
  const pickerW = 248
  return (
    <>
      <div className={styles.header}>
        <span className={styles.brand}>
          <span className={styles.brandMark}>
            <Icon name="check" size={34} stroke={3} />
          </span>
          <span>
            <span className={styles.brandTitle}>{app.frameTitle}</span>
            {chrome.tagline && <span className={styles.brandTagline}>{chrome.tagline}</span>}
          </span>
        </span>
        <svg className={styles.swoosh} viewBox="0 0 800 88" preserveAspectRatio="none" aria-hidden="true">
          <path d="M150 0 H800 V88 H330 C230 88 165 55 150 0 Z" />
        </svg>
        <span className={styles.headerActions}>
          <span className={styles.headerPill}>
            <Icon name="globe" size={18} />
          </span>
          <span className={styles.headerPill}>
            <Icon name="filePen" size={18} />
          </span>
        </span>
      </div>

      <div className={styles.sidebar}>
        {(chrome.nav ?? []).map((label, i) => (
          <span key={label} className={i === 0 ? `${styles.navItem} ${styles.navActive}` : styles.navItem}>
            <Icon name={NAV_ICONS[i] ?? 'info'} size={20} />
            <span>{label}</span>
          </span>
        ))}
      </div>

      <div className={styles.search} style={{ left: mx, top: my - 68, width: mw - pickerW - 12 }}>
        <span className={styles.searchIcon}>
          <Icon name="search" size={20} />
        </span>
        <span className={styles.searchText}>{labels.address}</span>
        <span className={styles.searchIcon}>
          <Icon name="x" size={18} />
        </span>
      </div>
      <div className={styles.picker} style={{ left: mx + mw - pickerW, top: my - 68, width: pickerW }}>
        {chrome.licenseLabel && <span className={styles.pickerLabel}>{chrome.licenseLabel}</span>}
        <span className={styles.pickerValue}>{labels.licenseType}</span>
        <Icon name="chevron" size={18} className={styles.pickerChevron} />
      </div>

      <div className={styles.mapCard} style={{ left: mx - 1, top: my - 1, width: mw + 2, height: mh + 2 }}>
        <Aerial rect={scene.mapRect} lotX={scene.geo.lotX} fenceX={scene.geo.fenceX} street={chrome.street} />
      </div>
    </>
  )
}

// Leaflet's control stack (zoom, home and locate, layers) over the map's top-left corner
export function MapControls({ mapRect: [mx, my] }) {
  return (
    <div className={styles.controls} style={{ left: mx + 14, top: my + 14 }}>
      <span className={styles.bar}>
        <span>
          <Icon name="plus" size={20} />
        </span>
        <span>
          <Icon name="minus" size={20} />
        </span>
      </span>
      <span className={styles.bar}>
        <span>
          <Icon name="home" size={20} />
        </span>
        <span>
          <Icon name="locate" size={20} />
        </span>
      </span>
      <span className={styles.bar}>
        <span>
          <Icon name="layers" size={22} />
        </span>
      </span>
    </div>
  )
}
