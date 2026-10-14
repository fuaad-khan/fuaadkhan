// My Applications hub (v2 scaffold stub): WP-A replaces this with the centered heading and the three app tiles
export default function Applications({ content }) {
  return (
    <section id="applications" data-section="applications" aria-labelledby="applications-title">
      <p className="eyebrow">{content.eyebrow}</p>
      <h2 id="applications-title">{content.headline}</h2>
      <p>{content.body}</p>
    </section>
  )
}
