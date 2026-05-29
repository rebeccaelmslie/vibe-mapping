import { Hono } from 'hono';
import { z } from 'zod';
import { desc, eq } from 'drizzle-orm';
import { db, schema } from '../db/client';
import { id } from '../ids';
import { badRequest } from '../errors';
import { getOwnedProject } from './guards';
import { param } from '../http';
import type { AppVariables } from '../auth';

export const projects = new Hono<{ Variables: AppVariables }>();

const createBody = z.object({ name: z.string().min(1).max(200) });

projects.post('/', async (c) => {
  const parsed = createBody.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) throw badRequest('A project `name` is required');
  const project = { id: id('proj'), userId: c.get('userId'), name: parsed.data.name };
  await db().insert(schema.projects).values(project);
  return c.json({ project }, 201);
});

projects.get('/', async (c) => {
  const rows = await db()
    .select()
    .from(schema.projects)
    .where(eq(schema.projects.userId, c.get('userId')))
    .orderBy(desc(schema.projects.createdAt));
  return c.json({ projects: rows });
});

projects.get('/:projectId', async (c) => {
  const project = await getOwnedProject(c.get('userId'), param(c, 'projectId'));
  const [sources, maps] = await Promise.all([
    db()
      .select()
      .from(schema.sources)
      .where(eq(schema.sources.projectId, project.id))
      .orderBy(desc(schema.sources.createdAt)),
    db()
      .select()
      .from(schema.maps)
      .where(eq(schema.maps.projectId, project.id))
      .orderBy(desc(schema.maps.updatedAt)),
  ]);
  return c.json({ project, sources, maps });
});
