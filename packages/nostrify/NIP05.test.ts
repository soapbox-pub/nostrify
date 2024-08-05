import { assertEquals } from '@std/assert';
import { returnsNext, stub } from '@std/testing/mock';

import { NIP05 } from './NIP05.ts';
import nostrJson from '../../fixtures/nostr.json' with { type: 'json' };

Deno.test('NIP05.lookup', async () => {
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
