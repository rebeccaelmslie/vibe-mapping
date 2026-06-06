import { describe, it, expect } from 'vitest';
import { mapSpec, type MapSpec } from './map-spec';
import { deriveLegend } from './legend';

function parse(raw: Parameters<typeof mapSpec.parse>[0]): MapSpec {
  return mapSpec.parse(raw);
}

describe('deriveLegend', () => {
  it('emits one constant-color entry for a constant-styled point layer', () => {
    const spec = parse({
      id: 'm',
      name: 'M',
      initialView: { center: [0, 0] },
      sources: [{ id: 's', kind: 'geojson', url: 'https://e.test/a.geojson' }],
      layers: [
        {
          id: 'pins',
          name: 'Field pins',
          type: 'point',
          sourceId: 's',
          style: { color: '#ff0000', radius: 6 },
        },
      ],
    });
    const legend = deriveLegend(spec);
    expect(legend).toHaveLength(1);
    expect(legend[0]).toMatchObject({
      layerId: 'pins',
      title: 'Field pins',
      entries: [
        {
          label: 'Field pins',
          swatch: { kind: 'point', color: '#ff0000', radius: 6 },
        },
      ],
    });
  });

  it('emits one entry per case for a match-styled line layer', () => {
    const spec = parse({
      id: 'm',
      name: 'M',
      initialView: { center: [0, 0] },
      sources: [{ id: 's', kind: 'geojson', url: 'https://e.test/a.geojson' }],
      layers: [
        {
          id: 'tracks',
          type: 'line',
          sourceId: 's',
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
            dash: 'dashed',
            width: 3,
          },
        },
      ],
    });
    const legend = deriveLegend(spec);
    expect(legend).toHaveLength(1);
    const entries = legend[0]!.entries;
    expect(entries).toHaveLength(3); // 2 cases + distinct fallback
    expect(entries[0]).toMatchObject({
      label: 'walking',
      swatch: { kind: 'line', color: '#16a34a', dash: 'dashed', width: 3 },
    });
    expect(entries[1]).toMatchObject({ label: 'cycling', swatch: { color: '#2563eb' } });
    expect(entries[2]).toMatchObject({ label: 'Other', swatch: { color: '#9ca3af' } });
  });

  it('omits the fallback entry when its color duplicates a case', () => {
    const spec = parse({
      id: 'm',
      name: 'M',
      initialView: { center: [0, 0] },
      sources: [{ id: 's', kind: 'geojson', url: 'https://e.test/a.geojson' }],
      layers: [
        {
          id: 'tracks',
          type: 'line',
          sourceId: 's',
          style: {
            color: {
              kind: 'match',
              field: 'type',
              cases: [{ when: 'walking', then: '#16a34a' }],
              fallback: '#16a34a',
            },
          },
        },
      ],
    });
    const entries = deriveLegend(spec)[0]!.entries;
    expect(entries).toHaveLength(1);
    expect(entries[0]?.label).toBe('walking');
  });

  it('skips invisible layers', () => {
    const spec = parse({
      id: 'm',
      name: 'M',
      initialView: { center: [0, 0] },
      sources: [{ id: 's', kind: 'geojson', url: 'https://e.test/a.geojson' }],
      layers: [
        { id: 'shown', type: 'point', sourceId: 's' },
        { id: 'hidden', type: 'point', sourceId: 's', visible: false },
      ],
    });
    const legend = deriveLegend(spec);
    expect(legend.map((s) => s.layerId)).toEqual(['shown']);
  });

  it('lists sections in spec order (top-first matches chrome order)', () => {
    const spec = parse({
      id: 'm',
      name: 'M',
      initialView: { center: [0, 0] },
      sources: [{ id: 's', kind: 'geojson', url: 'https://e.test/a.geojson' }],
      layers: [
        { id: 'top', type: 'point', sourceId: 's' },
        { id: 'middle', type: 'line', sourceId: 's' },
        { id: 'bottom', type: 'polygon', sourceId: 's' },
      ],
    });
    expect(deriveLegend(spec).map((s) => s.layerId)).toEqual(['top', 'middle', 'bottom']);
  });

  it('emits a gradient swatch for a step-styled polygon layer', () => {
    const spec = parse({
      id: 'm',
      name: 'M',
      initialView: { center: [0, 0] },
      sources: [{ id: 's', kind: 'geojson', url: 'https://e.test/a.geojson' }],
      layers: [
        {
          id: 'stands',
          type: 'polygon',
          sourceId: 's',
          style: {
            fillColor: {
              kind: 'step',
              field: 'YOE',
              base: '#e0f2fe',
              stops: [
                { at: 2010, value: '#7dd3fc' },
                { at: 2020, value: '#0284c7' },
              ],
            },
          },
        },
      ],
    });
    const entries = deriveLegend(spec)[0]!.entries;
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      label: 'by YOE',
      swatch: { kind: 'gradient', stops: ['#e0f2fe', '#7dd3fc', '#0284c7'] },
    });
  });

  it('falls back to a humanised id when no name is set', () => {
    const spec = parse({
      id: 'm',
      name: 'M',
      initialView: { center: [0, 0] },
      sources: [{ id: 's', kind: 'geojson', url: 'https://e.test/a.geojson' }],
      layers: [{ id: 'pine_stands', type: 'polygon', sourceId: 's' }],
    });
    expect(deriveLegend(spec)[0]?.title).toBe('Pine stands');
  });
});
