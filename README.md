# Vibe Mapping

A natural-language map editor for people who don't do GIS. Upload spatial data
(shapefiles, GeoJSON, KML, GPX), then build and style maps by **chatting** —
"make the tracks dashed orange and label them by name" — instead of clicking
through symbology dialogs. Finished maps are shared as live, interactive
artifacts viewable in a companion mobile app with your location overlaid.

> This is an MVP being built in phases. **Phase 1 (monorepo scaffold) is
> complete.** See [Status](#status) for what works today vs. what's stubbed.

## Architecture

A pnpm + Turborepo monorepo:

```
apps/
  web/        Next.js 15 (App Router) + React 19 + Tailwind v4 + MapLibre GL JS
  mobile/     Expo (SDK 56) + Expo Router + (MapLibre RN — added in Phase 6)
  api/        Hono service for endpoints shared by mobile (auth, map fetch, share links)
packages/
  shared/         Zod schemas & types — most importantly the MapSpec (Phase 2)
  map-renderer/   MapSpec -> MapLibre style JSON. Imported by web AND mobile.
```

The center of the system is the **MapSpec**: a single typed JSON document
(defined in `packages/shared`) that the LLM mutates via typed tools. Both web
and mobile render from it through `packages/map-renderer`. The model never emits
raw MapLibre style JSON.

## Prerequisites

| Tool       | Notes                                                                    |
| ---------- | ------------------------------------------------------------------------ |
| Node       | >= 20 (developed on 25). Use `nvm` if you need to match.                  |
| pnpm       | `npm install -g pnpm` (this repo pins pnpm 11 via `packageManager`).     |
| Docker     | For local Postgres + MinIO via `docker compose`. **Not yet installed** on this machine — install Docker Desktop. |
| gdal       | `ogr2ogr` for format conversion. Already installed (`brew install gdal`).|
| tippecanoe | Vector tiles for large sources (Phase 3). `brew install tippecanoe`. **Not yet installed.** |

> The spatial pipeline (gdal/tippecanoe) and Docker services aren't exercised
> until later phases — Phase 1 only needs Node + pnpm.

## Quick start

```bash
pnpm install                 # install all workspaces

cp .env.example .env         # then fill in keys (see below)

# Once Phase 3+ lands you'll also run:
# docker compose up -d       # postgres (PostGIS) + minio
# pnpm db:migrate            # apply Drizzle migrations

pnpm dev                     # turbo runs web (:3000) + api (:8787)
```

Mobile is run separately (it isn't part of `turbo run dev`):

```bash
pnpm --filter @vibe/mobile start
```

### Environment variables

Copy `.env.example` to `.env` and fill in. Summary:

| Var                                | Purpose                                        |
| ---------------------------------- | ---------------------------------------------- |
| `ANTHROPIC_API_KEY`                | Claude chat + tool use                         |
| `MAPTILER_API_KEY`                 | Aerial + streets basemaps                      |
| `BASEMAP_PROVIDER`                 | Provider abstraction (default `maptiler`)      |
| `CLERK_PUBLISHABLE_KEY` / `_SECRET_KEY` | Auth (web + mobile)                       |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Clerk key exposed to the browser              |
| `DATABASE_URL`                     | PostGIS Postgres (compose default: port 5544)  |
| `S3_ENDPOINT` / `S3_*`             | MinIO object storage                           |
| `API_URL` / `NEXT_PUBLIC_API_URL`  | Hono API location                              |

> Local Postgres is mapped to **5544** (not 5432/5433) to avoid clashing with
> other Postgres instances you may already run.

## Scripts (root)

| Command           | What it does                                  |
| ----------------- | --------------------------------------------- |
| `pnpm dev`        | Run web + api in dev (Turbo)                  |
| `pnpm build`      | Build all packages/apps                       |
| `pnpm lint`       | Lint all workspaces                           |
| `pnpm typecheck`  | Type-check all workspaces                     |
| `pnpm test`       | Run package tests (Vitest)                    |
| `pnpm format`     | Prettier write                                |

## Status

| Phase | Scope                                             | State        |
| ----- | ------------------------------------------------- | ------------ |
| 1     | Monorepo scaffold (apps, packages, TS, lint, env) | ✅ Done       |
| 2     | MapSpec + shared renderer + tests                 | ⏳ Next       |
| 3     | API + DB (Drizzle), upload, inspect, share links  | ⏳ Stubbed    |
| 4     | Web: map + chat + upload, Claude tool loop         | ⏳ Stubbed    |
| 5     | Share link page + viewer                          | ⏳ Stubbed    |
| 6     | Mobile: auth, open shared map, location dot        | ⏳ Scaffolded |
| 7     | Polish: loading/error/empty states                | ⏳ —          |

What runs today after `pnpm install`:

- `pnpm dev` starts the **web** app (placeholder landing page at
  http://localhost:3000) and the **api** health endpoint
  (http://localhost:8787/health).
- `pnpm --filter @vibe/mobile start` boots the Expo dev server (default
  template UI; MapLibre + share-link flow come in Phase 6).
