// Render-blocking on purpose: html.js must be set before first paint so .js-gated CSS never flashes its no-JS state
document.documentElement.classList.add('js')
