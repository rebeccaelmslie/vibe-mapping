import { z } from 'zod';
import { colorValue, numberValue, filter } from './styled-value';

// ---------------------------------------------------------------------------
// Sources — uploaded data, stored as GeoJSON or as a vector tileset.
// ---------------------------------------------------------------------------

export const source = z.object({
  id: z.string(),
  /** geojson = stored GeoJSON document; vector = generated tileset (tippecanoe). */
  kind: z.enum(['geojson', 'vector']),
  /** geojson: URL of the GeoJSON document. vector: tile URL template ({z}/{x}/{y}). */
  url: z.string().url(),
  /** Required for `vector`: the layer name inside the tileset. */
  sourceLayer: z.string().optional(),
  attribution: z.string().optional(),
});
export type Source = z.infer<typeof source>;

// ---------------------------------------------------------------------------
// Labels
// ---------------------------------------------------------------------------

export const labelStyle = z
  .object({
    /** Label by a single attribute. */
    field: z.string().optional(),
    /**
     * Or a template combining multiple attributes with literal text:
     *   "{CPT}/{Stand}\n{YOE}"
     * Use `\n` for line breaks. `{` cannot currently be escaped.
     */
    template: z.string().optional(),
    color: z.string().default('#ffffff'),
    size: numberValue.default(12),
    haloColor: z.string().default('#1f2937'),
    haloWidth: z.number().default(1.2),
  })
  .refine((v) => !!v.field !== !!v.template, {
    message: 'Provide exactly one of `field` or `template`',
  });
export type LabelStyle = z.infer<typeof labelStyle>;

// ---------------------------------------------------------------------------
// Layers — three concrete kinds. No generic layer engine (by design).
// ---------------------------------------------------------------------------

const layerBase = {
  id: z.string(),
  sourceId: z.string(),
  name: z.string().optional(),
  visible: z.boolean().default(true),
  filter: filter.optional(),
  labels: labelStyle.nullable().default(null),
};

export const pointLayer = z.object({
  ...layerBase,
  type: z.literal('point'),
  style: z
    .object({
      color: colorValue.default('#3b82f6'),
      radius: numberValue.default(5),
      opacity: numberValue.default(1),
      strokeColor: colorValue.default('#ffffff'),
      strokeWidth: numberValue.default(1),
    })
    .default({}),
});
export type PointLayer = z.infer<typeof pointLayer>;

export const lineLayer = z.object({
  ...layerBase,
  type: z.literal('line'),
  style: z
    .object({
      color: colorValue.default('#f97316'),
      width: numberValue.default(2),
      opacity: numberValue.default(1),
      dash: z.union([z.enum(['solid', 'dashed', 'dotted']), z.array(z.number())]).default('solid'),
    })
    .default({}),
});
export type LineLayer = z.infer<typeof lineLayer>;

export const polygonLayer = z.object({
  ...layerBase,
  type: z.literal('polygon'),
  style: z
    .object({
      fillColor: colorValue.default('#22c55e'),
      fillOpacity: numberValue.default(0.4),
      outlineColor: colorValue.default('#15803d'),
      outlineWidth: numberValue.default(1),
    })
    .default({}),
});
export type PolygonLayer = z.infer<typeof polygonLayer>;

export const layer = z.discriminatedUnion('type', [pointLayer, lineLayer, polygonLayer]);
export type Layer = z.infer<typeof layer>;

// ---------------------------------------------------------------------------
// MapSpec — the central document. The LLM mutates this via typed tools; both
// web and mobile render from it through @vibe/map-renderer.
// ---------------------------------------------------------------------------

export const initialView = z.object({
  center: z.tuple([z.number(), z.number()]), // [lng, lat]
  zoom: z.number().default(2),
  bearing: z.number().default(0),
  pitch: z.number().default(0),
});
export type InitialView = z.infer<typeof initialView>;

// ---------------------------------------------------------------------------
// Layout — the print/presentation furniture (title, legend, scale bar, north
// arrow). Drives both the live on-screen chrome and PDF export. The LLM sets
// this via the `set_layout` tool; the map itself stays the WYSIWYG preview.
// ---------------------------------------------------------------------------

export const legendPosition = z.enum(['top-left', 'top-right', 'bottom-left', 'bottom-right']);
export type LegendPosition = z.infer<typeof legendPosition>;

export const mapLayout = z
  .object({
    /** Map title shown across the top. Omit for none. */
    title: z.string().optional(),
    /** Smaller line under the title (e.g. date, subtitle). */
    subtitle: z.string().optional(),
    legend: z
      .object({
        visible: z.boolean().default(true),
        position: legendPosition.default('bottom-right'),
      })
      .default({}),
    scaleBar: z.object({ visible: z.boolean().default(true) }).default({}),
    northArrow: z.object({ visible: z.boolean().default(false) }).default({}),
  })
  .default({});
export type MapLayout = z.infer<typeof mapLayout>;

export const mapSpec = z.object({
  id: z.string(),
  name: z.string(),
  basemap: z.enum(['aerial', 'streets', 'hybrid']).default('aerial'),
  initialView,
  sources: z.array(source).default([]),
  /** Ordered top-first: layers[0] renders above layers[1], etc. */
  layers: z.array(layer).default([]),
  /** Print/presentation furniture. Defaults fill in for older specs. */
  layout: mapLayout,
});
export type MapSpec = z.infer<typeof mapSpec>;
