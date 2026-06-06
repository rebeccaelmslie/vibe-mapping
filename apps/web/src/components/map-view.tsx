'use client';

import { useEffect, useRef, useState } from 'react';
import maplibregl, { type StyleSpecification } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { mapSpecToStyle } from '@vibe/map-renderer';
import type { MapSpec } from '@vibe/shared';
import { API_BASE, MAPTILER_KEY, LINZ_KEY } from '@/lib/config';
import { useToast } from './toast';

function toStyle(spec: MapSpec): StyleSpecification {
  // Our renderer emits a structurally-valid v8 style; cast to MapLibre's type.
  return mapSpecToStyle(spec, {
    maptilerKey: MAPTILER_KEY,
    linzKey: LINZ_KEY || undefined,
  }) as unknown as StyleSpecification;
}

interface SourceCounter {
  total: number;
  loaded: Set<string>;
}

export function MapView({ spec }: { spec: MapSpec }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const prevView = useRef('');
  const justInitedRef = useRef(false);
  const counterRef = useRef<SourceCounter>({ total: 0, loaded: new Set() });
  const errorsRef = useRef<{ when: string; sourceId: string; message: string; status?: number; url?: string }[]>([]);
  const [status, setStatus] = useState('');
  const toast = useToast();
  const toastRef = useRef(toast);
  toastRef.current = toast;

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: toStyle(spec),
      center: spec.initialView.center,
      zoom: spec.initialView.zoom,
      bearing: spec.initialView.bearing,
      pitch: spec.initialView.pitch,
      // Required so /debug/report can capture the canvas via toDataURL.
      preserveDrawingBuffer: true,
    });
    map.addControl(
      new maplibregl.NavigationControl({ showCompass: true, visualizePitch: true }),
      'top-right',
    );
    map.addControl(
      new maplibregl.ScaleControl({ maxWidth: 120, unit: 'metric' }),
      'bottom-left',
    );

    // Surface silent MapLibre failures (CORS, 404, malformed GeoJSON, tiles).
    // Use console.warn (not error) so Next's dev overlay doesn't catch it as
    // an unhandled error — the toast carries the actionable message.
    map.on('error', (e) => {
      try {
        const sourceId = (e as unknown as { sourceId?: string }).sourceId ?? '';
        const errObj = (e as { error?: { message?: string; status?: number; url?: string } }).error;
        const message = errObj?.message ?? 'unknown error';
        const entry = {
          when: new Date().toISOString(),
          sourceId,
          message,
          status: errObj?.status,
          url: errObj?.url,
        };
        errorsRef.current.push(entry);
        if (errorsRef.current.length > 20) errorsRef.current.shift();
        console.warn('[map] error', entry);
        toastRef.current(`Map error${sourceId ? ` (${sourceId})` : ''}: ${message}`, 'error');
      } catch {
        // never let the handler itself throw
      }
    });

    // Recount the geojson sources each time the style changes.
    map.on('styledata', () => {
      const sources = map.getStyle()?.sources ?? {};
      const geo = Object.keys(sources).filter((k) => sources[k]?.type === 'geojson');
      counterRef.current = { total: geo.length, loaded: new Set() };
      setStatus(geo.length === 0 ? '' : `0/${geo.length} sources loaded`);
    });

    // Increment as each source finishes loading.
    map.on('sourcedata', (e) => {
      if (!e.sourceId || !e.isSourceLoaded || e.dataType !== 'source') return;
      const c = counterRef.current;
      if (c.loaded.has(e.sourceId)) return;
      c.loaded.add(e.sourceId);
      setStatus(`${c.loaded.size}/${c.total} sources loaded`);
    });

    mapRef.current = map;
    justInitedRef.current = true;
    prevView.current = JSON.stringify(spec.initialView);
    return () => {
      map.remove();
      mapRef.current = null;
    };
    // Initialise once; subsequent spec changes are handled below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    // Skip the redundant first-render setStyle — the constructor just used
    // the same spec, and racing the in-flight style load can leave the map
    // with no style at all (canvas renders black).
    if (justInitedRef.current) {
      justInitedRef.current = false;
      return;
    }
    // diff:false forces a full reload — successive setStyle with the default
    // diff:true path mis-handles basemap raster swaps and geojson source churn.
    map.setStyle(toStyle(spec), { diff: false });
    const view = JSON.stringify(spec.initialView);
    if (view !== prevView.current) {
      map.jumpTo({
        center: spec.initialView.center,
        zoom: spec.initialView.zoom,
        bearing: spec.initialView.bearing,
        pitch: spec.initialView.pitch,
      });
      prevView.current = view;
    }
  }, [spec]);

  async function sendReport() {
    const map = mapRef.current;
    if (!map) {
      toast('No map to report yet', 'error');
      return;
    }
    try {
      // Force a render frame so the WebGL buffer has fresh contents.
      map.triggerRepaint();
      await new Promise<void>((resolve) => map.once('render', () => resolve()));

      const canvas = map.getCanvas();
      const png = canvas.toDataURL('image/png');

      // getStyle() can return undefined if the style failed/hasn't loaded.
      // Capture as much as we can either way.
      const style = map.getStyle();
      const sources = style
        ? Object.entries(style.sources ?? {}).map(([id, s]) => ({
            id,
            type: (s as { type?: string }).type,
            url:
              (s as { data?: string; url?: string }).data ??
              (s as { url?: string }).url ??
              null,
            tiles: (s as { tiles?: string[] }).tiles ?? null,
          }))
        : [];
      const layerIds = style
        ? style.layers.map((l) => ({
            id: l.id,
            type: l.type,
            source: 'source' in l ? l.source : null,
          }))
        : [];

      // What WE handed to MapLibre (so we can see if the input was bad).
      const intendedStyle = mapSpecToStyle(spec, {
        maptilerKey: MAPTILER_KEY,
        linzKey: LINZ_KEY || undefined,
      });

      const meta = {
        when: new Date().toISOString(),
        styleLoaded: map.isStyleLoaded?.() ?? null,
        loaded: map.loaded?.() ?? null,
        styleIsUndefined: !style,
        maptilerKeyHead: MAPTILER_KEY ? MAPTILER_KEY.slice(0, 4) + '…' : '(empty)',
        maptilerKeyLength: MAPTILER_KEY.length,
        recentMapErrors: errorsRef.current,
        center: map.getCenter().toArray(),
        zoom: map.getZoom(),
        canvasSize: { width: canvas.width, height: canvas.height },
        status,
        spec,
        layerIds,
        sources,
        intendedStyle,
      };

      const res = await fetch(`${API_BASE}/debug/report`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ png, meta }),
      });
      if (!res.ok) throw new Error(`report failed: ${res.status}`);
      toast('Report sent — Claude can see what you see now', 'success');
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Report failed', 'error');
    }
  }

  return (
    <div className="relative h-full w-full">
      <div ref={containerRef} className="h-full w-full" />
      {status && (
        <div className="pointer-events-none absolute left-2 top-2 rounded bg-black/70 px-2 py-1 text-xs text-white">
          {status}
        </div>
      )}
      <button
        onClick={sendReport}
        title="Send a screenshot + map state to Claude"
        className="absolute bottom-3 left-3 rounded-md bg-fuchsia-700 px-3 py-1.5 text-xs font-medium text-white shadow-lg hover:bg-fuchsia-600"
      >
        📸 Send report
      </button>
    </div>
  );
}
