import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import type { Inspection, AttributeSummary, AttributeType } from '@vibe/shared';

export type { Inspection, AttributeSummary, AttributeType } from '@vibe/shared';

const execFileAsync = promisify(execFile);

// ---------------------------------------------------------------------------
// Minimal GeoJSON shapes (kept local to avoid a types dependency).
// ---------------------------------------------------------------------------
interface Geometry {
  type: string;
  coordinates?: unknown;
  geometries?: Geometry[];
}
interface Feature {
  type: 'Feature';
  geometry: Geometry | null;
  properties: Record<string, unknown> | null;
}
export interface FeatureCollection {
  type: 'FeatureCollection';
  features: Feature[];
}

export type SourceFormat = 'geojson' | 'shapefile' | 'kml' | 'gpx';

const SAMPLE_CAP = 8;
const CATEGORICAL_CAP = 20;

function extensionFormat(name: string): SourceFormat | null {
  const lower = name.toLowerCase();
  if (lower.endsWith('.geojson') || lower.endsWith('.json')) return 'geojson';
  if (lower.endsWith('.zip') || lower.endsWith('.shp')) return 'shapefile';
  if (lower.endsWith('.kml')) return 'kml';
  if (lower.endsWith('.gpx')) return 'gpx';
  return null;
}

function sniffFormat(head: Buffer): SourceFormat | null {
  if (head.length < 2) return null;
  // PK\x03\x04 — ZIP local file header (shapefile zip).
  if (head[0] === 0x50 && head[1] === 0x4b) return 'shapefile';
  // Skip whitespace, then check the first meaningful character.
  let i = 0;
  while (i < head.length && /\s/.test(String.fromCharCode(head[i]!))) i++;
  const first = String.fromCharCode(head[i] ?? 0);
  if (first === '{' || first === '[') return 'geojson';
  if (first === '<') {
    const text = head.slice(i, Math.min(head.length, i + 512)).toString('utf8').toLowerCase();
    if (text.includes('<kml')) return 'kml';
    if (text.includes('<gpx')) return 'gpx';
  }
  return null;
}

/**
 * Detect the source format from the filename, with a fallback to byte-sniffing
 * the head of the file. Finder's de-dup rename ("Tracks (2)") strips the
 * extension, so extension-only detection breaks on common drag-and-drop flows.
 */
export function detectFormat(filename: string, head?: Buffer): SourceFormat {
  // Strip a trailing " (N)" before re-checking the extension.
  const cleaned = filename.replace(/\s*\(\d+\)\s*$/, '');
  const fromExt = extensionFormat(cleaned) ?? extensionFormat(filename);
  if (fromExt) return fromExt;
  if (head) {
    const fromBytes = sniffFormat(head);
    if (fromBytes) return fromBytes;
  }
  throw new Error(`Unsupported file type: ${filename}`);
}

function extendBbox(bbox: [number, number, number, number], lng: number, lat: number) {
  if (lng < bbox[0]) bbox[0] = lng;
  if (lat < bbox[1]) bbox[1] = lat;
  if (lng > bbox[2]) bbox[2] = lng;
  if (lat > bbox[3]) bbox[3] = lat;
}

function walkCoords(coords: unknown, bbox: [number, number, number, number]) {
  if (!Array.isArray(coords)) return;
  // a position is [number, number, ...]
  if (typeof coords[0] === 'number' && typeof coords[1] === 'number') {
    extendBbox(bbox, coords[0], coords[1]);
    return;
  }
  for (const c of coords) walkCoords(c, bbox);
}

/**
 * Summarize a GeoJSON FeatureCollection: geometry types, feature count, bbox,
 * and per-attribute type / sample values / value counts / numeric range. Pure.
 */
