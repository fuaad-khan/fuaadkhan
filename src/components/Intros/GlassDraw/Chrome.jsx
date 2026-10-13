import Icon from './Icon'
import styles from './GlassDraw.module.css'

const RAIL_ICONS = ['pencil', 'share', 'upload', 'info']
const TOOL_ICONS = ['seedling', 'slab', 'vector', 'undo', 'redo', 'magnet']
const TOOL_CLASSES = ['toolTurf', 'toolConcrete', 'tool', 'tool', 'tool', 'toolSnap']
const TOOL_HOOKS = ['tool-turf', 'tool-concrete', undefined, 'tool-undo', 'tool-redo', undefined]
const QUICK = [['trash', 'quickDanger'], ['crosshair', 'quick'], ['share', 'quickAccent']]
const DOCK = [['seedling', 'dock-turf'], ['slab', 'dock-concrete'], ['magnet', 'dock-snap'], null, ['vector'], ['undo', 'dock-undo'], ['redo', 'dock-redo']]
const SWATCHES = ['swTurf', 'swConcrete', 'swParcel']

// App text when apps.js supplies it, else a neutral bar of about the same width
function Txt({ text, w, className }) {
  if (text) return <span className={className}>{text}</span>
  return <span className={`${className ?? ''} ${styles.bar}`} style={{ '--w': w }} />
}

