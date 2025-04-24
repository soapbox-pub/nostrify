/** LNURL `payRequest` details, as defined by LUD-06. Includes additional properties from NIP-57. */
export interface LNURLDetails {
  /** Whether the LN SERVICE supports NIP-57 Lightning Zaps. */
  allowsNostr?: boolean;
  /** The URL from LN SERVICE which will accept the pay request parameters. */
  callback: string;
  /** The number of characters accepted for the `comment` query parameter on subsequent callback. (Should be interpreted as 0 if not provided). */
  commentAllowed?: number;
  /** Max millisatoshi amount LN SERVICE is willing to receive. */
  maxSendable: number;
  /** Min millisatoshi amount LN SERVICE is willing to receive, can not be less than 1 or more than `maxSendable`. */
  minSendable: number;
  /** Metadata json which must be presented as raw string here, this is required to pass signature verification at a later step. */
  metadata: string;
  /** The Nostr pubkey LN SERVICE will use to sign zap receipt events. Clients will use this to validate zap receipts. */
  nostrPubkey?: string;
  /** Type of LNURL. */
  tag: 'payRequest';
}
