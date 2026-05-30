import { describe, it, expect } from 'vitest';
import { polygonArea, formatArea } from './area';

describe('polygonArea', () => {
  it('is 0 for <3 vertices', () => {
    expect(polygonArea([])).toBe(0);
    expect(
      polygonArea([
        [0, 0],
        [1, 0],
      ]),
    ).toBe(0);
  });

  it('measures a ~100 m square at the equator at about 10,000 m²', () => {
    // 100m ≈ 0.000898° latitude, 0.000898° longitude at the equator.
    const d = 0.000898;
    const ring: [number, number][] = [
      [0, 0],
      [d, 0],
      [d, d],
      [0, d],
    ];
    const area = polygonArea(ring);
    expect(area).toBeGreaterThan(9_900);
    expect(area).toBeLessThan(10_100);
  });

  it('measures a 1° square at the equator at about 12,391 km²', () => {
    const ring: [number, number][] = [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1],
    ];
    // Spherical (R = 6,378,137 m): a 1° square at the equator is ~12,391 km².
    // The WGS84 ellipsoid (PostGIS) gives ~12,308 km² — a small distinction
    // that doesn't matter at field-tool scales.
    expect(polygonArea(ring) / 1e10).toBeCloseTo(1.239, 2);
  });

  it('ignores winding direction', () => {
    const ccw: [number, number][] = [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1],
    ];
    const cw: [number, number][] = [...ccw].reverse() as [number, number][];
    expect(polygonArea(cw)).toBeCloseTo(polygonArea(ccw), 0);
  });
});

describe('formatArea', () => {
  it('renders m² under 1 ha', () => {
    expect(formatArea(123)).toBe('123 m²');
    expect(formatArea(9_999)).toBe('9,999 m²');
  });
  it('renders ha between 1 ha and 100 ha to 2 dp', () => {
    expect(formatArea(15_000)).toBe('1.50 ha');
    expect(formatArea(123_456)).toBe('12.35 ha');
  });
  it('renders large ha as a rounded integer', () => {
    expect(formatArea(1_500_000)).toBe('150 ha');
    expect(formatArea(123_456_789)).toBe('12,346 ha');
  });
});
