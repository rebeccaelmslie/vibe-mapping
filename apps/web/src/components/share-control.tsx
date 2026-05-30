'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { API_BASE } from '@/lib/config';
import { QrCode } from './qr-code';
import { useToast } from './toast';

interface SizeEstimate {
  zmax: number;
  bytes: number;
}

const ZOOM_OPTIONS = [
  { zmax: 16, label: 'Default' },
  { zmax: 17, label: 'More detail' },
  { zmax: 18, label: 'Highest detail' },
] as const;

function formatBytes(b: number): string {
  if (b < 1024 * 1024) return `${Math.round(b / 1024)} KB`;
  return `${(b / (1024 * 1024)).toFixed(b < 10 * 1024 * 1024 ? 1 : 0)} MB`;
}

export function ShareControl({ mapId }: { mapId: string | null }) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [estimates, setEstimates] = useState<Record<number, SizeEstimate>>({});

  const url = token ? `${window.location.origin}/s/${token}` : null;

  // Fetch one size estimate per zoom option once we have a token.
  useEffect(() => {
    if (!token) return;
    let active = true;
    (async () => {
      for (const opt of ZOOM_OPTIONS) {
        try {
          const res = await fetch(`${API_BASE}/share/${token}/export-size?zmax=${opt.zmax}`);
          if (!res.ok) continue;
          const data = (await res.json()) as { estimatedBytes: number };
          if (!active) return;
          setEstimates((e) => ({ ...e, [opt.zmax]: { zmax: opt.zmax, bytes: data.estimatedBytes } }));
        } catch {
          // ignore — labels just won't show size for that zoom
        }
      }
    })();
    return () => {
      active = false;
    };
  }, [token]);

  async function share() {
    if (!mapId) return;
    if (token) {
      setOpen((o) => !o);
      return;
    }
    setBusy(true);
    try {
      const { token: t } = await api.shareMap(mapId);
      setToken(t);
      setOpen(true);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Share failed', 'error');
    } finally {
      setBusy(false);
    }
  }

  function downloadVibemap(zmax: number) {
    if (!token) return;
    // Native browser download — no JS file handling needed. anchor.click()
    // works around popup blockers vs window.open.
    const a = document.createElement('a');
    a.href = `${API_BASE}/share/${token}/export.vibemap?zmax=${zmax}`;
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    a.remove();
    toast('Preparing field map file…', 'info');
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

      {open && token && url && (
        <div className="absolute right-0 top-full z-10 mt-2 w-80 rounded-lg border border-neutral-700 bg-neutral-900 p-4 shadow-xl">
          {/* Live link section */}
          <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-neutral-400">
            Live map link
          </p>
          <div className="flex justify-center">
            <QrCode value={url} />
          </div>
          <p className="mt-3 text-xs text-neutral-500">
            Opens in the Vibe Mapping mobile app, or any browser. Recipient
            saves a copy for offline use from the app.
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
                toast('Link copied', 'success');
                setTimeout(() => setCopied(false), 1500);
              }}
              className="rounded bg-blue-600 px-2 py-1 text-xs font-medium text-white"
            >
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>

          {/* Field map file section */}
          <div className="my-4 border-t border-neutral-800" />
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-neutral-400">
            Field map file
          </p>
          <p className="mb-3 text-xs text-neutral-500">
            A single <span className="font-mono">.vibemap</span> file with
            basemap and data baked in. AirDrop / email / Files — works offline
            with no signup.
          </p>
          <div className="space-y-1.5">
            {ZOOM_OPTIONS.map((opt) => {
              const est = estimates[opt.zmax];
              const sizeLabel = est ? `~${formatBytes(est.bytes)}` : '…';
              return (
                <button
                  key={opt.zmax}
                  onClick={() => downloadVibemap(opt.zmax)}
                  className="flex w-full items-center justify-between rounded-md border border-neutral-700 bg-neutral-950 px-3 py-2 text-left text-xs hover:border-neutral-500"
                >
                  <span className="flex flex-col">
                    <span className="font-medium text-neutral-200">
                      {opt.label}{' '}
                      <span className="text-neutral-500">(z{opt.zmax})</span>
                    </span>
                  </span>
                  <span className="font-mono text-neutral-400">{sizeLabel}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
