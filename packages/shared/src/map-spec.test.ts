import { describe, it, expect } from 'vitest';
import { mapSpec } from './map-spec';

describe('mapSpec schema', () => {
  it('applies sensible defaults to a minimal spec', () => {
    const spec = mapSpec.parse({
      id: 'm1',
      name: 'Min',
      initialView: { center: [0, 0] },
    });

    expect(spec.basemap).toBe('aerial');
    expect(spec.initialView).toMatchObject({ zoom: 2, bearing: 0, pitch: 0 });
    expect(spec.sources).toEqual([]);
    expect(spec.layers).toEqual([]);
  });

  it('fills layer style and label defaults', () => {
    const spec = mapSpec.parse({
      id: 'm1',
      name: 'Styled',
      initialView: { center: [0, 0] },
      sources: [{ id: 's', kind: 'geojson', url: 'https://e.test/a.geojson' }],
      layers: [{ id: 'l', type: 'line', sourceId: 's' }],
    });

    const layer = spec.layers[0];
    expect(layer?.type).toBe('line');
    if (layer?.type === 'line') {
      expect(layer.style.color).toBe('#f97316');
      expect(layer.style.width).toBe(2);
      expect(layer.style.dash).toBe('solid');
    }
    expect(layer?.visible).toBe(true);
    expect(layer?.labels).toBeNull();
  });

  it('accepts a data-driven match expression for color', () => {
    const spec = mapSpec.parse({
      id: 'm1',
      name: 'DD',
      initialView: { center: [0, 0] },
      sources: [{ id: 's', kind: 'geojson', url: 'https://e.test/a.geojson' }],
      layers: [
        {
          id: 'l',
          type: 'point',
          sourceId: 's',
          style: {
            color: {
              kind: 'match',
              field: 'type',
              cases: [{ when: 'a', then: '#fff' }],
              fallback: '#000',
            },
          },
        },
      ],
    });

    const layer = spec.layers[0];
    if (layer?.type === 'point') {
      expect(layer.style.color).toMatchObject({ kind: 'match', field: 'type' });
    }
  });

  it('rejects an unknown layer type', () => {
    expect(() =>
      mapSpec.parse({
        id: 'm1',
        name: 'Bad',
        initialView: { center: [0, 0] },
        layers: [{ id: 'l', type: 'raster', sourceId: 's' }],
      }),
    ).toThrow();
  });
});
