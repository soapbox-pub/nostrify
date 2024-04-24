import { assertEquals } from '@std/assert';
import { finalizeEvent, generateSecretKey } from 'nostr-tools';

import { RegexPolicy } from './RegexPolicy.ts';

Deno.test('RegexPolicy', async () => {
  const event = finalizeEvent(
    { kind: 1, content: '🔥🔥🔥 https://t.me/spam 我想死', tags: [], created_at: 0 },
    generateSecretKey(),
  );

  assertEquals((await new RegexPolicy(/https:\/\/t\.me\/\w+/i).call(event))[2], false);
  assertEquals((await new RegexPolicy(/🔥{1,3}/).call(event))[2], false);
  assertEquals((await new RegexPolicy(/🔥{4}/).call(event))[2], true);
  assertEquals((await new RegexPolicy(/🔥$/).call(event))[2], true);
  assertEquals((await new RegexPolicy(/^🔥/).call(event))[2], false);
});
