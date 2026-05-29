import type { MapSpec, Layer, InitialView } from '../map-spec';
import type { SourceCatalogEntry, AttributeSummary } from '../inspection';

export function findLayer(spec: MapSpec, layerId: string): Layer {
  const layer = spec.layers.find((l) => l.id === layerId);
  if (!layer) throw new Error(`No layer with id "${layerId}"`);
  return layer;
}

export function getEntry(
  sources: SourceCatalogEntry[],
  sourceId: string,
): SourceCatalogEntry {
  const entry = sources.find((s) => s.id === sourceId);
  if (!entry) throw new Error(`No source with id "${sourceId}"`);
  return entry;
}

/** Ensure the spec has a Source for this catalog entry; return its id. */
export function ensureSource(spec: MapSpec, entry: SourceCatalogEntry): void {
  if (spec.sources.some((s) => s.id === entry.id)) return;
  spec.sources.push({
    id: entry.id,
    kind: entry.kind,
    url: entry.dataUrl,
    ...(entry.sourceLayer ? { sourceLayer: entry.sourceLayer } : {}),
  });
}

let counter = 0;
/** Deterministic-ish unique layer id (Math.random is unavailable in some hosts). */
export function newLayerId(sourceId: string, existing: MapSpec): string {
  const base = `layer_${sourceId}`;
  if (!existing.layers.some((l) => l.id === base)) return base;
  counter += 1;
  return `${base}_${counter}`;
}

export function combineBbox(
  bboxes: ([number, number, number, number] | null | undefined)[],
): [number, number, number, number] | null {
  const valid = bboxes.filter((b): b is [number, number, number, number] => Array.isArray(b));
  if (valid.length === 0) return null;
  return valid.reduce<[number, number, number, number]>(
    (acc, b) => [
      Math.min(acc[0], b[0]),
      Math.min(acc[1], b[1]),
      Math.max(acc[2], b[2]),
      Math.max(acc[3], b[3]),
    ],
    [Infinity, Infinity, -Infinity, -Infinity],
  );
}

/** Rough center + zoom for a bbox, suitable for an initial view. */
export function bboxToView(bbox: [number, number, number, number]): {
  center: [number, number];
  zoom: number;
} {
  const center: [number, number] = [(bbox[0] + bbox[2]) / 2, (bbox[1] + bbox[3]) / 2];
  const span = Math.max(bbox[2] - bbox[0], bbox[3] - bbox[1]);
  // 360deg -> ~zoom 0; halve the span per zoom level.
  const zoom = span <= 0 ? 14 : Math.max(1, Math.min(18, Math.round(Math.log2(360 / span))));
  return { center, zoom };
}

export function viewForBbox(bbox: [number, number, number, number]): InitialView {
  const { center, zoom } = bboxToView(bbox);
  return { center, zoom, bearing: 0, pitch: 0 };
}

const LABEL_FIELDS = ['name', 'title', 'label', 'id', 'ref'];

/** Pick the most label-worthy attribute (a name-like string field). */
export function pickLabelField(attrs: AttributeSummary[]): string | undefined {
  for (const candidate of LABEL_FIELDS) {
    const hit = attrs.find((a) => a.name.toLowerCase() === candidate && a.type === 'string');
    if (hit) return hit.name;
  }
  return attrs.find((a) => a.type === 'string')?.name;
}
