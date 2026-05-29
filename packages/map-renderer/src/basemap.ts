import type { MapSpec } from '@vibe/shared';
import type { RasterSource } from './maplibre-types';

const MAPTILER = 'https://api.maptiler.com';

type Basemap = MapSpec['basemap'];

// MapTiler raster tile endpoints. Raster (rather than vector style JSON) keeps
// the renderer pure and self-contained — it emits one style object with no
// external style to fetch/merge. Swap here if BASEMAP_PROVIDER changes.
const TILE_TEMPLATES: Record<Basemap, string> = {
  aerial: `${MAPTILER}/tiles/satellite-v2/{z}/{x}/{y}.jpg`,
  streets: `${MAPTILER}/maps/streets-v2/256/{z}/{x}/{y}.png`,
  hybrid: `${MAPTILER}/maps/hybrid/256/{z}/{x}/{y}.jpg`,
};

const ATTRIBUTION =
  '© <a href="https://www.maptiler.com/copyright/">MapTiler</a> © <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>';

export function basemapSource(basemap: Basemap, maptilerKey: string): RasterSource {
  return {
    type: 'raster',
    tiles: [`${TILE_TEMPLATES[basemap]}?key=${maptilerKey}`],
    tileSize: 256,
    attribution: ATTRIBUTION,
    maxzoom: 22,
  };
}

/** Glyphs endpoint required for any label (symbol) layers. */
export function glyphsUrl(maptilerKey: string): string {
  return `${MAPTILER}/fonts/{fontstack}/{range}.pbf?key=${maptilerKey}`;
}
