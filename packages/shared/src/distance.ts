// Distances on the WGS84 sphere via the haversine formula. Same R as area.ts.

const RADIUS_M = 6378137;

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

/** Great-circle distance between two [lng, lat] degrees, in metres. */
export function haversine(a: [number, number], b: [number, number]): number {
  const [lng1, lat1] = a;
  const [lng2, lat2] = b;
  const φ1 = toRad(lat1);
  const φ2 = toRad(lat2);
  const dφ = toRad(lat2 - lat1);
  const dλ = toRad(lng2 - lng1);
  const h = Math.sin(dφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(dλ / 2) ** 2;
  return 2 * RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Total length of a [lng, lat] polyline in metres. Returns 0 for fewer than 2 points. */
export function polylineLength(points: [number, number][]): number {
  if (points.length < 2) return 0;
  let sum = 0;
  for (let i = 1; i < points.length; i++) {
    sum += haversine(points[i - 1]!, points[i]!);
  }
  return sum;
}

/** "423 m" / "1.23 km" / "12.3 km". */
export function formatDistance(m: number): string {
  if (m < 1000) return `${Math.round(m)} m`;
  const km = m / 1000;
  if (km < 10) return `${km.toFixed(2)} km`;
  return `${km.toFixed(1)} km`;
}

/** "0:42" / "5:07" / "1:23:45". */
export function formatDuration(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const hh = Math.floor(s / 3600);
  const mm = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  const pad = (n: number) => n.toString().padStart(2, '0');
  return hh > 0 ? `${hh}:${pad(mm)}:${pad(ss)}` : `${mm}:${pad(ss)}`;
}
