import { test } from 'node:test';
import { deepStrictEqual } from 'node:assert';
import { finalizeEvent, generateSecretKey } from 'nostr-tools';

import { WhitelistPolicy } from './WhitelistPolicy.ts';

test('WhitelistPolicy', async () => {
  const [event1, event2, event3] = new Array(3).fill(0).map(() => {
    return finalizeEvent(
      { kind: 1, content: '', tags: [], created_at: 0 },
      generateSecretKey(),
    );
  });

  deepStrictEqual((await new WhitelistPolicy([]).call(event1))[2], false);
  deepStrictEqual((await new WhitelistPolicy([event2.pubkey, event1.pubkey]).call(event3))[2], false);
  deepStrictEqual((await new WhitelistPolicy([event2.pubkey, event1.pubkey]).call(event2))[2], true);
});
