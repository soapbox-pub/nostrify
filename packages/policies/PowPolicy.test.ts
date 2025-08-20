import { test } from 'node:test';
import { deepStrictEqual } from 'node:assert';
import { finalizeEvent, generateSecretKey } from 'nostr-tools';

import { PowPolicy } from './PowPolicy.ts';

test('blocks events without a nonce', async () => {
  const event = finalizeEvent(
    { kind: 1, content: '', tags: [], created_at: 0 },
    generateSecretKey(),
  );

  deepStrictEqual((await new PowPolicy().call(event))[2], false);
});

test('accepts event with sufficient POW', async () => {
  const event = {
    id: '000006d8c378af1779d2feebc7603a125d99eca0ccf1085959b307f64e5dd358',
    tags: [['nonce', '776797', '20']],
    kind: 1,
    content: '',
    pubkey: '',
    created_at: 0,
    sig: '',
  };

  deepStrictEqual((await new PowPolicy().call(event))[2], true);
});
