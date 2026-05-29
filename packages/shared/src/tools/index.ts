import { z } from 'zod';
import { mapSpec, type MapSpec } from '../map-spec';
import { filter, numberValue } from '../styled-value';
import type { SourceCatalogEntry } from '../inspection';
import {
  findLayer,
  getEntry,
  ensureSource,
  newLayerId,
  combineBbox,
  viewForBbox,
  pickLabelField,
} from './helpers';

export interface ToolContext {
  sources: SourceCatalogEntry[];
}

export interface ToolResult {
  spec: MapSpec;
  summary: string;
}

export interface ToolDef {
  name: string;
  description: string;
  /** JSON Schema for the Anthropic tool's `input_schema`. */
  inputSchema: Record<string, unknown>;
  parse: (args: unknown) => unknown;
  apply: (draft: MapSpec, args: never, ctx: ToolContext) => string;
}

function defineTool<A>(def: {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  schema: z.ZodType<A>;
  apply: (draft: MapSpec, args: A, ctx: ToolContext) => string;
}): ToolDef {
  return {
    name: def.name,
    description: def.description,
    inputSchema: def.inputSchema,
    parse: (args) => def.schema.parse(args),
    // The registry erases the per-tool arg type; parse guarantees the shape.
    apply: def.apply as ToolDef['apply'],
  };
}

const layerIdSchema = z.object({ layerId: z.string() });

// ---------------------------------------------------------------------------
// Tool definitions
// ---------------------------------------------------------------------------

const inspectSource = defineTool({
  name: 'inspect_source',
  description:
    'Inspect an uploaded source: geometry type, feature count, and attributes (types, sample values, value counts, numeric ranges). Read-only — call this before proposing or styling.',
  inputSchema: {
    type: 'object',
    properties: { sourceId: { type: 'string' } },
    required: ['sourceId'],
  },
  schema: z.object({ sourceId: z.string() }),
  apply: (_draft, args, ctx) => {
    const entry = getEntry(ctx.sources, args.sourceId);
    return JSON.stringify({
      id: entry.id,
      name: entry.name,
      layerType: entry.layerType,
      geometryType: entry.inspection.geometryType,
      featureCount: entry.inspection.featureCount,
      bbox: entry.inspection.bbox,
      attributes: entry.inspection.attributes,
    });
  },
});

const proposeInitialMap = defineTool({
  name: 'propose_initial_map',
  description:
    'Generate a sensible starting map from one or more sources: one layer each (top = first listed), default styling, labels on a name-like field when present, and an initial view framing the data. Replaces existing layers.',
  inputSchema: {
    type: 'object',
    properties: { sourceIds: { type: 'array', items: { type: 'string' }, minItems: 1 } },
    required: ['sourceIds'],
  },
  schema: z.object({ sourceIds: z.array(z.string()).min(1) }),
  apply: (draft, args, ctx) => {
    const entries = args.sourceIds.map((id) => getEntry(ctx.sources, id));
    draft.sources = entries.map((e) => ({
      id: e.id,
      kind: e.kind,
      url: e.dataUrl,
      ...(e.sourceLayer ? { sourceLayer: e.sourceLayer } : {}),
    }));
    draft.layers = entries.map((e) => {
      const labelField = pickLabelField(e.inspection.attributes);
      return {
        id: `layer_${e.id}`,
        type: e.layerType,
        sourceId: e.id,
        name: e.name,
        ...(labelField ? { labels: { field: labelField } } : {}),
      } as MapSpec['layers'][number];
    });
    const bbox = combineBbox(entries.map((e) => e.inspection.bbox));
    if (bbox) draft.initialView = viewForBbox(bbox);
    return `Proposed a map with ${entries.length} layer(s): ${entries.map((e) => e.name).join(', ')}.`;
  },
});

