// Render-blocking on purpose: html.js must be set before first paint so .js-gated CSS never flashes its no-JS state
document.documentElement.classList.add('js')

// A refresh starts at the top: scroll restoration is off from the first load (Chrome decides before a reloaded page runs), and a reload drops the section hash a nav click left
;(function () {
  if ('scrollRestoration' in history) history.scrollRestoration = 'manual'
  var entry = window.performance && performance.getEntriesByType && performance.getEntriesByType('navigation')[0]
  if (entry && entry.type === 'reload' && location.hash) history.replaceState(history.state, '', location.pathname + location.search)
})()
