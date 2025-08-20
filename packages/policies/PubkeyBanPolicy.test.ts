import { test } from 'node:test';
import { deepStrictEqual } from 'node:assert';
import { finalizeEvent, generateSecretKey } from 'nostr-tools';

import { PubkeyBanPolicy } from './PubkeyBanPolicy.ts';

test('PubkeyBanPolicy', async () => {
  const [event1, event2, event3] = new Array(3).fill(0).map(() => {
    return finalizeEvent(
      { kind: 1, content: '', tags: [], created_at: 0 },
      generateSecretKey(),
    );
  });

  deepStrictEqual((await new PubkeyBanPolicy([]).call(event1))[2], true);
  deepStrictEqual((await new PubkeyBanPolicy([event2.pubkey, event1.pubkey]).call(event3))[2], true);
  deepStrictEqual((await new PubkeyBanPolicy([event2.pubkey, event1.pubkey]).call(event2))[2], false);
});
