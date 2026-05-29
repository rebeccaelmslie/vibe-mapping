import { describe, it, expect } from 'vitest';
import { summarizeGeoJSON, detectFormat, type FeatureCollection } from './inspect';

const FC: FeatureCollection = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      geometry: { type: 'LineString', coordinates: [[174.7, -41.3], [174.8, -41.2]] },
      properties: { name: 'Ridge', type: 'walking', length_km: 3.2 },
    },
    {
      type: 'Feature',
      geometry: { type: 'LineString', coordinates: [[174.6, -41.4], [174.9, -41.1]] },
      properties: { name: 'Coastal', type: 'walking', length_km: 5.0 },
    },
    {
      type: 'Feature',
      geometry: { type: 'LineString', coordinates: [[174.5, -41.5], [175.0, -41.0]] },
      properties: { name: 'Loop', type: 'cycling', length_km: 8.5 },
    },
  ],
};

describe('detectFormat', () => {
  it('maps extensions to formats', () => {
    expect(detectFormat('a.geojson')).toBe('geojson');
    expect(detectFormat('a.json')).toBe('geojson');
    expect(detectFormat('tracks.zip')).toBe('shapefile');
    expect(detectFormat('a.shp')).toBe('shapefile');
    expect(detectFormat('a.kml')).toBe('kml');
    expect(detectFormat('a.gpx')).toBe('gpx');
    expect(() => detectFormat('a.txt')).toThrow();
  });

  it('strips Finder dedup suffixes like " (2)" before checking the extension', () => {
    expect(detectFormat('Tracks (2).zip')).toBe('shapefile');
    expect(detectFormat('Boundary (10).geojson')).toBe('geojson');
  });

  it('sniffs bytes when the extension is missing or unrecognised', () => {
    const zipHead = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0, 0, 0, 0]);
    expect(detectFormat('Tracks (2)', zipHead)).toBe('shapefile');
    expect(detectFormat('boundary', Buffer.from('  { "type": "FeatureCollection" }'))).toBe(
      'geojson',
    );
    expect(detectFormat('areas', Buffer.from('<?xml version="1.0"?><kml xmlns="…">'))).toBe('kml');
    expect(detectFormat('route', Buffer.from('<?xml version="1.0"?><gpx xmlns="…">'))).toBe('gpx');
  });

  it('still throws when neither name nor bytes give a clue', () => {
    expect(() => detectFormat('mystery', Buffer.from('hello world'))).toThrow();
    expect(() => detectFormat('a.txt')).toThrow();
  });
});

describe('summarizeGeoJSON', () => {
  const ins = summarizeGeoJSON(FC);

  it('reports geometry type and feature count', () => {
    expect(ins.geometryType).toBe('LineString');
    expect(ins.geometryTypes).toEqual(['LineString']);
    expect(ins.featureCount).toBe(3);
  });

  it('computes a bbox over all coordinates', () => {
    expect(ins.bbox).toEqual([174.5, -41.5, 175.0, -41.0]);
  });

  it('classifies a numeric attribute with a range', () => {
    const length = ins.attributes.find((a) => a.name === 'length_km');
    expect(length?.type).toBe('number');
    expect(length?.numericRange).toEqual({ min: 3.2, max: 8.5 });
    expect(length?.presentCount).toBe(3);
  });

  it('classifies a categorical attribute with value counts', () => {
    const type = ins.attributes.find((a) => a.name === 'type');
    expect(type?.type).toBe('string');
    expect(type?.valueCounts).toEqual([
      { value: 'walking', count: 2 },
      { value: 'cycling', count: 1 },
    ]);
  });

  it('samples a high-cardinality string without value counts beyond the cap', () => {
    const name = ins.attributes.find((a) => a.name === 'name');
    expect(name?.type).toBe('string');
    expect(name?.sampleValues).toContain('Ridge');
  });
});
