// The CrowdMap icon (green → yellow → red crowd scale with a white dot),
// drawn with ImageResponse so no image files need to be kept in sync.
import { ImageResponse } from "next/og";

export function brandIcon(size: number, { maskable = false } = {}) {
  // Maskable icons need a safe zone: Android may crop to a circle or squircle.
  const inner = maskable ? Math.round(size * 0.62) : size;
  return new ImageResponse(
    (
      <div style={{ width: size, height: size, display: "flex", alignItems: "center", justifyContent: "center",
                    background: maskable ? "#2563eb" : "transparent" }}>
        <div style={{
          width: inner, height: inner, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center",
          background: "linear-gradient(135deg, #16a34a 0%, #eab308 50%, #dc2626 100%)",
        }}>
          <div style={{ width: inner * 0.3, height: inner * 0.3, borderRadius: "50%", background: "#ffffff" }} />
        </div>
      </div>
    ),
    { width: size, height: size },
  );
}
