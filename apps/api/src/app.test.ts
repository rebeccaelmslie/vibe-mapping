import { describe, it, expect } from 'vitest';
import { app } from './index';

describe('app wiring', () => {
  it('responds on /health without auth', async () => {
    const res = await app.request('/health');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, service: '@vibe/api' });
  });
});
