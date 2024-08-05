import { assertEquals } from '@std/assert';
import { finalizeEvent, generateSecretKey } from 'nostr-tools';

import { NoOpPolicy } from './NoOpPolicy.ts';
import { PipePolicy } from './PipePolicy.ts';
import { ReadOnlyPolicy } from './ReadOnlyPolicy.ts';

Deno.test('passes events through multiple policies', async () => {
  const policy = new PipePolicy([
    new NoOpPolicy(),
    new ReadOnlyPolicy(),
  ]);

  const event = finalizeEvent(
    { kind: 1, content: '', tags: [], created_at: 0 },
    generateSecretKey(),
  );

  const [_, _eventId, ok, reason] = await policy.call(event);

  assertEquals(ok, false);
  assertEquals(reason, 'blocked: the relay is read-only');
});

Deno.test('short-circuits on the first reject', async () => {
  const policy = new PipePolicy([
    new ReadOnlyPolicy(),
    new NoOpPolicy(),
  ]);

  const event = finalizeEvent(
    { kind: 1, content: '', tags: [], created_at: 0 },
    generateSecretKey(),
  );

  const [_, _eventId, ok, reason] = await policy.call(event);

  assertEquals(ok, false);
  assertEquals(reason, 'blocked: the relay is read-only');
});

Deno.test('accepts when all policies accept', async () => {
  const policy = new PipePolicy([
    new NoOpPolicy(),
    new NoOpPolicy(),
    new NoOpPolicy(),
  ]);

  const event = finalizeEvent(
    { kind: 1, content: '', tags: [], created_at: 0 },
    generateSecretKey(),
  );

  const [_, _eventId, ok, reason] = await policy.call(event);

  assertEquals(ok, true);
  assertEquals(reason, '');
});
