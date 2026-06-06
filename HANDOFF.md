# Vibe Mapping — handoff snapshot

_Last updated: end of TestFlight prep session. Read top to bottom; everything below is grounded in what's actually on disk._

---

## 1. What this project is

**Vibe Mapping** — a "Cursor / v0 for maps". Non-GIS users (the user is a
forestry consultant) upload spatial data (shapefile zips, GeoJSON, KML, GPX),
chat with Claude to style and refine a map, then share it as a live link + QR
that opens in a companion mobile app. The mobile app has grown into a real
field tool: pins, area measurements, GPS tracks, an offline data cache, and
now `.vibemap` file sharing — the AirDrop-able PDF replacement.

- Original spec: `vibe-mapping-prompt.md` + `CLAUDE.md`.
- Code lives at **`/Users/rebeccaelmslie/vibe-mapping/`** (renamed from
  `Vibe Mapping/` because Xcode/CocoaPods scripts choke on spaces — don't
  rename it back).

## 2. Stack at a glance

pnpm workspaces + Turborepo:

```
apps/
  web/      Next.js 15 + React 19 + Tailwind v4 + MapLibre GL JS
  api/      Hono + Drizzle ORM (Postgres) + S3 SDK (MinIO) + Anthropic SDK
  mobile/   Expo SDK 56 + Expo Router + @maplibre/maplibre-react-native + expo-symbols
packages/
  shared/         Zod schemas, MapSpec, area/distance/legend helpers
  map-renderer/   Pure MapSpec → MapLibre style. Both apps import this.
```

Data plane: PostgreSQL 17 + PostGIS on port **5433**; MinIO locally; LINZ
Basemaps for aerial; MapTiler for streets + glyphs; Anthropic SDK for chat.

## 3. What shipped this session

Three commits, top to bottom:

### `eee0cdd` chore(mobile): EAS config + projectId
- `eas.json` with `production` build profile (`distribution: "store"`) and
  submit profile placeholder
- `app.json` gained `extra.eas.projectId = 99e6a8a5-c53e-4581-ba99-02cefe1128ac`
  after `eas init`; version bumped 0.0.0 → 1.0.0 (App Store Connect rejects 0.0.0)

### `6c738cc` feat: cartographic chrome
The on-screen viewer experience now reads as a map, not unfinished software.

- `packages/shared/src/legend.ts` — `deriveLegend(spec)` pure function +
  7 tests. Handles constant / `match` / `step` / `interpolate` color
  expressions. One swatch per match-case; gradient swatch for step.
- `packages/map-renderer/src/basemap.ts` — `LINZ_ATTRIBUTION` /
  `MAPTILER_ATTRIBUTION` constants + `creditsFor(basemap, hasLinz)` helper
  now exported for the chrome.
- **Mobile** (`apps/mobile/src/components/MapChrome.tsx`): title strip,
  collapsible legend drawer, attribution row. Wired into `s/[token].tsx`;
  `Map` component gained `compass`, `compassHiddenFacingNorth`, `scaleBar`,
  `attribution={false}`, `logo={false}` props. New info button in the right
  tool column toggles chrome visibility. `loadOfflineMap` now returns the
  manifest so the chrome can show `exportedAt` from a `.vibemap` import.
- **Web** (`apps/web/src/components/map-chrome.tsx`): floating legend
  overlay. `map-view.tsx` adds `ScaleControl` (bottom-left) and
  `NavigationControl({ showCompass: true })`. Page header shows
  `<map name> · <today's date>` and a "Hide/Show legend" toggle.

All tests green (39 + 14 + 10 = 63).

