import AsyncStorage from '@react-native-async-storage/async-storage';

export interface RecentMap {
  token: string;
  name: string;
  openedAt: number; // epoch millis
}

export interface Pin {
  id: string;
  lng: number;
  lat: number;
  name: string;
  createdAt: number;
}

export interface Measurement {
  id: string;
  label: string;
  /** Closed ring of [lng, lat] pairs (first ≠ last; we close in the renderer). */
  coordinates: [number, number][];
  areaM2: number;
  createdAt: number;
}

export interface MapAnnotations {
  pins: Pin[];
  measurements: Measurement[];
}

const RECENTS_KEY = 'recents';
const annotationsKey = (token: string) => `map:${token}`;
const RECENTS_CAP = 50;

async function readJSON<T>(key: string, fallback: T): Promise<T> {
  try {
    const raw = await AsyncStorage.getItem(key);
    if (raw == null) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

async function writeJSON<T>(key: string, value: T): Promise<void> {
  await AsyncStorage.setItem(key, JSON.stringify(value));
}

// ---------------------------------------------------------------------------
// Recents
// ---------------------------------------------------------------------------

export function getRecents(): Promise<RecentMap[]> {
  return readJSON<RecentMap[]>(RECENTS_KEY, []);
}

export async function saveRecent(entry: RecentMap): Promise<void> {
  const list = await getRecents();
  const without = list.filter((r) => r.token !== entry.token);
  const next = [entry, ...without].slice(0, RECENTS_CAP);
  await writeJSON(RECENTS_KEY, next);
}

export async function removeRecent(token: string): Promise<void> {
  const list = await getRecents();
  await writeJSON(
    RECENTS_KEY,
    list.filter((r) => r.token !== token),
  );
}

// ---------------------------------------------------------------------------
// Per-map annotations
// ---------------------------------------------------------------------------

const EMPTY_ANNOTATIONS: MapAnnotations = { pins: [], measurements: [] };

export async function getAnnotations(token: string): Promise<MapAnnotations> {
  const raw = await readJSON<Partial<MapAnnotations>>(annotationsKey(token), EMPTY_ANNOTATIONS);
  // Backward-compat for saved blobs from earlier phases that lacked measurements.
  return { pins: raw.pins ?? [], measurements: raw.measurements ?? [] };
}

export async function saveAnnotations(token: string, m: MapAnnotations): Promise<void> {
  await writeJSON(annotationsKey(token), m);
}

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

/** Generate a short unique-enough id without pulling a uuid dep. */
export function newId(prefix: string): string {
  const rand = Math.random().toString(36).slice(2, 10);
  const t = Date.now().toString(36);
  return `${prefix}_${t}${rand}`;
}
