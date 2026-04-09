/**
 * Key-value storage interface for login persistence.
 * Supports both synchronous (e.g. `localStorage`) and asynchronous
 * (e.g. Capacitor Secure Storage) implementations.
 */
export interface NLoginStorage {
  /** Retrieve a value by key. */
  getItem(key: string): string | null | Promise<string | null>;
  /** Store a value by key. */
  setItem(key: string, value: string): void | Promise<void>;
}
