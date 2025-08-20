import { test } from 'node:test';
import { deepStrictEqual } from 'node:assert';
import { finalizeEvent, generateSecretKey } from 'nostr-tools';

import { RegexPolicy } from './RegexPolicy.ts';

test('RegexPolicy', async () => {
  const event = finalizeEvent(
    { kind: 1, content: '🔥🔥🔥 https://t.me/spam 我想死', tags: [], created_at: 0 },
    generateSecretKey(),
  );

  deepStrictEqual((await new RegexPolicy(/https:\/\/t\.me\/\w+/i).call(event))[2], false);
  deepStrictEqual((await new RegexPolicy(/🔥{1,3}/).call(event))[2], false);
  deepStrictEqual((await new RegexPolicy(/🔥{4}/).call(event))[2], true);
  deepStrictEqual((await new RegexPolicy(/🔥$/).call(event))[2], true);
  deepStrictEqual((await new RegexPolicy(/^🔥/).call(event))[2], false);
});
