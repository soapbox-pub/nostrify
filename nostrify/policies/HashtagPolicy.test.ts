import { assertEquals } from '@std/assert';
import { finalizeEvent, generateSecretKey } from 'nostr-tools';

import { HashtagPolicy } from './HashtagPolicy.ts';

Deno.test('HashtagPolicy', async () => {
  const hashtags = ['nsfw'];

  const event1 = finalizeEvent(
    { kind: 1, content: '', tags: [], created_at: 0 },
    generateSecretKey(),
  );

  const event2 = finalizeEvent(
    { kind: 1, content: '', tags: [['t', 'nsfw'], ['t', 'other']], created_at: 0 },
    generateSecretKey(),
  );

  const event3 = finalizeEvent(
    { kind: 1, content: 'nsfw', tags: [], created_at: 0 },
    generateSecretKey(),
  );

  const event4 = finalizeEvent(
    { kind: 1, content: '', tags: [['p', 'nsfw'], ['t', 'other']], created_at: 0 },
    generateSecretKey(),
  );

  assertEquals((await new HashtagPolicy(hashtags).call(event1))[2], true);
  assertEquals((await new HashtagPolicy(hashtags).call(event2))[2], false);
  assertEquals((await new HashtagPolicy([]).call(event2))[2], true);
  assertEquals((await new HashtagPolicy(hashtags).call(event3))[2], true);
  assertEquals((await new HashtagPolicy(hashtags).call(event4))[2], true);
});
