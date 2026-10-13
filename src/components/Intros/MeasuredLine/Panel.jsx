import { fill } from '../values'
import Icon from './Icon'
import { COLUMN_W, HEADER_H, slantPath } from './scene'
import styles from './MeasuredLine.module.css'

// Row glyphs by rule id, as Green Check's ResultPanel maps them
const ROW_ICONS = { cityLimits: 'pin', zoning: 'compass', residential: 'home', school: 'school', dayCare: 'users', youthCenter: 'users' }

// Card width less its 14 px side padding, and the banner's height, for the slanted clip
const BANNER_CLIP = `path('${slantPath(COLUMN_W - 16 - 28, 74)}')`

function Disc({ id, status, tag }) {
  const pass = status === 'pass'
  return (
    <span className={`${styles.disc} ${pass ? styles.discPass : styles.discFail}`} data-ml={tag}>
      <Icon name={ROW_ICONS[id] ?? 'info'} size={18} />
      <span className={`${styles.badge} ${pass ? styles.badgePass : styles.badgeFail}`}>
        <Icon name={pass ? 'check' : 'x'} size={10} stroke={3.4} />
      </span>
    </span>
  )
}

// One settled rule row: icon, title, optional feet chip and map pin, optional detail, optional actions underneath
function Row({ row, status, title, detail, chip, tag, children }) {
  return (
    <li className={styles.check} data-ml={tag}>
      <div className={styles.checkRow}>
        <span className={styles.rowIcon}>
          <Disc id={row.id} status={status} />
        </span>
        <span className={styles.title}>{title}</span>
        {chip && (
          <span className={styles.metric}>
            <span className={`${styles.feet} ${styles.feetPass}`}>{chip}</span>
          </span>
        )}
        {chip && <Icon name="pin" size={16} className={styles.go} />}
        {detail && <span className={styles.detail}>{detail}</span>}
      </div>
      {children}
    </li>
  )
}

const Button = ({ kind, tag, tint, icon, children }) => (
  <span className={`${styles.btn} ${kind ? styles[kind] : ''}`} data-ml={tag}>
    {tint && <span className={styles.tint} data-ml={tint} />}
    {icon && <Icon name={icon} size={14} className={styles.btnIcon} />}
    <span className={styles.btnText}>{children}</span>
  </span>
)

const Stamp = ({ label, tag }) => (
  <span className={styles.stamp} data-ml={tag}>
    <Icon name="ruler" size={14} />
    {label}
  </span>
)

