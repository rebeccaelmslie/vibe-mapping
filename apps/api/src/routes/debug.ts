import { Hono } from 'hono';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { badRequest } from '../errors';

// Public dev-debug endpoint. Receives a PNG snapshot of the map + JSON
// metadata, writes both to /tmp/vibe-debug/ so the developer can inspect what
// the browser was actually showing. Keep this off in prod.
export const debug = new Hono();

const DIR = '/tmp/vibe-debug';

debug.post('/report', async (c) => {
  const body = (await c.req.json().catch(() => null)) as
    | { png?: string; meta?: unknown }
    | null;
  if (!body || typeof body.png !== 'string') throw badRequest('expected { png, meta }');

  // Strip the `data:image/png;base64,` prefix and decode.
  const base64 = body.png.replace(/^data:image\/png;base64,/, '');
  const buffer = Buffer.from(base64, 'base64');

  await mkdir(DIR, { recursive: true });
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const pngPath = join(DIR, `report-${ts}.png`);
  const metaPath = join(DIR, `report-${ts}.json`);
  const latestPng = join(DIR, 'latest.png');
  const latestMeta = join(DIR, 'latest.json');

  await Promise.all([
    writeFile(pngPath, buffer),
    writeFile(latestPng, buffer),
    writeFile(metaPath, JSON.stringify(body.meta ?? {}, null, 2)),
    writeFile(latestMeta, JSON.stringify(body.meta ?? {}, null, 2)),
  ]);

  console.log(`[debug] report saved: ${pngPath} (${buffer.length} bytes)`);
  return c.json({ ok: true, png: pngPath });
});
