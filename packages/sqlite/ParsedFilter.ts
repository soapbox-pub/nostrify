import { NIP50 } from '@nostrify/nostrify';
import type { NostrEvent, NostrFilter } from '@nostrify/types';

// ============================================================================
// ParsedFilter — a parsed, normalized representation of a single Nostr filter,
// plus an in-memory matcher. A port of strfry's `NostrFilter` (src/filters.h):
// it pre-sorts/dedupes each value set (which drives the planner's selectivity
// choice) and matches an event against every condition at once.
//
// Matching semantics are NIP-01's:
//   - `ids`/`authors`/`kinds`: membership in the set.
//   - `#x` tag filters: the event has at least one `x` tag whose value is in
//     the set. The tag name may be single- or multi-letter (`#e`, `#proxy`).
//   - `since`/`until`: inclusive created_at bounds.
//   - multiple filters in a request are OR'd; conditions within a filter AND.
// ============================================================================

/** A tag filter, e.g. `{ name: 'e', values: [...] }` for `#e`. */
export interface TagFilter {
  /** The tag name without the leading `#` (single- or multi-letter). */
  name: string;
  /** Sorted, de-duplicated set of acceptable values (drives the planner). */
  values: string[];
  /** The same values as a Set, for O(1) membership in the matcher. */
  valueSet: Set<string>;
}

export class ParsedFilter {
  readonly ids?: string[];
  readonly authors?: string[];
  readonly kinds?: number[];
  /** Tag filters (`#x`), each holding a single- or multi-letter name. */
  readonly tags: TagFilter[];
  readonly search?: string;

  /**
   * The NIP-50 keywords parsed out of `search`, pre-lowercased: `required`
   * keywords must all appear in an event's content, `negated` ones
   * (`-keyword` tokens) must not. Extension tokens (`key:value`) are parsed
   * and removed — no extensions are supported, and per NIP-50 unsupported
   * extensions are ignored. `undefined` when the filter has no `search`, or
   * when it parses to no keywords (in which case it imposes no constraint).
   */
  readonly searchKeywords?: { required: string[]; negated: string[] };

  readonly since?: number;
  readonly until?: number;
  readonly limit?: number;

  /** Set views of the array constraints, for O(1) membership in `matches`. */
  private readonly idSet?: Set<string>;
  private readonly authorSet?: Set<string>;
  private readonly kindSet?: Set<number>;

  /**
   * True when this filter can never match anything (an empty array was given
   * for a constraint, e.g. `{ ids: [] }`). The planner short-circuits these.
   */
  readonly neverMatch: boolean;

  constructor(filter: NostrFilter) {
    let neverMatch = false;
    const tags: TagFilter[] = [];

    for (const [key, value] of Object.entries(filter)) {
      // Empty array constraints can never match (NIP-01).
      if (Array.isArray(value) && value.length === 0) {
        neverMatch = true;
        continue;
      }

      if (key === 'ids') {
        this.ids = sortUnique(value as string[]);
      } else if (key === 'authors') {
        this.authors = sortUnique(value as string[]);
      } else if (key === 'kinds') {
        this.kinds = sortUniqueNums(value as number[]);
      } else if (key === 'since') {
        this.since = value as number;
      } else if (key === 'until') {
        this.until = value as number;
      } else if (key === 'limit') {
        this.limit = value as number;
      } else if (key === 'search') {
        // There's no full-text index; this drives the in-memory match only.
        this.search = value as string;
      } else if (key.startsWith('#') && key.length >= 2) {
        // Any `#`-prefixed key is a tag filter; the name is everything after
        // the `#` (single- OR multi-letter, e.g. `#e`, `#proxy`). Whether such
        // a tag is actually queryable depends on the store's `indexTags`
        // policy — a filter on a non-indexed tag simply matches nothing.
        const values = sortUnique(value as string[]);
        tags.push({ name: key.slice(1), values, valueSet: new Set(values) });
      }
      // Unrecognised keys are ignored (treated as no constraint).
    }

    this.tags = tags;
    this.neverMatch = neverMatch;

    this.idSet = this.ids && new Set(this.ids);
    this.authorSet = this.authors && new Set(this.authors);
    this.kindSet = this.kinds && new Set(this.kinds);

    // NIP-50: parse the search input into tokens. Extension tokens
    // (`key:value`) are parsed and removed — no extensions are supported, and
    // per NIP-50 unsupported extensions are ignored. The remaining keywords
    // (a leading `-` negates) drive a case-insensitive match on content.
    if (this.search !== undefined) {
      const required: string[] = [];
      const negated: string[] = [];

      for (const token of NIP50.parseInput(this.search)) {
        if (typeof token !== 'string') continue; // extension token: removed
        const keyword = token.toLowerCase();
        if (keyword.startsWith('-')) {
          if (keyword.length > 1) negated.push(keyword.slice(1));
        } else if (keyword.length > 0) {
          required.push(keyword);
        }
      }

      if (required.length > 0 || negated.length > 0) {
        this.searchKeywords = { required, negated };
      }
    }
  }

  /** Full NIP-01 match of an event against every condition in this filter. */
  matches(event: NostrEvent): boolean {
    if (this.neverMatch) return false;

    if (this.since !== undefined && event.created_at < this.since) return false;
    if (this.until !== undefined && event.created_at > this.until) return false;

    if (this.idSet && !this.idSet.has(event.id)) return false;
    if (this.authorSet && !this.authorSet.has(event.pubkey)) return false;
    if (this.kindSet && !this.kindSet.has(event.kind)) return false;

    for (const { name, valueSet } of this.tags) {
      const found = event.tags.some(([n, v]) => n === name && valueSet.has(v));
      if (!found) return false;
    }

    if (this.searchKeywords) {
      const content = event.content.toLowerCase();
      for (const keyword of this.searchKeywords.required) {
        if (!content.includes(keyword)) return false;
      }
      for (const keyword of this.searchKeywords.negated) {
        if (content.includes(keyword)) return false;
      }
    }

    return true;
  }
}

function sortUnique(values: string[]): string[] {
  return [...new Set(values)].sort();
}

function sortUniqueNums(values: number[]): number[] {
  return [...new Set(values)].sort((a, b) => a - b);
}
