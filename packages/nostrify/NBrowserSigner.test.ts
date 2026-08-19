import { test } from "node:test";
import { NSecSigner } from "@nostrify/nostrify";
import { deepStrictEqual, ok, rejects } from "node:assert";
import { generateSecretKey, getPublicKey, verifyEvent } from "nostr-tools";

import { NBrowserSigner } from "./NBrowserSigner.ts";

import type { NostrEvent, NostrSigner } from "@nostrify/types";

await test("NBrowserSigner - without extension", async () => {
  // Ensure no extension is available
  (globalThis as { nostr?: NostrSigner }).nostr = undefined;

  const signer = new NBrowserSigner({ timeout: 200 });

  await rejects(
    () => signer.getPublicKey(),
    Error,
    "Browser extension not available",
  );

  await rejects(
    () =>
      signer.signEvent({
        kind: 1,
        content: "Hello, world!",
        tags: [],
        created_at: 0,
      }),
    Error,
    "Browser extension not available",
  );
});

await test("NBrowserSigner - with extension polyfill", async () => {
  const secretKey = generateSecretKey();
  const mockExtension = new NSecSigner(secretKey);

  // Set up the polyfill
  (globalThis as { nostr?: NostrSigner }).nostr = mockExtension;

  const signer = new NBrowserSigner();

  // Test getPublicKey
  deepStrictEqual(await signer.getPublicKey(), getPublicKey(secretKey));

  // Test signEvent. Compared field by field rather than against a second
  // `finalizeEvent` call: that mutates and returns the template it is given, so
  // comparing the two was comparing one object with itself, and Schnorr
  // signatures are randomized anyway.
  const template = {
    kind: 1,
    content: "Hello, world!",
    tags: [],
    created_at: 0,
  };

  const signed = await signer.signEvent({ ...template });

  ok(verifyEvent(signed));
  deepStrictEqual(signed.pubkey, getPublicKey(secretKey));
  deepStrictEqual(signed.kind, template.kind);
  deepStrictEqual(signed.content, template.content);
  deepStrictEqual(signed.tags, template.tags);
  deepStrictEqual(signed.created_at, template.created_at);

  // Clean up
  (globalThis as { nostr?: NostrSigner }).nostr = undefined;
});

await test("NBrowserSigner - rejects an event the extension didn't sign", async () => {
  const inner = new NSecSigner(generateSecretKey());

  (globalThis as { nostr?: NostrSigner }).nostr = {
    getPublicKey: () => inner.getPublicKey(),
    signEvent: async (event: Omit<NostrEvent, "id" | "pubkey" | "sig">) => {
      const signed = await inner.signEvent(event);
      // Every field the presence check looks for is populated; the signature
      // is what stops covering it.
      return { ...signed, content: "something else" };
    },
  };

  const signer = new NBrowserSigner();

  await rejects(
    () =>
      signer.signEvent({
        kind: 1,
        content: "Hello, world!",
        tags: [],
        created_at: 0,
      }),
    (e: unknown) =>
      e instanceof Error &&
      e.message ===
        "Nostr event signing failed: the extension returned an invalid event",
  );

  (globalThis as { nostr?: NostrSigner }).nostr = undefined;
});

await test("NBrowserSigner.nip44 - with extension polyfill", async () => {
  const secretKey = generateSecretKey();
  const mockExtension = new NSecSigner(secretKey);

  // Set up the polyfill
  (globalThis as { nostr?: NostrSigner }).nostr = mockExtension;

  const signer = new NBrowserSigner();

  const pubkey = await signer.getPublicKey();
  const plaintext = "Hello, world!";

  const ciphertext = await signer.nip44!.encrypt(pubkey, plaintext);
  deepStrictEqual(await signer.nip44!.decrypt(pubkey, ciphertext), plaintext);

  // Clean up
  (globalThis as { nostr?: NostrSigner }).nostr = undefined;
});

await test("NBrowserSigner.nip04 - with extension polyfill", async () => {
  const secretKey = generateSecretKey();
  const mockExtension = new NSecSigner(secretKey);

  // Set up the polyfill
  (globalThis as { nostr?: NostrSigner }).nostr = mockExtension;

  const signer = new NBrowserSigner();

  const pubkey = await signer.getPublicKey();
  const plaintext = "Hello, world!";

  const ciphertext = await signer.nip04!.encrypt(pubkey, plaintext);
  deepStrictEqual(await signer.nip04!.decrypt(pubkey, ciphertext), plaintext);

  // Clean up
  (globalThis as { nostr?: NostrSigner }).nostr = undefined;
});

