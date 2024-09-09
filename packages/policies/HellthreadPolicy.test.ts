import { assertEquals } from '@std/assert';
import { finalizeEvent, generateSecretKey } from 'nostr-tools';

import { HellthreadPolicy } from './HellthreadPolicy.ts';

Deno.test('HellthreadPolicy', async () => {
  const policy = new HellthreadPolicy({ limit: 1 });

  const okEvent = finalizeEvent(
    { kind: 1, content: '', tags: [], created_at: 0 },
    generateSecretKey(),
  );

  const badEvent = finalizeEvent({
    kind: 1,
    content: '',
    tags: [['p'], ['p'], ['p']],
    created_at: 0,
  }, generateSecretKey());

  assertEquals((await policy.call(okEvent))[2], true);
  assertEquals((await policy.call(badEvent))[2], false);
});