### `9b107e6` feat: .vibemap file sharing — the PDF-replacement
Shipped previous session, included here for context. ZIP archive with
manifest.json + spec.json + sources/*.geojson + tiles/{z}/{x}/{y}.webp.
LINZ aerial baked in at z0–z16 (~8 MB default). Mobile import via iOS
share sheet (UTI registered).

## 4. In-progress at end of session: TestFlight build

### State
- ✅ `eas-cli` v18.6.0 installed at `/opt/homebrew/bin/eas`
- ✅ Logged in as `rebelm` (rebeccaelmslie@gmail.com)
- ✅ `eas.json` written, `eas init --force` ran, project linked
- ✅ `extra.eas.projectId` written to `app.json` by `eas init`
- ❌ Build not yet triggered — `eas build` waits to be run interactively

### Why TestFlight (not local Xcode install)
The previous round of local `npx expo run:ios --device` builds failed to
register the `.vibemap` UTI because the `ios/` folder pre-existed and
Expo prebuild skipped syncing `app.json` infoPlist changes. TestFlight
sidesteps this — EAS Build runs prebuild fresh from `app.json`, so the
UTI declarations there will land in the Info.plist correctly. Also,
TestFlight cuts the USB-and-Xcode-trust-cert workflow.

### Decisions locked in
- **Just internal testing, just the user** (one tester, no Apple beta review)
- **EAS free tier** — one-shot build, will iterate later
- **API skipped** for TestFlight — only the `.vibemap` import flow is being
  smoke-tested, which works fully offline. `eas.json` sets
  `EXPO_PUBLIC_API_URL=http://api-not-configured.invalid` so the live-link
  code path obviously fails (don't deploy this to App Store as-is).

### Exact next steps when you re-open
The terminal can be closed; pick up by running these in a fresh terminal.
**Do NOT include the leading `!`** — that's a Claude Code convention;
in your own zsh shell, `!` is interpreted as logical-NOT and silently
kills the command after `&&`. (We hit this bug already.)

```bash
# 1. Build (interactive prompts: Apple ID, password, 2FA, certs, bundle id)
cd /Users/rebeccaelmslie/vibe-mapping/apps/mobile
eas build --platform ios --profile production
```

Prompts to expect, in order:
- Apple ID email → your Apple Developer email
- Apple ID password
- 6-digit 2FA code from your iPhone/Mac
- "Reuse this team?" → pick the one tied to your developer membership
- "Generate Apple Distribution Certificate?" → **yes**
- "Generate Apple Provisioning Profile?" → **yes**
- "Register bundle identifier `com.rebelm.vibe-mapping-mobile`?" → **yes**
- Push Notifications? → **no**

Build runs in EAS cloud (~10–25 min on free tier). The CLI prints a
`https://expo.dev/accounts/rebelm/projects/...` URL — that's the live
progress page. You can close the terminal.

```bash
# 2. Submit (after build succeeds)
eas submit -p ios --latest
```

Prompts:
- Apple ID re-auth
- "Create new App Store Connect app?" → **yes** (first submit only)
- Name / SKU / language defaults are fine

Then ~10 min processing in ASC. Apple emails when build is ready.

```bash
# 3. Add yourself as internal tester
# Web only — go to appstoreconnect.apple.com
# My Apps → Vibe Mapping → TestFlight tab → Internal Testing
# Add your Apple ID with Developer / App Manager role
```

```bash
# 4. Install TestFlight on phone if not already, then accept the invite
```

### Smoke test once installed
The thing this whole TestFlight push is for: confirm the `.vibemap` flow.

1. Web: `pnpm --filter web dev` → open a map → Share → "Field map file" →
   download (~8 MB)
2. AirDrop the file from Finder → your iPhone
3. **iOS share sheet should list "Vibe Mapping" as an option.** This is
   the UTI moment of truth — the whole point of the TestFlight build.
4. Tap Vibe Mapping → app unzips the `.vibemap` and routes to the
   imported map
5. Verify the new chrome: title bar reads `<map name> · <exportedAt>`;
   bottom-left has a scale bar; bottom (mobile) / bottom-right (web)
   has the legend with one row per visible layer + LINZ/MapTiler/OSM
   attribution; two-finger twist shows the compass top-right
6. Turn airplane mode on. Re-open from recents. Map should render
   fully — basemap + data layers — entirely offline. **This is the
   field use case.**
7. Tap the info button → all chrome hides. Tap again → returns.

### If the AirDrop test fails
Most likely cause: UTI didn't register. Check:
- Phone's iOS log (Console.app on Mac → connected phone → filter "VibeMapping")
- Did the build's Info.plist include CFBundleDocumentTypes? Inspect
  the `.ipa` from the EAS build page → download → unzip → look in
  `Payload/VibeMapping.app/Info.plist`

## 5. Open tasks at session end

- **#41** Phase B: run on physical iPhone — superseded by the TestFlight path; can probably be closed once TestFlight install works
- **#73** mobile: `.vibemap` import (UTI + unzip + open) — code is shipped + committed; verification is the TestFlight smoke test above
- **#79** testflight: `eas.json` + first build — config done, build not yet triggered (see §4)

All other tasks (1–78 except 41, 73, 79) are completed.

## 6. Gotchas worth knowing

- **Don't prefix shell commands with `!`** when running in your own terminal
  (zsh treats it as logical-NOT, silently breaks `&&` chains). The `!`
  prefix was a Claude Code convention to route the command back through
  this session.
- **PG17 on port 5433** (not 5432; PG15 still squats on 5432 without
  PostGIS). Start with `pg_ctl -D /opt/homebrew/var/postgresql@17 -o "-p 5433" start -l /opt/homebrew/var/log/postgresql@17.log`
- **API runs on port 8787**, not 3001 (FieldTrack uses 3001 — don't confuse them)
- **LAN IP `192.168.88.3`** is your Mac's current DHCP-assigned IP. It has
  changed before; if mobile-on-LAN fails check the actual IP with `ipconfig getifaddr en0`.
- **`apps/mobile/ios/` is gitignored** — Expo prebuild regenerates it. Don't
  rely on local Info.plist edits; put everything in `app.json`.
- **MapLibre Native MapView props use bare names**: `compass`, `scaleBar`,
  `attribution` — NOT `compassEnabled` / `scaleBarEnabled` (older RN-Mapbox names).
- **`eas.json` has a placeholder `ascAppId`** — `eas submit` will create the
  ASC app on first run and you can fill the real id in later if you want
  scripted submits.
