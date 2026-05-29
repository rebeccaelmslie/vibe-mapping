import { describe, it, expect } from 'vitest';
import { mapSpec, type MapSpec } from '@vibe/shared';
import { mapSpecToStyle, type MapLibreStyle } from './index';

// A hand-written MapSpec exercising: layer ordering (top-first), a match
// expression, dashed lines, labels, filters, vector source-layer, and
// visibility. Parsed through the schema so style defaults are applied.
const RAW = {
  id: 'map_1',
  name: 'Test map',
  basemap: 'aerial',
  initialView: { center: [174.77, -41.29], zoom: 12 },
  sources: [
    { id: 'tracks', kind: 'geojson', url: 'https://store.example/tracks.geojson' },
    {
      id: 'parcels',
      kind: 'vector',
      url: 'https://store.example/parcels/{z}/{x}/{y}.pbf',
      sourceLayer: 'parcels',
    },
  ],
  layers: [
    {
      id: 'points',
      type: 'point',
      sourceId: 'tracks',
      filter: { field: 'type', op: '==', value: 'walking' },
      labels: { field: 'name' },
      style: {
        color: {
          kind: 'match',
          field: 'type',
          cases: [
            { when: 'walking', then: '#16a34a' },
            { when: 'cycling', then: '#2563eb' },
          ],
          fallback: '#9ca3af',
        },
      },
    },
    { id: 'lines', type: 'line', sourceId: 'tracks', style: { dash: 'dashed' } },
    { id: 'parcels', type: 'polygon', sourceId: 'parcels' },
    { id: 'hidden', type: 'polygon', sourceId: 'parcels', visible: false },
  ],
} as const;

function build(): MapLibreStyle {
  const spec: MapSpec = mapSpec.parse(RAW);
  return mapSpecToStyle(spec, { maptilerKey: 'TEST_KEY' });
}

const ids = (style: MapLibreStyle) => style.layers.map((l) => l.id);
const find = (style: MapLibreStyle, id: string) => style.layers.find((l) => l.id === id);

describe('mapSpecToStyle', () => {
  it('emits a v8 style with a MapTiler aerial basemap at the bottom', () => {
    const style = build();
    expect(style.version).toBe(8);

    expect(style.layers[0]).toMatchObject({ id: 'basemap', type: 'raster', source: 'basemap' });
    const basemap = style.sources.basemap;
    expect(basemap?.type).toBe('raster');
    if (basemap?.type === 'raster') {
      expect(basemap.tiles[0]).toContain('satellite-v2');
      expect(basemap.tiles[0]).toContain('key=TEST_KEY');
    }
    expect(style.glyphs).toContain('key=TEST_KEY');
  });

  it('registers each data source (geojson + vector)', () => {
    const style = build();
    expect(style.sources.tracks).toMatchObject({ type: 'geojson', data: RAW.sources[0].url });
    expect(style.sources.parcels).toMatchObject({
      type: 'vector',
      tiles: [RAW.sources[1].url],
    });
  });

  it('orders layers top-first (spec[0] renders on top of spec[1])', () => {
    const style = build();
    // polygon (bottom of spec) draws before the point (top of spec).
    expect(ids(style).indexOf('parcels')).toBeLessThan(ids(style).indexOf('points'));
    // polygon emits a fill plus a dedicated outline line.
    expect(find(style, 'parcels')?.type).toBe('fill');
    expect(find(style, 'parcels__outline')?.type).toBe('line');
  });

  it('compiles a match expression for data-driven color', () => {
    const style = build();
    expect(find(style, 'points')?.paint?.['circle-color']).toEqual([
      'match',
      ['get', 'type'],
      'walking',
      '#16a34a',
      'cycling',
      '#2563eb',
      '#9ca3af',
    ]);
  });

  it('maps a dashed line to a line-dasharray', () => {
    const style = build();
    expect(find(style, 'lines')?.paint?.['line-dasharray']).toEqual([2, 2]);
  });

  it('emits a label symbol layer on top, with the field bound', () => {
    const style = build();
    const labels = find(style, 'points__labels');
    expect(labels?.type).toBe('symbol');
    expect(labels?.layout?.['text-field']).toEqual(['get', 'name']);
    // labels render above all geometry.
    expect(ids(style).indexOf('points__labels')).toBeGreaterThan(ids(style).indexOf('points'));
  });

  it('compiles a filter and applies the vector source-layer', () => {
    const style = build();
    expect(find(style, 'points')?.filter).toEqual(['==', ['get', 'type'], 'walking']);
    expect(find(style, 'parcels')?.['source-layer']).toBe('parcels');
  });

  it('skips invisible layers', () => {
    const style = build();
    expect(find(style, 'hidden')).toBeUndefined();
  });

  it('omits `attribution` when the source has none (MapLibre rejects undefined)', () => {
    const style = build();
    // Spec sources in RAW have no attribution; the emitted geojson source
    // must NOT carry an `attribution` key at all.
    expect(Object.prototype.hasOwnProperty.call(style.sources.tracks!, 'attribution')).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(style.sources.parcels!, 'attribution')).toBe(false);
  });
});
