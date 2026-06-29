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
  type LegendPosition,
  type MapSpec,
} from '@vibe/shared';
import { creditsFor } from '@vibe/map-renderer';

interface MapChromeProps {
  spec: MapSpec;
  visible: boolean;
  /** When false, the title overlay is omitted (e.g. the page band renders it). */
  showTitle?: boolean;
  /** 'light' tints the legend/north arrow for the white print sheet. */
  theme?: 'dark' | 'light';
}

// Where the legend panel sits. Top-right is nudged down to clear the
// MapLibre navigation control; bottom-left clears the scale control.
const LEGEND_POSITION_CLASS: Record<LegendPosition, string> = {
  'top-left': 'top-4 left-4',
  'top-right': 'top-28 right-4',
  'bottom-left': 'bottom-12 left-4',
  'bottom-right': 'bottom-8 right-4',
};

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

function LegendRow({ section, dark }: { section: LegendSection; dark: boolean }) {
  return (
    <div className="px-3 pb-2 pt-1">
      <p className={`mb-1 text-xs font-semibold ${dark ? 'text-neutral-100' : 'text-neutral-900'}`}>
        {section.title}
      </p>
      {section.entries.map((e, i) => (
        <div key={i} className="flex items-center gap-2 py-0.5">
          <span className="flex w-6 items-center justify-center">
            <Swatch entry={e} />
          </span>
          <span className={`truncate text-xs ${dark ? 'text-neutral-400' : 'text-neutral-600'}`}>
            {e.label}
          </span>
        </div>
      ))}
    </div>
  );
}

function NorthArrow({ positionClass, dark }: { positionClass: string; dark: boolean }) {
  const theme = dark
    ? 'border-white/10 bg-neutral-900/80 text-neutral-100'
    : 'border-neutral-300 bg-white text-neutral-900';
  return (
    <div
      className={`pointer-events-none absolute z-10 flex h-12 w-12 flex-col items-center justify-center rounded-full border shadow-lg backdrop-blur ${theme} ${positionClass}`}
      aria-label="North arrow"
    >
      <span className="-mb-1 text-lg leading-none" aria-hidden>
        ▲
      </span>
      <span className="text-xs font-bold leading-none">N</span>
    </div>
  );
}

function TitleBlock({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="pointer-events-none absolute inset-x-0 top-4 z-10 flex justify-center">
      <div className="max-w-[80%] rounded-lg border border-white/10 bg-neutral-900/80 px-4 py-2 text-center shadow-lg backdrop-blur">
        <p className="text-sm font-semibold text-neutral-50">{title}</p>
        {subtitle && <p className="text-xs text-neutral-300">{subtitle}</p>}
      </div>
    </div>
  );
}

export function MapChrome({ spec, visible, showTitle = true, theme = 'dark' }: MapChromeProps) {
  const [open, setOpen] = useState(true);
  if (!visible) return null;

  const dark = theme !== 'light';
  const layout = spec.layout;
  const legend = deriveLegend(spec);
  const credits = creditsFor(spec.basemap, true);

  // Keep the north arrow out of the legend's corner (top-28 clears the nav control).
  const arrowTopLeftTaken = layout.legend.visible && layout.legend.position === 'top-left';
  const arrowPositionClass = arrowTopLeftTaken ? 'top-28 right-4' : 'top-4 left-4';

  const panelCls = dark ? 'border-white/10 bg-neutral-900/90' : 'border-neutral-300 bg-white/95';
  const headerCls = dark ? 'text-neutral-200' : 'text-neutral-800';

  return (
    <>
      {showTitle && layout.title && <TitleBlock title={layout.title} subtitle={layout.subtitle} />}
      {layout.northArrow.visible && <NorthArrow positionClass={arrowPositionClass} dark={dark} />}
      {layout.legend.visible && (
        <div
          className={`pointer-events-none absolute z-10 w-72 ${LEGEND_POSITION_CLASS[layout.legend.position]}`}
          aria-label="Map legend"
        >
          <div className={`pointer-events-auto overflow-hidden rounded-lg border shadow-lg backdrop-blur ${panelCls}`}>
            <button
              type="button"
              onClick={() => setOpen((o) => !o)}
              className="flex w-full items-center justify-between px-3 py-2 text-left"
            >
              <span className={`text-xs font-bold uppercase tracking-wide ${headerCls}`}>
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
                  legend.map((s) => <LegendRow key={s.layerId} section={s} dark={dark} />)
                )}
                <p className="px-3 pb-2 pt-1 text-[10px] text-neutral-500">
                  {credits.basemap} · {credits.labels}
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
