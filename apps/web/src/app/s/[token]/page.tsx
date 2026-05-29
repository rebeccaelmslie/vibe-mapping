'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import type { MapSpec } from '@vibe/shared';
import { api } from '@/lib/api';
import { MapView } from '@/components/map-view';

export default function SharedMap() {
  const token = String(useParams().token);
  const [spec, setSpec] = useState<MapSpec | null>(null);
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .getShared(token)
      .then((r) => {
        setSpec(r.map.spec);
        setName(r.map.name);
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Could not load map'));
  }, [token]);

  if (error) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-2 text-center">
        <p className="text-lg font-medium">Map not found</p>
        <p className="text-sm text-neutral-500">This share link is invalid or has been removed.</p>
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col">
      <header className="flex items-center justify-between border-b border-neutral-800 px-4 py-2">
        <span className="font-medium">{name || 'Shared map'}</span>
        <span className="text-xs text-neutral-500">Vibe Mapping</span>
      </header>
      <div className="min-h-0 flex-1">
        {spec ? (
          <MapView spec={spec} />
        ) : (
          <div className="flex h-full items-center justify-center text-neutral-500">Loading map…</div>
        )}
      </div>
    </div>
  );
}