const addLayerFromSource = defineTool({
  name: 'add_layer_from_source',
  description: 'Add a new layer (on top) referencing an existing source.',
  inputSchema: {
    type: 'object',
    properties: { sourceId: { type: 'string' }, name: { type: 'string' } },
    required: ['sourceId'],
  },
  schema: z.object({ sourceId: z.string(), name: z.string().optional() }),
  apply: (draft, args, ctx) => {
    const entry = getEntry(ctx.sources, args.sourceId);
    ensureSource(draft, entry);
    const id = newLayerId(entry.id, draft);
    draft.layers.unshift({
      id,
      type: entry.layerType,
      sourceId: entry.id,
      name: args.name ?? entry.name,
    } as MapSpec['layers'][number]);
    return `Added a ${entry.layerType} layer "${args.name ?? entry.name}".`;
  },
});

const removeLayer = defineTool({
  name: 'remove_layer',
  description: 'Remove a layer by id.',
  inputSchema: {
    type: 'object',
    properties: { layerId: { type: 'string' } },
    required: ['layerId'],
  },
  schema: layerIdSchema,
  apply: (draft, args) => {
    const before = draft.layers.length;
    draft.layers = draft.layers.filter((l) => l.id !== args.layerId);
    if (draft.layers.length === before) throw new Error(`No layer with id "${args.layerId}"`);
    return `Removed layer "${args.layerId}".`;
  },
});

const setLayerStyle = defineTool({
  name: 'set_layer_style',
  description:
    'Update a layer\'s visual style. Provide only the fields to change. point: color, radius, opacity, strokeColor, strokeWidth. line: color, width, opacity, dash ("solid"|"dashed"|"dotted"). polygon: fillColor, fillOpacity, outlineColor, outlineWidth. Each value is a constant OR a data-driven expression: {"kind":"match","field":F,"cases":[{"when":V,"then":X}],"fallback":X}, {"kind":"step","field":F,"base":X,"stops":[{"at":N,"value":X}]}, or {"kind":"interpolate","field":F,"stops":[{"at":N,"value":X}]}.',
  inputSchema: {
    type: 'object',
    properties: {
      layerId: { type: 'string' },
      style: { type: 'object', additionalProperties: true },
    },
    required: ['layerId', 'style'],
  },
  schema: z.object({ layerId: z.string(), style: z.record(z.string(), z.unknown()) }),
  apply: (draft, args) => {
    const layer = findLayer(draft, args.layerId);
    // Merge partial style; the central re-parse validates each value.
    (layer as { style: Record<string, unknown> }).style = {
      ...(layer as { style: Record<string, unknown> }).style,
      ...args.style,
    };
    return `Updated style of "${args.layerId}" (${Object.keys(args.style).join(', ')}).`;
  },
});

const labelInput = z
  .object({
    field: z.string(),
    color: z.string().optional(),
    size: numberValue.optional(),
    haloColor: z.string().optional(),
    haloWidth: z.number().optional(),
  })
  .nullable();

const setLayerLabels = defineTool({
  name: 'set_layer_labels',
  description:
    'Set or clear labels for a layer. Pass {field, color?, size?, haloColor?, haloWidth?} to label by an attribute, or null to remove labels.',
  inputSchema: {
    type: 'object',
    properties: {
      layerId: { type: 'string' },
      labels: {
        type: ['object', 'null'],
        properties: {
          field: { type: 'string' },
          color: { type: 'string' },
          size: { type: 'number' },
          haloColor: { type: 'string' },
          haloWidth: { type: 'number' },
        },
      },
    },
    required: ['layerId', 'labels'],
  },
  schema: z.object({ layerId: z.string(), labels: labelInput }),
  apply: (draft, args) => {
    const layer = findLayer(draft, args.layerId);
    // Partial label input; the central re-parse fills color/size/halo defaults.
    (layer as { labels: unknown }).labels = args.labels;
    return args.labels
      ? `Labelled "${args.layerId}" by "${args.labels.field}".`
      : `Removed labels from "${args.layerId}".`;
  },
});

const filterLayer = defineTool({
  name: 'filter_layer',
  description:
    'Filter the features shown in a layer, or pass null to clear. A condition is {field, op, value} with op one of ==,!=,>,>=,<,<=,in (use an array value for `in`). Combine with {"all":[...]} or {"any":[...]}.',
  inputSchema: {
    type: 'object',
    properties: {
      layerId: { type: 'string' },
      filter: { type: ['object', 'null'] },
    },
    required: ['layerId', 'filter'],
  },
  schema: z.object({ layerId: z.string(), filter: filter.nullable() }),
  apply: (draft, args) => {
    const layer = findLayer(draft, args.layerId);
    if (args.filter === null) {
      delete layer.filter;
      return `Cleared the filter on "${args.layerId}".`;
    }
    layer.filter = args.filter;
    return `Filtered "${args.layerId}".`;
  },
});

