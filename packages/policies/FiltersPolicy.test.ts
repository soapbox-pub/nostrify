import { test } from 'node:test';
import { deepStrictEqual } from 'node:assert';
import { finalizeEvent, generateSecretKey } from 'nostr-tools';

import { FiltersPolicy } from './FiltersPolicy.ts';

test('FiltersPolicy', async () => {
  const event = finalizeEvent(
    { kind: 1, content: '', tags: [], created_at: 0 },
    generateSecretKey(),
  );

  deepStrictEqual((await new FiltersPolicy([{ kinds: [1] }]).call(event))[2], true);
  deepStrictEqual((await new FiltersPolicy([{ kinds: [1], authors: [] }]).call(event))[2], false);
});
