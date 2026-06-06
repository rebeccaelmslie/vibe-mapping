// Derive a legend from a MapSpec. Pure — same input produces the same
// list of swatch+label entries, ready for the chrome to render. Lives
// alongside the renderer in `packages/*` so web and mobile share it.

import type { MapSpec, Layer } from './map-spec';
import type { ColorValue, NumberValue } from './styled-value';

export type SwatchKind = 'point' | 'line' | 'polygon';

export interface PointSwatch {
  kind: 'point';
  color: string;
  radius: number;
  strokeColor: string;
}
export interface LineSwatch {
  kind: 'line';
  color: string;
  width: number;
  dash: 'solid' | 'dashed' | 'dotted';
}
export interface PolygonSwatch {
  kind: 'polygon';
  fillColor: string;
  fillOpacity: number;
  outlineColor: string;
}
export interface GradientSwatch {
  kind: 'gradient';
  /** Hex colors, low-stop → high-stop. */
  stops: string[];
}

export type Swatch = PointSwatch | LineSwatch | PolygonSwatch | GradientSwatch;

export interface LegendEntry {
  swatch: Swatch;
  label: string;
}

export interface LegendSection {
  layerId: string;
  /** Display title — `layer.name` if set, else humanised `layer.id`. */
  title: string;
  entries: LegendEntry[];
}

function humanise(id: string): string {
  const cleaned = id.replace(/[_-]+/g, ' ').trim();
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}

function asString(v: string | number | boolean): string {
  return typeof v === 'string' ? v : String(v);
}

function constantColor(v: ColorValue): string | null {
  return typeof v === 'string' ? v : null;
}
function constantNumber(v: NumberValue): number | null {
  return typeof v === 'number' ? v : null;
}

/**
 * Walk a color value, returning the per-case entries. Returns null if the
 * color isn't expressible as discrete swatches (i.e. a constant — handled by
 * the caller — or a step/interpolate gradient — handled separately).
 */
function colorCases(color: ColorValue): { when: string; color: string }[] | null {
  if (typeof color !== 'object' || color === null) return null;
  if (color.kind !== 'match') return null;
  return color.cases.map((c) => ({ when: asString(c.when), color: c.then }));
}

function colorFallback(color: ColorValue): string | null {
  if (typeof color !== 'object' || color === null) return null;
  if (color.kind !== 'match') return null;
  return color.fallback;
}

function gradientStops(color: ColorValue): string[] | null {
  if (typeof color !== 'object' || color === null) return null;
  if (color.kind === 'step') {
    return [color.base, ...color.stops.map((s) => s.value)];
  }
  if (color.kind === 'interpolate') {
    return color.stops.map((s) => s.value);
  }
  return null;
}

function colorField(color: ColorValue): string | null {
  if (typeof color !== 'object' || color === null) return null;
  return color.field ?? null;
}

function numberConstant(v: NumberValue, fallback: number): number {
  return constantNumber(v) ?? fallback;
}

function pointSwatch(layer: Layer & { type: 'point' }, color: string): PointSwatch {
  return {
    kind: 'point',
    color,
    radius: numberConstant(layer.style.radius, 5),
    strokeColor: constantColor(layer.style.strokeColor) ?? '#ffffff',
  };
}

function lineSwatch(layer: Layer & { type: 'line' }, color: string): LineSwatch {
  const dash = Array.isArray(layer.style.dash) ? 'dashed' : layer.style.dash;
  return {
    kind: 'line',
    color,
    width: numberConstant(layer.style.width, 2),
    dash,
  };
}

function polygonSwatch(layer: Layer & { type: 'polygon' }, fillColor: string): PolygonSwatch {
  return {
    kind: 'polygon',
    fillColor,
    fillOpacity: numberConstant(layer.style.fillOpacity, 0.4),
    outlineColor: constantColor(layer.style.outlineColor) ?? '#15803d',
  };
}

function colorOf(layer: Layer): ColorValue {
  if (layer.type === 'point') return layer.style.color;
  if (layer.type === 'line') return layer.style.color;
  return layer.style.fillColor;
}

function swatchWithColor(layer: Layer, color: string): Swatch {
  if (layer.type === 'point') return pointSwatch(layer, color);
  if (layer.type === 'line') return lineSwatch(layer, color);
  return polygonSwatch(layer, color);
}

function defaultColor(layer: Layer): string {
  // Schema defaults — used only when a layer's color is itself the schema default
  // expressed as a constant. Kept in sync with map-spec.ts.
  if (layer.type === 'point') return '#3b82f6';
  if (layer.type === 'line') return '#f97316';
  return '#22c55e';
}

function sectionFor(layer: Layer): LegendSection {
  const title = layer.name ?? humanise(layer.id);
  const color = colorOf(layer);

  // Constant color → one entry.
  const constant = constantColor(color);
  if (constant !== null) {
    return {
      layerId: layer.id,
      title,
      entries: [{ swatch: swatchWithColor(layer, constant), label: title }],
    };
  }

  // Match expression → one entry per case, plus fallback if distinct.
  const cases = colorCases(color);
  if (cases) {
    const entries: LegendEntry[] = cases.map((c) => ({
      swatch: swatchWithColor(layer, c.color),
      label: c.when,
    }));
    const fb = colorFallback(color);
    const seen = new Set(cases.map((c) => c.color));
    if (fb && !seen.has(fb)) {
      entries.push({ swatch: swatchWithColor(layer, fb), label: 'Other' });
    }
    return { layerId: layer.id, title, entries };
  }

  // Step / interpolate → one gradient entry, labelled "by {field}".
  const stops = gradientStops(color);
  if (stops) {
    const field = colorField(color);
    return {
      layerId: layer.id,
      title,
      entries: [
        {
          swatch: { kind: 'gradient', stops },
          label: field ? `by ${field}` : title,
        },
      ],
    };
  }

  // Schema is exhaustive, but fall back to default constant just in case.
  return {
    layerId: layer.id,
    title,
    entries: [{ swatch: swatchWithColor(layer, defaultColor(layer)), label: title }],
  };
}

/**
 * Walk visible layers in spec order (top-first) and produce one section
 * per layer. Layer styled with a match expression gets one entry per
 * case; a step/interpolate gets a single gradient entry.
 */
export function deriveLegend(spec: MapSpec): LegendSection[] {
  return spec.layers.filter((l) => l.visible).map(sectionFor);
}
