import { test } from 'node:test';
import { deepStrictEqual, ok } from 'node:assert';
import { NCustodial } from '@nostrify/seed';

const seed = new TextEncoder().encode(
  '41m/FT2MOYBAJfIphFOTRTu2prGz/m9cdxS0lcYfetbszzy1BbVxAIQpV6vkTv2U',
);
const signers = new NCustodial(seed);

test('getPublicKey', async () => {
  const alex = await signers.get('alex');
  const fiatjaf = await signers.get('fiatjaf');

  deepStrictEqual(
    await alex.getPublicKey(),
    'ef8fb05de6bcb4795380dad56bf00644f16176f8acd6a4c2c600ee6f5a634390',
  );
  deepStrictEqual(
    await fiatjaf.getPublicKey(),
    'fae2098a3ca1a7c083f757a04a1a8841696541ebc20fb01a50362a8a467123fe',
  );
});

test('signEvent', async () => {
  const signer = await signers.get('alex');

  const event = await signer.signEvent({
    kind: 1,
    content: 'hello world',
    tags: [],
    created_at: 0,
  });

  deepStrictEqual(
    event.id,
    'd072222df9f24688634a69813b5e3bba75557736ea40c5bf6263f2701690752e',
  );
  deepStrictEqual(
    event.pubkey,
    'ef8fb05de6bcb4795380dad56bf00644f16176f8acd6a4c2c600ee6f5a634390',
  );
  ok(event.sig);
});
