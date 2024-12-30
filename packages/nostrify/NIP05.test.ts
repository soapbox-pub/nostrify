import { assertEquals, assertRejects } from '@std/assert';
import { returnsNext, stub } from '@std/testing/mock';

import { NIP05 } from './NIP05.ts';

Deno.test('NIP05.lookup', async () => {
  const { default: nostrJson } = await import('../../fixtures/nostr.json', { with: { type: 'json' } });

  const fetch = stub(
    globalThis,
    'fetch',
    returnsNext([
      Promise.resolve(new Response(JSON.stringify(nostrJson))),
    ]),
  );

  const result = await NIP05.lookup('alex_at_gleasonator.com@mostr.pub', { fetch });

  const expected = {
    pubkey: '79c2cae114ea28a981e7559b4fe7854a473521a8d22a66bbab9fa248eb820ff6',
    relays: ['wss://relay.mostr.pub'],
  };

  assertEquals(result, expected);
  fetch.restore();
});

// https://github.com/nostrability/nostrability/issues/143#issuecomment-2565772246
Deno.test('NIP05.lookup with invalid values but valid profile pointer', async () => {
  const { default: nostrJson } = await import('../../fixtures/lncal.json', { with: { type: 'json' } });

  const fetch = stub(
    globalThis,
    'fetch',
    returnsNext([
      Promise.resolve(new Response(JSON.stringify(nostrJson))),
    ]),
  );

  const result = await NIP05.lookup('elsat@lncal.com', { fetch });

  const expected = {
    pubkey: '17538dc2a62769d09443f18c37cbe358fab5bbf981173542aa7c5ff171ed77c4',
    relays: undefined,
  };

  assertEquals(result, expected);
  fetch.restore();
});

Deno.test('NIP05.lookup with invalid document', () => {
  const fetch = stub(
    globalThis,
    'fetch',
    returnsNext([
      Promise.resolve(new Response(JSON.stringify({ names: 'yolo' }))),
      Promise.resolve(new Response(JSON.stringify({}))),
      Promise.resolve(new Response(JSON.stringify([]))),
    ]),
  );

  assertRejects(() => NIP05.lookup('alex@gleasonator.dev', { fetch }));
  assertRejects(() => NIP05.lookup('alex@gleasonator.dev', { fetch }));
  assertRejects(() => NIP05.lookup('alex@gleasonator.dev', { fetch }));

  fetch.restore();
});