await test("NBrowserSigner.getRelays - with extension polyfill", async () => {
  const secretKey = generateSecretKey();
  const mockExtension = new NSecSigner(secretKey);

  // Set up the polyfill
  (globalThis as { nostr?: NostrSigner }).nostr = mockExtension;

  const signer = new NBrowserSigner();

  // Since NSecSigner doesn't implement getRelays, this should return empty object
  const relays = await signer.getRelays();
  deepStrictEqual(relays, {});

  // Clean up
  (globalThis as { nostr?: NostrSigner }).nostr = undefined;
});

await test("NBrowserSigner - missing nip44 support", () => {
  // Create a mock extension without nip44 support
  const mockExtension = {
    // deno-lint-ignore require-await
    getPublicKey: async () => "pubkey",
    // deno-lint-ignore require-await
    signEvent: async (event: NostrEvent) => event,
    // No nip44 property
  };

  (globalThis as { nostr?: NostrSigner }).nostr = mockExtension;

  const signer = new NBrowserSigner();

  // Should return undefined when extension is loaded but doesn't support nip44
  deepStrictEqual(signer.nip44, undefined);

  // Clean up
  (globalThis as { nostr?: NostrSigner }).nostr = undefined;
});

await test("NBrowserSigner - missing nip04 support", () => {
  // Create a mock extension without nip04 support
  const mockExtension = {
    // deno-lint-ignore require-await
    getPublicKey: async () => "pubkey",
    // deno-lint-ignore require-await
    signEvent: async (event: NostrEvent) => event,
    // No nip04 property
  };

  (globalThis as { nostr?: NostrSigner }).nostr = mockExtension;

  const signer = new NBrowserSigner();

  // Should return undefined when extension is loaded but doesn't support nip04
  deepStrictEqual(signer.nip04, undefined);

  // Clean up
  (globalThis as { nostr?: NostrSigner }).nostr = undefined;
});

await test("NBrowserSigner - feature detection", () => {
  const secretKey = generateSecretKey();
  const mockExtension = new NSecSigner(secretKey);

  // Set up the polyfill
  (globalThis as { nostr?: NostrSigner }).nostr = mockExtension;

  const signer = new NBrowserSigner();

  // Should be able to detect nip44 support
  if (signer.nip44) {
    // This should work since NSecSigner supports nip44
    deepStrictEqual(typeof signer.nip44.encrypt, "function");
    deepStrictEqual(typeof signer.nip44.decrypt, "function");
  }

  // Should be able to detect nip04 support
  if (signer.nip04) {
    // This should work since NSecSigner supports nip04
    deepStrictEqual(typeof signer.nip04.encrypt, "function");
    deepStrictEqual(typeof signer.nip04.decrypt, "function");
  }

  // Clean up
  (globalThis as { nostr?: NostrSigner }).nostr = undefined;
});

await test("NBrowserSigner - extension appears after delay", async () => {
  // Ensure no extension initially
  (globalThis as { nostr?: NostrSigner }).nostr = undefined;

  const secretKey = generateSecretKey();
  const expectedPubkey = getPublicKey(secretKey);

  const signer = new NBrowserSigner({ timeout: 3000 });

  // Simulate extension injecting after 300ms
  setTimeout(() => {
    (globalThis as { nostr?: NostrSigner }).nostr = new NSecSigner(secretKey);
  }, 300);

  // Should wait for the extension and succeed
  const pubkey = await signer.getPublicKey();
  deepStrictEqual(pubkey, expectedPubkey);

  // Clean up
  (globalThis as { nostr?: NostrSigner }).nostr = undefined;
});

await test("NBrowserSigner - nip44 works when extension appears after delay", async () => {
  // Ensure no extension initially
  (globalThis as { nostr?: NostrSigner }).nostr = undefined;

  const secretKey = generateSecretKey();
  const expectedPubkey = getPublicKey(secretKey);

  const signer = new NBrowserSigner({ timeout: 3000 });

  // nip44 getter returns an object even without extension
  ok(signer.nip44);

  // Simulate extension injecting after 300ms
  setTimeout(() => {
    (globalThis as { nostr?: NostrSigner }).nostr = new NSecSigner(secretKey);
  }, 300);

  // Should wait for the extension and succeed
  const plaintext = "Hello, world!";
  const ciphertext = await signer.nip44!.encrypt(expectedPubkey, plaintext);
  deepStrictEqual(await signer.nip44!.decrypt(expectedPubkey, ciphertext), plaintext);

  // Clean up
  (globalThis as { nostr?: NostrSigner }).nostr = undefined;
});
