import { StrictMode } from 'react'
import { createRoot, hydrateRoot } from 'react-dom/client'
import App from './App.jsx'
import './styles/global.css'

// /js-flag.js in <head> sets html.js before first paint; this repeats it in case that file failed to load
document.documentElement.classList.add('js')

// Late extras (the topo mask) key off html.loaded so they never compete with fonts and first paint
const markLoaded = () => document.documentElement.classList.add('loaded')
if (document.readyState === 'complete') markLoaded()
else window.addEventListener('load', markLoaded, { once: true })

const root = document.getElementById('root')
const app = (
  <StrictMode>
    <App />
  </StrictMode>
)

// Prerendered HTML hydrates in place; an empty root (dev server) renders from scratch. Elements only: stray whitespace is not markup
if (root.firstElementChild) hydrateRoot(root, app)
else createRoot(root).render(app)
