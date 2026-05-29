import { Hono } from 'hono';
import { z } from 'zod';
import { desc, eq } from 'drizzle-orm';
import { mapSpec, type MapSpec } from '@vibe/shared';
import { db, schema } from '../db/client';
import { id, shareToken } from '../ids';
import { badRequest } from '../errors';
import { env } from '../env';
import { getOwnedProject, getOwnedMap } from './guards';
import { param } from '../http';
import type { AppVariables } from '../auth';

function emptySpec(mapId: string, name: string): MapSpec {
  return mapSpec.parse({
    id: mapId,
    name,
    basemap: 'aerial',
    initialView: { center: [0, 0], zoom: 2 },
    sources: [],
    layers: [],
  });
}

// Mounted at /projects/:projectId/maps
export const projectMaps = new Hono<{ Variables: AppVariables }>();

const createBody = z.object({
  name: z.string().min(1).max(200),
  spec: mapSpec.optional(),
});

projectMaps.post('/', async (c) => {
  const project = await getOwnedProject(c.get('userId'), param(c, 'projectId'));
  const parsed = createBody.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) throw badRequest('A map `name` is required');

  const mapId = id('map');
  const spec = parsed.data.spec
    ? { ...parsed.data.spec, id: mapId, name: parsed.data.name }
    : emptySpec(mapId, parsed.data.name);

  const row = { id: mapId, projectId: project.id, name: parsed.data.name, spec };
  await db().insert(schema.maps).values(row);
  return c.json({ map: row }, 201);
});

projectMaps.get('/', async (c) => {
  const project = await getOwnedProject(c.get('userId'), param(c, 'projectId'));
  const rows = await db()
    .select()
    .from(schema.maps)
    .where(eq(schema.maps.projectId, project.id))
    .orderBy(desc(schema.maps.updatedAt));
  return c.json({ maps: rows });
});

// Mounted at /maps
export const maps = new Hono<{ Variables: AppVariables }>();

maps.get('/:id', async (c) => {
  const { map } = await getOwnedMap(c.get('userId'), c.req.param('id'));
  return c.json({ map });
});

const updateBody = z.object({ spec: mapSpec });

maps.put('/:id', async (c) => {
  const { map } = await getOwnedMap(c.get('userId'), c.req.param('id'));
  const parsed = updateBody.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) throw badRequest('A valid `spec` is required');

  const spec = { ...parsed.data.spec, id: map.id };
  const [updated] = await db()
    .update(schema.maps)
    .set({ spec, name: spec.name, updatedAt: new Date() })
    .where(eq(schema.maps.id, map.id))
    .returning();
  return c.json({ map: updated });
});

maps.post('/:id/share', async (c) => {
  const { map } = await getOwnedMap(c.get('userId'), c.req.param('id'));
  const token = shareToken();
  await db().insert(schema.shareLinks).values({ id: id('share'), mapId: map.id, token });
  return c.json(
    { token, fetchUrl: `${env().PUBLIC_API_URL}/share/${token}` },
    201,
  );
});
