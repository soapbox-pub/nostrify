import type { NostrFilter } from '@nostrify/types';
import { getFilterLimit as _getFilterLimit } from 'nostr-tools';

import { NKinds } from '../NKinds.ts';

/**
 * Wraps `getFilterLimit` from nostr-tools to avoid enforcing a limit
 * on filters that target a single coordinate (eg. representable as naddr).
 *
 * The use-case is querying historical events from relays that support it.
 * Relays that support querying historical events enable this behavior
 * whenever a filter that could be represented as an naddr is used.
 *
 * These filters are NOT given an inferred limit:
 * - Single replaceable kind + single author (+ optionally since/until/limit)
 * - Single addressable kind + single author + single #d (+ optionally since/until/limit)
 */
export function getFilterLimit(filter: NostrFilter): number {
  if (isCoordinateFilter(filter)) {
    return filter.limit ?? Infinity;
  }
  return _getFilterLimit(filter);
}

/** Allowed filter keys for a replaceable coordinate filter. */
const REPLACEABLE_KEYS = new Set(['kinds', 'authors', 'since', 'until', 'limit']);

/** Allowed filter keys for an addressable coordinate filter. */
const ADDRESSABLE_KEYS = new Set(['kinds', 'authors', '#d', 'since', 'until', 'limit']);

/**
 * Check whether the filter targets a single coordinate:
 * - Single kind, single author, replaceable kind, no extra properties.
 * - Single kind, single author, single #d, addressable kind, no extra properties.
 */
function isCoordinateFilter(filter: NostrFilter): boolean {
  const kinds = filter.kinds;
  const authors = filter.authors;

  if (!kinds || kinds.length !== 1 || !authors || authors.length !== 1) {
    return false;
  }

  const kind = kinds[0];

  if (NKinds.replaceable(kind)) {
    return everyKeyIn(filter, REPLACEABLE_KEYS);
  }

  if (NKinds.addressable(kind)) {
    const d = filter['#d'];
    if (!d || d.length !== 1) {
      return false;
    }
    return everyKeyIn(filter, ADDRESSABLE_KEYS);
  }

  return false;
}

/** Returns true if every key in the object belongs to the allowed set. */
function everyKeyIn(obj: object, allowed: Set<string>): boolean {
  for (const key of Object.keys(obj)) {
    if (!allowed.has(key)) {
      return false;
    }
  }
  return true;
}
