import { z } from 'npm:zod@^3.22.4';

class n {
  /** Schema to validate Nostr hex IDs such as event IDs and pubkeys. */
  static id() {
    return z.string().regex(/^[0-9a-f]{64}$/);
  }
}

export { n, z };
