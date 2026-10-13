// Injected before any page script: per-app privacy scrubs keyed by window.__wp6App, re-run on every DOM change, plus the leak report
;(() => {
  if (window.__privacy) return
  const app = window.__wp6App || ''
  const seen = new Set()

  // Internal hosts, keys and local origins must never be readable in a frame, whatever the app
  const ALWAYS = /gis01|sanjacintoca\.gov\/server|api[_-]?key|[?&]key=|127\.0\.0\.1|localhost:\d+/i
  // A residence as Green Check prints it: "445 X ST ... CA 92583 (residential, built 1941)" or "APN 123-456 (single-family)"
  const RESIDENCE = /(?:\b\d+[A-Z]?(?:\s+[A-Z0-9][A-Z0-9.'#/-]*)+|\bAPN\s+[\w-]+)\s*\([a-z0-9][^)]*\)/g
  // The sensitive-use name inside "Nearest day care center is NAME (day care center), ..."
  const CARE_NAME = /(?<=\bis\s)(.+?)(?=\s\((?:day care center|youth center)\))/g
  const DEV_NOTE = /has not been compiled yet|sensitiveUses\.manual\.json/i

  const style = document.createElement('style')
  style.textContent = '.__redacted { filter: blur(6px) !important; user-select: none; }'

  // Wraps regex matches in el's text nodes in blurred spans; React rewrites a single-text element wholesale, and the observer re-applies
  function blurMatches(el, re, note) {
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
    const nodes = []
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      if (!n.parentElement.closest('.__redacted')) nodes.push(n)
    }
    for (const node of nodes) {
      const text = node.nodeValue
      re.lastIndex = 0
      if (!re.test(text)) continue
      re.lastIndex = 0
      const frag = document.createDocumentFragment()
      let last = 0
      for (let m = re.exec(text); m; m = re.exec(text)) {
        if (!m[0]) {
          re.lastIndex++
          continue
        }
        frag.append(text.slice(last, m.index))
        const span = document.createElement('span')
        span.className = '__redacted'
        span.dataset.private = '1'
        span.textContent = m[0]
        frag.append(span)
        if (note) seen.add(m[0].trim())
        last = m.index + m[0].length
      }
      frag.append(text.slice(last))
      node.replaceWith(frag)
    }
  }

  // Text nodes a viewer could read (rendered, visible, not blurred) whose text passes the cheap test first
  function readable(test, root = document.body) {
    const out = []
    if (!root) return out
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const el = n.parentElement
      if (!el || !n.nodeValue.trim() || !test(n.nodeValue)) continue
      if (el.closest('.__redacted, script, style, noscript, template') || !el.getClientRects().length) continue
      const cs = getComputedStyle(el)
      if (cs.visibility !== 'visible' || Number(cs.opacity) === 0) continue
      out.push({ el, text: n.nodeValue })
    }
    return out
  }

  // Map My City: the officer row (and its copy in the property report) reads "—"; redact.js handles the assessor rows
  function scrubOfficer() {
    for (const el of document.querySelectorAll('#CodeEnforcement, #propertyReportContent .report-list-item')) {
      const m = /^\s*Code Enforcement Officer:\s*(.*?)\s*$/s.exec(el.textContent)
      if (!m || m[1] === '—') continue
      if (m[1] && m[1] !== '--') seen.add(m[1])
      el.textContent = 'Code Enforcement Officer: —'
    }
  }

  // Green Check: residence addresses and day-care / youth-center names blurred, compile notes hidden
  function scrubGreenCheck() {
    for (const el of document.querySelectorAll('#resultPanel .check-detail')) {
      blurMatches(el, RESIDENCE, true)
      if (el.closest('[data-check-id="sensitive:dayCare"], [data-check-id="sensitive:youthCenter"]')) blurMatches(el, CARE_NAME, true)
      if (DEV_NOTE.test(el.textContent)) el.style.setProperty('visibility', 'hidden', 'important')
    }
  }

  // Any app: an internal host, key or local origin printed in the page is blurred where it sits
  function scrubAlways() {
    for (const { el } of readable((t) => ALWAYS.test(t))) el.classList.add('__redacted')
  }

  let queued = false
  function run() {
    queued = false
    if (app === 'map-my-city') scrubOfficer()
    if (app === 'green-check') scrubGreenCheck()
    scrubAlways()
  }

  // Everything still readable that must not be: redact.js leaks plus this app's patterns
  function leaks() {
    run()
    const out = window.__redact ? window.__redact.leaks().map(() => 'private assessor row') : []
    const secrets = [...seen].filter((s) => s.length > 3)
    const residence = (t) => {
      RESIDENCE.lastIndex = 0
      return RESIDENCE.test(t)
    }
    const suspicious = (t) =>
      ALWAYS.test(t) ||
      (app === 'map-my-city' && /Code Enforcement Officer:\s*(?!—|--)\S/.test(t)) ||
      (app === 'green-check' && (residence(t) || DEV_NOTE.test(t))) ||
      secrets.some((s) => t.includes(s))
    for (const { text } of readable(suspicious)) {
      if (ALWAYS.test(text)) out.push('internal host, key or local origin')
      else if (app === 'map-my-city' && /Code Enforcement Officer/.test(text)) out.push('officer name')
      else if (app === 'green-check' && residence(text)) out.push('residence address')
      else if (DEV_NOTE.test(text)) out.push('compile note')
      else out.push('scrubbed string readable elsewhere')
    }
    return out
  }

  const boot = () => {
    document.head.appendChild(style)
    run()
    // Scrubs land before the next paint: observer callbacks run as microtasks after each mutation
    new MutationObserver(() => {
      if (queued) return
      queued = true
      queueMicrotask(run)
    }).observe(document.documentElement, { subtree: true, childList: true, characterData: true })
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot)
  else boot()

  window.__privacy = { run, leaks, seen: () => [...seen] }
})()
