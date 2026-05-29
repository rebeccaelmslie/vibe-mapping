'use client';

import type { SourceRow } from '@/lib/api';

function StatusBadge({ source }: { source: SourceRow }) {
  if (source.status === 'ready') {
    return (
      <span className="shrink-0 text-xs text-neutral-500">
        {source.inspection?.featureCount ?? 0} features
      </span>
    );
  }
  if (source.status === 'inspecting') {
    return <span className="shrink-0 text-xs text-amber-400">inspecting…</span>;
  }
  return <span className="shrink-0 text-xs text-red-400">failed</span>;
}

export function SourcesPanel({ sources }: { sources: SourceRow[] }) {
  if (sources.length === 0) return null;
  return (
    <div className="space-y-1.5 border-b border-neutral-800 p-3">
      <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">Sources</p>
      {sources.map((s) => (
        <div key={s.id} className="flex items-center justify-between gap-2">
          <span className="truncate text-sm text-neutral-200" title={s.originalFilename}>
            {s.originalFilename}
          </span>
          <StatusBadge source={s} />
        </div>
      ))}
    </div>
  );
}
