# Vibe Mapping — handoff snapshot

_Last updated by Claude, mid-Phase-10 (offline file cache pivot). Read top to bottom; everything below is grounded in what's actually on disk._

---

## 1. What this project is

**Vibe Mapping** — a "Cursor / v0 for maps". Non-GIS users (the user is a
forestry consultant) upload spatial data (shapefile zips, GeoJSON, KML, GPX),
chat with Claude to style and refine a map, then share it as a live link + QR
that opens in a companion mobile app. The mobile app has grown into a real
field tool: pins, area measurements, GPS tracks, and an in-progress offline
data cache for use in low-coverage forests.

- Original spec lives at the repo root: `vibe-mapping-prompt.md` + `CLAUDE.md`.
- Code lives at **`/Users/rebeccaelmslie/vibe-mapping/`** (renamed from
  `Vibe Mapping/` because Xcode/CocoaPods scripts choke on spaces in paths —
  don't rename it back).

## 2. Stack at a glance

pnpm workspaces + Turborepo:

```
apps/
  web/      Next.js 15 + React 19 + Tailwind v4 + MapLibre GL JS
  api/      Hono + Drizzle ORM (Postgres) + S3 SDK (MinIO) + Anthropic SDK
  mobile/   Expo SDK 56 + Expo Router + @maplibre/maplibre-react-native + expo-symbols
packages/
  shared/        Zod MapSpec + LLM-tool defs + area/distance math + inspection types
  map-renderer/  MapSpec → MapLibre style JSON (used by both web AND mobile)
```

**The MapSpec is the centre of the system** (`packages/shared/src/map-spec.ts`).
The LLM never emits raw style JSON — it calls typed tools (`packages/shared/src/tools/`)
that mutate the MapSpec; the renderer is the single source of truth for
MapLibre style.

## 3. Local infra (no Docker)

Docker is _not_ used. Instead:

| Service       | Where                                                          | Notes |
| ------------- | -------------------------------------------------------------- | --- |
| PostgreSQL 17 | port **5433** (PG15 owns 5432)                                 | `pg_ctl -D /opt/homebrew/var/postgresql@17 -o "-p 5433" start -l /opt/homebrew/var/log/postgresql@17.log` |
| Database      | `vibe`, role `rebeccaelmslie` (trust auth)                     | PostGIS 3.6 enabled |
| MinIO         | port **:9000** (console **:9001**), creds `vibe`/`vibe-secret` | `MINIO_ROOT_USER=vibe MINIO_ROOT_PASSWORD=vibe-secret minio server ~/.vibe-minio --address :9000 --console-address :9001` |
| Web           | http://localhost:3000                                          | Next dev |
| API           | http://localhost:8787                                          | Hono (tsx watch) |
| Metro         | http://localhost:8081                                          | for the mobile dev client |

Currently running per `pgrep`: minio (pid `18072`), `turbo run dev` (web + api),
`expo start` (Metro).

## 4. Env (`.env` at the repo root + `apps/mobile/.env`)

Both must point at the **same** Mac LAN IP so the iPhone (real or sim) can
reach the api. Today's IP is `192.168.88.3` — but DHCP changes it, which has
broken things twice already (search this doc for "LAN IP").

Root `.env`:

```
ANTHROPIC_API_KEY=sk-ant-…
MAPTILER_API_KEY=
NEXT_PUBLIC_MAPTILER_API_KEY=
DATABASE_URL=postgresql://rebeccaelmslie@localhost:5433/vibe
S3_ENDPOINT=http://localhost:9000
S3_ACCESS_KEY=vibe
S3_SECRET_KEY=vibe-secret
S3_BUCKET=vibe-uploads
API_URL=http://192.168.88.3:8787
PUBLIC_API_URL=http://192.168.88.3:8787
NEXT_PUBLIC_API_URL=http://192.168.88.3:8787
```

`apps/mobile/.env`:

```
EXPO_PUBLIC_API_URL=http://192.168.88.3:8787
EXPO_PUBLIC_MAPTILER_API_KEY=
```

> If the IP changes, run a SQL replace on `maps.spec` for the old IP →
> new IP, because saved MapSpecs embed the source URLs:
> `update maps set spec = replace(spec::text, 'OLD_IP', 'NEW_IP')::jsonb …`

## 5. What's shipped (commits, most recent first)

```
4825d5c feat: GPS track recording (mobile field tool)
553165b feat: measure area (mobile field tool)
5be9b38 feat(mobile): maps list + pins + iOS-native polish
31d257f feat(api): tolerant file-type detection
74f08c5 feat: composite label templates
ee8f79b fix(renderer): MapLibre robustness + debug reporter
2940798 feat: polish pass — toasts, states, working lint, README (Phase 7)
5b59d20 feat: mobile shared-map viewer with location (Phase 6)
6d090e1 feat: public share page + QR code viewer (Phase 5)
e1d8d61 docs: mark Phase 4 done in README status
ce20978 feat: web workspace + Claude tool loop (Phase 4)
e6aac55 feat: API + DB — projects, uploads, inspection, maps, share links (Phase 3)
7c31029 feat: MapSpec schema + shared MapLibre renderer (Phase 2)
0dfc14e chore: scaffold pnpm + turborepo monorepo (Phase 1)
```

- Phases 1–7 = the original spec, all done.
- The 3 `fix/feat:` commits between Phase 7 and `5be9b38` were a live-debug
  session: a real **MapLibre `attribution: undefined` bug** that broke whole
  styles, composite label templates (`{CPT}/{Stand}\n{YOE}`), tolerant upload
  detection (Finder's `(2)` dedup), and a `/debug/report` screenshot endpoint
  with a "Send report" button on the web map.
- The 3 `feat:` commits at the top = mobile field tools v1 (recents list,
  pin tool, measure area, GPS tracks, iOS-native styling pass with SF Symbols).

## 6. What's _uncommitted right now_ (Phase 10 in progress)

```
 M apps/api/src/env.ts           # added MAPTILER_API_KEY to the schema
 M apps/mobile/package.json      # added expo-file-system ~56.0.7
 M apps/mobile/src/app/s/[token].tsx
 M apps/mobile/src/lib/storage.ts
 M pnpm-lock.yaml
?? apps/mobile/src/lib/offline.ts
```

**Story of these changes:** we built an offline-tiles "Path A" (MapLibre's
`OfflineManager.createPack` against MapTiler) — wired the api `/share/:token/style.json`
endpoint, added the iCloud button, the progress banner, etc. User pushed back:
they wanted a **single file you ship to the phone**. Then we agreed to drop
the basemap from offline entirely ("we can add background context as required")
and just cache the **data layers** (spec + each source's GeoJSON) to local
files.

So the api `style.json` route was reverted (`apps/api/src/routes/share.ts`
is back to HEAD). The mobile side was rewritten:

- New `apps/mobile/src/lib/offline.ts`: `saveMapOffline(token, onProgress)`
  fetches `/share/:token`, then `File.downloadFileAsync` each source's GeoJSON
  into `<documentDirectory>/offline/<token>/`. Writes a `spec.json` with each
  source's URL rewritten to its local `file://` path. `loadOfflineMap(token)`
  reads it back.
- `apps/mobile/src/lib/storage.ts` reshaped `OfflineMap`:
  `{ token, name, dir, sizeBytes, savedAt }` (dropped `packId`/`bbox` from
  the path-A era).
- `apps/mobile/src/app/s/[token].tsx`:
  - **Mount effect prefers local data** — calls `loadOfflineMap(token)` first;
    falls back to `/share/:token` only if nothing is cached.
  - "Save offline" button now uses `saveMapOffline`; progress 0–100 %.
  - "Remove offline" uses `removeMapOffline`.
  - `OfflineManager` import + types removed.

**Type checks clean.** A `pod install` + iOS rebuild is in flight (background
task `blmusmx9j`) to link the new `expo-file-system` native module — same
dance as when AsyncStorage was added.

## 7. Known sharp edges (the gotchas that bit us)

1. **Mac LAN IP changes break everything.** When DHCP renews, the api becomes
   unreachable from the simulator and saved maps' source URLs go stale.
   Mitigation: update both `.env`s and run the SQL replace shown above.
2. **`vibe-mapping/` must not have spaces.** Xcode/CocoaPods build scripts
   were splitting on whitespace.
3. **AsyncStorage + expo-file-system are native modules.** After adding
   either, you need `cd apps/mobile/ios && pod install` (with
   `RCT_USE_PREBUILT_RNCORE=0 RCT_USE_RN_DEP=0` envs to make pod install
   complete on CocoaPods 1.16) followed by `npx expo run:ios`.
4. **expo-file-system v56 has a new API.** The legacy `documentDirectory` +
   `downloadAsync` functions were removed. Use `Paths.document`, `new File(...)`,
   `File.downloadFileAsync`, etc. — see `apps/mobile/src/lib/offline.ts`.
5. **maplibre-react-native v11 exports** are `Map` (not `MapView` — we alias
   it on import), `GeoJSONSource`, `Layer` (with `type` prop, not separate
   FillLayer/LineLayer), `Marker`, `Camera`, `UserLocation`, `OfflineManager`.
6. **The renderer once emitted `attribution: undefined`.** MapLibre 4's
   validator rejected the whole style. Fixed in commit `ee8f79b`; regression
   test in `packages/map-renderer/src/renderer.test.ts`. _Never_ pass
   `undefined` style props.
7. **CocoaPods 1.16.2 + RN 0.85 prebuilt React-Core** errors with
   `Missing required attribute 'source'`. Workaround: set
   `RCT_USE_PREBUILT_RNCORE=0 RCT_USE_RN_DEP=0` env vars on `pod install`.
8. **Successive `setStyle({ diff: true })` calls** mishandle basemap raster
   swaps + geojson churn in MapLibre 4. Web's MapView uses `{ diff: false }`
   and skips the redundant first-render setStyle (see
   `apps/web/src/components/map-view.tsx`).
9. **Auth is dev-stubbed.** Both web and api trust an `x-dev-user-id` header
   (defaulting to `dev_user`). Clerk is the biggest remaining stub.

## 8. Picking it up next session

### First five minutes

```bash
cd /Users/rebeccaelmslie/vibe-mapping
git log --oneline -3                        # confirm 4825d5c is HEAD
git status --short                          # confirm Phase 10 files match §6
ipconfig getifaddr en0                      # is LAN IP still 192.168.88.3?
curl -s http://localhost:8787/health        # api alive?
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:8081/status   # metro alive?
xcrun simctl list devices | grep Booted     # iPhone 16e booted?
```

If any of those isn't true:

- **api dead**: `cd /Users/rebeccaelmslie/vibe-mapping && pnpm dev` (in background or a terminal).
- **PG dead**: `pg_ctl -D /opt/homebrew/var/postgresql@17 -o "-p 5433" start -l /opt/homebrew/var/log/postgresql@17.log`
- **MinIO dead**: `MINIO_ROOT_USER=vibe MINIO_ROOT_PASSWORD=vibe-secret minio server ~/.vibe-minio --address :9000 --console-address :9001 &`
- **LAN IP changed**: edit `.env` + `apps/mobile/.env` + run the SQL replace, restart `pnpm dev` + Metro.
- **Metro dead**: `cd apps/mobile && nohup npx expo start --dev-client > /tmp/vibe-metro.log 2>&1 & disown`
- **Sim shut down**: `xcrun simctl boot 8E4FC1EA-E8C7-4182-BBCD-FE6C0FC3B292 && open -a Simulator`

### Where Phase 10 left off

The iOS rebuild for `expo-file-system` was kicked off as background task
`blmusmx9j` and writes its progress to
`/private/tmp/claude-501/.../tasks/blmusmx9j.output` plus
`/tmp/vibe-ios-build.log`. **Verify it succeeded**:

```bash
tail -10 /tmp/vibe-ios-build.log
xcrun simctl spawn booted launchctl list 2>/dev/null | grep -i vibe   # has the new build launched?
```

If the build succeeded, the next test is the offline flow on the simulator:

1. Open a recent map.
2. Tap the iCloud-down icon → progress banner climbs.
3. Once saved, kill the network from Mac (or toggle simulator Wi-Fi off via
   `xcrun simctl status_bar booted override --dataNetwork no-service`).
4. Force-close + reopen the app → tap the same map → the **data layers
   should render** (forest stand polygons in their styled colours). The
   basemap will be blank — that's expected because we explicitly dropped
   aerial caching.

When that works, commit it: a single
`feat(mobile): offline data cache (spec + GeoJSON files)` commit covering
the uncommitted set in §6. (Note the `expo-file-system` line in
`apps/mobile/package.json` plus the new native pod.)

### What's still on the runway

In rough priority:

- **Edit / delete saved measurements + tracks on the map**. Pins already
  have this (tap → bottom sheet). Measurements + tracks render but aren't
  tap-aware yet.
- **A list view inside a map**: "All annotations" — show all pins/areas/
  tracks for the open map; tap to fly to + edit.
- **Show offline status on the home recents tiles** (small cloud icon if
  saved offline).
- **Real auth (Clerk)** — the biggest remaining stub. Affects web + mobile
  + the api's `x-dev-user-id` middleware.
- **Physical iPhone build** — `npx expo run:ios --device` (Xcode signing
  already configured per the user's FieldTrack project per memory).
- **Background GPS tracking** — currently foreground-only. Background
  needs `expo-location`'s plugin config + `requestBackgroundPermissionsAsync`.
- **Aerial offline context** — the deliberately-deferred path B (LINZ +
  PMTiles per-map files). Plan is sketched in conversation but not started.

## 9. Where Claude's project memory is

- `/Users/rebeccaelmslie/.claude/projects/-Users-rebeccaelmslie/memory/MEMORY.md`
  — the auto-loaded index.
- `/Users/rebeccaelmslie/.claude/projects/-Users-rebeccaelmslie/memory/project_vibe_mapping.md`
  — the project-specific memory.

If memory is fresh in a future session, those files include path,
infrastructure notes, and the list of deferred decisions.

## 10. A short prompt to seed the next chat

> "Read `/Users/rebeccaelmslie/vibe-mapping/HANDOFF.md`, then run the §8
> 'first five minutes' checklist and tell me what's broken before we
> continue."

That gets you back to the same shared mental model in one turn.
