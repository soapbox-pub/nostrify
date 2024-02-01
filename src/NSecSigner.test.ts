import { assertEquals } from 'https://deno.land/std@0.212.0/assert/mod.ts';
import { finalizeEvent, generateSecretKey, getPublicKey } from 'npm:nostr-tools@^2.1.4';

import { NSecSigner } from './NSecSigner.ts';

Deno.test('NSecSigner', async () => {
  const secretKey = generateSecretKey();
  const signer = new NSecSigner(secretKey);

  assertEquals(await signer.getPublicKey(), getPublicKey(secretKey));

  const template = { kind: 1, content: 'Hello, world!', tags: [], created_at: 0 };

  assertEquals(await signer.signEvent(template), finalizeEvent(template, secretKey));
});
