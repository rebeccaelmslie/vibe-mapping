import { serve } from '@hono/node-server';
import { Hono } from 'hono';

const app = new Hono();

app.get('/health', (c) => c.json({ ok: true, service: '@vibe/api' }));

// Mobile-shared endpoints (auth, map fetch, share links) land in Phase 3+.

const port = Number(process.env.PORT ?? 8787);

serve({ fetch: app.fetch, port }, (info) => {
  console.log(`[@vibe/api] listening on http://localhost:${info.port}`);
});

export { app };
