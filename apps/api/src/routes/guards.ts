import { and, eq } from 'drizzle-orm';
import { db, schema } from '../db/client';
import { notFound } from '../errors';

export async function getOwnedProject(userId: string, projectId: string) {
  const [project] = await db()
    .select()
    .from(schema.projects)
    .where(and(eq(schema.projects.id, projectId), eq(schema.projects.userId, userId)));
  if (!project) throw notFound('Project');
  return project;
}

export async function getOwnedMap(userId: string, mapId: string) {
  const [row] = await db()
    .select({ map: schema.maps, project: schema.projects })
    .from(schema.maps)
    .innerJoin(schema.projects, eq(schema.maps.projectId, schema.projects.id))
    .where(and(eq(schema.maps.id, mapId), eq(schema.projects.userId, userId)));
  if (!row) throw notFound('Map');
  return row;
}

export async function getOwnedSource(userId: string, sourceId: string) {
  const [row] = await db()
    .select({ source: schema.sources, project: schema.projects })
    .from(schema.sources)
    .innerJoin(schema.projects, eq(schema.sources.projectId, schema.projects.id))
    .where(and(eq(schema.sources.id, sourceId), eq(schema.projects.userId, userId)));
  if (!row) throw notFound('Source');
  return row;
}
