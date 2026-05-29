import type { MapSpec, Inspection } from '@vibe/shared';
import { API_BASE, DEV_USER_ID } from './config';

export interface Project {
  id: string;
  userId: string;
  name: string;
  createdAt: string;
}

export interface SourceRow {
  id: string;
  projectId: string;
  originalFilename: string;
  format: 'geojson' | 'shapefile' | 'kml' | 'gpx';
  status: 'inspecting' | 'ready' | 'failed';
  rawKey: string;
  geojsonKey: string | null;
  tilesKey: string | null;
  sizeBytes: number;
  inspection: Inspection | null;
  error: string | null;
  createdAt: string;
}

export interface MapRow {
  id: string;
  projectId: string;
  name: string;
  spec: MapSpec;
  createdAt: string;
  updatedAt: string;
}

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: { 'x-dev-user-id': DEV_USER_ID, ...init?.headers },
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? `API error ${res.status}`);
  }
  return res.json() as Promise<T>;
}

const json = (body: unknown): RequestInit => ({
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

export const api = {
  listProjects: () => apiFetch<{ projects: Project[] }>('/projects'),

  createProject: (name: string) =>
    apiFetch<{ project: Project }>('/projects', json({ name })),

  getProject: (id: string) =>
    apiFetch<{ project: Project; sources: SourceRow[]; maps: MapRow[] }>(`/projects/${id}`),

  uploadSource: (projectId: string, file: File) => {
    const form = new FormData();
    form.append('file', file);
    return apiFetch<{ source: SourceRow }>(`/projects/${projectId}/sources`, {
      method: 'POST',
      body: form,
    });
  },

  createMap: (projectId: string, name: string, spec?: MapSpec) =>
    apiFetch<{ map: MapRow }>(`/projects/${projectId}/maps`, json({ name, spec })),

  getMap: (id: string) => apiFetch<{ map: MapRow }>(`/maps/${id}`),

  updateMap: (id: string, spec: MapSpec) =>
    apiFetch<{ map: MapRow }>(`/maps/${id}`, { ...json({ spec }), method: 'PUT' }),

  shareMap: (id: string) =>
    apiFetch<{ token: string; fetchUrl: string }>(`/maps/${id}/share`, json({})),

  getShared: (token: string) =>
    apiFetch<{ map: { id: string; name: string; spec: MapSpec } }>(`/share/${token}`),
};
