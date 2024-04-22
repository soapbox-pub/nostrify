import { assertEquals } from '@std/assert';
import { finalizeEvent, generateSecretKey } from 'nostr-tools';

import { NoOpPolicy } from './NoOpPolicy.ts';
import { PipelinePolicy } from './PipelinePolicy.ts';
import { ReadOnlyPolicy } from './ReadOnlyPolicy.ts';

Deno.test('passes events through multiple policies', async () => {
  const policy = new PipelinePolicy([
    new NoOpPolicy(),
    new ReadOnlyPolicy(),
  ]);

  const event = finalizeEvent({
    kind: 1,
    content: 'hello world',
    tags: [],
    created_at: Math.floor(Date.now() / 1000),
  }, generateSecretKey());

  const [_, _eventId, ok, reason] = await policy.call(event);

  assertEquals(ok, false);
  assertEquals(reason, 'blocked: the relay is read-only');
});

Deno.test('short-circuits on the first reject', async () => {
  const policy = new PipelinePolicy([
    new ReadOnlyPolicy(),
    new NoOpPolicy(),
  ]);

  const event = finalizeEvent({
    kind: 1,
    content: 'hello world',
    tags: [],
    created_at: Math.floor(Date.now() / 1000),
  }, generateSecretKey());

  const [_, _eventId, ok, reason] = await policy.call(event);

  assertEquals(ok, false);
  assertEquals(reason, 'blocked: the relay is read-only');
});

Deno.test('accepts when all policies accept', async () => {
  const policy = new PipelinePolicy([
    new NoOpPolicy(),
    new NoOpPolicy(),
    new NoOpPolicy(),
  ]);

  const event = finalizeEvent({
    kind: 1,
    content: 'hello world',
    tags: [],
    created_at: Math.floor(Date.now() / 1000),
  }, generateSecretKey());

  const [_, _eventId, ok, reason] = await policy.call(event);

  assertEquals(ok, true);
  assertEquals(reason, '');
});
