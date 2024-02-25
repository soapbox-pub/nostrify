/** NIP-19 `nprofile` data. */
export interface NProfilePointer {
  /** Profile public key in hex format. */
  pubkey: string;
  /** Relays in which the profile is more likely to be found. */
  relays?: WebSocket['url'][];
}
