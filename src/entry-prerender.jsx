import { StrictMode } from 'react'
import { prerender } from 'react-dom/static'
import App from './App.jsx'

// Build step 2 (vite build --ssr): the page as static HTML for scripts/prerender.mjs; prerender waits for every lazy part, so nothing streams later
export async function render() {
  const errors = []
  const { prelude } = await prerender(
    <StrictMode>
      <App />
    </StrictMode>,
    { onError: (error) => errors.push(error) },
  )
  // A failed boundary would hydrate as a client render, so any error fails the build instead
  if (errors.length) throw new AggregateError(errors, `prerender failed: ${errors.map((e) => e?.message ?? e).join('; ')}`)
  return new Response(prelude).text()
}
