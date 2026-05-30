import { Hono } from 'hono';
import { eq } from 'drizzle-orm';
import { stream } from 'hono/streaming';
import { db, schema } from '../db/client';
import { notFound, badRequest } from '../errors';
import { mapForToken, unionBboxForSpec } from '../export/bbox';
import { estimateBytes, tileCountRange } from '../export/tiles';
import { buildVibemap } from '../export/vibemap';

const MAX_ZMAX = 18;
const DEFAULT_ZMAX = 16;

function parseZmax(raw: string | undefined): number {
  if (!raw) return DEFAULT_ZMAX;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 8 || n > MAX_ZMAX) {
    throw badRequest(`zmax must be 8..${MAX_ZMAX}`);
  }
  return Math.floor(n);
}

// Public — no auth. Resolves a share token to the map's MapSpec for the web
// share page and the mobile viewer.
export const share = new Hono();

share.get('/:token', async (c) => {
  const [row] = await db()
    .select({ map: schema.maps })
    .from(schema.shareLinks)
    .innerJoin(schema.maps, eq(schema.shareLinks.mapId, schema.maps.id))
    .where(eq(schema.shareLinks.token, c.req.param('token')));
  if (!row) throw notFound('Shared map');

  return c.json({ map: { id: row.map.id, name: row.map.name, spec: row.map.spec } });
});

/**
 * Cheap size estimate for a .vibemap export of this map. Pure math — bbox
 * union + tile count × average bytes/tile. Lets the web UI label the
 * Export button honestly before the heavy download starts.
 */
share.get('/:token/export-size', async (c) => {
  const map = await mapForToken(c.req.param('token'));
  if (!map) throw notFound('Shared map');
  const zmax = parseZmax(c.req.query('zmax'));
  const bbox = await unionBboxForSpec(map.spec);
  return c.json({
    bbox,
    zoomMin: 0,
    zoomMax: zmax,
    tileCount: tileCountRange(bbox, 0, zmax),
    estimatedBytes: estimateBytes(bbox, 0, zmax),
  });
});

/**
 * Stream a `.vibemap` ZIP (manifest + spec + sources/*.geojson + tiles/{z}/{x}/{y}.webp).
 * Public — the URL itself is the access token.
 */
share.get('/:token/export.vibemap', async (c) => {
  const token = c.req.param('token');
  const zmax = parseZmax(c.req.query('zmax'));
  const result = await buildVibemap(token, { zmin: 0, zmax });
  if (!result) throw notFound('Shared map');

  c.header('Content-Type', 'application/vnd.vibe.vibemap+zip');
  c.header(
    'Content-Disposition',
    `attachment; filename="${result.filename.replace(/"/g, '\\"')}"`,
  );
  return stream(c, async (s) => {
    const reader = result.stream;
    for await (const chunk of reader) {
      await s.write(chunk as Buffer);
    }
  });
});
