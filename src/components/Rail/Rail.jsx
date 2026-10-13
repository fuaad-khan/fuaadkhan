import { accentVar } from '../../styles/accent'
import styles from './Rail.module.css'

// Section rail at --rail-x: base line, scroll-driven fill [data-rail] and nodes [data-node]; host must be position: relative
export default function Rail({ accent = 'gold', nodes = [], className, style }) {
  return (
    <div
      className={className ? `${styles.rail} ${className}` : styles.rail}
      style={{ '--rail-accent': accentVar(accent), ...style }}
      aria-hidden="true"
    >
      <span className={styles.base} />
      <span className={styles.fill} data-rail />
      {nodes.map((node, i) => (
        <span
          key={i}
          className={styles.node}
          data-node={i}
          style={node.accent ? { top: node.at, '--node-accent': accentVar(node.accent) } : { top: node.at }}
        >
          <span className={styles.nodeFill} data-node-fill={i} data-lit={node.lit ? '' : undefined} />
          {node.label && <span className={styles.label}>{node.label}</span>}
        </span>
      ))}
    </div>
  )
}