const reorderLayers = defineTool({
  name: 'reorder_layers',
  description:
    'Reorder layers, top first. List the layer ids in the desired order; any omitted layers keep their relative order at the bottom.',
  inputSchema: {
    type: 'object',
    properties: { layerIds: { type: 'array', items: { type: 'string' } } },
    required: ['layerIds'],
  },
  schema: z.object({ layerIds: z.array(z.string()) }),
  apply: (draft, args) => {
    const byId = new Map(draft.layers.map((l) => [l.id, l]));
    const ordered = args.layerIds.map((id) => byId.get(id)).filter((l) => l !== undefined);
    const mentioned = new Set(args.layerIds);
    const rest = draft.layers.filter((l) => !mentioned.has(l.id));
    draft.layers = [...ordered, ...rest];
    return `Reordered layers.`;
  },
});

const setBasemap = defineTool({
  name: 'set_basemap',
  description: 'Switch the basemap: aerial (satellite, default), streets, or hybrid (satellite + labels).',
  inputSchema: {
    type: 'object',
    properties: { basemap: { type: 'string', enum: ['aerial', 'streets', 'hybrid'] } },
    required: ['basemap'],
  },
  schema: z.object({ basemap: z.enum(['aerial', 'streets', 'hybrid']) }),
  apply: (draft, args) => {
    draft.basemap = args.basemap;
    return `Set basemap to ${args.basemap}.`;
  },
});

const zoomTo = defineTool({
  name: 'zoom_to',
  description:
    'Move the initial view to frame a layer (by id) or an explicit bbox [minLng, minLat, maxLng, maxLat].',
  inputSchema: {
    type: 'object',
    properties: {
      layerId: { type: 'string' },
      bbox: { type: 'array', items: { type: 'number' }, minItems: 4, maxItems: 4 },
    },
  },
  schema: z
    .object({
      layerId: z.string().optional(),
      bbox: z.tuple([z.number(), z.number(), z.number(), z.number()]).optional(),
    })
    .refine((v) => v.layerId || v.bbox, 'Provide either layerId or bbox'),
  apply: (draft, args, ctx) => {
    if (args.bbox) {
      draft.initialView = viewForBbox(args.bbox);
      return `Zoomed to the given extent.`;
    }
    const layer = findLayer(draft, args.layerId!);
    const entry = getEntry(ctx.sources, layer.sourceId);
    const bbox = entry.inspection.bbox;
    if (!bbox) throw new Error(`Source "${layer.sourceId}" has no known extent`);
    draft.initialView = viewForBbox(bbox);
    return `Zoomed to layer "${layer.id}".`;
  },
});

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

export const TOOLS: ToolDef[] = [
  inspectSource,
  proposeInitialMap,
  addLayerFromSource,
  removeLayer,
  setLayerStyle,
  setLayerLabels,
  filterLayer,
  reorderLayers,
  setBasemap,
  zoomTo,
];

const REGISTRY = new Map(TOOLS.map((t) => [t.name, t]));

const READ_ONLY = new Set(['inspect_source']);

/**
 * Run a tool against a MapSpec. Validates args, applies the mutation to a clone,
 * then re-parses so the returned spec is always valid (style defaults filled,
 * invalid values rejected). Throws on unknown tool / bad args / bad result.
 */
export function applyTool(
  name: string,
  rawArgs: unknown,
  spec: MapSpec,
  ctx: ToolContext,
): ToolResult {
  const def = REGISTRY.get(name);
  if (!def) throw new Error(`Unknown tool: ${name}`);
  const args = def.parse(rawArgs);
  const draft = structuredClone(spec);
  const summary = def.apply(draft, args as never, ctx);
  const nextSpec = READ_ONLY.has(name) ? spec : mapSpec.parse(draft);
  return { spec: nextSpec, summary };
}
