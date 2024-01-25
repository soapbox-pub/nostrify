import { z } from 'npm:zod@^3.22.4';

class NSchema {
  /** Schema to validate Nostr hex IDs such as event IDs and pubkeys. */
  static id() {
    return z.string().regex(/^[0-9a-f]{64}$/);
  }
  /**
   * Bech32 string.
   * @see https://github.com/bitcoin/bips/blob/master/bip-0173.mediawiki#bech32
   */
  static bech32() {
    return z.string().regex(/^[\x21-\x7E]{1,83}1[023456789acdefghjklmnpqrstuvwxyz]{6,}$/);
  }
}

export { NSchema, z };
