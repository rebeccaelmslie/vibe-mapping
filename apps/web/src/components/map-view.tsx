'use client';

import { useEffect, useRef } from 'react';
import maplibregl, { type StyleSpecification } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { mapSpecToStyle } from '@vibe/map-renderer';
import type { MapSpec } from '@vibe/shared';
import { MAPTILER_KEY } from '@/lib/config';

function toStyle(spec: MapSpec): StyleSpecification {
  // Our renderer emits a structurally-valid v8 style; cast to MapLibre's type.
  return mapSpecToStyle(spec, { maptilerKey: MAPTILER_KEY }) as unknown as StyleSpecification;
}

export function MapView({ spec }: { spec: MapSpec }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const prevView = useRef('');

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: toStyle(spec),
      center: spec.initialView.center,
      zoom: spec.initialView.zoom,
      bearing: spec.initialView.bearing,
      pitch: spec.initialView.pitch,
    });
    map.addControl(new maplibregl.NavigationControl(), 'top-right');
    mapRef.current = map;
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
    map.setStyle(toStyle(spec));
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

  return <div ref={containerRef} className="h-full w-full" />;
}