// Green Check's Eligibility Result card: checking, then Not Eligible with its reasons, then the verified Eligible list
export default function Panel({ app, values, viewport }) {
  const labels = app.intro?.labels ?? {}
  const rows = app.intro?.rows ?? []
  const text = (template, extra) => fill(template, { ...values, ...extra })
  const sub = text(labels.verdictSub, { licenseType: labels.licenseType })
  const res = rows.find((row) => row.verifiedTitle) ?? rows.find((row) => row.status === 'fail')
  const passed = rows.filter((row) => row !== res)
  const autoFeet = text(labels.autoFeet)
  const handFeet = text(labels.handFeet)

  return (
    <div className={styles.column} style={{ left: viewport[0] - COLUMN_W, top: HEADER_H, height: viewport[1] - HEADER_H }}>
      <div className={styles.card}>
        <div className={styles.banner} style={{ clipPath: BANNER_CLIP }}>
          <span className={styles.bannerIcon}>
            <Icon name="clipboardCheck" size={24} stroke={2.4} />
          </span>
          <span className={styles.bannerTitle}>{labels.result}</span>
        </div>

        <div className={styles.stack} data-ml="verdicts">
          <div className={`${styles.verdict} ${styles.vPending}`} data-ml="v-pending">
            <span className={styles.vIcon} data-ml="vc-pending">
              <Icon name="search" size={26} />
              <span className={styles.vArc} data-ml="v-arc" />
            </span>
            <span data-ml="vc-pending">
              <span className={styles.vStatus}>{labels.checking}</span>
              <span className={styles.vSub}>{sub}</span>
            </span>
          </div>
          <div className={`${styles.verdict} ${styles.vFail}`} data-ml="v-fail">
            <span className={styles.vIcon} data-ml="vc-fail vi-fail">
              <Icon name="x" size={30} stroke={3} />
            </span>
            <span data-ml="vc-fail vt-fail">
              <span className={styles.vStatus}>{labels.verdictBefore}</span>
              <span className={styles.vSub}>{sub}</span>
            </span>
          </div>
          <div className={`${styles.verdict} ${styles.vPass}`} data-ml="v-pass">
            <span className={styles.vIcon} data-ml="vc-pass vi-pass">
              <Icon name="check" size={30} stroke={3} />
            </span>
            <span data-ml="vc-pass vt-pass">
              <span className={styles.vStatus}>{labels.verdictAfter}</span>
              <span className={styles.vSub}>{sub}</span>
            </span>
          </div>
        </div>

        <div className={styles.stack}>
          <ul className={styles.skel} data-ml="skel">
            {[0, 1, 2].map((i) => (
              <li key={i} className={styles.skelRow}>
                <span className={styles.skelDot} />
                <span className={styles.skelLines}>
                  <span className={styles.skelLine} />
                  <span className={`${styles.skelLine} ${styles.skelShort}`} />
                </span>
                <span className={styles.skelMetric} />
              </li>
            ))}
          </ul>

          <div data-ml="list1">
            <span className={styles.why}>{labels.why}</span>
            {res && (
              <ul className={styles.list}>
                <li className={`${styles.check} ${styles.res}`} data-ml="item1">
                  <span className={styles.rowBg} data-ml="res-bg" />
                  <div className={styles.checkRow}>
                    <span className={styles.rowIcon}>
                      <Disc id={res.id} status="fail" tag="res-fail" />
                      <Disc id={res.id} status="pass" tag="res-pass" />
                    </span>
                    <span className={`${styles.title} ${styles.stack}`}>
                      <span data-ml="res-fail">{res.title}</span>
                      <span data-ml="res-pass">{res.verifiedTitle}</span>
                    </span>
                    <span className={`${styles.metric} ${styles.stack}`}>
                      <span className={`${styles.feet} ${styles.feetFail}`} data-ml="chip-fail">
                        {autoFeet}
                      </span>
                      <span className={`${styles.feet} ${styles.feetVerify}`} data-ml="chip-verify">
                        <span data-ml="count">{autoFeet}</span>
                      </span>
                      <span className={`${styles.feet} ${styles.feetPass}`} data-ml="chip-pass">
                        {handFeet}
                      </span>
                    </span>
                    <Icon name="pin" size={16} className={styles.go} />
                    <span className={`${styles.detail} ${styles.stack}`}>
                      <span data-ml="res-fail">{text(res.detail)}</span>
                      <span data-ml="res-pass">{text(res.verifiedDetail)}</span>
                    </span>
                  </div>
                  <div className={styles.stack} data-ml="res-actions">
                    <div className={styles.actions} data-ml="act-verify">
                      <span className={styles.hint}>{labels.verifyHint}</span>
                      <Button kind="btnOutline" tag="verify-btn" tint="verify-tint" icon="ruler">
                        {labels.verify}
                      </Button>
                    </div>
                    <div className={styles.actions} data-ml="act-drag">
                      <span className={styles.hint}>{labels.dragHint}</span>
                      <Button kind="btnPrimary" tag="complete-btn" tint="complete-tint">
                        {labels.complete}
                      </Button>
                      <Button>{labels.cancel}</Button>
                    </div>
                    <div className={styles.actions} data-ml="act-done">
                      <Stamp label={labels.stamp} tag="stamp" />
                      <Button tag="reset">{labels.reset}</Button>
                    </div>
                  </div>
                </li>
              </ul>
            )}
            {passed.length > 0 && (
              <div className={styles.fold}>
                <span className={styles.foldHead} data-ml="item1">
                  <Icon name="check" size={16} />
                  <span>{text(labels.passed, { count: passed.length })}</span>
                  <Icon name="chevron" size={16} className={styles.foldCaret} />
                </span>
                <ul className={styles.list}>
                  {passed.map((row) => (
                    <Row key={row.id} row={row} status="pass" title={row.title} detail={text(row.detail)} tag="item1" />
                  ))}
                </ul>
              </div>
            )}
          </div>

          <div data-ml="list2">
            <span className={styles.why}>{labels.allMet}</span>
            <ul className={styles.list}>
              {rows.map((row) =>
                row === res ? (
                  <Row key={row.id} row={row} status="pass" title={row.verifiedTitle} detail={text(row.verifiedDetail)} chip={handFeet} tag="item2 res2">
                    <div className={styles.actions}>
                      <Stamp label={labels.stamp} />
                      <Button>{labels.reset}</Button>
                    </div>
                  </Row>
                ) : (
                  <Row key={row.id} row={row} status="pass" title={row.title} detail={text(row.detail)} tag="item2" />
                ),
              )}
            </ul>
          </div>
        </div>
      </div>
    </div>
  )
}
