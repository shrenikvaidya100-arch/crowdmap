// A QR code drawn as an SVG on the server (no image file, crisp at any size).
import { qrSvgPath } from "@/lib/qr";

export function QrCode({ value, label, className = "" }: { value: string; label: string; className?: string }) {
  const { d, size } = qrSvgPath(value);
  return (
    <svg viewBox={`0 0 ${size} ${size}`} role="img" aria-label={label} shapeRendering="crispEdges" className={className}>
      <rect width={size} height={size} fill="#fff" />
      <path d={d} fill="#000" />
    </svg>
  );
}
