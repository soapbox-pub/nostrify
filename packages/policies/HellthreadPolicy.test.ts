import { test } from 'node:test';
import { deepStrictEqual } from 'node:assert';
import { finalizeEvent, generateSecretKey } from 'nostr-tools';

import { HellthreadPolicy } from './HellthreadPolicy.ts';

test('HellthreadPolicy', async () => {
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

  deepStrictEqual((await policy.call(okEvent))[2], true);
  deepStrictEqual((await policy.call(badEvent))[2], false);
});
