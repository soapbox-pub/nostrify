import { assertEquals } from '@std/assert';
import { finalizeEvent, generateSecretKey } from 'nostr-tools';

import { AntiDuplicationPolicy } from './AntiDuplicationPolicy.ts';

Deno.test('AntiDuplicationPolicy', async () => {
  const kv = await Deno.openKv(':memory:');

  const policy = new AntiDuplicationPolicy({ kv });
  const content = 'Spicy peppermint apricot mediterranean ginger carrot spiced juice edamame hummus';

  const event = finalizeEvent(
    { kind: 1, content, tags: [], created_at: 0 },
    generateSecretKey(),
  );

  assertEquals((await policy.call(event))[2], true);
  assertEquals((await policy.call(event))[2], false);
  assertEquals((await policy.call(event))[2], false);

  const event2 = finalizeEvent(
    { kind: 1, content: 'a', tags: [], created_at: 0 },
    generateSecretKey(),
  );

  assertEquals((await policy.call(event2))[2], true);
  assertEquals((await policy.call(event2))[2], true);
  assertEquals((await policy.call(event2))[2], true);

  kv.close();
});
