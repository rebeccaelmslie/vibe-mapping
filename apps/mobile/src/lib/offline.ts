import { File, Directory, Paths } from 'expo-file-system';
import { unzip } from 'react-native-zip-archive';
import type { MapSpec } from '@vibe/shared';
import { API_BASE } from './config';
import {
  addOfflineMap,
  getOfflineMap,
  removeOfflineMap,
  saveRecent,
  type OfflineMap,
} from './storage';

function rootDir(): Directory {
  return new Directory(Paths.document, 'offline');
}

function mapDir(token: string): Directory {
  return new Directory(rootDir(), token);
}

function specFile(token: string): File {
  return new File(mapDir(token), 'spec.json');
}

function sourceFile(token: string, sourceId: string): File {
  return new File(mapDir(token), `source-${sourceId}.geojson`);
}

function ensureDir(d: Directory): void {
  if (!d.exists) d.create({ intermediates: true });
}

export interface SaveProgress {
  /** What's currently being downloaded (the spec or a source id). */
  step: string;
  /** 0..1, monotonic. */
  ratio: number;
}

/**
 * Download a shared map and every one of its source GeoJSON to local files,
 * rewriting source URLs so the saved spec works without network. Returns the
 * stored OfflineMap record on success.
 */
export async function saveMapOffline(
  token: string,
  onProgress?: (p: SaveProgress) => void,
): Promise<OfflineMap> {
  ensureDir(rootDir());
  ensureDir(mapDir(token));

  onProgress?.({ step: 'spec', ratio: 0.02 });
  const specRes = await fetch(`${API_BASE}/share/${token}`);
  if (!specRes.ok) throw new Error(`spec ${specRes.status}`);
  const { map } = (await specRes.json()) as { map: { name: string; spec: MapSpec } };

  const sources = map.spec.sources;
  let totalSize = 0;
  const rewritten = { ...map.spec, sources: [...sources] };

  for (let i = 0; i < sources.length; i++) {
    const s = sources[i]!;
    onProgress?.({
      step: s.id,
      ratio: 0.05 + (0.9 * i) / Math.max(1, sources.length),
    });
    const target = sourceFile(token, s.id);
    const downloaded = await File.downloadFileAsync(s.url, target, { idempotent: true });
    const info = downloaded.info();
    if ('size' in info && typeof info.size === 'number') totalSize += info.size;
    rewritten.sources[i] = { ...s, url: downloaded.uri };
  }

  // Write the rewritten spec last so a partial save is detectable.
  const specJson = JSON.stringify(rewritten);
  const f = specFile(token);
  if (!f.exists) f.create();
  f.write(specJson);
  totalSize += specJson.length;

  const record: OfflineMap = {
    token,
    name: map.name,
    dir: mapDir(token).uri,
    sizeBytes: totalSize,
    savedAt: Date.now(),
  };
  await addOfflineMap(record);
  onProgress?.({ step: 'done', ratio: 1 });
  return record;
}

/**
 * If the map has been saved offline AND its spec.json is still on disk,
 * return the saved {name, spec, manifest}. `manifest` is non-null only
 * for `.vibemap` imports (the legacy live-link offline cache has no
 * manifest.json). Returns null when there's no offline copy at all.
 */
export async function loadOfflineMap(
  token: string,
): Promise<{ name: string; spec: MapSpec; manifest: VibemapManifest | null } | null> {
  const record = await getOfflineMap(token);
  if (!record) return null;
  const f = specFile(token);
  if (!f.exists) return null;
  const text = await f.text();
  const spec = JSON.parse(text) as MapSpec;

  let manifest: VibemapManifest | null = null;
  const mf = new File(mapDir(token), 'manifest.json');
  if (mf.exists) {
    try {
      manifest = JSON.parse(await mf.text()) as VibemapManifest;
    } catch {
      // Corrupt manifest is non-fatal — the chrome falls back to today's date.
    }
  }
  return { name: record.name, spec, manifest };
}

/** Delete the on-disk files and remove the storage record. */
export async function removeMapOffline(token: string): Promise<void> {
  const d = mapDir(token);
  if (d.exists) d.delete();
  await removeOfflineMap(token);
}

/**
 * Path to the local tile pack folder for a saved offline map, or null if
 * this map's offline copy doesn't include tiles (e.g. data-only cache from
 * the live-share `Save offline` flow). Used by the viewer to swap the
 * basemap to a `file://` source when a `.vibemap` was imported.
 */
export async function getOfflineTilesDir(token: string): Promise<string | null> {
  const record = await getOfflineMap(token);
  if (!record) return null;
  const tiles = new Directory(mapDir(token), 'tiles');
  if (!tiles.exists) return null;
  // Strip the trailing slash that Directory.uri tends to carry.
  return tiles.uri.replace(/\/$/, '');
}

// ---------------------------------------------------------------------------
// .vibemap import — receives an already-on-disk zip and unpacks it into our
// offline cache, then records it in storage so the home recents picks it up.
// ---------------------------------------------------------------------------

export interface VibemapManifest {
  format: string;          // 'vibemap/1'
  name: string;
  mapId?: string;
  exportedAt?: string;
  bbox?: [number, number, number, number];
  zoomMin?: number;
  zoomMax?: number;
  sourceCount?: number;
}

function slugForImport(name: string): string {
  const s = name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .slice(0, 40);
  return `imp_${s || 'map'}`;
}

/**
 * Import a `.vibemap` ZIP that already lives on disk (the OS handed us a
 * file:// URI via the share sheet / Files / AirDrop). Unzips into the
 * offline cache directory keyed by a stable token derived from the
 * manifest's `name`, so re-importing the same map replaces the prior copy
 * — PDF-replace semantics. Returns the token so the caller can route to
 * `/s/<token>`.
 */
export async function importVibemap(sourceUri: string): Promise<string> {
  // Unzip into a temp dir so a corrupt zip can't half-write the live cache.
  const tmp = new Directory(Paths.cache, `import-${Date.now()}`);
  if (tmp.exists) tmp.delete();
  tmp.create({ intermediates: true });

  try {
    await unzip(sourceUri.replace(/^file:\/\//, ''), tmp.uri.replace(/^file:\/\//, ''));

    const manifestFile = new File(tmp, 'manifest.json');
    if (!manifestFile.exists) throw new Error('manifest.json missing — not a valid .vibemap');
    const manifest = JSON.parse(await manifestFile.text()) as VibemapManifest;
    if (!manifest.format?.startsWith('vibemap/')) {
      throw new Error(`unsupported manifest format: ${manifest.format}`);
    }

    const token = slugForImport(manifest.name);

    // Replace any previous import of the same map.
    const existing = mapDir(token);
    if (existing.exists) existing.delete();
    ensureDir(rootDir());

    // Move the unpacked tree into place.
    tmp.move(existing);

    // Walk the final dir to total up size.
    let totalSize = 0;
    try {
      const info = new Directory(existing).info?.();
      if (info && typeof info.size === 'number') totalSize = info.size;
    } catch {
      // info() may not exist on this Directory version; size stays 0.
    }

    const record: OfflineMap = {
      token,
      name: manifest.name,
      dir: existing.uri,
      sizeBytes: totalSize,
      savedAt: Date.now(),
    };
    await addOfflineMap(record);
    // Pop the imported map to the top of the recents list.
    await saveRecent({ token, name: manifest.name, openedAt: Date.now() });

    return token;
  } catch (e) {
    if (tmp.exists) tmp.delete();
    throw e;
  }
}