export function summarizeGeoJSON(fc: FeatureCollection): Inspection {
  const geometryTypeCounts = new Map<string, number>();
  const bbox: [number, number, number, number] = [Infinity, Infinity, -Infinity, -Infinity];

  type Stat = {
    types: Set<string>;
    present: number;
    counts: Map<string | number | boolean, number>;
    min: number;
    max: number;
    hasNumber: boolean;
  };
  const stats = new Map<string, Stat>();

  for (const feature of fc.features) {
    const geom = feature.geometry;
    if (geom) {
      geometryTypeCounts.set(geom.type, (geometryTypeCounts.get(geom.type) ?? 0) + 1);
      if (geom.coordinates !== undefined) walkCoords(geom.coordinates, bbox);
      if (geom.geometries) for (const g of geom.geometries) walkCoords(g.coordinates, bbox);
    }

    const props = feature.properties ?? {};
    for (const [key, value] of Object.entries(props)) {
      if (value === null || value === undefined) continue;
      let stat = stats.get(key);
      if (!stat) {
        stat = {
          types: new Set(),
          present: 0,
          counts: new Map(),
          min: Infinity,
          max: -Infinity,
          hasNumber: false,
        };
        stats.set(key, stat);
      }
      stat.present += 1;
      const t = typeof value;
      if (t === 'number' && Number.isFinite(value as number)) {
        stat.types.add('number');
        stat.hasNumber = true;
        const n = value as number;
        if (n < stat.min) stat.min = n;
        if (n > stat.max) stat.max = n;
        bump(stat.counts, n);
      } else if (t === 'boolean') {
        stat.types.add('boolean');
        bump(stat.counts, value as boolean);
      } else {
        stat.types.add('string');
        bump(stat.counts, String(value));
      }
    }
  }

  const geometryTypes = [...geometryTypeCounts.keys()];
  const geometryType =
    [...geometryTypeCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'Unknown';

  const attributes: AttributeSummary[] = [...stats.entries()].map(([name, stat]) => {
    const type: AttributeType =
      stat.types.size === 0
        ? 'null'
        : stat.types.size > 1
          ? 'mixed'
          : (stat.types.values().next().value as AttributeType);

    const distinct = [...stat.counts.entries()];
    const sampleValues = distinct.slice(0, SAMPLE_CAP).map(([v]) => v);

    const summary: AttributeSummary = { name, type, presentCount: stat.present, sampleValues };

    if (stat.hasNumber && type === 'number') {
      summary.numericRange = { min: stat.min, max: stat.max };
    }
    if ((type === 'string' || type === 'boolean') && distinct.length <= CATEGORICAL_CAP) {
      summary.valueCounts = distinct
        .map(([value, count]) => ({ value, count }))
        .sort((a, b) => b.count - a.count);
    }
    return summary;
  });

  const hasBbox = Number.isFinite(bbox[0]);
  return {
    geometryType,
    geometryTypes,
    featureCount: fc.features.length,
    bbox: hasBbox ? bbox : null,
    attributes,
  };
}

function bump<K>(map: Map<K, number>, key: K) {
  map.set(key, (map.get(key) ?? 0) + 1);
}

/**
 * Convert an uploaded file at `inputPath` to WGS84 GeoJSON via gdal/ogr2ogr.
 * Returns the GeoJSON text and the parsed FeatureCollection.
 */
export async function convertToGeoJSON(
  inputPath: string,
  format: SourceFormat,
): Promise<{ text: string; fc: FeatureCollection }> {
  const dir = await mkdtemp(join(tmpdir(), 'vibe-convert-'));
  const outPath = join(dir, 'out.geojson');
  // /vsizip/ lets ogr2ogr read a shapefile straight out of the uploaded .zip.
  const source = format === 'shapefile' ? `/vsizip/${inputPath}` : inputPath;
  try {
    await execFileAsync('ogr2ogr', [
      '-f',
      'GeoJSON',
      '-t_srs',
      'EPSG:4326',
      outPath,
      source,
    ]);
    const text = await readFile(outPath, 'utf8');
    const fc = JSON.parse(text) as FeatureCollection;
    return { text, fc };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

/** Whether tippecanoe is on PATH (vector-tile generation for large sources). */
export async function tippecanoeAvailable(): Promise<boolean> {
  try {
    await execFileAsync('tippecanoe', ['--version']);
    return true;
  } catch {
    return false;
  }
}
