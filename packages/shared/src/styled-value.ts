import { z } from 'zod';

/**
 * A styling field is either a constant or a data-driven expression keyed off a
 * feature attribute. These four forms are the entire, exhaustive surface — keep
 * it narrow so the renderer's expression compiler can stay total.
 */

const matchExpression = <V extends z.ZodTypeAny>(value: V) =>
  z.object({
    kind: z.literal('match'),
    field: z.string(),
    cases: z
      .array(z.object({ when: z.union([z.string(), z.number(), z.boolean()]), then: value }))
      .min(1),
    fallback: value,
  });

const stepExpression = <V extends z.ZodTypeAny>(value: V) =>
  z.object({
    kind: z.literal('step'),
    field: z.string(),
    base: value, // applied below the first stop
    stops: z.array(z.object({ at: z.number(), value })).min(1),
  });

const interpolateExpression = <V extends z.ZodTypeAny>(value: V) =>
  z.object({
    kind: z.literal('interpolate'),
    field: z.string(),
    stops: z.array(z.object({ at: z.number(), value })).min(2),
  });

/** constant | match | step | interpolate over a single leaf value type. */
export const dataDriven = <V extends z.ZodTypeAny>(value: V) =>
  z.union([value, matchExpression(value), stepExpression(value), interpolateExpression(value)]);

/**
 * Hand-written mirror of the schema above, used by the renderer to compile
 * expressions with full type information. `T` is the leaf type (string for
 * colors, number for widths/opacity/radius).
 */
export type DataDrivenValue<T> =
  | T
  | { kind: 'match'; field: string; cases: { when: string | number | boolean; then: T }[]; fallback: T }
  | { kind: 'step'; field: string; base: T; stops: { at: number; value: T }[] }
  | { kind: 'interpolate'; field: string; stops: { at: number; value: T }[] };

export const colorValue = dataDriven(z.string());
export const numberValue = dataDriven(z.number());

export type ColorValue = DataDrivenValue<string>;
export type NumberValue = DataDrivenValue<number>;

// ---------------------------------------------------------------------------
// Filters
// ---------------------------------------------------------------------------

export const filterCondition = z.object({
  field: z.string(),
  op: z.enum(['==', '!=', '>', '>=', '<', '<=', 'in']),
  value: z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.array(z.union([z.string(), z.number()])), // for `in`
  ]),
});
export type FilterCondition = z.infer<typeof filterCondition>;

export const filter = z.union([
  filterCondition,
  z.object({ all: z.array(filterCondition).min(1) }),
  z.object({ any: z.array(filterCondition).min(1) }),
]);
export type Filter = z.infer<typeof filter>;
