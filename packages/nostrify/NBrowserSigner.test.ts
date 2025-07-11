import { NSecSigner } from '@nostrify/nostrify';
import { assertEquals, assertRejects } from '@std/assert';
import { finalizeEvent, generateSecretKey, getPublicKey } from 'nostr-tools';

import { NBrowserSigner } from './NBrowserSigner.ts';

import type { NostrEvent, NostrSigner } from '@nostrify/types';

Deno.test('NBrowserSigner - without extension', async () => {
  // Ensure no extension is available
  (globalThis as { nostr?: NostrSigner }).nostr = undefined;

  const signer = new NBrowserSigner();

  await assertRejects(
    () => signer.getPublicKey(),
    Error,
    'Browser extension not available',
  );

  await assertRejects(
    () => signer.signEvent({ kind: 1, content: 'Hello, world!', tags: [], created_at: 0 }),
    Error,
    'Browser extension not available',
  );
});

Deno.test('NBrowserSigner - with extension polyfill', async () => {
  const secretKey = generateSecretKey();
  const mockExtension = new NSecSigner(secretKey);

  // Set up the polyfill
  (globalThis as { nostr?: NostrSigner }).nostr = mockExtension;

  const signer = new NBrowserSigner();

  // Test getPublicKey
  assertEquals(await signer.getPublicKey(), getPublicKey(secretKey));

  // Test signEvent
  const template = { kind: 1, content: 'Hello, world!', tags: [], created_at: 0 };
  assertEquals(await signer.signEvent(template), finalizeEvent(template, secretKey));

  // Clean up
  (globalThis as { nostr?: NostrSigner }).nostr = undefined;
});

Deno.test('NBrowserSigner.nip44 - with extension polyfill', async () => {
  const secretKey = generateSecretKey();
  const mockExtension = new NSecSigner(secretKey);

  // Set up the polyfill
  (globalThis as { nostr?: NostrSigner }).nostr = mockExtension;

  const signer = new NBrowserSigner();

  const pubkey = await signer.getPublicKey();
  const plaintext = 'Hello, world!';

  const ciphertext = await signer.nip44!.encrypt(pubkey, plaintext);
  assertEquals(await signer.nip44!.decrypt(pubkey, ciphertext), plaintext);

  // Clean up
  (globalThis as { nostr?: NostrSigner }).nostr = undefined;
});

Deno.test('NBrowserSigner.nip04 - with extension polyfill', async () => {
  const secretKey = generateSecretKey();
  const mockExtension = new NSecSigner(secretKey);

  // Set up the polyfill
  (globalThis as { nostr?: NostrSigner }).nostr = mockExtension;

  const signer = new NBrowserSigner();

  const pubkey = await signer.getPublicKey();
  const plaintext = 'Hello, world!';

  const ciphertext = await signer.nip04!.encrypt(pubkey, plaintext);
  assertEquals(await signer.nip04!.decrypt(pubkey, ciphertext), plaintext);

  // Clean up
  (globalThis as { nostr?: NostrSigner }).nostr = undefined;
});

Deno.test('NBrowserSigner.getRelays - with extension polyfill', async () => {
  const secretKey = generateSecretKey();
  const mockExtension = new NSecSigner(secretKey);

  // Set up the polyfill
  (globalThis as { nostr?: NostrSigner }).nostr = mockExtension;

  const signer = new NBrowserSigner();

  // Since NSecSigner doesn't implement getRelays, this should return empty object
  const relays = await signer.getRelays();
  assertEquals(relays, {});

  // Clean up
  (globalThis as { nostr?: NostrSigner }).nostr = undefined;
});

Deno.test('NBrowserSigner - missing nip44 support', () => {
  // Create a mock extension without nip44 support
  const mockExtension = {
    // deno-lint-ignore require-await
    getPublicKey: async () => 'pubkey',
    // deno-lint-ignore require-await
    signEvent: async (event: NostrEvent) => event,
    // No nip44 property
  };

  (globalThis as { nostr?: NostrSigner }).nostr = mockExtension;

  const signer = new NBrowserSigner();

  // Should return undefined when nip44 is not supported
  assertEquals(signer.nip44, undefined);

  // Clean up
  (globalThis as { nostr?: NostrSigner }).nostr = undefined;
});

Deno.test('NBrowserSigner - missing nip04 support', () => {
  // Create a mock extension without nip04 support
  const mockExtension = {
    // deno-lint-ignore require-await
    getPublicKey: async () => 'pubkey',
    // deno-lint-ignore require-await
    signEvent: async (event: NostrEvent) => event,
    // No nip04 property
  };

  (globalThis as { nostr?: NostrSigner }).nostr = mockExtension;

  const signer = new NBrowserSigner();

  // Should return undefined when nip04 is not supported
  assertEquals(signer.nip04, undefined);

  // Clean up
  (globalThis as { nostr?: NostrSigner }).nostr = undefined;
});

Deno.test('NBrowserSigner - feature detection', () => {
  const secretKey = generateSecretKey();
  const mockExtension = new NSecSigner(secretKey);

  // Set up the polyfill
  (globalThis as { nostr?: NostrSigner }).nostr = mockExtension;

  const signer = new NBrowserSigner();

  // Should be able to detect nip44 support
  if (signer.nip44) {
    // This should work since NSecSigner supports nip44
    assertEquals(typeof signer.nip44.encrypt, 'function');
    assertEquals(typeof signer.nip44.decrypt, 'function');
  }

  // Should be able to detect nip04 support
  if (signer.nip04) {
    // This should work since NSecSigner supports nip04
    assertEquals(typeof signer.nip04.encrypt, 'function');
    assertEquals(typeof signer.nip04.decrypt, 'function');
  }

  // Clean up
  (globalThis as { nostr?: NostrSigner }).nostr = undefined;
});
