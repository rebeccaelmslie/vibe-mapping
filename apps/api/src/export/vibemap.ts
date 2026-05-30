import archiver from 'archiver';
import { PassThrough } from 'node:stream';
import type { MapSpec, Source } from '@vibe/shared';
import { env } from '../env';
import { getObjectBytes } from '../storage/s3';
import { mapForToken, unionBboxForSpec } from './bbox';
import { enumerateTiles, tileCountRange, type Bbox } from './tiles';

const LINZ_BASE = 'https://basemaps.linz.govt.nz/v1/tiles/aerial/EPSG:3857';
const TILE_CONCURRENCY = 8;
const DEFAULT_ZMIN = 0;
const DEFAULT_ZMAX = 16;
const MAX_ZMAX = 18;

export interface ExportOptions {
  zmin?: number;
  zmax?: number;
}

export interface BuildResult {
  /** Web-readable stream of the assembled .vibemap zip. */
  stream: NodeJS.ReadableStream;
  /** Suggested filename, e.g. `Carlyon.vibemap`. */
  filename: string;
}

function slugify(s: string): string {
  return s
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .slice(0, 60) || 'map';
}

/**
 * Build a `.vibemap` ZIP for the given share token. The zip is assembled
 * lazily — bytes start flowing to the caller as soon as the manifest is
 * appended, and tiles are downloaded concurrently in the background.
 *
 * Layout:
 *   manifest.json
 *   spec.json                (source.url rewritten to local paths)
 *   sources/<id>.geojson     (one per spec source)
 *   tiles/<z>/<x>/<y>.webp   (raster basemap for the bbox)
 */
export async function buildVibemap(
  token: string,
  opts: ExportOptions = {},
): Promise<BuildResult | null> {
  const map = await mapForToken(token);
  if (!map) return null;

  const zmin = Math.max(0, opts.zmin ?? DEFAULT_ZMIN);
  const zmax = Math.min(MAX_ZMAX, Math.max(zmin, opts.zmax ?? DEFAULT_ZMAX));
  const bbox = await unionBboxForSpec(map.spec);

  const out = new PassThrough();
  const zip = archiver('zip', { zlib: { level: 0 } }); // tiles + GeoJSON don't compress; level 0 is fastest
  zip.pipe(out);
  zip.on('warning', (err) => console.warn('[export] archiver warning', err));
  zip.on('error', (err) => out.destroy(err));

  // Rewrite the spec so all references become local relative paths.
  const rewrittenSpec: MapSpec = {
    ...map.spec,
    sources: map.spec.sources.map((s) => ({ ...s, url: `sources/${s.id}.geojson` })),
  };

  zip.append(
    JSON.stringify(
      {
        format: 'vibemap/1',
        name: map.name,
        mapId: map.id,
        exportedAt: new Date().toISOString(),
        bbox,
        zoomMin: zmin,
        zoomMax: zmax,
        sourceCount: map.spec.sources.length,
      },
      null,
      2,
    ),
    { name: 'manifest.json' },
  );
  zip.append(JSON.stringify(rewrittenSpec), { name: 'spec.json' });

  // Build the rest off the main flow so headers can flush immediately.
  (async () => {
    try {
      await appendSources(zip, map.spec.sources);
      await appendTiles(zip, bbox, zmin, zmax);
      await zip.finalize();
    } catch (err) {
      console.error('[export] failed', err);
      out.destroy(err instanceof Error ? err : new Error(String(err)));
    }
  })();

  return {
    stream: out,
    filename: `${slugify(map.name)}.vibemap`,
  };
}

async function appendSources(zip: archiver.Archiver, sources: Source[]): Promise<void> {
  for (const s of sources) {
    // Source URLs in the DB point at our own /sources/:id/data — we have the
    // canonical bytes in MinIO under sources/<id>/data.geojson.
    const bytes = await getObjectBytes(`sources/${s.id}/data.geojson`);
    if (!bytes) {
      console.warn(`[export] no geojson for ${s.id}, skipping`);
      continue;
    }
    zip.append(Buffer.from(bytes), { name: `sources/${s.id}.geojson` });
  }
}

async function appendTiles(
  zip: archiver.Archiver,
  bbox: Bbox,
  zmin: number,
  zmax: number,
): Promise<void> {
  const total = tileCountRange(bbox, zmin, zmax);
  console.log(`[export] downloading ${total} tiles, z${zmin}-z${zmax}`);
  const iter = enumerateTiles(bbox, zmin, zmax);
  const linzKey = env().LINZ_API_KEY;
  let done = 0;
  let nextLog = Date.now() + 2000;

  // Simple worker pool over the iterator.
  await Promise.all(
    Array.from({ length: TILE_CONCURRENCY }, () => worker()),
  );

  async function worker(): Promise<void> {
    for (;;) {
      const next = iter.next();
      if (next.done) return;
      const { z, x, y } = next.value;
      try {
        const res = await fetch(
          `${LINZ_BASE}/${z}/${x}/${y}.webp?api=${linzKey}`,
        );
        if (res.ok) {
          const buf = Buffer.from(await res.arrayBuffer());
          zip.append(buf, { name: `tiles/${z}/${x}/${y}.webp` });
        }
        // ignore 404 / 5xx for individual tiles — many bbox edges have empty tiles
      } catch (err) {
        console.warn(`[export] tile ${z}/${x}/${y} failed`, err);
      }
      done++;
      if (Date.now() >= nextLog) {
        console.log(`[export] tiles ${done}/${total}`);
        nextLog = Date.now() + 2000;
      }
    }
  }

  console.log(`[export] tiles ${done}/${total} (done)`);
}
