import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { env } from '../env';
import * as schema from './schema';

let cached: ReturnType<typeof drizzle<typeof schema>> | null = null;

export function db() {
  if (cached) return cached;
  const sql = postgres(env().DATABASE_URL, { max: 10 });
  cached = drizzle(sql, { schema });
  return cached;
}

export { schema };
