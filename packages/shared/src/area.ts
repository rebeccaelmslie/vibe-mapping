// Polygon area on the WGS84 sphere. Same formula turf-area uses — a spherical
// shoelace that works for any polygon size at any latitude, no spherical-
// excess pole-special-casing needed.

const RADIUS_M = 6378137; // WGS84 equatorial radius

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

/**
 * Area of a single polygon ring in square metres.
 *
 * - Ring is an array of `[longitude, latitude]` pairs in degrees.
 * - The ring may be open (last point != first) or closed; both are treated as
 *   the same closed polygon.
 * - Always returns a non-negative value (winding direction is ignored).
 *
 * Implements the standard spherical-polygon-area formula:
 *
 *   A = | Σ (λ_{i+1} - λ_i) · sin(φ_{i+1}) | · R² / 2     (degenerate at the poles
 *
 * which is what turf, mapbox and PostGIS all use under the hood.
 */
export function polygonArea(ring: [number, number][]): number {
  const n = ring.length;
  if (n < 3) return 0;
  let total = 0;
  for (let i = 0; i < n; i++) {
    const lower = ring[i]!;
    const middle = ring[(i + 1) % n]!;
    const upper = ring[(i + 2) % n]!;
    total += (toRad(upper[0]) - toRad(lower[0])) * Math.sin(toRad(middle[1]));
  }
  return Math.abs((total * RADIUS_M * RADIUS_M) / 2);
}

/** Convenience: format an area in m² as a human string ("1,234 m²" / "12.34 ha"). */
export function formatArea(m2: number): string {
  if (m2 < 10_000) return `${Math.round(m2).toLocaleString()} m²`;
  const ha = m2 / 10_000;
  if (ha < 100) return `${ha.toFixed(2)} ha`;
  return `${Math.round(ha).toLocaleString()} ha`;
}
