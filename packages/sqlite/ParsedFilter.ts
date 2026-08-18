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

  /**
   * The same keywords as an FTS5 `MATCH` expression, or `undefined` when they
   * can't be expressed as one. FTS5 has no way to say "everything except X", so
   * a search that is nothing but negations has no query; those fall back to
   * matching in memory.
   */
  readonly searchQuery?: string;

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
        this.searchQuery = toFtsQuery(required, negated);
      }
    }
  }

  /**
   * Full NIP-01 match of an event against every condition in this filter.
   *
   * Pass `skipSearch` when FTS5 has already applied the keywords. Re-checking
   * them here would be worse than redundant: FTS5 matches whole words and this
   * matches substrings, so a phrase FTS5 accepted could be rejected on
   * whitespace alone.
   */
  matches(event: NostrEvent, skipSearch = false): boolean {
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

    if (this.searchKeywords && !skipSearch) {
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

/**
 * Build an FTS5 `MATCH` expression from NIP-50 keywords.
 *
 * Every keyword becomes a quoted phrase, which is FTS5's literal-string form,
 * so nothing a user types is read as query syntax — a keyword of `OR` or `(`
 * searches for that word rather than breaking the query. Embedded quotes are
 * doubled, per FTS5's escaping.
 *
 * Returns `undefined` when there are no required keywords: FTS5 rejects an
 * expression that is only negations, since there's nothing to subtract them
 * from.
 */
function toFtsQuery(required: string[], negated: string[]): string | undefined {
  if (required.length === 0) return undefined;

  const phrase = (keyword: string) => `"${keyword.replace(/"/g, '""')}"`;

  return [
    required.map(phrase).join(' AND '),
    ...negated.map((keyword) => `NOT ${phrase(keyword)}`),
  ].join(' ');
}

function sortUnique(values: string[]): string[] {
  return [...new Set(values)].sort();
}

function sortUniqueNums(values: number[]): number[] {
  return [...new Set(values)].sort((a, b) => a - b);
}
