"use client"; // Error boundaries must be Client Components
// Last resort when the root layout itself fails. Must render its own <html>.
export default function GlobalError({ retry }: { error: unknown; retry: () => void }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui, sans-serif", display: "grid", placeItems: "center", minHeight: "100vh", margin: 0 }}>
        <div style={{ textAlign: "center", padding: 16 }}>
          <h1 style={{ fontSize: 20 }}>CrowdMap couldn&rsquo;t load</h1>
          <p style={{ color: "#555" }}>Please try again in a moment.</p>
          <button type="button" onClick={() => retry()}
                  style={{ background: "#2563eb", color: "#fff", border: 0, borderRadius: 6, padding: "8px 16px", cursor: "pointer" }}>
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
