import DeviceFrame from '../Media/DeviceFrame'
import Media from '../Media/Media'
import IntroLayer from '../Intros/IntroLayer'
import { site } from '../../content/site'
import styles from './Gallery.module.css'

// The frame is about half the viewport wide on desktop and nearly full width on phones
const SIZES = '(min-width: 1024px) 50vw, 90vw'

// A loop's poster as a plain still: the prerendered card and the frame under the clip
const asStill = (entry) => (entry?.kind === 'loop' ? { ...entry, kind: 'still' } : entry)

// The old intro block as a spec sheet: problem, three metrics, audience, deployment, stack, status and footnote
function Glance({ app }) {
  const { ui } = site
  return (
    <div className={styles.glance}>
      {app.problem && <p className={styles.lede}>{app.problem}</p>}
      <ul className={styles.metrics}>
        {app.metrics.map((m) => (
          <li key={m.label} className={styles.metric}>
            <span className={styles.metricValue}>{m.value}</span>
            <span className={styles.metricLabel}>{m.label}</span>
          </li>
        ))}
      </ul>
      <dl className={styles.facts}>
        <div className={styles.fact}>
          <dt>{ui.builtFor}</dt>
          <dd>{app.audience}</dd>
        </div>
        {app.deployedAs && (
          <div className={styles.fact}>
            <dt>{ui.deployedAs}</dt>
            <dd>{app.deployedAs}</dd>
          </div>
        )}
        <div className={styles.fact}>
          <dt>{ui.stackLabel}</dt>
          <dd>
            <ul className={styles.chips}>
              {app.stack.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </dd>
        </div>
      </dl>
      <div className={styles.glanceFoot}>
        <p className={styles.status}>{app.status}</p>
        {app.footnote && <p className={styles.footnote}>{app.footnote}</p>}
      </div>
    </div>
  )
}

// One highlight: a bold centred caption over the app in a device frame (poster, coded intro or clip), or the glance sheet
export default function Card({ app, card, index, current, assets, driver, target, live, preload, videoRef, onClipError }) {
  const { entry } = card
  const ratio = entry ? entry.width / entry.height : 1.6
  return (
    <li className={styles.card} data-index={index} data-kind={card.kind} data-current={current ? '' : undefined}>
      <h3 className={styles.caption}>{card.caption}</h3>
      {card.kind === 'glance' ? (
        <Glance app={app} />
      ) : (
        <div className={styles.media}>
          <div className={styles.frameBox} style={{ '--ratio': ratio }}>
            <DeviceFrame
              title={app.frameTitle}
              accent={app.accent}
              aspect={entry ? `${entry.width} / ${entry.height}` : undefined}
              className={styles.deviceFrame}
            >
              <Media media={asStill(entry)} sizes={SIZES} />
              {card.kind === 'intro' && (
                <div className={styles.layerFill} data-intro-layer>
                  {live && <IntroLayer appId={app.id} app={app} media={assets} driver={driver} target={target} />}
                </div>
              )}
              {card.kind === 'loop' && live && (
                <video
                  ref={videoRef}
                  className={styles.video}
                  muted
                  playsInline
                  disablePictureInPicture
                  preload={preload}
                  tabIndex={-1}
                  aria-hidden="true"
                  onError={(e) => e.target === e.currentTarget && onClipError()}
                >
                  {/* A skipped source (WebM where only MP4 plays) also errors and bubbles here; only the last one failing means nothing can play */}
                  {entry.sources.map((s, i) => (
                    <source key={s.src} src={s.src} type={s.type} onError={i === entry.sources.length - 1 ? onClipError : undefined} />
                  ))}
                </video>
              )}
            </DeviceFrame>
          </div>
        </div>
      )}
    </li>
  )
}
