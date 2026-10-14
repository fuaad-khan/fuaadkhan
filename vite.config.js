import { readFileSync } from 'node:fs'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// The site-wide (/*) block of public/_headers, so vite preview (and the audits run against it) enforces the production CSP
function siteHeaders() {
  const headers = {}
  let site = false
  for (const line of readFileSync(new URL('./public/_headers', import.meta.url), 'utf8').split(/\r?\n/)) {
    if (!line.trim() || line.trim().startsWith('#')) continue
    if (!/^\s/.test(line)) site = line.trim() === '/*'
    else if (site) {
      const match = /^\s+([^:\s]+):\s*(.+)$/.exec(line)
      if (match) headers[match[1]] = match[2].trim()
    }
  }
  return headers
}

export default defineConfig(({ isSsrBuild, isPreview }) => ({
  plugins: [react()],
  // One build-time year for the footer, shared by the prerender and the client bundle
  define: { __BUILD_YEAR__: JSON.stringify(new Date().getFullYear()) },
  // Short deterministic class names, identical in the client and SSR builds so prerendered markup hydrates
  css: { modules: { generateScopedName: '[local]_[hash:base64:6]' } },
  // GSAP ships ESM that Node cannot import directly, so the SSR build bundles it
  ssr: { noExternal: ['gsap'] },
  // Dev keeps no CSP (HMR needs inline scripts and a websocket); preview mirrors Cloudflare Pages so violations surface as console errors
  preview: isPreview ? { headers: siteHeaders() } : {},
  build: isSsrBuild
    ? {}
    : {
        rollupOptions: {
          output: {
            // Vendor code changes rarely: separate chunks stay cached across content deploys (they still load up front)
            manualChunks: {
              react: ['react', 'react-dom', 'react-dom/client'],
              gsap: ['gsap', 'gsap/ScrollTrigger', 'gsap/DrawSVGPlugin', 'gsap/Flip'],
            },
          },
        },
      },
}))
