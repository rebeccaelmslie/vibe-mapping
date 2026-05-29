// Inspection = what we learn about an uploaded source. Produced by the API's
// inspection job (apps/api), consumed by the LLM tools and the web client.

export type AttributeType = 'string' | 'number' | 'boolean' | 'mixed' | 'null';

export interface AttributeSummary {
  name: string;
  type: AttributeType;
  presentCount: number;
  sampleValues: (string | number | boolean)[];
  valueCounts?: { value: string | number | boolean; count: number }[];
  numericRange?: { min: number; max: number };
}

export interface Inspection {
  geometryType: string; // dominant geometry type, e.g. 'LineString'
  geometryTypes: string[];
  featureCount: number;
  bbox: [number, number, number, number] | null; // [minLng, minLat, maxLng, maxLat]
  attributes: AttributeSummary[];
}

/** The three concrete layer kinds the renderer supports. */
export type LayerType = 'point' | 'line' | 'polygon';

/** Map a GeoJSON geometry type to one of our layer kinds. */
export function geometryToLayerType(geometryType: string): LayerType {
  const g = geometryType.toLowerCase();
  if (g.includes('point')) return 'point';
  if (g.includes('line')) return 'line';
  return 'polygon';
}

/**
 * A source as the LLM tools see it: enough to build a layer and reason about
 * styling, without any storage/DB detail. The web client builds these from API
 * source rows and passes them to the chat endpoint.
 */
export interface SourceCatalogEntry {
  id: string;
  name: string;
  layerType: LayerType;
  /** geojson data URL or vector tile template the renderer fetches. */
  dataUrl: string;
  kind: 'geojson' | 'vector';
  sourceLayer?: string;
  inspection: Inspection;
}
