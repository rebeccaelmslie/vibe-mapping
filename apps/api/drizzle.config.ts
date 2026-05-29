import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig } from 'drizzle-kit';

const rootEnv = resolve(process.cwd(), '../../.env');
if (existsSync(rootEnv)) {
  try {
    process.loadEnvFile(rootEnv);
  } catch {
    // ignore
  }
}

export default defineConfig({
  schema: './src/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    // Only used by `migrate`/`push`; `generate` works offline.
    url: process.env.DATABASE_URL ?? 'postgresql://vibe:vibe@localhost:5544/vibe',
  },
});
