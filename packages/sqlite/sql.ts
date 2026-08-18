import type { NSQLiteValue } from './types.ts';

/** `?, ?, ?` — a placeholder list of the given length. */
export function qs(length: number): string {
  return new Array(length).fill('?').join(', ');
}

/**
 * A membership test on a column, as `= ?` for a single value and `IN (…)` for
 * several.
 *
 * The distinction matters: an equality on an index column keeps the scan
 * ordered by the columns after it, so `ORDER BY created_at DESC` comes free,
 * whereas `IN` makes SQLite loop over the values and sort the union. Writing a
 * one-element list as `IN (?)` measurably slowed tag scans.
 */
export function memberOf(column: string, values: readonly NSQLiteValue[]): string {
  return values.length === 1 ? `${column} = ?` : `${column} IN (${qs(values.length)})`;
}

/**
 * `(?, ?), (?, ?)` — a placeholder row list for a multi-row `INSERT`.
 *
 * Worth having because SQLite runs an `AFTER INSERT` trigger's sub-program once
 * per INSERT *statement*, not once per row, so a table with a trigger on it is
 * dramatically cheaper to fill a statement at a time than a row at a time.
 */
export function tuples(rows: number, width: number): string {
  return new Array(rows).fill(`(${qs(width)})`).join(', ');
}

/** Join conditions into a `WHERE` clause, or nothing if there are none. */
export function where(conditions: string[]): string {
  return conditions.length > 0 ? ` WHERE ${conditions.join(' AND ')}` : '';
}

/** Split values into chunks that fit within a statement's parameter budget. */
export function* batch<T>(values: T[], size: number): Generator<T[]> {
  for (let i = 0; i < values.length; i += size) {
    yield values.slice(i, i + size);
  }
}
