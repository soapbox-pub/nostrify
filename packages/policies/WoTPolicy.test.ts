import { test } from "node:test";
import { ErrorRelay, genEvent, MockRelay } from "@nostrify/nostrify/test";
import { ok } from "node:assert";
import { generateSecretKey, getPublicKey } from "nostr-tools";

import { WoTPolicy } from "./WoTPolicy.ts";

function keygen(): { pubkey: string; seckey: Uint8Array } {
  const seckey = generateSecretKey();
  const pubkey = getPublicKey(seckey);
  return { pubkey, seckey };
}

await test("WoTPolicy", async () => {
  const store = new MockRelay();
  try {
    const [alex, patrick, fiatjaf, replyguy] = [
      keygen(),
      keygen(),
      keygen(),
      keygen(),
    ];

    await store.event(
      genEvent({ kind: 3, tags: [["p", patrick.pubkey]] }, alex.seckey),
    );
    await store.event(
      genEvent({ kind: 3, tags: [["p", fiatjaf.pubkey]] }, patrick.seckey),
    );
    await store.event(
      genEvent({ kind: 3, tags: [["p", patrick.pubkey]] }, fiatjaf.seckey),
    );

    const policy = new WoTPolicy({ store, pubkeys: [alex.pubkey], depth: 2 });

    ok((await policy.call(genEvent({}, alex.seckey)))[2]);
    ok((await policy.call(genEvent({}, patrick.seckey)))[2]);
    ok((await policy.call(genEvent({}, fiatjaf.seckey)))[2]);
    ok(!(await policy.call(genEvent({}, replyguy.seckey)))[2]);
  } finally {
    await store.close();
  }
});

await test("WoTPolicy constructor with error store", async () => {
  const store = new ErrorRelay();
  try {
    const alex = keygen();

    // Ensure this doesn't result in an unhandled promise rejection.
    new WoTPolicy({ store, pubkeys: [alex.pubkey], depth: 1 });
  } catch {
    // Expected, ErrorRelay throws errors intentionally
  } finally {
    try {
      await store.close();
    } catch {
      // Expected, ErrorRelay.close() throws an error intentionally
    }
  }
});
