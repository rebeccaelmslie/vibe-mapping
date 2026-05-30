import { describe, it, expect } from 'vitest';
import { haversine, polylineLength, formatDistance, formatDuration } from './distance';

describe('haversine', () => {
  it('is 0 for the same point', () => {
    expect(haversine([0, 0], [0, 0])).toBe(0);
  });

  it('matches a known equatorial 1°-of-longitude distance (~111.32 km)', () => {
    const d = haversine([0, 0], [1, 0]);
    expect(d / 1000).toBeCloseTo(111.319, 2);
  });

  it('matches a small 100 m hop at the equator', () => {
    const d = haversine([0, 0], [0.000898, 0]);
    expect(d).toBeGreaterThan(99);
    expect(d).toBeLessThan(101);
  });
});

describe('polylineLength', () => {
  it('returns 0 for <2 points', () => {
    expect(polylineLength([])).toBe(0);
    expect(polylineLength([[0, 0]])).toBe(0);
  });

  it('sums leg lengths', () => {
    const line: [number, number][] = [
      [0, 0],
      [1, 0],
      [1, 1],
    ];
    expect(polylineLength(line) / 1000).toBeCloseTo(111.319 * 2, 1);
  });
});

describe('formatDistance', () => {
  it('renders metres under 1 km', () => {
    expect(formatDistance(0)).toBe('0 m');
    expect(formatDistance(423)).toBe('423 m');
    expect(formatDistance(999)).toBe('999 m');
  });
  it('renders 2-dp km from 1 to 10', () => {
    expect(formatDistance(1234)).toBe('1.23 km');
  });
  it('renders 1-dp km from 10 up', () => {
    expect(formatDistance(12345)).toBe('12.3 km');
  });
});

describe('formatDuration', () => {
  it('mm:ss under an hour', () => {
    expect(formatDuration(0)).toBe('0:00');
    expect(formatDuration(42)).toBe('0:42');
    expect(formatDuration(125)).toBe('2:05');
  });
  it('h:mm:ss from an hour', () => {
    expect(formatDuration(3725)).toBe('1:02:05');
  });
});
