// ============================================================================
// Tag tokens — the encoding that lets an FTS5 inverted index stand in for a tag
// b-tree.
//
// A tag becomes one opaque token, `name:value`, which the `ascii tokenchars
// ':_'` tokenizer treats as a single indivisible word. `{"#e": [id]}` is then a
// full-text match for the word `e:<id>`.
//
// Shared by every store that indexes tags this way.
// ============================================================================

/**
 * Tokens are only safe to embed verbatim when the tokenizer can't split or fold
 * them: lowercase ASCII alphanumerics, and nothing else.
 */
const VERBATIM = /^[0-9a-z]+$/;

const encoder = new TextEncoder();

/**
 * Encode one half of a tag token.
 *
 * Verbatim where possible — event ids, pubkeys and most topics already qualify,
 * and they're the values worth optimizing for. Anything else is hex-escaped,
 * which no tokenizer will split and no case folding will alter. The two forms
 * can't be confused: an escaped value starts with `_`, which a verbatim one can
 * never contain.
 */
export function part(value: string): string {
  if (VERBATIM.test(value)) return value;

  let hex = '_';
  for (const byte of encoder.encode(value)) {
    hex += byte.toString(16).padStart(2, '0');
  }

  return hex;
}

/** The index token for a tag, e.g. `e:<id>` or `t:_c3a9`. */
export function tagToken(name: string, value: string): string {
  return `${part(name)}:${part(value)}`;
}

/**
 * Build an FTS5 MATCH expression: each group's tokens are alternatives, and the
 * groups are required together.
 *
 * A group with one member is written as a bare phrase rather than a
 * parenthesized alternation, which is the same query with less for FTS5's
 * parser to chew through — and single-value groups are the common case.
 */
export function matchExpr(groups: string[][]): string {
  return groups
    .map((group) => (group.length === 1 ? phrase(group[0]) : `(${group.map(phrase).join(' OR ')})`))
    .join(' AND ');
}

/**
 * A token as an FTS5 phrase. Quoting is what keeps a keyword like `OR` or `(`
 * from being read as query syntax; embedded quotes are doubled, per FTS5.
 */
export function phrase(token: string): string {
  return `"${token.replace(/"/g, '""')}"`;
}
