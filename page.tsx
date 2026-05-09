export default function Home() {
  return (
    <main style={{ fontFamily: 'monospace', padding: '2rem' }}>
      <h1>Persona Pipeline</h1>
      <p>Backend running. API routes active:</p>
      <ul>
        <li><code>POST /api/inngest</code> — Inngest function handler</li>
        <li><code>POST /api/webhooks/post-approved</code> — Review dashboard webhook</li>
        <li><code>POST /api/webhooks/engagement-update</code> — Analytics sync</li>
      </ul>
    </main>
  )
}
