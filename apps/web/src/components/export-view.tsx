'use client';

// Full-screen export composition view. Shows a true-to-PDF paper sheet (A4 /
// Letter, portrait / landscape) scaled to fit, with the map fitted into the
// page's map area and the layout furniture in place. The user refines the
// appearance by prompting (same chat → set_layout loop), then downloads.

import { useEffect, useRef, useState } from 'react';
import type maplibregl from 'maplibre-gl';
import type { MapSpec } from '@vibe/shared';
import { creditsFor } from '@vibe/map-renderer';
import {
  pageDimsMm,
  pageLayout,
  MM_TO_PX,
  PAGE_SIZE_LABEL,
  type PageSize,
  type Orientation,
  type ExportOptions,
} from '@/lib/page-layout';
import type { Artifact } from '@/lib/artifact';
import { MapView } from './map-view';
import { MapChrome } from './map-chrome';
import type { ChatMessage } from './chat-panel';
import { useArtifactPicker, ArtifactAttachButton, ArtifactPreview } from './artifact-attach';

export function ExportView({
  spec,
  messages,
  busy,
  exporting,
  onSend,
  onExportPdf,
  onBack,
  onMap,
  onError,
}: {
  spec: MapSpec;
  messages: ChatMessage[];
  busy: boolean;
  exporting: boolean;
  onSend: (text: string, artifact?: Artifact) => void;
  onExportPdf: (opts: ExportOptions) => void;
  onBack: () => void;
  onMap: (map: maplibregl.Map | null) => void;
  onError?: (message: string) => void;
}) {
  const [input, setInput] = useState('');
  const { artifact, setArtifact, fileRef, pick } = useArtifactPicker(onError);
  const [pageSize, setPageSize] = useState<PageSize>('a4');
  const [orientation, setOrientation] = useState<Orientation>('landscape');
  const lastAssistant = [...messages].reverse().find((m) => m.role === 'assistant');

  // Page geometry in mm → design pixels for the on-screen sheet.
  const { w: pageWmm, h: pageHmm } = pageDimsMm(pageSize, orientation);
  const rects = pageLayout(pageWmm, pageHmm, {
    hasTitle: !!spec.layout.title,
    hasSubtitle: !!spec.layout.subtitle,
  });
  const pageWpx = pageWmm * MM_TO_PX;
  const pageHpx = pageHmm * MM_TO_PX;
  const px = (mm: number) => mm * MM_TO_PX;

  // Scale the sheet to fit the backdrop.
  const stageRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0);
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const measure = () => {
      const pad = 48;
      const s = Math.min((el.clientWidth - pad) / pageWpx, (el.clientHeight - pad) / pageHpx);
      setScale(Math.max(0.05, s));
    };
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    measure();
    return () => ro.disconnect();
  }, [pageWpx, pageHpx]);

  function submit() {
    const text = input.trim();
    if ((!text && !artifact) || busy) return;
    const ask = text || 'Take a look at this file and use it for my map layout.';
    setInput('');
    setArtifact(null);
    onSend(ask, artifact ?? undefined);
  }

  const credits = creditsFor(spec.basemap, true);

  return (
    <div className="absolute inset-0 z-50 flex flex-col bg-neutral-950">
      <header className="flex items-center justify-between border-b border-neutral-800 px-4 py-2">
        <button onClick={onBack} className="text-sm text-neutral-400 hover:text-neutral-200">
          ← Back to editor
        </button>
        <span className="text-sm font-medium text-neutral-200">Export</span>
        <div className="flex items-center gap-2">
          <select
            value={pageSize}
            onChange={(e) => setPageSize(e.target.value as PageSize)}
            className="rounded-md border border-neutral-700 bg-neutral-900 px-2 py-1.5 text-sm text-neutral-200"
          >
            {(Object.keys(PAGE_SIZE_LABEL) as PageSize[]).map((s) => (
              <option key={s} value={s}>
                {PAGE_SIZE_LABEL[s]}
              </option>
            ))}
          </select>
          <select
            value={orientation}
            onChange={(e) => setOrientation(e.target.value as Orientation)}
            className="rounded-md border border-neutral-700 bg-neutral-900 px-2 py-1.5 text-sm text-neutral-200"
          >
            <option value="landscape">Landscape</option>
            <option value="portrait">Portrait</option>
          </select>
          <button
            onClick={() => onExportPdf({ pageSize, orientation })}
            disabled={exporting}
            className="rounded-md bg-blue-600 px-4 py-1.5 text-sm font-medium text-white disabled:opacity-40"
          >
            {exporting ? 'Preparing…' : 'Download PDF'}
          </button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        {/* Paper-sheet preview on a gray stage. */}
        <div ref={stageRef} className="relative min-w-0 flex-1 overflow-hidden bg-neutral-800">
          <div
            className="absolute left-1/2 top-1/2 bg-white shadow-2xl"
            style={{
              width: pageWpx,
              height: pageHpx,
              transform: `translate(-50%, -50%) scale(${scale})`,
              transformOrigin: 'center center',
            }}
          >
            {/* Title band */}
            {rects.title && (
              <div
                className="absolute flex flex-col items-center justify-center text-center text-neutral-900"
                style={{ left: px(rects.title.x), top: px(rects.title.y), width: px(rects.title.w), height: px(rects.title.h) }}
              >
                <span style={{ fontSize: 21, fontWeight: 700 }}>{spec.layout.title}</span>
                {spec.layout.subtitle && (
                  <span style={{ fontSize: 13, color: '#555' }}>{spec.layout.subtitle}</span>
                )}
              </div>
            )}

            {/* Map area */}
            <div
              className="absolute overflow-hidden border border-neutral-400"
              style={{ left: px(rects.map.x), top: px(rects.map.y), width: px(rects.map.w), height: px(rects.map.h) }}
            >
              <MapView spec={spec} onMap={onMap} printMode />
              <MapChrome spec={spec} visible showTitle={false} theme="light" />
            </div>

            {/* Attribution footer */}
            <div
              className="absolute flex items-center justify-center text-neutral-500"
              style={{ left: px(rects.footer.x), top: px(rects.footer.y), width: px(rects.footer.w), height: px(rects.footer.h), fontSize: 9 }}
            >
              {credits.basemap} · {credits.labels}
            </div>
          </div>
        </div>

        {/* Appearance prompt */}
        <aside className="flex w-80 flex-col border-l border-neutral-800">
          <div className="border-b border-neutral-800 p-4">
            <p className="text-sm font-medium text-neutral-200">Tune the appearance</p>
            <p className="mt-1 text-xs text-neutral-500">
              Describe how the exported map should look — title, legend position, scale bar,
              north arrow. Changes show live on the sheet and are baked into the PDF.
            </p>
          </div>

          <div className="flex-1 space-y-3 overflow-y-auto p-4 text-sm">
            {busy ? (
              <p className="text-neutral-500">Thinking…</p>
            ) : lastAssistant ? (
              <div className="rounded-lg bg-neutral-800 px-3 py-2 text-neutral-100">
                <p className="whitespace-pre-wrap">{lastAssistant.content}</p>
              </div>
            ) : (
              <p className="text-neutral-500">
                e.g. “title it Whakarewarewa Forest Tracks”, “put the legend bottom-left”, “add a
                north arrow and scale bar”.
              </p>
            )}
          </div>

          <div className="border-t border-neutral-800 p-3">
            {artifact && <ArtifactPreview artifact={artifact} onRemove={() => setArtifact(null)} />}
            <div className="flex gap-2">
              <ArtifactAttachButton fileRef={fileRef} onPick={pick} disabled={busy} />
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    submit();
                  }
                }}
                rows={2}
                placeholder="Describe the appearance…"
                className="flex-1 resize-none rounded-md border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-neutral-100 outline-none focus:border-neutral-500"
              />
              <button
                onClick={submit}
                disabled={busy || (!input.trim() && !artifact)}
                className="self-end rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
              >
                Send
              </button>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
