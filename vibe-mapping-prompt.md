# Vibe Mapping MVP — Build Prompt

You're building the MVP of a "vibe mapping" application — think Cursor or v0, but for maps. Users with little to no GIS experience upload their own spatial data (shapefiles, GeoJSON, KML, GPX — primarily points, lines, polygons) and use natural language to build, style, and refine maps. They then share those maps to a companion mobile app that acts as a live, interactive replacement for paper or PDF maps (shows user location, supports navigation).

## Product principles

1. **Prompting replaces panels.** Traditional GIS exposes symbology, filters, classifications, and labels through nested dialogs. Here, the user types "make the tracks dashed orange and label them by name" and the map updates. The UI shows the map and a chat panel — that's it for v1.
2. **The LLM interprets the data first.** When a user uploads a file, the assistant inspects the attributes, geometry types, and value distributions, then proposes a starting map (symbology, what to label, sensible zoom) instead of dumping raw default styling on screen.
3. **Aerial imagery is the default basemap.** Roads/streets are a toggle. Most users want to see the real world underneath their data.
4. **Maps are live artifacts, not exports.** Sharing a map produces a link/QR that opens in the mobile app with the user's live location overlaid. No PDF export in v1.

## Tech stack

Use this stack unless you hit a concrete blocker — in which case, stop and ask before substituting:

- **Monorepo:** pnpm workspaces + Turborepo. Apps: `web`, `mobile`, `api`. Packages: `shared` (types, map spec schema), `map-renderer` (shared MapLibre styling logic).
- **Web app:** Next.js 15 (App Router) + React 19 + TypeScript + Tailwind + shadcn/ui. MapLibre GL JS for rendering.
- **Mobile app:** Expo (React Native) + TypeScript + `@maplibre/maplibre-react-native`. Expo Router for navigation.
- **Backend:** Next.js API routes for the web client; a small Hono service inside `api` for shared mobile endpoints (auth, map fetch, share links). PostgreSQL + PostGIS via Drizzle ORM. S3-compatible object storage (use MinIO locally) for uploaded source files and generated tilesets.
- **LLM:** Anthropic Claude via `@anthropic-ai/sdk`, using tool use. The model never returns free-form map styling — it calls typed tools that mutate a structured `MapSpec` (defined in `packages/shared`).
- **Spatial processing:** `gdal` via a Node child process for format conversion (shapefile/KML/GPX → GeoJSON), `@turf/turf` for in-memory geometry ops, `tippecanoe` for generating vector tiles when datasets exceed ~5MB.
- **Basemaps:** MapTiler (aerial + streets) — read the key from `MAPTILER_API_KEY`. Leave a `BASEMAP_PROVIDER` env var so we can swap later.
- **Auth:** Clerk for v1 (web + mobile both supported, saves us a week).

## The MapSpec — the central abstraction

Everything revolves around a JSON document called `MapSpec` stored in Postgres. The LLM edits it via tools; both web and mobile render from it. Define it in `packages/shared/src/map-spec.ts` with Zod. Sketch:

```ts
MapSpec {
  id, name, basemap: 'aerial' | 'streets' | 'hybrid',
  initialView: { center: [lng, lat], zoom, bearing, pitch },
  layers: Layer[]   // ordered, top first
}
Layer = PointLayer | LineLayer | PolygonLayer
// each Layer references a `sourceId`; sources point to stored GeoJSON or tile URLs
// styling fields support either constants OR data-driven expressions (match/step/interpolate on attributes)
```

The renderer in `packages/map-renderer` takes a `MapSpec` and produces a MapLibre style JSON. Same code runs on web and mobile.

## The LLM tools (define these, wire them up, make them work)

Expose these as Claude tools in the chat endpoint. Each one is a pure function over the current `MapSpec`:

- `inspect_source(sourceId)` — returns geometry type, attribute names, sample values, value counts, numeric ranges. Called automatically right after a user uploads.
- `propose_initial_map(sourceIds[])` — generates a sensible first `MapSpec` from inspection results.
- `set_layer_style(layerId, style)` — change color/width/opacity/dash, possibly data-driven.
- `set_layer_labels(layerId, { field, ...textStyle } | null)`.
- `filter_layer(layerId, expression)` — e.g. show only features where `type = 'walking'`.
- `reorder_layers(layerIds[])`.
- `set_basemap(basemap)`.
- `zoom_to(layerId | bbox)`.
- `add_layer_from_source(sourceId, hints?)` / `remove_layer(layerId)`.

The chat loop: user message → Claude with tools + current MapSpec in system → tool calls applied server-side → new MapSpec persisted → diff streamed back to the client → map re-renders. Don't let the model emit raw style JSON.

## What "done" means for this MVP

Build a vertical slice that demonstrably works end-to-end:

1. Sign up on web, create a project.
2. Upload a shapefile (zip) and a GeoJSON. Server converts, stores, generates tiles if large, inspects attributes.
3. Claude proposes an initial map; it renders over aerial imagery.
4. User types instructions in chat and the map visibly updates (at least: color, width, labels, filter, basemap toggle, zoom-to).
5. Click "Share" → generates a short link + QR code.
6. Open the mobile app, sign in, open the share link → same map renders, user location is shown as a blue dot, basic recenter button works.

## How to proceed

Work in this order. After each phase, pause and summarize what was built and what's next before starting the next phase. Commit at the end of each phase.

1. **Scaffold the monorepo** (pnpm + Turbo, apps + packages, base TS configs, lint, env handling with `.env.example`). Stop. Summarize.
2. **Define `MapSpec` + the shared renderer.** Include a minimal test that converts a hand-written `MapSpec` to a valid MapLibre style.
3. **API + DB:** Drizzle schema (users via Clerk IDs, projects, sources, maps, share_links), upload endpoint, source-inspection job, share-link endpoint.
4. **Web app:** project page with map + chat panel + upload dropzone. Wire the chat endpoint to Claude with the tool set above. Make at least three tools fully working before adding the rest.
5. **Sharing:** share link page rendered with the renderer + a minimal viewer.
6. **Mobile app:** Expo project, auth, "open shared map" flow, location dot, recenter.
7. **Polish pass:** loading states, error toasts, empty states, README with run instructions.

## Ground rules while you work

- Ask before adding any dependency not listed above.
- Ask before introducing a service I'd need to sign up for beyond MapTiler, Clerk, and Anthropic.
- If you discover a stack choice above is genuinely wrong for the goal, stop and propose the swap with reasoning — don't silently substitute.
- Prefer working code over abstractions. No "framework" layers, no premature plugin systems. Two real layer types beat a generic layer engine.
- Every PR-sized chunk gets a brief summary: what changed, what it enables, what's still stubbed.
- The README must let me clone and `pnpm dev` to a working state, with clear notes on env vars.

Start with Phase 1.
