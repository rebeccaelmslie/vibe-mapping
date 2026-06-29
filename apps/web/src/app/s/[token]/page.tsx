'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { mapSpec, type MapSpec } from '@vibe/shared';
import { api } from '@/lib/api';
import { MapView } from '@/components/map-view';
import { MapChrome } from '@/components/map-chrome';

export default function SharedMap() {
  const token = String(useParams().token);
  const [spec, setSpec] = useState<MapSpec | null>(null);
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [chromeVisible, setChromeVisible] = useState(true);

  useEffect(() => {
    api
      .getShared(token)
      .then((r) => {
        // Parse to fill schema defaults (e.g. `layout`) for older specs.
        setSpec(mapSpec.parse(r.map.spec));
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

  const today = new Date().toLocaleDateString();

  return (
    <div className="flex h-screen flex-col">
      <header className="flex items-center justify-between border-b border-neutral-800 px-4 py-2">
        <div className="flex items-baseline gap-2">
          <span className="font-medium">{name || 'Shared map'}</span>
          <span className="text-xs text-neutral-500">· {today}</span>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setChromeVisible((v) => !v)}
            className="rounded-md border border-neutral-700 px-2 py-1 text-xs text-neutral-300 hover:bg-neutral-800"
            aria-label={chromeVisible ? 'Hide map info' : 'Show map info'}
          >
            {chromeVisible ? 'Hide legend' : 'Show legend'}
          </button>
          <span className="text-xs text-neutral-500">Vibe Mapping</span>
        </div>
      </header>
      <div className="relative min-h-0 flex-1">
        {spec ? (
          <>
            <MapView spec={spec} />
            <MapChrome spec={spec} visible={chromeVisible} />
          </>
        ) : (
          <div className="flex h-full items-center justify-center text-neutral-500">Loading map…</div>
        )}
      </div>
    </div>
  );
}
