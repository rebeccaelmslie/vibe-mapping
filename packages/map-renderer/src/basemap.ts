import type { MapSpec } from '@vibe/shared';
import type { RasterSource } from './maplibre-types';

const MAPTILER = 'https://api.maptiler.com';
const LINZ = 'https://basemaps.linz.govt.nz/v1';

type Basemap = MapSpec['basemap'];

export interface BasemapKeys {
  /** Required: MapTiler powers streets/hybrid and the glyphs URL (used for labels). */
  maptilerKey: string;
  /**
   * Optional: LINZ Basemaps key. When set, the `aerial` basemap is served
   * from LINZ's NZ aerial imagery (CC BY 4.0, offline-cache-friendly).
   * When absent, aerial falls back to MapTiler satellite-v2.
   * Get a key at https://basemaps.linz.govt.nz/login (free).
   */
  linzKey?: string;
}

// MapTiler raster tile endpoints. Raster (rather than vector style JSON) keeps
// the renderer pure and self-contained — it emits one style object with no
// external style to fetch/merge.
const MAPTILER_TILES: Record<Basemap, string> = {
  aerial: `${MAPTILER}/tiles/satellite-v2/{z}/{x}/{y}.jpg`,
  streets: `${MAPTILER}/maps/streets-v2/256/{z}/{x}/{y}.png`,
  hybrid: `${MAPTILER}/maps/hybrid/256/{z}/{x}/{y}.jpg`,
};

const MAPTILER_ATTRIBUTION =
  '© <a href="https://www.maptiler.com/copyright/">MapTiler</a> © <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>';
const LINZ_ATTRIBUTION =
  '© <a href="https://www.linz.govt.nz/">Toitū Te Whenua LINZ</a> · CC BY 4.0';

export function basemapSource(basemap: Basemap, keys: BasemapKeys): RasterSource {
  // LINZ aerial is the preferred NZ-quality basemap when we have a key.
  if (basemap === 'aerial' && keys.linzKey) {
    return {
      type: 'raster',
      tiles: [`${LINZ}/tiles/aerial/EPSG:3857/{z}/{x}/{y}.webp?api=${keys.linzKey}`],
      tileSize: 256,
      attribution: LINZ_ATTRIBUTION,
      maxzoom: 22,
    };
  }
  // streets / hybrid (and aerial without a LINZ key) come from MapTiler.
  return {
    type: 'raster',
    tiles: [`${MAPTILER_TILES[basemap]}?key=${keys.maptilerKey}`],
    tileSize: 256,
    attribution: MAPTILER_ATTRIBUTION,
    maxzoom: 22,
  };
}

/** Glyphs endpoint required for any label (symbol) layers. */
export function glyphsUrl(maptilerKey: string): string {
  return `${MAPTILER}/fonts/{fontstack}/{range}.pbf?key=${maptilerKey}`;
}
