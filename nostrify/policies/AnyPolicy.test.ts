import { assertEquals } from '@std/assert';
import { finalizeEvent, generateSecretKey } from 'nostr-tools';

import { AnyPolicy } from './AnyPolicy.ts';
import { NoOpPolicy } from './NoOpPolicy.ts';
import { ReadOnlyPolicy } from './ReadOnlyPolicy.ts';

Deno.test('accepts when all policies accept', async () => {
  const policy = new AnyPolicy([
    new NoOpPolicy(),
    new NoOpPolicy(),
    new NoOpPolicy(),
  ]);

  const event = finalizeEvent(
    { kind: 1, content: '', tags: [], created_at: 0 },
    generateSecretKey(),
  );

  const [_, _eventId, ok] = await policy.call(event);

  assertEquals(ok, true);
});

Deno.test('accepts when some policies reject', async () => {
  const policy = new AnyPolicy([
    new NoOpPolicy(),
    new ReadOnlyPolicy(),
    new NoOpPolicy(),
  ]);

  const event = finalizeEvent(
    { kind: 1, content: '', tags: [], created_at: 0 },
    generateSecretKey(),
  );

  const [_, _eventId, ok] = await policy.call(event);

  assertEquals(ok, true);
});

Deno.test('rejects when all policies reject', async () => {
  const policy = new AnyPolicy([
    new ReadOnlyPolicy(),
    new ReadOnlyPolicy(),
    new ReadOnlyPolicy(),
  ]);

  const event = finalizeEvent(
    { kind: 1, content: '', tags: [], created_at: 0 },
    generateSecretKey(),
  );

  const [_, _eventId, ok] = await policy.call(event);

  assertEquals(ok, false);
});
