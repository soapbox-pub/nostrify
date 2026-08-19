import { test } from "node:test";
import { deepStrictEqual, throws } from "node:assert";

import { NPhraseSigner } from "@nostrify/seed";

await test("getPublicKey", async () => {
  const mnemonic = "zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo wrong";
  const signer = new NPhraseSigner(mnemonic);
  const pubkey = await signer.getPublicKey();

  deepStrictEqual(
    pubkey,
    "ed6b4c4479c2a9a74dc2fb0757163e25dc0a4e13407263952bfc6c56525f5cfd",
  );
});

await test("getPublicKey for account 1", async () => {
  const mnemonic = "zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo wrong";
  const signer = new NPhraseSigner(mnemonic, { account: 1 });
  const pubkey = await signer.getPublicKey();

  deepStrictEqual(
    pubkey,
    "83581a0215fb60d08683d2dabecf29ef2a3e69e65103fb5808014ebb6dc74e35",
  );
});

await test("getPublicKey with a passphrase", async () => {
  const mnemonic = "zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo wrong";
  const signer = new NPhraseSigner(mnemonic, { passphrase: "123" });
  const pubkey = await signer.getPublicKey();

  deepStrictEqual(
    pubkey,
    "5d4a75ce5049f3b024f039d3b3e6aee6d6b5abb41452cb141cf37c2edfa54d26",
  );
});

await test("rejects a mnemonic that fails its checksum", () => {
  // One word off from the valid phrase above. BIP-39 mnemonics carry a
  // checksum so this is knowable; without checking it, the typo derives a
  // different account and nothing says so.
  throws(
    () => new NPhraseSigner("zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo"),
    (e: unknown) => e instanceof Error && e.message === "Invalid mnemonic",
  );

  throws(() => new NPhraseSigner("hello there general kenobi"));
});
