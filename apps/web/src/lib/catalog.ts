import { geometryToLayerType, type SourceCatalogEntry } from '@vibe/shared';
import { API_BASE } from './config';
import type { SourceRow } from './api';

/** Build the source catalog the chat endpoint/tools consume from API rows. */
export function toCatalog(sources: SourceRow[]): SourceCatalogEntry[] {
  return sources
    .filter((s) => s.status === 'ready' && s.inspection && s.geojsonKey)
    .map((s) => ({
      id: s.id,
      name: s.originalFilename,
      layerType: geometryToLayerType(s.inspection!.geometryType),
      dataUrl: `${API_BASE}/sources/${s.id}/data`,
      kind: 'geojson' as const,
      inspection: s.inspection!,
    }));
}
