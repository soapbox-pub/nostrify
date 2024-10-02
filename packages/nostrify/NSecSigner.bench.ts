import { generateSecretKey } from 'nostr-tools';

import { NSecSigner } from './NSecSigner.ts';

Deno.bench('NSecSigner.nip04.encrypt', async (b) => {
  const signer = new NSecSigner(generateSecretKey());
  const pubkey = await signer.getPublicKey();
  b.start();
  await signer.nip04.encrypt(pubkey, 'Hello, world!');
});

Deno.bench('NSecSigner.nip04.decrypt', async (b) => {
  const signer = new NSecSigner(generateSecretKey());
  const pubkey = await signer.getPublicKey();
  const ciphertext = await signer.nip04.encrypt(pubkey, 'Hello, world!');
  b.start();
  await signer.nip04.decrypt(pubkey, ciphertext);
});

Deno.bench('NSecSigner.nip44.encrypt', async (b) => {
  const signer = new NSecSigner(generateSecretKey());
  const pubkey = await signer.getPublicKey();
  b.start();
  await signer.nip44.encrypt(pubkey, 'Hello, world!');
});

Deno.bench('NSecSigner.nip44.decrypt', async (b) => {
  const signer = new NSecSigner(generateSecretKey());
  const pubkey = await signer.getPublicKey();
  const ciphertext = await signer.nip44.encrypt(pubkey, 'Hello, world!');
  b.start();
  await signer.nip44.decrypt(pubkey, ciphertext);
});
