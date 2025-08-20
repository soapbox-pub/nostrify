import { test } from 'node:test';
import { deepStrictEqual } from 'node:assert';
import { finalizeEvent, generateSecretKey } from 'nostr-tools';

import { SizePolicy } from './SizePolicy.ts';

test('SizePolicy', async () => {
  const policy = new SizePolicy();

  const event = finalizeEvent(
    { kind: 1, content: 'yolo'.repeat(100), tags: [], created_at: 0 },
    generateSecretKey(),
  );

  const bigEvent = finalizeEvent(
    { kind: 1, content: 'yolo'.repeat(2500), tags: [], created_at: 0 },
    generateSecretKey(),
  );

  deepStrictEqual((await policy.call(event))[2], true);
  deepStrictEqual((await policy.call(bigEvent))[2], false);
});
