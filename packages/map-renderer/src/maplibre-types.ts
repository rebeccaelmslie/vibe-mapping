// Minimal structural types for the slice of the MapLibre GL style spec we emit.
// Kept local so this package stays dependency-light and usable by both the web
// MapLibre GL JS and the mobile @maplibre/maplibre-react-native renderers.

export type Expression = unknown[];

/** A paint/layout property value: a constant or a MapLibre expression. */
export type StyleValue = string | number | boolean | number[] | Expression;

export interface RasterSource {
  type: 'raster';
  tiles: string[];
  tileSize: number;
  attribution?: string;
  maxzoom?: number;
}

export interface GeoJSONSource {
  type: 'geojson';
  data: string;
  attribution?: string;
}

export interface VectorSource {
  type: 'vector';
  tiles: string[];
  attribution?: string;
}

export type Source = RasterSource | GeoJSONSource | VectorSource;

export interface Layer {
  id: string;
  type: 'raster' | 'circle' | 'line' | 'fill' | 'symbol';
  source: string;
  'source-layer'?: string;
  filter?: Expression;
  layout?: Record<string, StyleValue>;
  paint?: Record<string, StyleValue>;
}

export interface MapLibreStyle {
  version: 8;
  glyphs?: string;
  sources: Record<string, Source>;
  layers: Layer[];
}
