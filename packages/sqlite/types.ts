import type { NostrEvent } from '@nostrify/types';

/** A value SQLite can bind or return. */
export type NSQLiteValue = string | number | bigint | Uint8Array | null;

/** A row returned by a query, as a plain column-name → value object. */
export type NSQLiteRow = Record<string, NSQLiteValue>;

/**
 * The minimum surface the SQLite stores need from a SQLite library.
 *
 * Both methods may be synchronous or return a promise, so this fits
 * `node:sqlite`, `better-sqlite3`, `bun:sqlite`, `@db/sqlite`, wa-sqlite, and
 * remote/WASM drivers alike. Statements are issued as SQL text plus bound
 * parameters; a driver is free (and encouraged) to cache prepared statements
 * keyed by the SQL string, which is why the stores reuse statement shapes.
 */
export interface NSQLiteDatabase {
  /** Execute a statement that returns no rows. */
  run(sql: string, params?: NSQLiteValue[]): void | Promise<void>;
  /** Execute a statement and return every row it produces. */
  all(sql: string, params?: NSQLiteValue[]): NSQLiteRow[] | Promise<NSQLiteRow[]>;
  /** Release the underlying connection, if the driver has one to release. */
  close?(): void | Promise<void>;
}

/** Options shared by the SQLite-backed stores. */
export interface NSQLiteOpts {
  /**
   * Returns which tags to index, as `[name, value]` pairs, so tag queries like
   * `{ "#p": [...] }` work. Defaults to all single-letter tags with a non-empty
   * value under 200 chars (see `NSQLite.indexTags`). Only the tags
   * returned here are queryable; a filter on any other tag matches nothing.
   *
   * Changing this policy only affects events written afterwards.
   */
  indexTags?(event: NostrEvent): string[][];
  /** Prefix for the table names this store creates. Default `nostr`. */
  tablePrefix?: string;
  /** Called with every statement executed, for debugging. */
  onQuery?(sql: string, params: NSQLiteValue[]): void;
}
