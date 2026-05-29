import { describe, it, expect } from 'vitest';
import { mapSpec, type MapSpec } from '../map-spec';
import type { SourceCatalogEntry } from '../inspection';
import { applyTool, type ToolContext } from './index';

const TRACKS: SourceCatalogEntry = {
  id: 'src_tracks',
  name: 'Tracks',
  layerType: 'line',
  dataUrl: 'https://api.test/sources/src_tracks/data',
  kind: 'geojson',
  inspection: {
    geometryType: 'LineString',
    geometryTypes: ['LineString'],
    featureCount: 3,
    bbox: [174.5, -41.5, 175.0, -41.0],
    attributes: [
      { name: 'name', type: 'string', presentCount: 3, sampleValues: ['A', 'B', 'C'] },
      {
        name: 'type',
        type: 'string',
        presentCount: 3,
        sampleValues: ['walking', 'cycling'],
        valueCounts: [
          { value: 'walking', count: 2 },
          { value: 'cycling', count: 1 },
        ],
      },
    ],
  },
};

const ctx: ToolContext = { sources: [TRACKS] };

function emptySpec(): MapSpec {
  return mapSpec.parse({ id: 'm', name: 'M', initialView: { center: [0, 0] } });
}

describe('applyTool', () => {
  it('inspect_source returns inspection without mutating the spec', () => {
    const spec = emptySpec();
    const { spec: out, summary } = applyTool('inspect_source', { sourceId: 'src_tracks' }, spec, ctx);
    expect(out).toBe(spec); // unchanged reference
    expect(JSON.parse(summary)).toMatchObject({ geometryType: 'LineString', featureCount: 3 });
  });

  it('propose_initial_map builds a layer per source with labels + framed view', () => {
    const { spec } = applyTool('propose_initial_map', { sourceIds: ['src_tracks'] }, emptySpec(), ctx);
    expect(spec.layers).toHaveLength(1);
    expect(spec.layers[0]).toMatchObject({ type: 'line', sourceId: 'src_tracks' });
    expect(spec.layers[0]?.labels?.field).toBe('name');
    expect(spec.sources[0]).toMatchObject({ id: 'src_tracks', kind: 'geojson' });
    expect(spec.initialView.center).toEqual([174.75, -41.25]);
  });

  it('set_layer_style merges and validates a data-driven match expression', () => {
    let { spec } = applyTool('propose_initial_map', { sourceIds: ['src_tracks'] }, emptySpec(), ctx);
    const layerId = spec.layers[0]!.id;
    spec = applyTool(
      'set_layer_style',
      {
        layerId,
        style: {
          color: {
            kind: 'match',
            field: 'type',
            cases: [{ when: 'walking', then: '#16a34a' }],
            fallback: '#888',
          },
          width: 4,
        },
      },
      spec,
      ctx,
    ).spec;
    const layer = spec.layers[0];
    if (layer?.type === 'line') {
      expect(layer.style.width).toBe(4);
      expect(layer.style.color).toMatchObject({ kind: 'match', field: 'type' });
    }
  });

  it('set_layer_style rejects an invalid value', () => {
    const { spec } = applyTool('propose_initial_map', { sourceIds: ['src_tracks'] }, emptySpec(), ctx);
    const layerId = spec.layers[0]!.id;
    expect(() =>
      applyTool('set_layer_style', { layerId, style: { width: 'thick' } }, spec, ctx),
    ).toThrow();
  });

  it('filter_layer sets and clears a filter', () => {
    let { spec } = applyTool('propose_initial_map', { sourceIds: ['src_tracks'] }, emptySpec(), ctx);
    const layerId = spec.layers[0]!.id;
    spec = applyTool(
      'filter_layer',
      { layerId, filter: { field: 'type', op: '==', value: 'walking' } },
      spec,
      ctx,
    ).spec;
    expect(spec.layers[0]?.filter).toMatchObject({ field: 'type', op: '==' });
    spec = applyTool('filter_layer', { layerId, filter: null }, spec, ctx).spec;
    expect(spec.layers[0]?.filter).toBeUndefined();
  });

  it('set_basemap and zoom_to mutate the view/basemap', () => {
    let { spec } = applyTool('propose_initial_map', { sourceIds: ['src_tracks'] }, emptySpec(), ctx);
    spec = applyTool('set_basemap', { basemap: 'streets' }, spec, ctx).spec;
    expect(spec.basemap).toBe('streets');
    spec = applyTool('zoom_to', { bbox: [0, 0, 10, 10] }, spec, ctx).spec;
    expect(spec.initialView.center).toEqual([5, 5]);
  });

  it('remove_layer drops the layer; reorder respects given order', () => {
    let { spec } = applyTool('add_layer_from_source', { sourceId: 'src_tracks' }, emptySpec(), ctx);
    spec = applyTool('add_layer_from_source', { sourceId: 'src_tracks', name: 'Second' }, spec, ctx).spec;
    expect(spec.layers).toHaveLength(2);
    const [a, b] = spec.layers.map((l) => l.id);
    spec = applyTool('reorder_layers', { layerIds: [b!, a!] }, spec, ctx).spec;
    expect(spec.layers.map((l) => l.id)).toEqual([b, a]);
    spec = applyTool('remove_layer', { layerId: b! }, spec, ctx).spec;
    expect(spec.layers.map((l) => l.id)).toEqual([a]);
  });

  it('throws on unknown tool and unknown source', () => {
    expect(() => applyTool('nope', {}, emptySpec(), ctx)).toThrow(/Unknown tool/);
    expect(() =>
      applyTool('add_layer_from_source', { sourceId: 'missing' }, emptySpec(), ctx),
    ).toThrow(/No source/);
  });

  it('set_layer_labels accepts a template combining multiple attributes', () => {
    let { spec } = applyTool(
      'propose_initial_map',
      { sourceIds: ['src_tracks'] },
      emptySpec(),
      ctx,
    );
    const layerId = spec.layers[0]!.id;
    const out = applyTool(
      'set_layer_labels',
      { layerId, labels: { template: '{name}\n{type}' } },
      spec,
      ctx,
    );
    spec = out.spec;
    expect(spec.layers[0]?.labels?.template).toBe('{name}\n{type}');
    expect(spec.layers[0]?.labels?.field).toBeUndefined();
    expect(out.summary).toMatch(/template/);
  });

  it('set_layer_labels rejects providing both field and template', () => {
    const { spec } = applyTool(
      'propose_initial_map',
      { sourceIds: ['src_tracks'] },
      emptySpec(),
      ctx,
    );
    const layerId = spec.layers[0]!.id;
    expect(() =>
      applyTool(
        'set_layer_labels',
        { layerId, labels: { field: 'name', template: '{name}' } },
        spec,
        ctx,
      ),
    ).toThrow();
  });
});
