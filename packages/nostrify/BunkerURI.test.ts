import { assertEquals, assertObjectMatch } from '@std/assert';

import { BunkerURI } from './BunkerURI.ts';

Deno.test('BunkerURI', () => {
  const uri = new BunkerURI(
    'bunker://79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798?relay=wss%3A%2F%2Fditto.pub%2Frelay&secret=piAuZsxgKlil',
  );

  assertObjectMatch(uri, {
    pubkey: '79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798',
    relays: ['wss://ditto.pub/relay'],
    secret: 'piAuZsxgKlil',
  });
});

Deno.test('BunkerURI.fromJSON', () => {
  const result = BunkerURI.fromJSON({
    pubkey: '79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798',
    relays: ['wss://ditto.pub/relay'],
    secret: 'piAuZsxgKlil',
  });

  const expected =
    'bunker://79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798?relay=wss%3A%2F%2Fditto.pub%2Frelay&secret=piAuZsxgKlil';

  assertEquals(result.toString(), expected);
});
