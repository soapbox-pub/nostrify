import { assertEquals } from '@std/assert';
import { finalizeEvent, generateSecretKey } from 'nostr-tools';

import { KeywordPolicy } from './KeywordPolicy.ts';

Deno.test('KeywordPolicy', async () => {
  const words = ['https://t.me/spam', 'hello world'];

  const event1 = finalizeEvent(
    { kind: 1, content: '', tags: [], created_at: 0 },
    generateSecretKey(),
  );

  const event2 = finalizeEvent(
    { kind: 1, content: '🔥🔥🔥 https://t.me/spam 我想死', tags: [], created_at: 0 },
    generateSecretKey(),
  );

  const event3 = finalizeEvent(
    { kind: 1, content: 'hElLo wOrLd!', tags: [], created_at: 0 },
    generateSecretKey(),
  );

  assertEquals((await new KeywordPolicy(words).call(event1))[2], true);
  assertEquals((await new KeywordPolicy(words).call(event2))[2], false);
  assertEquals((await new KeywordPolicy([]).call(event2))[2], true);
  assertEquals((await new KeywordPolicy(words).call(event3))[2], false);
});
