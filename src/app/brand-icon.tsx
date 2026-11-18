// The CrowdMap icon: the header logo (white map pin with a pulse line) on a
// blue circle, drawn with ImageResponse so no image files need to be kept in
// sync. The browser-tab icon is the same drawing in app/icon.svg.
import { ImageResponse } from "next/og";

export function brandIcon(size: number, { maskable = false } = {}) {
  // Maskable icons need a safe zone: Android may crop to a circle or squircle.
  const inner = maskable ? Math.round(size * 0.62) : size;
  const pin = Math.round(inner * 0.72);
  return new ImageResponse(
    (
      <div style={{ width: size, height: size, display: "flex", alignItems: "center", justifyContent: "center",
                    background: maskable ? "#2563eb" : "transparent" }}>
        <div style={{ width: inner, height: inner, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", background: "#2563eb" }}>
          <svg width={pin} height={pin} viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 21.5s-6.5-6.2-6.5-11.5a6.5 6.5 0 0 1 13 0c0 5.3-6.5 11.5-6.5 11.5Z" />
            <path d="M8.8 10.5h1.2l1-2.2 2 4.4 1-2.2h1.2" />
          </svg>
        </div>
      </div>
    ),
    { width: size, height: size },
  );
}
