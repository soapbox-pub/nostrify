import { genEvent } from '@nostrify/nostrify/test';
import { assertEquals } from '@std/assert';

import { AntiDuplicationPolicy } from './AntiDuplicationPolicy.ts';

Deno.test('AntiDuplicationPolicy', async () => {
  using kv = await Deno.openKv(':memory:');

  const policy = new AntiDuplicationPolicy({ kv });
  const content = 'Spicy peppermint apricot mediterranean ginger carrot spiced juice edamame hummus';

  const event1 = genEvent({ kind: 1, content });

  assertEquals((await policy.call(event1))[2], true);
  assertEquals((await policy.call(event1))[2], false);
  assertEquals((await policy.call(event1))[2], false);

  const event2 = genEvent({ kind: 1, content: 'a' });

  assertEquals((await policy.call(event2))[2], true);
  assertEquals((await policy.call(event2))[2], true);
  assertEquals((await policy.call(event2))[2], true);
});

Deno.test('AntiDuplicationPolicy with deobfuscate', async () => {
  using kv = await Deno.openKv(':memory:');

  const policy = new AntiDuplicationPolicy({
    kv,
    deobfuscate: ({ content }) => (
      content
        .replace(/[\p{Emoji}\p{Emoji_Modifier}\p{Emoji_Component}\p{Emoji_Modifier_Base}\p{Emoji_Presentation}]/gu, '')
        .replace(/\s/g, '')
        .toLowerCase()
    ),
  });

  const event1 = genEvent({
    kind: 1,
    content: 'Spicy peppermint apricot mediterranean ginger carrot spiced juice edamame hummus',
  });

  const event2 = genEvent({
    kind: 1,
    content: 'Spicy 🌶️  peppermint apricot 🍑 mediterranean 🌊 ginger carrot 🥕 spiced 🌶️ juice 🥤 edamame 🌱  hummus ',
  });

  assertEquals((await policy.call(event1))[2], true);
  assertEquals((await policy.call(event2))[2], false);
});
