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

  /** Compare the auth event with the request, throwing a human-readable error if validation fails. */
  async verify(
    request: Request,
    event: NostrEvent,
    opts?: { maxAge?: number; validatePayload?: boolean },
  ): Promise<void> {
    const { maxAge = 60_000, validatePayload = ['POST', 'PUT', 'PATCH'].includes(request.method) } = opts ?? {};

    const age = Date.now() - (event.created_at * 1_000);

    const u = event.tags.find(([name]) => name === 'u')?.[1];
    const method = event.tags.find(([name]) => name === 'method')?.[1];
    const payload = event.tags.find(([name]) => name === 'payload')?.[1];

    if (event.kind !== 27235) {
      throw new Error('Event must be kind 27235');
    }
    if (u !== request.url) {
      throw new Error('Event URL does not match request URL');
    }
    if (method !== request.method) {
      throw new Error('Event method does not match HTTP request method');
    }
    if (age >= maxAge) {
      throw new Error('Event expired');
    }
    if (validatePayload && payload !== undefined) {
      const buffer = await request.clone().arrayBuffer();
      const digest = await crypto.subtle.digest('SHA-256', buffer);

      if (encodeHex(digest) !== payload) {
        throw new Error('Event payload does not match request body');
      }
    }
  }
}
