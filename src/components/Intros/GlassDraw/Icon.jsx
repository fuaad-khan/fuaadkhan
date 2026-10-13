// Minimal 16x16 stand-ins for the app's Font Awesome glyphs (the CSP allows no icon font); s = stroked outline, f = filled shape
const ICONS = {
  search: { s: 'M7 2.5a4.5 4.5 0 1 1 0 9a4.5 4.5 0 1 1 0-9M10.4 10.4L14 14' },
  globe: { s: 'M8 2a6 6 0 1 1 0 12a6 6 0 1 1 0-12M2 8h12M8 2c-2.2 2.4-2.2 9.6 0 12M8 2c2.2 2.4 2.2 9.6 0 12' },
  external: { s: 'M9 2.5h4.5V7M13.5 2.5L7.5 8.5M11.5 9.5v3.5h-9v-9H6' },
  pencil: { s: 'M3 13l.6-3.2l7.7-7.7l2.6 2.6l-7.7 7.7zM9.8 3.8l2.6 2.6' },
  share: { s: 'M11.5 2.5a2 2 0 1 1 0 4a2 2 0 1 1 0-4M4.5 6a2 2 0 1 1 0 4a2 2 0 1 1 0-4M11.5 9.5a2 2 0 1 1 0 4a2 2 0 1 1 0-4M6.3 7.1l3.4-1.8M6.3 8.9l3.4 1.8' },
  upload: { s: 'M4 1.8h5.5l3 3v9.4h-8.5zM8 12V7.2M5.8 9.2L8 7l2.2 2.2' },
  info: { s: 'M8 2a6 6 0 1 1 0 12a6 6 0 1 1 0-12M8 7.2v4M8 4.8v.4' },
  layers: { s: 'M8 2.5l6 3l-6 3l-6-3zM2 8.5l6 3l6-3M2 11.2l6 3l6-3' },
  house: { f: 'M8 1.8l6.6 5.6h-1.8V14H9.6v-3.6H6.4V14H3.2V7.4H1.4z' },
  seedling: { f: 'M7.3 14V8.6C4.2 8.6 2.4 6.8 2.4 3.7c3.1 0 4.9 1.6 5.2 4.1C8 5.2 9.7 3.3 13.6 3.3c0 3.6-2 5.5-5.3 5.6V14z' },
  slab: { f: 'M1 2.7c1.75 0 1.75 2.3 3.5 2.3s1.75-2.3 3.5-2.3s1.75 2.3 3.5 2.3s1.75-2.3 3.5-2.3v11.6H1z' },
  magnet: { s: 'M3.5 2.5v5.5a4.5 4.5 0 0 0 9 0V2.5M3.5 5.2h3M9.5 5.2h3M6.5 2.5v5.5a1.5 1.5 0 0 0 3 0V2.5' },
  vector: { s: 'M4 4h8v8H4zM2.5 2.5h3v3h-3zM10.5 2.5h3v3h-3zM2.5 10.5h3v3h-3zM10.5 10.5h3v3h-3z' },
  undo: { s: 'M3.5 8a4.5 4.5 0 1 0 1.3-3.2M3 2.6v2.6h2.6' },
  redo: { s: 'M12.5 8a4.5 4.5 0 1 1-1.3-3.2M13 2.6v2.6h-2.6' },
  trash: { s: 'M2.5 4h11M6 4V2.5h4V4M4 4l.7 9.5h6.6L12 4M6.7 6.5v4.5M9.3 6.5v4.5' },
  crosshair: { s: 'M8 3a5 5 0 1 1 0 10a5 5 0 1 1 0-10M8 1v3.5M8 11.5V15M1 8h3.5M11.5 8H15' },
  close: { s: 'M4 4l8 8M12 4l-8 8' },
  plus: { s: 'M8 3v10M3 8h10' },
  minus: { s: 'M3 8h10' },
  moon: { f: 'M10.4 1.6A6.4 6.4 0 1 0 14.4 11A5.2 5.2 0 0 1 10.4 1.6z' },
  sun: { s: 'M8 5a3 3 0 1 1 0 6a3 3 0 1 1 0-6M8 1v1.8M8 13.2V15M1 8h1.8M13.2 8H15M3 3l1.3 1.3M11.7 11.7L13 13M3 13l1.3-1.3M11.7 4.3L13 3' },
}

// Decorative glyph in currentColor; the intro root is aria-hidden, so icons carry no names
export default function Icon({ name, className }) {
  const icon = ICONS[name]
  if (!icon) return null
  return (
    <svg className={className} viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      {icon.f ? (
        <path d={icon.f} fill="currentColor" />
      ) : (
        <path d={icon.s} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      )}
    </svg>
  )
}