// Yard Plan's chrome on the glass (yardplan.css at the capture width): header, rail, Draw panel, dock and the map controls
export default function Chrome({ app, chrome = {}, rows = [], texts, real }) {
  const sections = chrome.sections ?? []
  return (
    <>
      <div className={styles.leaflet}>
        <span className={styles.zoom}>
          <span className={styles.zoomBtn}>
            <Icon name="plus" />
          </span>
          <span className={styles.zoomBtn}>
            <Icon name="minus" />
          </span>
        </span>
        <span className={`${styles.ctl} ${styles.ctlHome}`}>
          <Icon name="house" />
        </span>
        <span className={`${styles.ctl} ${styles.ctlTheme}`}>
          <Icon name="moon" className={styles.moon} />
          <Icon name="sun" className={styles.sun} />
        </span>
      </div>
      <div className={styles.legend}>
        {SWATCHES.map((sw, i) => (
          <span key={sw} className={styles.legendItem}>
            <span className={`${styles.swatch} ${styles[sw]}`} />
            <Txt text={chrome.legend?.[i]} w={44} />
          </span>
        ))}
      </div>
      {real && chrome.attribution && <span className={styles.attribution}>{chrome.attribution}</span>}

      <svg className={styles.flag} viewBox="0 0 19 10" aria-hidden="true" focusable="false">
        <rect width="19" height="10" fill="#fff" />
        <path d="M0 0h19v.77H0zM0 1.54h19v.77H0zM0 3.08h19v.77H0zM0 4.62h19v.77H0zM0 6.15h19v.77H0zM0 7.69h19v.77H0zM0 9.23h19V10H0z" fill="#b22234" />
        <rect width="7.6" height="5.38" fill="#3c3b6e" />
      </svg>

      <div className={styles.header}>
        <span className={styles.brand}>
          <span className={styles.seal} />
          <span className={styles.titles}>
            <span className={styles.titleMain}>{app.frameTitle}</span>
            <Txt text={chrome.subtitle} w={219} className={styles.titleSub} />
          </span>
        </span>
        <span className={styles.search}>
          <Icon name="search" className={styles.searchIcon} />
          <Txt text={chrome.search} w={170} className={styles.placeholder} />
        </span>
        <span className={styles.links}>
          <span className={styles.circleBtn}>
            <Icon name="globe" />
          </span>
          <span className={styles.circleBtn}>
            <Icon name="external" />
          </span>
        </span>
      </div>

      <div className={styles.rail}>
        {RAIL_ICONS.map((icon, i) => (
          <span key={icon} className={i === 0 ? `${styles.railBtn} ${styles.railActive}` : styles.railBtn}>
            <Icon name={icon} className={styles.railIcon} />
            <Txt text={chrome.rail?.[i]} w={44} />
          </span>
        ))}
        <span className={`${styles.railBtn} ${styles.railFoot}`}>
          <Icon name="layers" className={styles.railIcon} />
          <Txt text={chrome.basemap} w={40} />
        </span>
      </div>

      <div className={styles.dock}>
        {DOCK.map((item, i) =>
          item ? (
            <span key={i} className={`${styles.dockBtn} ${item[0] === 'magnet' ? styles.dockSnap : ''}`} data-gd={item[1]} data-icon={item[0]}>
              <Icon name={item[0]} />
            </span>
          ) : (
            <span key={i} className={styles.dockSep} />
          ),
        )}
      </div>

      <div className={styles.panel}>
        <div className={`${styles.section} ${styles.prop}`}>
          <span className={styles.propIcon}>
            <Icon name="house" />
          </span>
          <span className={styles.propText}>
            <span className={`${styles.bar} ${styles.propLine}`} />
            <span className={`${styles.bar} ${styles.propMeta}`} />
          </span>
        </div>

        <div className={styles.section}>
          <Txt text={sections[0]} w={140} className={styles.sectionTitle} />
          <div className={styles.composition}>
            <span className={styles.donut} data-gd="donut">
              <span className={styles.donutFill} data-gd="donut-fill" />
              <span className={styles.donutHole} />
              <span className={styles.donutCenter}>
                <span className={styles.donutValue} data-gd="donut-value">
                  {texts.donut}
                </span>
                <span className={styles.donutLabel}>{texts.donutLabel}</span>
              </span>
            </span>
            <span className={styles.compRows}>
              {rows.map((row, i) => (
                <span key={i} className={row.pct ? styles.compRow : `${styles.compRow} ${styles.compTotal}`}>
                  {row.pct && <span className={`${styles.dot} ${i === 0 ? styles.dotTurf : styles.dotConcrete}`} />}
                  <span className={styles.compLabel}>{row.label}</span>
                  <span className={styles.compVal} data-gd={`row-value-${i}`}>
                    {texts.rowValues[i]}
                  </span>
                  {row.pct && (
                    <span className={styles.compPct} data-gd={`row-pct-${i}`}>
                      {texts.rowPcts[i]}
                    </span>
                  )}
                </span>
              ))}
            </span>
          </div>
        </div>

        <div className={styles.section}>
          <Txt text={sections[1]} w={120} className={styles.sectionTitle} />
          <div className={styles.tools}>
            {TOOL_ICONS.map((icon, i) => (
              <span key={icon} className={`${styles.toolBtn} ${styles[TOOL_CLASSES[i]]}`} data-gd={TOOL_HOOKS[i]}>
                <Icon name={icon} className={icon === 'slab' ? styles.slabIcon : styles.toolIcon} />
                <Txt text={chrome.tools?.[i]} w={i === 5 ? 92 : 48} />
              </span>
            ))}
          </div>
        </div>

        <div className={styles.section}>
          <Txt text={sections[2]} w={112} className={styles.sectionTitle} />
          <div className={styles.quickGrid}>
            {QUICK.map(([icon, cls], i) => (
              <span key={icon + i} className={`${styles.quickBtn} ${styles[cls]}`}>
                <Icon name={icon} className={styles.quickIcon} />
                <Txt text={chrome.quick?.[i]} w={52} />
              </span>
            ))}
          </div>
        </div>

        <div className={`${styles.section} ${styles.areas}`} data-gd="areas">
          <Txt text={sections[3]} w={104} className={styles.sectionTitle} />
          <div className={styles.areaList}>
            {texts.areas.map(([name, area], i) => (
              <span key={i} className={styles.areaRow} data-gd={`area-${i}`}>
                <span className={`${styles.dot} ${i === 0 ? styles.dotTurf : styles.dotConcrete}`} />
                <span className={styles.areaName}>{name}</span>
                <span className={styles.areaVal}>{area}</span>
                <span className={styles.areaRemove}>
                  <Icon name="close" />
                </span>
              </span>
            ))}
          </div>
        </div>
      </div>
    </>
  )
}
