'use client';

import { useState } from 'react';
import { api } from '@/lib/api';
import { QrCode } from './qr-code';

export function ShareControl({ mapId }: { mapId: string | null }) {
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function share() {
    if (!mapId) return;
    if (url) {
      setOpen((o) => !o);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const { token } = await api.shareMap(mapId);
      setUrl(`${window.location.origin}/s/${token}`);
      setOpen(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Share failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="relative">
      <button
        onClick={share}
        disabled={!mapId || busy}
        className="rounded-md border border-neutral-700 px-3 py-1.5 text-sm hover:border-neutral-500 disabled:opacity-40"
      >
        {busy ? 'Sharing…' : 'Share'}
      </button>

      {open && url && (
        <div className="absolute right-0 top-full z-10 mt-2 w-72 rounded-lg border border-neutral-700 bg-neutral-900 p-4 shadow-xl">
          <p className="mb-3 text-sm font-medium">Live map link</p>
          <div className="flex justify-center">
            <QrCode value={url} />
          </div>
          <p className="mt-3 text-xs text-neutral-500">
            Opens in the Vibe Mapping mobile app, or any browser.
          </p>
          <div className="mt-3 flex gap-2">
            <input
              readOnly
              value={url}
              onFocus={(e) => e.currentTarget.select()}
              className="min-w-0 flex-1 rounded border border-neutral-700 bg-neutral-950 px-2 py-1 text-xs text-neutral-300"
            />
            <button
              onClick={async () => {
                await navigator.clipboard.writeText(url);
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              }}
              className="rounded bg-blue-600 px-2 py-1 text-xs font-medium text-white"
            >
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
        </div>
      )}

      {error && <p className="absolute right-0 top-full mt-2 text-xs text-red-400">{error}</p>}
    </div>
  );
}
