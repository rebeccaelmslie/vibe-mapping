import type { Context } from 'hono';
import { badRequest } from './errors';

/** Read a required path parameter (string-typed even on nested mounts). */
export function param(c: Context, name: string): string {
  const value = c.req.param(name);
  if (!value) throw badRequest(`Missing path parameter: ${name}`);
  return value;
}
