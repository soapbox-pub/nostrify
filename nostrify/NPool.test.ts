// deno-lint-ignore-file require-await
import { assert, assertEquals } from '@std/assert';
import { finalizeEvent, generateSecretKey } from 'nostr-tools';

import { NostrEvent } from '../interfaces/NostrEvent.ts';
import { MockRelayWs } from './test/MockRelayWs.ts';
import { NPool } from './NPool.ts';
import { NRelay1 } from './NRelay1.ts';

import events from '../fixtures/events.json' with { type: 'json' };

const event1s = events
  .filter((e) => e.kind === 1)
  .toSorted((_) => 0.5 - Math.random())
  .slice(0, 10);

Deno.test('NRelay1.query', { sanitizeResources: false, sanitizeOps: false }, async () => {
  const controller = new AbortController();
  const tid = setTimeout(() => controller.abort(), 5000);

  const server = new MockRelayWs('wss://relay1.mostr.pub', event1s);
  const server2 = new MockRelayWs('wss://relay2.mostr.pub', event1s);
  const pool = new NPool({
    open: (url) => new NRelay1(url),
    reqRouter: async (filters) =>
      new Map([
        ['wss://relay1.mostr.pub', filters],
        ['wss://relay2.mostr.pub', filters],
      ]),
    eventRouter: async () => ['wss://relay1.mostr.pub'],
  });
  const events = await pool.query([{ kinds: [1], limit: 15 }], { signal: controller.signal });

  assertEquals(events.length, 10);
  assert(events[0].created_at >= events[1].created_at);

  server.close();
  server2.close();

  clearTimeout(tid);
});

Deno.test('NPool.req', { sanitizeResources: false, sanitizeOps: false }, async () => {
  const controller = new AbortController();
  const tid = setTimeout(() => controller.abort(), 3000);

  const server = new MockRelayWs('wss://relay1.mostr.pub', event1s);
  const server2 = new MockRelayWs('wss://relay2.mostr.pub', event1s);

  const events: NostrEvent[] = [];

  const pool = new NPool({
    open: (url) => new NRelay1(url),
    reqRouter: async (filters) =>
      new Map([
        ['wss://relay1.mostr.pub', filters],
        ['wss://relay2.mostr.pub', filters],
      ]),
    eventRouter: async () => ['wss://relay1.mostr.pub'],
  });

  for await (const msg of pool.req([{ kinds: [1], limit: 3 }], { signal: controller.signal })) {
    if (msg[0] === 'EVENT') {
      events.push(msg[2]);
    }

    if (events.length === 3) break;
  }

  assertEquals(events.length, 3);

  server.close();
  server2.close();

  clearTimeout(tid);
});

Deno.test('NPool.event', { sanitizeResources: false, sanitizeOps: false }, async () => {
  const controller = new AbortController();
  const tid = setTimeout(() => controller.abort(), 5000);

  const server = new MockRelayWs('wss://relay1.mostr.pub');
  const server2 = new MockRelayWs('wss://relay2.mostr.pub', event1s);

  const event: NostrEvent = finalizeEvent({
    kind: 1,
    content: 'This is an automated test from Nostrify: https://gitlab.com/soapbox-pub/nostrify',
    tags: [['unique', 'uniqueTag']],
    created_at: Math.floor(Date.now() / 1000),
  }, generateSecretKey());

  const pool = new NPool({
    open: (url) => new NRelay1(url),
    reqRouter: async (filters) =>
      new Map([
        ['wss://relay1.mostr.pub', filters],
        ['wss://relay2.mostr.pub', filters],
      ]),
    eventRouter: async () => ['wss://relay1.mostr.pub'],
  });
  await pool.event(event, { signal: controller.signal });

  assertEquals((await pool.query([{ kinds: [1], '#unique': ['uniqueTag'] }], { signal: controller.signal })).length, 1);

  server.close();
  server2.close();

  clearTimeout(tid);
});
