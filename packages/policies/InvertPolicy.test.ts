import { test } from 'node:test';
import { deepStrictEqual } from 'node:assert';
import { finalizeEvent, generateSecretKey } from 'nostr-tools';

import { InvertPolicy } from './InvertPolicy.ts';
import { NoOpPolicy } from './NoOpPolicy.ts';

test('InvertPolicy', async () => {
  const policy = new InvertPolicy(new NoOpPolicy(), 'blocked: inverted');

  const event = finalizeEvent(
    { kind: 1, content: '', tags: [], created_at: 0 },
    generateSecretKey(),
  );

  const [_, _eventId, ok, reason] = await policy.call(event);

  deepStrictEqual(ok, false);
  deepStrictEqual(reason, 'blocked: inverted');
});
