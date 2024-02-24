/** Kind 0 metadata. */
export interface NostrMetadata {
  name?: string;
  about?: string;
  picture?: string;
  banner?: string;
  nip05?: string;
  lud06?: string;
  lud16?: string;
  [key: string]: unknown;
}
