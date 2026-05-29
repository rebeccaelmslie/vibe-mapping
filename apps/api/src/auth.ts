import { createMiddleware } from 'hono/factory';
import { db, schema } from './db/client';

export type AppVariables = { userId: string };

// Dev auth: trust an `x-dev-user-id` header (defaulting to a fixed dev user).
// Phase 4/6 swaps this for real Clerk session verification (@clerk/backend),
// reading the Authorization bearer token instead. The seam — "resolve a userId,
// then upsert the user row" — stays the same.
export const auth = createMiddleware<{ Variables: AppVariables }>(async (c, next) => {
  const userId = c.req.header('x-dev-user-id')?.trim() || 'dev_user';

  await db()
    .insert(schema.users)
    .values({ id: userId })
    .onConflictDoNothing({ target: schema.users.id });

  c.set('userId', userId);
  await next();
});
