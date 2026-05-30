// Tile math for the `.vibemap` export. Pure: bbox -> XYZ tile triples
// (slippy / Web Mercator, EPSG:3857). Same convention the renderer + LINZ
// Basemaps use.

export type Bbox = [number, number, number, number]; // [west, south, east, north] in degrees

/** Real average bytes-per-tile measured against LINZ aerial WebP. Used by the
 * size-estimate endpoint so the web UI can show an honest "~8 MB" label
 * before the user commits to a download. */
export const AVG_TILE_BYTES = 12 * 1024;

export interface TileCoord {
  z: number;
  x: number;
  y: number;
}

function lon2x(lon: number, z: number): number {
  return Math.floor(((lon + 180) / 360) * 2 ** z);
}

function lat2y(lat: number, z: number): number {
  const rad = (lat * Math.PI) / 180;
  return Math.floor(((1 - Math.asinh(Math.tan(rad)) / Math.PI) / 2) * 2 ** z);
}

/** Inclusive [xmin, ymin, xmax, ymax] tile range covering bbox at zoom z. */
export function tileRange(
  bbox: Bbox,
  z: number,
): { xmin: number; ymin: number; xmax: number; ymax: number } {
  const [w, s, e, n] = bbox;
  return {
    xmin: lon2x(w, z),
    xmax: lon2x(e, z),
    // y is inverted: north (max lat) -> smaller y
    ymin: lat2y(n, z),
    ymax: lat2y(s, z),
  };
}

/** Number of tiles needed to cover the bbox at the given zoom (inclusive). */
export function tileCount(bbox: Bbox, z: number): number {
  const r = tileRange(bbox, z);
  return (r.xmax - r.xmin + 1) * (r.ymax - r.ymin + 1);
}

/** Total tiles for the bbox at every zoom in [zmin, zmax]. */
export function tileCountRange(bbox: Bbox, zmin: number, zmax: number): number {
  let total = 0;
  for (let z = zmin; z <= zmax; z++) total += tileCount(bbox, z);
  return total;
}

/** Enumerate every {z,x,y} triple covering the bbox across [zmin, zmax]. */
export function* enumerateTiles(
  bbox: Bbox,
  zmin: number,
  zmax: number,
): IterableIterator<TileCoord> {
  for (let z = zmin; z <= zmax; z++) {
    const r = tileRange(bbox, z);
    for (let x = r.xmin; x <= r.xmax; x++) {
      for (let y = r.ymin; y <= r.ymax; y++) {
        yield { z, x, y };
      }
    }
  }
}

/** Best-effort byte-size estimate for a tile pack covering the bbox. */
export function estimateBytes(bbox: Bbox, zmin: number, zmax: number): number {
  return tileCountRange(bbox, zmin, zmax) * AVG_TILE_BYTES;
}
