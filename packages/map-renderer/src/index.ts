// @vibe/map-renderer — the ONLY place that translates a MapSpec into MapLibre
// style JSON. Imported by both apps/web and apps/mobile.

import type { MapSpec, Layer, Source as SpecSource, LabelStyle } from '@vibe/shared';
import type {
  Layer as MlLayer,
  Source as MlSource,
  MapLibreStyle,
  Expression,
  StyleValue,
} from './maplibre-types';
import { compileValue, compileFilter } from './expressions';
import { basemapSource, glyphsUrl } from './basemap';

export interface RenderOptions {
  maptilerKey: string;
  /** When set, switches the `aerial` basemap to LINZ NZ aerial imagery. */
  linzKey?: string;
}

const BASEMAP_LAYER_ID = 'basemap';
const TEXT_FONT = ['Open Sans Regular'];

const DASH_ARRAYS: Record<'solid' | 'dashed' | 'dotted', number[] | undefined> = {
  solid: undefined,
  dashed: [2, 2],
  dotted: [0.5, 2],
};

function specSourceToMl(s: SpecSource): MlSource {
  // Only include `attribution` when the spec actually has one — MapLibre's
  // style validator rejects `attribution: undefined` and refuses to load the
  // whole style. Same for vector tiles.
  const attribution = s.attribution ? { attribution: s.attribution } : {};
  if (s.kind === 'geojson') {
    return { type: 'geojson', data: s.url, ...attribution };
  }
  return { type: 'vector', tiles: [s.url], ...attribution };
}

function geometryLayers(layer: Layer, sourceLayer?: string): MlLayer[] {
  const common = {
    source: layer.sourceId,
    ...(sourceLayer ? { 'source-layer': sourceLayer } : {}),
    ...(layer.filter ? { filter: compileFilter(layer.filter) } : {}),
  };

  switch (layer.type) {
    case 'point':
      return [
        {
          id: layer.id,
          type: 'circle',
          ...common,
          paint: {
            'circle-color': compileValue(layer.style.color),
            'circle-radius': compileValue(layer.style.radius),
            'circle-opacity': compileValue(layer.style.opacity),
            'circle-stroke-color': compileValue(layer.style.strokeColor),
            'circle-stroke-width': compileValue(layer.style.strokeWidth),
          },
        },
      ];

    case 'line': {
      const dash = Array.isArray(layer.style.dash)
        ? layer.style.dash
        : DASH_ARRAYS[layer.style.dash];
      return [
        {
          id: layer.id,
          type: 'line',
          ...common,
          layout: { 'line-cap': 'round', 'line-join': 'round' },
          paint: {
            'line-color': compileValue(layer.style.color),
            'line-width': compileValue(layer.style.width),
            'line-opacity': compileValue(layer.style.opacity),
            ...(dash ? { 'line-dasharray': dash } : {}),
          },
        },
      ];
    }

    case 'polygon':
      // A fill plus a dedicated outline line, so outlineWidth is honoured
      // (MapLibre `fill` can only draw a 1px hairline outline).
      return [
        {
          id: layer.id,
          type: 'fill',
          ...common,
          paint: {
            'fill-color': compileValue(layer.style.fillColor),
            'fill-opacity': compileValue(layer.style.fillOpacity),
          },
        },
        {
          id: `${layer.id}__outline`,
          type: 'line',
          ...common,
          paint: {
            'line-color': compileValue(layer.style.outlineColor),
            'line-width': compileValue(layer.style.outlineWidth),
          },
        },
      ];
  }
}

/**
 * Compile a label template like `"{CPT}/{Stand}\n{YOE}"` into a MapLibre
 * `concat` expression. Each attribute reference is wrapped in
 * `coalesce(to-string(get(name)), "")` so missing values render as empty
 * string rather than the literal "null". Literal `{` is not currently
 * escapable.
 */
function compileTemplate(template: string): Expression {
  const parts: Array<string | Expression> = [];
  const re = /\{([A-Za-z0-9_]+)\}/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = re.exec(template)) !== null) {
    if (match.index > lastIndex) parts.push(template.slice(lastIndex, match.index));
    parts.push(['coalesce', ['to-string', ['get', match[1]!]], '']);
    lastIndex = re.lastIndex;
  }
  if (lastIndex < template.length) parts.push(template.slice(lastIndex));
  return ['concat', ...parts] as Expression;
}

function labelTextField(labels: LabelStyle): Expression | StyleValue {
  if (labels.template) return compileTemplate(labels.template);
  // Schema guarantees field is set when template isn't.
  return ['get', labels.field!] as Expression;
}

function labelLayer(layer: Layer, labels: LabelStyle, sourceLayer?: string): MlLayer {
  return {
    id: `${layer.id}__labels`,
    type: 'symbol',
    source: layer.sourceId,
    ...(sourceLayer ? { 'source-layer': sourceLayer } : {}),
    ...(layer.filter ? { filter: compileFilter(layer.filter) } : {}),
    layout: {
      'text-field': labelTextField(labels),
      'text-font': TEXT_FONT,
      'text-size': compileValue(labels.size),
      'text-anchor': layer.type === 'point' ? 'top' : 'center',
      ...(layer.type === 'point' ? { 'text-offset': [0, 0.8] } : {}),
    },
    paint: {
      'text-color': labels.color,
      'text-halo-color': labels.haloColor,
      'text-halo-width': labels.haloWidth,
    },
  };
}

/** Convert a MapSpec into a complete MapLibre GL style object. Pure. */
export function mapSpecToStyle(spec: MapSpec, opts: RenderOptions): MapLibreStyle {
  const sources: Record<string, MlSource> = {
    [BASEMAP_LAYER_ID]: basemapSource(spec.basemap, {
      maptilerKey: opts.maptilerKey,
      linzKey: opts.linzKey,
    }),
  };
  const sourceById = new Map<string, SpecSource>();
  for (const s of spec.sources) {
    sources[s.id] = specSourceToMl(s);
    sourceById.set(s.id, s);
  }

  const geometry: MlLayer[] = [];
  const labels: MlLayer[] = [];

  // layers are top-first; MapLibre draws later layers on top, so reverse.
  for (const layer of [...spec.layers].reverse()) {
    if (!layer.visible) continue;
    const sourceLayer = sourceById.get(layer.sourceId)?.sourceLayer;
    geometry.push(...geometryLayers(layer, sourceLayer));
    if (layer.labels) labels.push(labelLayer(layer, layer.labels, sourceLayer));
  }

  return {
    version: 8,
    glyphs: glyphsUrl(opts.maptilerKey),
    sources,
    layers: [
      { id: BASEMAP_LAYER_ID, type: 'raster', source: BASEMAP_LAYER_ID },
      ...geometry,
      ...labels, // labels always on top
    ],
  };
}

export type { MapLibreStyle } from './maplibre-types';
