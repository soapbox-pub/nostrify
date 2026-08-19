import { test } from "node:test";
import { deepStrictEqual, ok } from "node:assert";
import { generateSecretKey, getPublicKey, verifyEvent } from "nostr-tools";

import { NSecSigner } from "./NSecSigner.ts";

await test("NSecSigner", async () => {
  const secretKey = generateSecretKey();
  const signer = new NSecSigner(secretKey);

  deepStrictEqual(await signer.getPublicKey(), getPublicKey(secretKey));

  const template = {
    kind: 1,
    content: "Hello, world!",
    tags: [],
    created_at: 0,
  };

  // Compared field by field rather than against a second `finalizeEvent` call:
  // that mutates and returns the template it is given, so comparing the two was
  // comparing one object with itself.
  const signed = await signer.signEvent({ ...template });

  ok(verifyEvent(signed));
  deepStrictEqual(signed.pubkey, getPublicKey(secretKey));
  deepStrictEqual(signed.kind, template.kind);
  deepStrictEqual(signed.content, template.content);
  deepStrictEqual(signed.tags, template.tags);
  deepStrictEqual(signed.created_at, template.created_at);
});

await test("NSecSigner is unaffected by mutation of the caller's array", async () => {
  const secretKey = generateSecretKey();
  const pubkey = getPublicKey(secretKey);
  const signer = new NSecSigner(secretKey);

  // Zeroizing your own copy of a key after handing it off is the responsible
  // thing to do, and it must not change who this signer is.
  secretKey.fill(0);

  deepStrictEqual(await signer.getPublicKey(), pubkey);

  const signed = await signer.signEvent({
    kind: 1,
    content: "Hello, world!",
    tags: [],
    created_at: 0,
  });

  deepStrictEqual(signed.pubkey, pubkey);
  ok(verifyEvent(signed));
});

await test("NSecSigner.nip44", async () => {
  const secretKey = generateSecretKey();
  const signer = new NSecSigner(secretKey);

  const pubkey = await signer.getPublicKey();
  const plaintext = "Hello, world!";

  const ciphertext = await signer.nip44.encrypt(pubkey, plaintext);
  deepStrictEqual(await signer.nip44.decrypt(pubkey, ciphertext), plaintext);
});
