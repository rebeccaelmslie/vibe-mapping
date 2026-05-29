import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { env } from './env';
import { ApiError } from './errors';
import { auth, type AppVariables } from './auth';
import { ensureBucket } from './storage/s3';
import { projects } from './routes/projects';
import { projectSources, sources, sourceData } from './routes/sources';
import { projectMaps, maps } from './routes/maps';
import { share } from './routes/share';
import { debug } from './routes/debug';

const app = new Hono<{ Variables: AppVariables }>();

app.use('*', cors());

app.onError((err, c) => {
  if (err instanceof ApiError) return c.json({ error: err.message }, err.status as 400);
  console.error('[api] unhandled error:', err);
  return c.json({ error: 'Internal server error' }, 500);
});

app.get('/health', (c) => c.json({ ok: true, service: '@vibe/api' }));

// Public (no auth): shared maps + source data the renderer fetches.
app.route('/share', share);
app.route('/sources', sourceData);
app.route('/debug', debug);

// Authenticated app.
const api = new Hono<{ Variables: AppVariables }>();
api.use('*', auth);
api.route('/projects', projects);
api.route('/projects/:projectId/sources', projectSources);
api.route('/projects/:projectId/maps', projectMaps);
api.route('/sources', sources);
api.route('/maps', maps);
app.route('/', api);

async function main() {
  const { PORT } = env();
  await ensureBucket();
  serve({ fetch: app.fetch, port: PORT }, (info) => {
    console.log(`[@vibe/api] listening on http://localhost:${info.port}`);
  });
}

// Don't boot the server (or touch S3) when imported by tests.
if (!process.env.VITEST && process.env.NODE_ENV !== 'test') {
  main().catch((err) => {
    console.error('[api] failed to start:', err);
    process.exit(1);
  });
}

export { app };
