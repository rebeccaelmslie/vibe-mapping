'use client';

// Floating cartographic chrome for the web viewer. Sits above the map
// canvas as absolutely-positioned overlays — the existing page header
// owns the title block, and the MapLibre `ScaleControl` /
// `NavigationControl` cover scale + compass. This component adds the
// legend drawer + attribution row.

import { useState } from 'react';
import {
  deriveLegend,
  type LegendSection,
  type LegendEntry,
  type MapSpec,
} from '@vibe/shared';
import { creditsFor } from '@vibe/map-renderer';

interface MapChromeProps {
  spec: MapSpec;
  visible: boolean;
}

function PointSwatch({ entry }: { entry: LegendEntry }) {
  if (entry.swatch.kind !== 'point') return null;
  const { color, strokeColor, radius } = entry.swatch;
  const size = Math.max(10, Math.min(16, radius * 2));
  return (
    <span
      className="inline-block rounded-full"
      style={{
        width: size,
        height: size,
        backgroundColor: color,
        border: `1.5px solid ${strokeColor}`,
      }}
    />
  );
}

function LineSwatch({ entry }: { entry: LegendEntry }) {
  if (entry.swatch.kind !== 'line') return null;
  const { color, width, dash } = entry.swatch;
  const thickness = Math.max(2, Math.min(4, width));
  const borderStyle = dash === 'solid' ? 'solid' : dash;
  return (
    <span
      className="inline-block"
      style={{
        width: 24,
        height: 0,
        borderTop: `${thickness}px ${borderStyle} ${color}`,
      }}
    />
  );
}

function PolygonSwatch({ entry }: { entry: LegendEntry }) {
  if (entry.swatch.kind !== 'polygon') return null;
  const { fillColor, fillOpacity, outlineColor } = entry.swatch;
  return (
    <span
      className="inline-block"
      style={{
        width: 16,
        height: 14,
        backgroundColor: fillColor,
        opacity: Math.max(0.5, fillOpacity),
        border: `1px solid ${outlineColor}`,
      }}
    />
  );
}

function GradientSwatch({ entry }: { entry: LegendEntry }) {
  if (entry.swatch.kind !== 'gradient') return null;
  const { stops } = entry.swatch;
  return (
    <span
      className="inline-block"
      style={{
        width: 24,
        height: 14,
        background: `linear-gradient(to right, ${stops.join(', ')})`,
      }}
    />
  );
}

function Swatch({ entry }: { entry: LegendEntry }) {
  switch (entry.swatch.kind) {
    case 'point':
      return <PointSwatch entry={entry} />;
    case 'line':
      return <LineSwatch entry={entry} />;
    case 'polygon':
      return <PolygonSwatch entry={entry} />;
    case 'gradient':
      return <GradientSwatch entry={entry} />;
  }
}

function LegendRow({ section }: { section: LegendSection }) {
  return (
    <div className="px-3 pb-2 pt-1">
      <p className="mb-1 text-xs font-semibold text-neutral-100">{section.title}</p>
      {section.entries.map((e, i) => (
        <div key={i} className="flex items-center gap-2 py-0.5">
          <span className="flex w-6 items-center justify-center">
            <Swatch entry={e} />
          </span>
          <span className="truncate text-xs text-neutral-400">{e.label}</span>
        </div>
      ))}
    </div>
  );
}

export function MapChrome({ spec, visible }: MapChromeProps) {
  const [open, setOpen] = useState(true);
  if (!visible) return null;

  const legend = deriveLegend(spec);
  const credits = creditsFor(spec.basemap, true);

  return (
    <div
      className="pointer-events-none absolute bottom-4 right-4 z-10 w-72"
      aria-label="Map legend"
    >
      <div className="pointer-events-auto overflow-hidden rounded-lg border border-white/10 bg-neutral-900/90 shadow-lg backdrop-blur">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="flex w-full items-center justify-between px-3 py-2 text-left"
        >
          <span className="text-xs font-bold uppercase tracking-wide text-neutral-200">
            Legend
          </span>
          <span className="text-neutral-500" aria-hidden>
            {open ? '▾' : '▴'}
          </span>
        </button>
        {open && (
          <div className="max-h-72 overflow-y-auto">
            {legend.length === 0 ? (
              <p className="px-3 pb-2 text-xs text-neutral-500">No data layers</p>
            ) : (
              legend.map((s) => <LegendRow key={s.layerId} section={s} />)
            )}
            <p className="px-3 pb-2 pt-1 text-[10px] text-neutral-500">
              {credits.basemap} · {credits.labels}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
