import { encodeHex } from '@std/encoding/hex';

import { NostrEvent } from '../interfaces/NostrEvent.ts';

/** [NIP-98](https://github.com/nostr-protocol/nips/blob/master/98.md) HTTP auth. */
export class NIP98 {
  /** Generate an auth event template from a Request. */
  static async template(
    request: Request,
    opts?: { validatePayload?: boolean },
  ): Promise<Omit<NostrEvent, 'id' | 'pubkey' | 'sig'>> {
    const { validatePayload = ['POST', 'PUT', 'PATCH'].includes(request.method) } = opts ?? {};
    const { method, url } = request;

    const tags = [
      ['method', method],
      ['u', url],
    ];

    if (validatePayload) {
      const buffer = await request.clone().arrayBuffer();
      const digest = await crypto.subtle.digest('SHA-256', buffer);

      tags.push(['payload', encodeHex(digest)]);
    }

    return {
      kind: 27235,
      content: '',
      tags,
      created_at: Math.floor(Date.now() / 1000),
    };
  }
}
