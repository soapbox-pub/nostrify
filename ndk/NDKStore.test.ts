import NDK from '@nostr-dev-kit/ndk';
import { assert } from '@std/assert';
import { finalizeEvent, generateSecretKey } from 'nostr-tools';

import { NostrEvent } from '../interfaces/NostrEvent.ts';

import { NDKStore } from './NDKStore.ts';

Deno.test({
  name: 'NDKStore.query',
  fn: async () => {
    const ndk = new NDK({
      explicitRelayUrls: ['wss://relay.mostr.pub', 'wss://relay.primal.net', 'wss://relay.nostr.band'],
    });
    await ndk.connect(3000);

    const relay = new NDKStore(ndk);
    const events = await relay.query([{ kinds: [1], limit: 3 }]);

    assert(events.length);
  },
  sanitizeOps: false,
  sanitizeResources: false,
});

Deno.test({
  name: 'NDKStore.req',
  fn: async () => {
    const ndk = new NDK({
      explicitRelayUrls: ['wss://relay.mostr.pub', 'wss://relay.primal.net', 'wss://relay.nostr.band'],
    });
    await ndk.connect(3000);

    const relay = new NDKStore(ndk);
    const events: NostrEvent[] = [];

    for await (const msg of relay.req([{ kinds: [1], limit: 3 }])) {
      if (msg[0] === 'EVENT') {
        events.push(msg[2]);
        break;
      }
    }

    assert(events.length);
  },
  sanitizeOps: false,
  sanitizeResources: false,
});

Deno.test({
  name: 'NDKStore.event',
  fn: async () => {
    const ndk = new NDK({
      explicitRelayUrls: ['wss://relay.mostr.pub'],
    });
    await ndk.connect(3000);

    const relay = new NDKStore(ndk);

    const event: NostrEvent = finalizeEvent({
      kind: 1,
      content: 'This is an automated test from Nostrify: https://gitlab.com/soapbox-pub/nostrify',
      tags: [],
      created_at: Math.floor(Date.now() / 1000),
    }, generateSecretKey());

    await relay.event(event);
  },
  sanitizeOps: false,
  sanitizeResources: false,
});
