import { assert } from '@std/assert';
import { Router } from '@welshman/util';
import { finalizeEvent, generateSecretKey } from 'nostr-tools';

import { NostrEvent } from '../../interfaces/NostrEvent.ts';

import { NWelshman } from './NWelshman.ts';

const relays = ['wss://relay.mostr.pub'];

const router = new Router({
  getUserPubkey: (): string | null => null,
  getGroupRelays: (): string[] => relays,
  getCommunityRelays: (): string[] => relays,
  getPubkeyRelays: (): string[] => relays,
  getStaticRelays: (): string[] => relays,
  getIndexerRelays: (): string[] => relays,
  getSearchRelays: (): string[] => relays,
  getRelayQuality: (): number => 1,
  getRedundancy: (): number => 0,
  getLimit: (): number => 10,
});

Deno.test({
  name: 'NWelshman.query',
  fn: async () => {
    const relay = new NWelshman(router);
    const events = await relay.query([{ kinds: [1], limit: 3 }]);

    assert(events.length);
  },
  sanitizeOps: false,
  sanitizeResources: false,
  ignore: Deno.env.get('CI') === 'true',
});

Deno.test({
  name: 'NWelshman.req',
  fn: async () => {
    const relay = new NWelshman(router);
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
  ignore: Deno.env.get('CI') === 'true',
});

Deno.test({
  name: 'NWelshman.event',
  fn: async () => {
    const relay = new NWelshman(router);

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
  ignore: Deno.env.get('CI') === 'true',
});
