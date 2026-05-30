import { eq, inArray } from 'drizzle-orm';
import type { Inspection, MapSpec } from '@vibe/shared';
import { db, schema } from '../db/client';
import type { Bbox } from './tiles';

/**
 * Union of the inspection bboxes of the spec's data sources. Falls back to
 * a ~5 km square around the spec's initial-view centre so the exporter
 * always has something to download (better a small over-estimate than zero
 * tiles).
 */
export async function unionBboxForSpec(spec: MapSpec): Promise<Bbox> {
  const ids = spec.sources.map((s) => s.id);
  let union: Bbox | null = null;
  if (ids.length > 0) {
    const rows = await db()
      .select({ inspection: schema.sources.inspection })
      .from(schema.sources)
      .where(inArray(schema.sources.id, ids));
    for (const r of rows) {
      const b = (r.inspection as Inspection | null)?.bbox;
      if (!b) continue;
      union = union ? merge(union, b) : [...b];
    }
  }
  if (union) return union;
  const [lng, lat] = spec.initialView.center;
  const d = 0.045; // ~5 km
  return [lng - d, lat - d, lng + d, lat + d];
}

/** Look up a map by share token. Returns null if no token / no map. */
export async function mapForToken(
  token: string,
): Promise<{ id: string; name: string; spec: MapSpec } | null> {
  const [row] = await db()
    .select({ map: schema.maps })
    .from(schema.shareLinks)
    .innerJoin(schema.maps, eq(schema.shareLinks.mapId, schema.maps.id))
    .where(eq(schema.shareLinks.token, token));
  if (!row) return null;
  return { id: row.map.id, name: row.map.name, spec: row.map.spec as MapSpec };
}

function merge(a: Bbox, b: Bbox): Bbox {
  return [
    Math.min(a[0], b[0]),
    Math.min(a[1], b[1]),
    Math.max(a[2], b[2]),
    Math.max(a[3], b[3]),
  ];
}
