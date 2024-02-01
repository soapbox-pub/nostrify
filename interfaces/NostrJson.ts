/** NIP-05 `nostr.json` document. */
export interface NostrJson {
  /** Mapping of names to hex formatted public keys. */
  names: Record<string, string>;
  /** Object with public keys as properties and arrays of relay URLs as values. */
  relays?: Record<string, string[]>;
}
