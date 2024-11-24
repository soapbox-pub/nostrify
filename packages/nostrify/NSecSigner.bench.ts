import { generateSecretKey } from 'nostr-tools';

import { NSecSigner } from './NSecSigner.ts';

const FIXED_SIGNER = new NSecSigner(generateSecretKey());

Deno.bench('NSecSigner', () => {
  new NSecSigner(generateSecretKey());
});

Deno.bench('NSecSigner.getPublicKey', async (b) => {
  const signer = new NSecSigner(generateSecretKey());
  b.start();
  await signer.getPublicKey();
});

Deno.bench('NSecSigner.getPublicKey with a fixed secret key', async () => {
  await FIXED_SIGNER.getPublicKey();
});

Deno.bench('NSecSigner.signEvent', async (b) => {
  const signer = new NSecSigner(generateSecretKey());
  b.start();
  await signer.signEvent({ kind: 1, content: 'Hello, world!', tags: [], created_at: 0 });
});

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
