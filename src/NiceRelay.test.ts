import { assertEquals } from 'https://deno.land/std@0.212.0/assert/mod.ts';
import { WebsocketEvent } from 'npm:websocket-ts@^2.1.5';

import { NostrEvent } from '../interfaces/NostrEvent.ts';

import { NiceRelay } from './NiceRelay.ts';

Deno.test('NiceRelay.query', async () => {
  const relay = new NiceRelay('wss://relay.mostr.pub');

  const events = await relay.query([{ kinds: [1], limit: 3 }]);

  assertEquals(events.length, 3);

  relay.socket.close();
  await new Promise((resolve) => relay.socket.addEventListener(WebsocketEvent.close, resolve));
});

Deno.test('NiceRelay.req', async () => {
  const relay = new NiceRelay('wss://relay.mostr.pub');

  const sub = relay.req([{ kinds: [1], limit: 3 }]);

  const events: NostrEvent[] = [];

  for await (const msg of sub) {
    if (msg[0] === 'EVENT') {
      events.push(msg[2]);
    } else {
      break;
    }
  }

  relay.socket.close();
  await new Promise((resolve) => relay.socket.addEventListener(WebsocketEvent.close, resolve));
});
