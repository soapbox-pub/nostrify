import { assertEquals, assertRejects, assertThrows } from '@std/assert';
import { finalizeEvent, generateSecretKey, getPublicKey } from 'nostr-tools';

import { BrowserSigner } from './BrowserSigner.ts';
import { NSecSigner } from './NSecSigner.ts';

import type { NostrEvent, NostrSigner } from '@nostrify/types';

Deno.test('BrowserSigner - without extension', async () => {
  // Ensure no extension is available
  (globalThis as { nostr?: NostrSigner }).nostr = undefined;

  const signer = new BrowserSigner();

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

Deno.test('BrowserSigner - with extension polyfill', async () => {
  const secretKey = generateSecretKey();
  const mockExtension = new NSecSigner(secretKey);

  // Set up the polyfill
  (globalThis as { nostr?: NostrSigner }).nostr = mockExtension;

  const signer = new BrowserSigner();

  // Test getPublicKey
  assertEquals(await signer.getPublicKey(), getPublicKey(secretKey));

  // Test signEvent
  const template = { kind: 1, content: 'Hello, world!', tags: [], created_at: 0 };
  assertEquals(await signer.signEvent(template), finalizeEvent(template, secretKey));

  // Clean up
  (globalThis as { nostr?: NostrSigner }).nostr = undefined;
});

Deno.test('BrowserSigner.nip44 - with extension polyfill', async () => {
  const secretKey = generateSecretKey();
  const mockExtension = new NSecSigner(secretKey);

  // Set up the polyfill
  (globalThis as { nostr?: NostrSigner }).nostr = mockExtension;

  const signer = new BrowserSigner();

  const pubkey = await signer.getPublicKey();
  const plaintext = 'Hello, world!';

  const ciphertext = await signer.nip44.encrypt(pubkey, plaintext);
  assertEquals(await signer.nip44.decrypt(pubkey, ciphertext), plaintext);

  // Clean up
  (globalThis as { nostr?: NostrSigner }).nostr = undefined;
});

Deno.test('BrowserSigner.nip04 - with extension polyfill', async () => {
  const secretKey = generateSecretKey();
  const mockExtension = new NSecSigner(secretKey);

  // Set up the polyfill
  (globalThis as { nostr?: NostrSigner }).nostr = mockExtension;

  const signer = new BrowserSigner();

  const pubkey = await signer.getPublicKey();
  const plaintext = 'Hello, world!';

  const ciphertext = await signer.nip04.encrypt(pubkey, plaintext);
  assertEquals(await signer.nip04.decrypt(pubkey, ciphertext), plaintext);

  // Clean up
  (globalThis as { nostr?: NostrSigner }).nostr = undefined;
});

Deno.test('BrowserSigner.getRelays - with extension polyfill', async () => {
  const secretKey = generateSecretKey();
  const mockExtension = new NSecSigner(secretKey);

  // Set up the polyfill
  (globalThis as { nostr?: NostrSigner }).nostr = mockExtension;

  const signer = new BrowserSigner();

  // Since NSecSigner doesn't implement getRelays, this should throw
  await assertRejects(
    () => signer.getRelays(),
    Error,
    'getRelays method not available in browser extension',
  );

  // Clean up
  (globalThis as { nostr?: NostrSigner }).nostr = undefined;
});

Deno.test('BrowserSigner - missing nip44 support', () => {
  // Create a mock extension without nip44 support
  const mockExtension = {
    // deno-lint-ignore require-await
    getPublicKey: async () => 'pubkey',
    // deno-lint-ignore require-await
    signEvent: async (event: NostrEvent) => event,
    // No nip44 property
  };

  (globalThis as { nostr?: NostrSigner }).nostr = mockExtension;

  const signer = new BrowserSigner();

  assertThrows(
    () => signer.nip44,
    Error,
    'NIP-44 methods not available in browser extension',
  );

  // Clean up
  (globalThis as { nostr?: NostrSigner }).nostr = undefined;
});

Deno.test('BrowserSigner - missing nip04 support', () => {
  // Create a mock extension without nip04 support
  const mockExtension = {
    // deno-lint-ignore require-await
    getPublicKey: async () => 'pubkey',
    // deno-lint-ignore require-await
    signEvent: async (event: NostrEvent) => event,
    // No nip04 property
  };

  (globalThis as { nostr?: NostrSigner }).nostr = mockExtension;

  const signer = new BrowserSigner();

  assertThrows(
    () => signer.nip04,
    Error,
    'NIP-04 methods not available in browser extension',
  );

  // Clean up
  (globalThis as { nostr?: NostrSigner }).nostr = undefined;
});
