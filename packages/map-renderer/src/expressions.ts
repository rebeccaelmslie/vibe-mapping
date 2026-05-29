import type { ColorValue, NumberValue, Filter, FilterCondition } from '@vibe/shared';
import type { Expression, StyleValue } from './maplibre-types';

type Leaf = string | number;

/** Compile a constant-or-data-driven style value into a MapLibre value. */
export function compileValue(v: ColorValue | NumberValue): StyleValue {
  if (typeof v !== 'object') return v; // constant string | number

  switch (v.kind) {
    case 'match':
      return [
        'match',
        ['get', v.field],
        ...v.cases.flatMap((c) => [c.when, c.then]),
        v.fallback,
      ] as Expression;

    case 'step': {
      const stops = [...v.stops].sort((a, b) => a.at - b.at);
      return [
        'step',
        ['get', v.field],
        v.base,
        ...stops.flatMap((s) => [s.at, s.value]),
      ] as Expression;
    }

    case 'interpolate': {
      const stops = [...v.stops].sort((a, b) => a.at - b.at);
      return [
        'interpolate',
        ['linear'],
        ['get', v.field],
        ...stops.flatMap((s) => [s.at, s.value]),
      ] as Expression;
    }
  }
}

function compileCondition(c: FilterCondition): Expression {
  const get: Expression = ['get', c.field];
  if (c.op === 'in') {
    const values = Array.isArray(c.value) ? c.value : [c.value];
    return ['in', get, ['literal', values]];
  }
  return [c.op, get, c.value as Leaf | boolean];
}

/** Compile a MapSpec Filter into a MapLibre filter expression. */
export function compileFilter(f: Filter): Expression {
  if ('all' in f) return ['all', ...f.all.map(compileCondition)];
  if ('any' in f) return ['any', ...f.any.map(compileCondition)];
  return compileCondition(f);
}
