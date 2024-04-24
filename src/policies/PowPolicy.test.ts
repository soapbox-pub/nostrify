import { assertEquals } from '@std/assert';
import { finalizeEvent, generateSecretKey } from 'nostr-tools';

import { PowPolicy } from './PowPolicy.ts';

Deno.test('blocks events without a nonce', async () => {
  const event = finalizeEvent(
    { kind: 1, content: '', tags: [], created_at: 0 },
    generateSecretKey(),
  );

  assertEquals((await new PowPolicy().call(event))[2], false);
});

Deno.test('accepts event with sufficient POW', async () => {
  const event = {
    id: '000006d8c378af1779d2feebc7603a125d99eca0ccf1085959b307f64e5dd358',
    tags: [['nonce', '776797', '20']],
    kind: 1,
    content: '',
    pubkey: '',
    created_at: 0,
    sig: '',
  };

  assertEquals((await new PowPolicy().call(event))[2], true);
});
