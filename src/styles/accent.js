// Accent tokens ('gold' | 'map' | 'yard' | 'green') resolve to the custom properties in global.css
export const accentVar = (token) => (!token || token === 'gold' ? 'var(--accent)' : `var(--accent-${token})`)
