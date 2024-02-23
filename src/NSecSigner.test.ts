import { assertEquals } from 'https://deno.land/std@0.212.0/assert/mod.ts';
import { finalizeEvent, generateSecretKey, getPublicKey } from 'npm:nostr-tools@^2.3.1';

import { NSecSigner } from './NSecSigner.ts';

Deno.test('NSecSigner', async () => {
  const secretKey = generateSecretKey();
  const signer = new NSecSigner(secretKey);

  assertEquals(await signer.getPublicKey(), getPublicKey(secretKey));

  const template = { kind: 1, content: 'Hello, world!', tags: [], created_at: 0 };

  assertEquals(await signer.signEvent(template), finalizeEvent(template, secretKey));
});

Deno.test('NSecSigner.nip44', async () => {
  const secretKey = generateSecretKey();
  const signer = new NSecSigner(secretKey);

  const pubkey = await signer.getPublicKey();
  const plaintext = 'Hello, world!';

  const ciphertext = await signer.nip44.encrypt(pubkey, plaintext);
  assertEquals(await signer.nip44.decrypt(pubkey, ciphertext), plaintext);
});
