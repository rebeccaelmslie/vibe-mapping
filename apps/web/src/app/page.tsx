'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api, type Project } from '@/lib/api';

export default function Home() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .listProjects()
      .then((r) => setProjects(r.projects))
      .catch((e) => setError(String(e.message)))
      .finally(() => setLoading(false));
  }, []);

  async function create() {
    const trimmed = name.trim();
    if (!trimmed) return;
    try {
      const { project } = await api.createProject(trimmed);
      setProjects((p) => [project, ...p]);
      setName('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create project');
    }
  }

  return (
    <main className="mx-auto max-w-2xl px-6 py-12">
      <h1 className="text-3xl font-bold">Vibe Mapping</h1>
      <p className="mt-2 text-neutral-400">Build maps by chatting. Start with a project.</p>

      <div className="mt-8 flex gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && create()}
          placeholder="New project name"
          className="flex-1 rounded-md border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm outline-none focus:border-neutral-500"
        />
        <button
          onClick={create}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white"
        >
          Create
        </button>
      </div>

      {error && (
        <p className="mt-4 rounded-md bg-red-950 px-3 py-2 text-sm text-red-300">
          {error} — is the API running on {process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8787'}?
        </p>
      )}

      <div className="mt-8 space-y-2">
        {loading && <p className="text-sm text-neutral-500">Loading…</p>}
        {!loading && projects.length === 0 && (
          <p className="text-sm text-neutral-500">No projects yet.</p>
        )}
        {projects.map((p) => (
          <Link
            key={p.id}
            href={`/projects/${p.id}`}
            className="block rounded-md border border-neutral-800 px-4 py-3 hover:border-neutral-600"
          >
            {p.name}
          </Link>
        ))}
      </div>
    </main>
  );
}
