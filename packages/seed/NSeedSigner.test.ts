import { assertEquals } from '@std/assert';

import { NSeedSigner } from './NSeedSigner';

Deno.test('getPublicKey', async () => {
  const seed = new TextEncoder().encode(
    '41m/FT2MOYBAJfIphFOTRTu2prGz/m9cdxS0lcYfetbszzy1BbVxAIQpV6vkTv2U',
  );
  const signer = new NSeedSigner(seed);
  const pubkey = await signer.getPublicKey();

  assertEquals(
    pubkey,
    '14a0cd2d9b1a3d6397c6797f1d13186882db21b294bd5a0656a04379df251143',
  );
});

Deno.test('getPublicKey for account 1', async () => {
  const seed = new TextEncoder().encode(
    '41m/FT2MOYBAJfIphFOTRTu2prGz/m9cdxS0lcYfetbszzy1BbVxAIQpV6vkTv2U',
  );
  const signer = new NSeedSigner(seed, 1);
  const pubkey = await signer.getPublicKey();

  assertEquals(
    pubkey,
    '88c06f0b1c0cccfa86501fbf9af747c5cea9351b01f35a2d6e069bced4fbbc2a',
  );
});
