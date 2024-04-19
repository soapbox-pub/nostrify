import { assert, assertEquals } from '@std/assert';

import { NCustodial } from './NCustodial.ts';

const seed = new TextEncoder().encode('41m/FT2MOYBAJfIphFOTRTu2prGz/m9cdxS0lcYfetbszzy1BbVxAIQpV6vkTv2U');
const signers = new NCustodial(seed);

Deno.test('getPublicKey', async () => {
  const alex = await signers.get('alex');
  const fiatjaf = await signers.get('fiatjaf');

  assertEquals(
    await alex.getPublicKey(),
    'ef8fb05de6bcb4795380dad56bf00644f16176f8acd6a4c2c600ee6f5a634390',
  );
  assertEquals(
    await fiatjaf.getPublicKey(),
    'fae2098a3ca1a7c083f757a04a1a8841696541ebc20fb01a50362a8a467123fe',
  );
});

Deno.test('signEvent', async () => {
  const signer = await signers.get('alex');

  const event = await signer.signEvent({
    kind: 1,
    content: 'hello world',
    tags: [],
    created_at: 0,
  });

  assertEquals(
    event.id,
    'd072222df9f24688634a69813b5e3bba75557736ea40c5bf6263f2701690752e',
  );
  assertEquals(
    event.pubkey,
    'ef8fb05de6bcb4795380dad56bf00644f16176f8acd6a4c2c600ee6f5a634390',
  );
  assert(event.sig);
});
