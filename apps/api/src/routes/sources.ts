import { Hono } from 'hono';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { eq } from 'drizzle-orm';
import { db, schema } from '../db/client';
import { id } from '../ids';
import { badRequest, notFound } from '../errors';
import { putObject, getObjectBytes } from '../storage/s3';
import {
  detectFormat,
  convertToGeoJSON,
  summarizeGeoJSON,
  tippecanoeAvailable,
} from '../inspect/inspect';
import { getOwnedProject, getOwnedSource } from './guards';
import { param } from '../http';
import type { AppVariables } from '../auth';

const TILE_THRESHOLD_BYTES = 5 * 1024 * 1024;

// Convert -> inspect -> store. Runs inline so the upload response carries the
// inspection. Fine for the MVP's file sizes; move to a job queue if it grows.
async function processSource(
  sourceId: string,
  rawBuffer: Buffer,
  filename: string,
  format: ReturnType<typeof detectFormat>,
) {
  const dir = await mkdtemp(join(tmpdir(), 'vibe-source-'));
  const inputPath = join(dir, filename); // keep extension for gdal driver detection
  try {
    await writeFile(inputPath, rawBuffer);
    const { text, fc } = await convertToGeoJSON(inputPath, format);
    const inspection = summarizeGeoJSON(fc);

    const geojsonKey = `sources/${sourceId}/data.geojson`;
    await putObject(geojsonKey, text, 'application/geo+json');

    const sizeBytes = Buffer.byteLength(text);
    if (sizeBytes > TILE_THRESHOLD_BYTES && !(await tippecanoeAvailable())) {
      console.warn(
        `[sources] ${sourceId} is ${(sizeBytes / 1e6).toFixed(1)}MB but tippecanoe is not installed — serving raw GeoJSON. Install tippecanoe for vector tiles.`,
      );
    }

    await db()
      .update(schema.sources)
      .set({ status: 'ready', geojsonKey, sizeBytes, inspection })
      .where(eq(schema.sources.id, sourceId));
  } catch (err) {
    await db()
      .update(schema.sources)
      .set({ status: 'failed', error: err instanceof Error ? err.message : String(err) })
      .where(eq(schema.sources.id, sourceId));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

// Mounted at /projects/:projectId/sources
export const projectSources = new Hono<{ Variables: AppVariables }>();

projectSources.post('/', async (c) => {
  const project = await getOwnedProject(c.get('userId'), param(c, 'projectId'));

  const body = await c.req.parseBody();
  const file = body['file'];
  if (!(file instanceof File)) throw badRequest('multipart field `file` is required');

  const format = detectFormat(file.name);
  const buffer = Buffer.from(await file.arrayBuffer());
  const sourceId = id('src');

  const rawKey = `sources/${sourceId}/raw/${file.name}`;
  await putObject(rawKey, buffer, file.type || 'application/octet-stream');

  await db().insert(schema.sources).values({
    id: sourceId,
    projectId: project.id,
    originalFilename: file.name,
    format,
    status: 'inspecting',
    rawKey,
  });

  await processSource(sourceId, buffer, file.name, format);

  const [source] = await db()
    .select()
    .from(schema.sources)
    .where(eq(schema.sources.id, sourceId));
  return c.json({ source }, 201);
});

projectSources.get('/', async (c) => {
  const project = await getOwnedProject(c.get('userId'), param(c, 'projectId'));
  const rows = await db()
    .select()
    .from(schema.sources)
    .where(eq(schema.sources.projectId, project.id));
  return c.json({ sources: rows });
});

// Mounted at /sources
export const sources = new Hono<{ Variables: AppVariables }>();

sources.get('/:id', async (c) => {
  const { source } = await getOwnedSource(c.get('userId'), c.req.param('id'));
  return c.json({ source });
});

// Public GeoJSON stream — the renderer (web + mobile, incl. shared maps) fetches
// source data from here, so it must be reachable without auth. Ids are
// unguessable UUIDs; tighten to share-scoped tokens if this data is sensitive.
export const sourceData = new Hono();

sourceData.get('/:id/data', async (c) => {
  const [source] = await db()
    .select()
    .from(schema.sources)
    .where(eq(schema.sources.id, c.req.param('id')));
  if (!source || !source.geojsonKey) throw notFound('Source data');

  const bytes = await getObjectBytes(source.geojsonKey);
  if (!bytes) throw notFound('Source data');

  c.header('Content-Type', 'application/geo+json');
  c.header('Cache-Control', 'public, max-age=60');
  return c.body(bytes as unknown as ArrayBuffer);
});
