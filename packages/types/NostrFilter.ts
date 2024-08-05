/** NIP-01 Nostr filter. */
export interface NostrFilter {
  /** A list of event IDs. */
  ids?: string[];
  /** A list of lowercase pubkeys, the pubkey of an event must be one of these. */
  authors?: string[];
  /** A list of a kind numbers. */
  kinds?: number[];
  /** An integer unix timestamp in seconds, events must be newer than this to pass. */
  since?: number;
  /** An integer unix timestamp in seconds, events must be older than this to pass. */
  until?: number;
  /** Maximum number of events relays SHOULD return in the initial query. */
  limit?: number;
  /** NIP-50 search query. */
  search?: string;
  /** A list of tag values, for #e — a list of event ids, for #p — a list of pubkeys, etc. */
  [key: `#${string}`]: string[] | undefined;
}
