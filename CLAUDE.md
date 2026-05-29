# CLAUDE.md

This file gives Claude Code the context it needs to work effectively in this repository. Read it before making non-trivial changes.

## What this project is

A "vibe mapping" application — a natural-language map editor for non-GIS users.

- Users upload spatial data (shapefiles, GeoJSON, KML, GPX — points, lines, polygons).
- They build and refine maps by chatting with an embedded LLM ("make the tracks dashed orange and label them by name") rather than clicking through symbology dialogs.
- Aerial imagery is the default basemap; data layers sit on top.
- Finished maps are shared as live, interactive artifacts viewable in a companion mobile app with the user's location overlaid. It is a replacement for paper maps and PDF exports, not a competitor to ArcGIS or QGIS.

## Product principles (these settle most design arguments)

1. **Prompting replaces panels.** The UI is map + chat. If you're tempted to add a symbology dialog, ask first.
2. **The LLM interprets data before rendering it.** New uploads are inspected (attributes, geometry, value distributions) and the model proposes a sensible starting map — never raw defaults dumped on screen.
3. **Aerial imagery first.** Streets are a toggle. Don't flip the default.
4. **Maps are live, not exported.** No PDF/PNG export in v1. Sharing produces a link + QR that opens in the mobile app.
5. **Working code over abstractions.** Two real layer types beat a generic layer engine. No premature plugin systems.

## Architecture at a glance

Monorepo (pnpm workspaces + Turborepo):

```
apps/
  web/        Next.js 15 (App Router), React 19, Tailwind, shadcn/ui, MapLibre GL JS
  mobile/     Expo + React Native, @maplibre/maplibre-react-native, Expo Router
  api/        Hono service for endpoints shared by mobile (auth, map fetch, share links)
packages/
  shared/         Zod schemas, types — most importantly MapSpec
  map-renderer/   MapSpec -> MapLibre style JSON. Used by both web and mobile.
```

Data plane:

- **PostgreSQL + PostGIS** via Drizzle ORM. Tables: `users` (Clerk IDs), `projects`, `sources`, `maps`, `share_links`.
- **S3-compatible object storage** (MinIO locally) for raw uploads and generated vector tiles.
- **Spatial pipeline:** `gdal` (child process) converts shapefile/KML/GPX → GeoJSON; `@turf/turf` for in-memory ops; `tippecanoe` generates vector tiles when a source exceeds ~5 MB.
- **Basemaps:** MapTiler. Key in `MAPTILER_API_KEY`. Provider abstracted behind `BASEMAP_PROVIDER`.
- **Auth:** Clerk (works on web and mobile).
- **LLM:** Anthropic Claude via `@anthropic-ai/sdk` with tool use.

## The MapSpec is the center of the universe

Everything routes through a single typed document called `MapSpec`, defined in `packages/shared/src/map-spec.ts` with Zod.

```ts
MapSpec {
  id, name,
  basemap: 'aerial' | 'streets' | 'hybrid',
  initialView: { center: [lng, lat], zoom, bearing, pitch },
  layers: Layer[]   // ordered, top first
}
Layer = PointLayer | LineLayer | PolygonLayer
```

Rules:

- The LLM **never** emits raw MapLibre style JSON. It calls typed tools that mutate the `MapSpec`.
- `packages/map-renderer` is the **only** place that translates `MapSpec` → MapLibre style. Web and mobile both import it.
- Styling fields accept constants or data-driven expressions (`match` / `step` / `interpolate` on attributes). Keep those expression types narrow and exhaustive.
- Persist the `MapSpec` after every accepted tool call. The mobile viewer reads the same document.

If you find yourself styling a layer outside the renderer, or letting the model write style JSON directly, stop and reconsider.

## The LLM tool surface

These are the tools Claude is allowed to call from the chat endpoint. Each is a pure function `(MapSpec, args) => MapSpec`:

- `inspect_source(sourceId)`
- `propose_initial_map(sourceIds[])`
- `set_layer_style(layerId, style)`
- `set_layer_labels(layerId, { field, ...textStyle } | null)`
- `filter_layer(layerId, expression)`
- `reorder_layers(layerIds[])`
- `set_basemap(basemap)`
- `zoom_to(layerId | bbox)`
- `add_layer_from_source(sourceId, hints?)`
- `remove_layer(layerId)`

When adding a new capability, add a new tool — don't widen an existing one into a swiss army knife.

Chat loop, briefly: user message → Claude with tools + current MapSpec in system prompt → tool calls applied server-side → new MapSpec persisted → diff streamed to client → map re-renders.

## Conventions

- **Language:** TypeScript everywhere. `strict: true`. No `any` without a comment explaining why.
- **Validation:** Zod at every trust boundary (HTTP, tool args, file parsing). Infer types from schemas; don't hand-write parallel types.
- **Errors:** Throw typed errors at the boundary; convert to user-facing messages at the UI layer. No silent catches.
- **Styling:** Tailwind + shadcn/ui on web. Keep components small. Co-locate component-specific logic; lift to `packages/shared` only when reused.
- **Tests:** Vitest for `packages/*`. Test the renderer with hand-written MapSpecs against expected MapLibre style snapshots. Test each LLM tool as a pure function. UI testing is not a v1 priority.
- **Commits:** Conventional commits (`feat:`, `fix:`, `chore:`...). One logical change per commit.
- **File size:** If a file passes ~300 lines, look for a split. Renderer is the exception.

## What NOT to do without asking

- Add a new dependency beyond the stack listed above.
- Introduce a service that needs a new signup (besides MapTiler, Clerk, Anthropic).
- Swap a stack choice "because it's better" — propose the swap with reasoning first.
- Add a settings panel, symbology dialog, or any non-chat editing UI.
- Add PDF/PNG export, offline tile bundling, routing/turn-by-turn, or collaborative editing. All are v2+.
- Let Claude (the model) emit raw MapLibre style JSON.
- Use percentage widths for table widths anywhere they get exported (Google Docs breaks). (Not a current concern, but a habit to keep.)

## Local development

Required env vars (see `.env.example`):

- `ANTHROPIC_API_KEY`
- `MAPTILER_API_KEY`
- `CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`
- `DATABASE_URL` (PostGIS-enabled Postgres)
- `S3_ENDPOINT`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`, `S3_BUCKET`

Standard flow:

```bash
pnpm install
docker compose up -d        # postgres + minio
pnpm db:migrate
pnpm dev                    # turbo runs web + api; mobile is `pnpm --filter mobile start`
```

The README must always reflect a working `git clone → pnpm dev` path. If you change setup, update it in the same commit.

## How to work in this repo

- Plan first for anything spanning more than one file. Post a short plan in the chat before editing.
- For each PR-sized chunk: what changed, what it enables, what's still stubbed.
- Prefer vertical slices (one end-to-end capability) over horizontal layers (a complete API with no UI).
- When something is genuinely ambiguous, ask. Don't pick a direction silently and build for an hour.
