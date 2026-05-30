import { File, Directory, Paths } from 'expo-file-system';
import type { MapSpec } from '@vibe/shared';
import { API_BASE } from './config';
import { addOfflineMap, getOfflineMap, removeOfflineMap, type OfflineMap } from './storage';

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
 * return the saved {name, spec} (with file:// source URLs); otherwise null.
 */
export async function loadOfflineMap(
  token: string,
): Promise<{ name: string; spec: MapSpec } | null> {
  const record = await getOfflineMap(token);
  if (!record) return null;
  const f = specFile(token);
  if (!f.exists) return null;
  const text = await f.text();
  const spec = JSON.parse(text) as MapSpec;
  return { name: record.name, spec };
}

/** Delete the on-disk files and remove the storage record. */
export async function removeMapOffline(token: string): Promise<void> {
  const d = mapDir(token);
  if (d.exists) d.delete();
  await removeOfflineMap(token);
}
