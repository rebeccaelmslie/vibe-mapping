# @vibe/api — Hono service. Build context is the REPO ROOT (the API depends on
# the pnpm workspace packages, which ship as raw TypeScript). GDAL/ogr2ogr is
# required for spatial uploads; the workspace TS deps are run via tsx.
# Node 22 (pnpm 11 needs node:sqlite, which lands in Node 22+).
FROM node:22-bookworm-slim

# ogr2ogr (GDAL) for shapefile/KML/GPX → GeoJSON conversion at upload time.
RUN apt-get update \
  && apt-get install -y --no-install-recommends gdal-bin ca-certificates \
  && rm -rf /var/lib/apt/lists/*

RUN corepack enable && corepack prepare pnpm@11.4.0 --activate
WORKDIR /app

# Copy the whole monorepo (node_modules etc. excluded via .dockerignore), then
# install only the API and its workspace deps (skips web/mobile).
COPY . .
RUN pnpm install --filter "@vibe/api..." --frozen-lockfile --ignore-scripts

ENV NODE_ENV=production
# Railway injects PORT; the API reads it (defaults to 8787 locally).
EXPOSE 8787
WORKDIR /app/apps/api
# Apply DB migrations (idempotent; the DB is reachable on the private network
# here), then serve via tsx so the TypeScript workspace deps load without a build.
CMD ["sh", "-c", "pnpm exec drizzle-kit migrate && pnpm exec tsx src/index.ts"]
