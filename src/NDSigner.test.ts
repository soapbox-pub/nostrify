import { assert, assertEquals } from 'https://deno.land/std@0.212.0/assert/mod.ts';

import { NDSigner } from './NDSigner.ts';

Deno.test('NDSigner.getPublicKey', async () => {
  const signer = new NDSigner({
    user: 'https://gleasonator.com/users/alex',
    seed: new TextEncoder().encode('1'),
  });

  assertEquals(
    await signer.getPublicKey(),
    'cf4041216d612ebf83ac34e16b1fcac13d77a90155fbcf611bc3e76619a1127c',
  );
});

Deno.test('NDSigner.signEvent', async () => {
  const signer = new NDSigner({
    user: 'https://gleasonator.com/users/alex',
    seed: new TextEncoder().encode('1'),
  });

  const event = await signer.signEvent({
    kind: 1,
    content: 'hello world',
    tags: [],
    created_at: 0,
  });

  assertEquals(
    event.id,
    '67a2628f4b84861b2f98f2cafce212e76bd21a7808645e25417863529e61e0e7',
  );
  assertEquals(
    event.pubkey,
    'cf4041216d612ebf83ac34e16b1fcac13d77a90155fbcf611bc3e76619a1127c',
  );
  assert(event.sig);
});
