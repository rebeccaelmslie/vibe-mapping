import { Hono } from 'hono';
import { eq } from 'drizzle-orm';
import { db, schema } from '../db/client';
import { notFound } from '../errors';

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
